import { saveFileFromBase64 } from '@/lib/files';
import { 
  saveInvoice, 
  saveLineItems, 
  findDuplicateInvoice, 
  updateInvoice,
  deleteLineItemsByInvoiceId
} from '@/lib/db/queries';
import { tool, generateObject } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';

// Helper functions for international format handling
function parseInternationalDate(dateStr: string): string {
  // Handle common international date formats
  const months: { [key: string]: number } = {
    'januar': 1, 'january': 1, 'jan': 1,
    'februar': 2, 'february': 2, 'feb': 2,
    'märz': 3, 'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'mai': 5, 'may': 5,
    'juni': 6, 'june': 6, 'jun': 6,
    'juli': 7, 'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9,
    'oktober': 10, 'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'dezember': 12, 'december': 12, 'dec': 12
  };

  try {
    // Remove any leading/trailing whitespace and convert to lowercase
    dateStr = dateStr.toLowerCase().trim();
    
    // Handle German format (7. Mai 2014)
    const germanFormat = dateStr.match(/(\d+)\.\s*([a-zä]+)\s*(\d{4})/i);
    if (germanFormat) {
      const [_, day, month, year] = germanFormat;
      const monthNum = months[month.toLowerCase()];
      if (monthNum) {
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(parseInt(day)).padStart(2, '0')}`;
      }
    }

    // Handle period format (01.05.14)
    const periodFormat = dateStr.match(/(\d{2})\.(\d{2})\.(\d{2})/);
    if (periodFormat) {
      const [_, day, month, year] = periodFormat;
      const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
      return `${fullYear}-${month}-${day}`;
    }

    // Try standard Date parsing as fallback
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
  } catch (e) {
    console.error('[DEBUG] Date parsing error:', e);
  }

  // Return current date if parsing fails
  return new Date().toISOString().split('T')[0];
}

function parseInternationalAmount(amountStr: string | number): number {
  if (typeof amountStr === 'number') return amountStr;
  
  try {
    // Remove currency symbols and whitespace
    const cleaned = amountStr.replace(/[$€£¥]|\s/g, '');
    
    // Handle European format (comma as decimal separator)
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      return parseFloat(cleaned.replace(',', '.'));
    }
    
    // Handle amounts with both thousands and decimal separators
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // If comma comes after dot, treat comma as decimal
      if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
      }
      // Otherwise treat dot as decimal
      return parseFloat(cleaned.replace(/,/g, ''));
    }
    
    return parseFloat(cleaned);
  } catch (e) {
    console.error('[DEBUG] Amount parsing error:', e);
    return 0;
  }
}

function extractServicePeriod(description: string): { 
  description: string, 
  servicePeriod?: { start: string; end: string } 
} {
  // Match date ranges in format DD.MM.YY-DD.MM.YY or similar
  const periodMatch = description.match(/(\d{2}\.\d{2}\.\d{2})-(\d{2}\.\d{2}\.\d{2})/);
  if (periodMatch) {
    const [_, startDate, endDate] = periodMatch;
    return {
      description: description.replace(/\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}/, '').trim(),
      servicePeriod: {
        start: parseInternationalDate(startDate),
        end: parseInternationalDate(endDate)
      }
    };
  }
  return { description };
}

// Define schema for line items
const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  total: z.number(),
  serviceId: z.string().optional(),
  servicePeriod: z.object({
    start: z.string(),
    end: z.string()
  }).optional()
});

// Define schema for invoice data
const invoiceDataSchema = z.object({
  customerName: z.string(),
  customerAddress: z.string(),
  vendorName: z.string(),
  vendorAddress: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  amount: z.number(),
  currency: z.string().optional(),
  language: z.string().optional(),
  contractNumber: z.string().optional(),
  lineItems: z.array(lineItemSchema).optional(),
});

// Create a direct instance of Anthropic Claude for invoice processing
// This bypasses the chat system's system messages
const invoiceModel = anthropic('claude-3-7-sonnet-20250219');

// Define the tool parameters schema
const processInvoiceSchema = z.object({
  fileType: z.string().describe('MIME type of the file'),
  fileName: z.string().describe('Name of the file'),
  invoiceNumber: z.string().describe('Invoice number'),
  customerName: z.string().describe('Full name of the customer'),
  customerAddress: z.string().describe('Complete address of the customer'),
  vendorName: z.string().describe('Full name of the vendor'),
  vendorAddress: z.string().describe('Complete address of the vendor'),
  invoiceDate: z.string().describe('Issue date of the invoice'),
  dueDate: z.string().optional().describe('Due date of the invoice if shown'),
  amount: z.number().describe('Total amount of the invoice'),
  currency: z.string().optional().describe('Currency of the invoice (defaults to EUR)'),
  contractNumber: z.string().optional().describe('Contract number if present'),
  lineItems: z.array(z.object({
    description: z.string().describe('Full service description'),
    quantity: z.number().optional().describe('Quantity if applicable'),
    unitPrice: z.number().optional().describe('Unit price in original format'),
    total: z.number().describe('Line item total'),
    serviceId: z.string().optional().describe('Service ID or reference number'),
    servicePeriod: z.object({
      start: z.string().describe('Start date of service period'),
      end: z.string().describe('End date of service period')
    }).optional().describe('Service period if applicable')
  })).optional().describe('Line items if present'),
  updateIfExists: z.boolean().optional().describe('Whether to update the invoice if it already exists')
});

// Update the processInvoiceImplementation to be a simple async function
export async function processInvoiceImplementation({ 
  fileType, 
  fileName, 
  invoiceNumber,
  customerName,
  customerAddress,
  vendorName,
  vendorAddress,
  invoiceDate,
  dueDate,
  amount,
  currency,
  contractNumber,
  lineItems,
  updateIfExists = false
}: z.infer<typeof processInvoiceSchema>) {
  try {
    // Log all parameters
    console.log('[DEBUG] Invoice Processing Parameters:', {
      fileType,
      fileName,
      invoiceNumber,
      customerName,
      customerAddress,
      vendorName,
      vendorAddress,
      invoiceDate,
      dueDate,
      amount,
      currency,
      contractNumber,
      lineItems: lineItems?.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        serviceId: item.serviceId,
        servicePeriod: item.servicePeriod
      })),
      updateIfExists
    });
    
    console.log('[DEBUG] Starting invoice processing for file:', fileName);
    console.log('[DEBUG] File type:', fileType);
    console.log('[DEBUG] Invoice number:', invoiceNumber);
    
    // Clean and normalize the invoice data
    console.log('[DEBUG] Starting data cleaning...');
    const cleanedData = cleanInvoiceData({
      customerName,
      customerAddress,
      vendorName,
      vendorAddress,
      invoiceNumber,
      invoiceDate,
      dueDate,
      amount,
      currency,
      contractNumber,
      lineItems
    });
    console.log('[DEBUG] Cleaned data:', JSON.stringify(cleanedData, null, 2));
    
    // Validate invoice data
    console.log('[DEBUG] Validating processed data...');
    const validationResult = invoiceDataSchema.safeParse(cleanedData);
    
    if (!validationResult.success) {
      console.error('[DEBUG] Validation error:', validationResult.error.format());
      return {
        success: false,
        error: "Failed to validate invoice data. Please check the data and try again.",
        details: validationResult.error.format()
      };
    }
    
    const invoiceData = validationResult.data;
    
    try {
      // Check if invoice with the same invoice number already exists
      console.log('[DEBUG] Checking for duplicate invoice...');
      const existingInvoice = await findDuplicateInvoice({
        invoiceNumber: invoiceData.invoiceNumber,
        vendorName: invoiceData.vendorName
      });
      
      if (existingInvoice) {
        console.log('[DEBUG] Duplicate invoice detected:', invoiceData.invoiceNumber);
        if (updateIfExists) {
          console.log('[DEBUG] Updating existing invoice:', existingInvoice.id);
          // Update the existing invoice
          await updateInvoice({
            id: existingInvoice.id,
            customerName: invoiceData.customerName,
            vendorName: invoiceData.vendorName,
            invoiceNumber: invoiceData.invoiceNumber,
            invoiceDate: invoiceData.invoiceDate,
            dueDate: invoiceData.dueDate,
            amount: invoiceData.amount,
          });
          
          // Delete existing line items
          await deleteLineItemsByInvoiceId({ invoiceId: existingInvoice.id });
          
          // Add new line items if available
          if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
            await saveLineItems({
              invoiceId: existingInvoice.id,
              items: invoiceData.lineItems,
            });
          }
          
          const updatedInvoice = {
            id: existingInvoice.id,
            ...invoiceData
          };
          
          return {
            success: true,
            message: "Invoice updated successfully",
            invoice: updatedInvoice
          };
        } else {
          return {
            success: false,
            error: "Duplicate invoice",
            message: `An invoice with the number ${invoiceData.invoiceNumber} from vendor ${invoiceData.vendorName} already exists.`,
            existingInvoice
          };
        }
      }
      
      // Save invoice to database
      console.log('[DEBUG] Saving new invoice to database...');
      const { id: invoiceId } = await saveInvoice({
        customerName: invoiceData.customerName,
        vendorName: invoiceData.vendorName,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        dueDate: invoiceData.dueDate,
        amount: invoiceData.amount,
        filePath: fileName, // Use fileName as filePath since we don't have fileContent
      });
      console.log('[DEBUG] Invoice saved with ID:', invoiceId);
      
      // Save line items if available
      if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
        console.log('[DEBUG] Saving line items...');
        await saveLineItems({
          invoiceId,
          items: invoiceData.lineItems,
        });
        console.log('[DEBUG] Line items saved successfully');
      }
      
      const newInvoice = {
        id: invoiceId,
        ...invoiceData
      };
      
      return {
        success: true,
        message: "Invoice processed successfully",
        invoice: newInvoice
      };
    } catch (dbError) {
      console.error('[DEBUG] Database operation error:', dbError);
      return {
        success: false,
        error: "Failed to save invoice data",
        details: dbError instanceof Error ? dbError.message : String(dbError)
      };
    }
  } catch (error) {
    console.error('[DEBUG] Error processing invoice:', error);
    return {
      success: false,
      error: "Failed to process invoice",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

// Helper function to clean and normalize invoice data
function cleanInvoiceData(data: any) {
  console.log('[DEBUG] Starting data cleaning process');
  const cleaned: any = { ...data };
  
  // Clean amount using international format parser
  if (typeof cleaned.amount === 'string' || typeof cleaned.amount === 'number') {
    cleaned.amount = parseInternationalAmount(cleaned.amount);
  } else {
    cleaned.amount = 0;
  }
  
  // Ensure addresses are properly formatted strings
  cleaned.customerAddress = cleaned.customerAddress ? cleaned.customerAddress.trim() : '';
  cleaned.vendorAddress = cleaned.vendorAddress ? cleaned.vendorAddress.trim() : '';
  
  // Clean line items with international format support
  if (Array.isArray(cleaned.lineItems) && cleaned.lineItems.length > 0) {
    cleaned.lineItems = cleaned.lineItems.map((item: any) => {
      // Extract service ID if present in description
      const serviceIdMatch = item.description?.match(/(?:Dienst|Service):\s*([A-Z0-9_]+)/i);
      const serviceId = serviceIdMatch ? serviceIdMatch[1] : undefined;
      
      // Extract and clean service period
      const { description, servicePeriod } = extractServicePeriod(item.description || '');
      
      return {
        description: description || 'Unspecified item',
        quantity: item.quantity || 1,
        unitPrice: parseInternationalAmount(item.unitPrice || 0),
        total: parseInternationalAmount(item.total || 0),
        serviceId,
        servicePeriod
      };
    });
  } else if (!cleaned.lineItems || cleaned.lineItems.length === 0) {
    // Create default line item based on total amount
    cleaned.lineItems = [{
      description: 'Invoice total',
      quantity: 1,
      unitPrice: cleaned.amount,
      total: cleaned.amount
    }];
  }
  
  // Ensure contract number is a string if present
  if (cleaned.contractNumber) {
    cleaned.contractNumber = cleaned.contractNumber.toString().trim();
  }
  
  // Set default currency if not present
  if (!cleaned.currency) {
    cleaned.currency = '€'; // Default to EUR since we're handling European invoices
  }
  
  console.log('[DEBUG] Data cleaning completed');
  return cleaned;
}

// Export the implementation function wrapped as a Tool
export const processInvoice = tool({
  description: `Process an invoice document and extract its data. The tool will:

1. First determine if the document is an invoice by looking for key indicators in multiple languages like:
   - Invoice/Rechnung/Factura/Facture number
   - Billing/payment details
   - Line items, charges, or services
   - Total amount and currency
   - VAT/Tax/MwSt. information if present

2. If it is an invoice, extract ALL of the following data precisely as shown:
   - Full company names (both customer and vendor)
   - Complete addresses (preserve format and international characters)
   - Invoice number/reference (exact format)
   - Contract number if present
   - Issue date (preserve original format)
   - Currency and amounts (preserve decimal format)
   - Due date if shown (preserve original format)
   
3. For line items, capture:
   - Full service descriptions
   - Service IDs or reference numbers (e.g. OUDJQ_strukan)
   - Service periods or date ranges
   - Unit prices in original format
   - Quantities if applicable
   - Line item totals in original format

4. Pay special attention to:
   - International date formats (e.g. German: 7. Mai 2014)
   - Provide dates in the format YYYY-MM-DD
   - European number formats (using comma as decimal)
   - Service identifiers and contract numbers
   - Multi-line addresses
   - Different currency symbols and positions`,
  parameters: processInvoiceSchema,
  execute: processInvoiceImplementation
});