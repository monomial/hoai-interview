import { saveFileFromBase64 } from '@/lib/files';
import { 
  saveInvoice, 
  saveLineItems, 
  findDuplicateInvoice, 
  updateInvoice,
  deleteLineItemsByInvoiceId
} from '@/lib/db/queries';
import { tool, generateText, type DataStreamWriter, generateObject } from 'ai';
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
  fileContent: z.string().describe('Base64 encoded file content'),
  fileType: z.string().describe('MIME type of the file'),
  fileName: z.string().describe('Name of the file'),
  updateIfExists: z.boolean().optional().describe('Whether to update the invoice if it already exists')
});

// Helper function to validate and extract invoice data in a single call
async function validateAndExtractInvoiceData(fileContent: string, fileType: string) {
  try {
    console.log('[DEBUG] Starting combined invoice validation and extraction');
    
    // Define the schema for the response
    const responseSchema = z.object({
      isInvoice: z.boolean(),
      language: z.string().optional(),
      invoiceData: z.object({
        customerName: z.string(),
        customerAddress: z.string(),
        vendorName: z.string(),
        vendorAddress: z.string(),
        invoiceNumber: z.string(),
        invoiceDate: z.string(),
        amount: z.number(),
        currency: z.string().optional(),
        language: z.string().optional(),
        contractNumber: z.string().optional(),
        dueDate: z.string().optional(),
        lineItems: z.array(z.object({
          description: z.string(),
          quantity: z.number().optional(),
          unitPrice: z.number().optional(),
          total: z.number(),
          serviceId: z.string().optional(),
          servicePeriod: z.object({
            start: z.string(),
            end: z.string()
          }).optional()
        })).optional()
      }).optional(),
      error: z.string().optional()
    });

    const result = await generateObject({
      model: invoiceModel as any,
      schema: responseSchema,
      prompt: `You are an invoice processing specialist with expertise in international invoices. Analyze this ${fileType} document and:

1. First determine the document language and if it is an invoice by looking for key indicators in multiple languages like:
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
   - European number formats (using comma as decimal)
   - Service identifiers and contract numbers
   - Multi-line addresses
   - Different currency symbols and positions

Base64 ${fileType}: ${fileContent}`
    });
    
    console.log('[DEBUG] Combined validation/extraction result:', JSON.stringify(result.object, null, 2));
    return result.object;
  } catch (error) {
    console.error('[DEBUG] Error in combined validation/extraction:', error);
    return {
      isInvoice: false,
      error: error instanceof Error ? error.message : "Failed to process invoice"
    };
  }
}

// Update the processInvoiceImplementation to be a simple async function
export async function processInvoiceImplementation({ 
  fileContent, 
  fileType, 
  fileName, 
  updateIfExists = false
}: z.infer<typeof processInvoiceSchema>) {
  try {
    console.log('[DEBUG] Starting invoice processing for file:', fileName);
    console.log('[DEBUG] File type:', fileType);
    console.log('[DEBUG] File content length:', fileContent.length);
    
    // Use combined validation and extraction
    console.log('[DEBUG] Starting combined invoice validation and extraction...');
    const result = await validateAndExtractInvoiceData(fileContent, fileType);
    console.log('[DEBUG] Combined validation/extraction result:', JSON.stringify(result, null, 2));
    
    if (!result.isInvoice) {
      console.log('[DEBUG] Document validation failed - not an invoice');
      return {
        success: false,
        error: result.error || "The uploaded document does not appear to be an invoice."
      };
    }
    
    if (!result.invoiceData) {
      console.log('[DEBUG] No invoice data extracted');
      return {
        success: false,
        error: "Failed to extract invoice data from the document."
      };
    }
    
    // Clean and normalize the extracted data
    console.log('[DEBUG] Starting data cleaning...');
    const cleanedData = cleanInvoiceData(result.invoiceData);
    console.log('[DEBUG] Cleaned data:', JSON.stringify(cleanedData, null, 2));
    
    // Validate extracted data
    console.log('[DEBUG] Validating processed data...');
    const validationResult = invoiceDataSchema.safeParse(cleanedData);
    
    if (!validationResult.success) {
      console.error('[DEBUG] Validation error:', validationResult.error.format());
      return {
        success: false,
        error: "Failed to extract valid invoice data. Please check the document and try again.",
        details: validationResult.error.format()
      };
    }
    
    const invoiceData = validationResult.data;
    
    try {
      // Save file to disk
      console.log('[DEBUG] Saving file to disk...');
      const filePath = await saveFileFromBase64(fileContent, fileName);
      console.log('[DEBUG] File saved to:', filePath);
      
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
        filePath,
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
  
  // Clean dates using international format parser
  if (cleaned.invoiceDate) {
    cleaned.invoiceDate = parseInternationalDate(cleaned.invoiceDate);
  } else {
    cleaned.invoiceDate = new Date().toISOString().split('T')[0];
  }
  
  if (cleaned.dueDate) {
    cleaned.dueDate = parseInternationalDate(cleaned.dueDate);
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
  description: 'Process an invoice document and extract its data',
  parameters: z.object({
    fileContent: z.string().describe('Base64 encoded file content'),
    fileType: z.string().describe('MIME type of the file'),
    fileName: z.string().describe('Name of the file'),
    updateIfExists: z.boolean().optional().describe('Whether to update the invoice if it already exists')
  }),
  execute: processInvoiceImplementation
});