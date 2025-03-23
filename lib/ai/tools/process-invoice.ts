import { saveFileFromBase64 } from '@/lib/files';
import { 
  saveInvoice, 
  saveLineItems, 
  findDuplicateInvoice, 
  updateInvoice,
  deleteLineItemsByInvoiceId
} from '@/lib/db/queries';
import { tool, generateText, type DataStreamWriter } from 'ai';
import { z } from 'zod';
import { anthropic } from '@ai-sdk/anthropic';

// Define schema for line items
const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  total: z.number(),
});

// Define schema for invoice data
const invoiceDataSchema = z.object({
  customerName: z.string(),
  vendorName: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  dueDate: z.string().optional(),
  amount: z.number(),
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
    
    const response = await generateText({
      model: invoiceModel as any,
      messages: [{
        role: 'user',
        content: `You are an invoice processing specialist. Analyze this ${fileType} document and:
1. First determine if it is an invoice by looking for key indicators like:
   - Invoice number or reference
   - Billing details
   - Payment terms
   - Line items or charges
   - Total amount

2. If it is an invoice, extract the following data and return as JSON:
{
  "isInvoice": true,
  "data": {
    "customerName": "Customer/client name",
    "vendorName": "Vendor/supplier name",
    "invoiceNumber": "Invoice number/ID",
    "invoiceDate": "Issue date (YYYY-MM-DD)",
    "amount": "Total amount (number only)",
    "dueDate": "Due date (YYYY-MM-DD, optional)",
    "lineItems": [
      {
        "description": "Item description",
        "quantity": "Quantity (number)",
        "unitPrice": "Unit price (number)",
        "total": "Total for this line (number)"
      }
    ]
  }
}

3. If it is not an invoice, return:
{
  "isInvoice": false,
  "error": "Brief explanation of why it's not an invoice"
}

Base64 ${fileType}: ${fileContent}`
      }]
    });
    
    const responseText = response.text || '';
    console.log('[DEBUG] Combined validation/extraction response:', responseText);
    
    // Try different approaches to extract valid JSON
    let extractedJson;
    
    // First try: Extract JSON if it's wrapped in code blocks
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
      const cleanJson = jsonMatch[1].trim();
      extractedJson = JSON.parse(cleanJson);
    } catch (jsonError) {
      console.log('[DEBUG] Failed to parse JSON from code blocks, trying direct parsing');
      
      // Second try: Direct JSON parsing of the whole response
      try {
        extractedJson = JSON.parse(responseText.trim());
      } catch (directJsonError) {
        console.log('[DEBUG] Failed direct JSON parsing, trying to find JSON object in text');
        
        // Third try: Look for anything that looks like a JSON object
        try {
          const possibleJson = responseText.match(/(\{[\s\S]*\})/) || [null, '{}'];
          extractedJson = JSON.parse(possibleJson[1]);
        } catch (lastAttemptError) {
          console.error('[DEBUG] All JSON parsing attempts failed:', lastAttemptError);
          throw new Error('Failed to parse any valid JSON from AI response');
        }
      }
    }
    
    return extractedJson;
  } catch (error) {
    console.error('[DEBUG] Error in combined validation/extraction:', error);
    throw error;
  }
}

// Update the processInvoiceImplementation to use the combined function
export async function processInvoiceImplementation({ 
  fileContent, 
  fileType, 
  fileName, 
  updateIfExists = false,
  dataStream
}: z.infer<typeof processInvoiceSchema> & { dataStream?: DataStreamWriter }) {
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
        error: result.error || "The uploaded document does not appear to be an invoice."
      };
    }
    
    // Clean and normalize the extracted data
    console.log('[DEBUG] Starting data cleaning...');
    const cleanedData = cleanInvoiceData(result.data);
    console.log('[DEBUG] Cleaned data:', JSON.stringify(cleanedData, null, 2));
    
    // Apply fallback values for missing fields
    const processedData = {
      customerName: cleanedData.customerName || 'Unknown Customer',
      vendorName: cleanedData.vendorName || 'Unknown Vendor',
      invoiceNumber: cleanedData.invoiceNumber || `INV-${Date.now()}`,
      invoiceDate: cleanedData.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: cleanedData.dueDate,
      amount: cleanedData.amount !== undefined && cleanedData.amount !== null ? cleanedData.amount : 0,
      lineItems: cleanedData.lineItems || [],
    };
    
    // Validate extracted data
    console.log('[DEBUG] Validating processed data...');
    const validationResult = invoiceDataSchema.safeParse(processedData);
    
    if (!validationResult.success) {
      console.error('[DEBUG] Validation error:', validationResult.error.format());
      return {
        error: "Failed to extract valid invoice data. Please check the document and try again.",
        details: validationResult.error.format()
      };
    }
    
    const invoiceData = validationResult.data;
    
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

        // Write to data stream if available
        if (dataStream) {
          dataStream.writeData({
            type: 'invoice-processed',
            content: updatedInvoice
          });
        }
        
        return {
          success: true,
          message: "Invoice updated successfully",
          invoice: updatedInvoice
        };
      } else {
        return {
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

    // Write to data stream if available
    if (dataStream) {
      dataStream.writeData({
        type: 'invoice-processed',
        content: newInvoice
      });
    }
    
    return {
      success: true,
      message: "Invoice processed successfully",
      invoice: newInvoice
    };
  } catch (error) {
    console.error('[DEBUG] Error processing invoice:', error);
    return {
      error: "Failed to process invoice",
      details: error instanceof Error ? error.message : String(error)
    };
  }
}

// Helper function to clean and normalize invoice data
function cleanInvoiceData(data: any) {
  console.log('[DEBUG] Starting data cleaning process');
  const cleaned: any = { ...data };
  
  // Clean amount: ensure it's a number and not zero unless explicitly set
  if (typeof cleaned.amount === 'string') {
    // Remove currency symbols and commas
    const amountStr = cleaned.amount.replace(/[$,£€]/g, '').trim();
    cleaned.amount = parseFloat(amountStr) || 1.0; // Default to 1.0 if parsing fails
  } else if (cleaned.amount === 0 || cleaned.amount === null || cleaned.amount === undefined) {
    // If amount is 0, null, or undefined, set a reasonable default
    cleaned.amount = 1.0;
  }
  
  // Clean dates: ensure they're in YYYY-MM-DD format
  if (cleaned.invoiceDate) {
    try {
      // Try to parse and format the date
      const date = new Date(cleaned.invoiceDate);
      if (!isNaN(date.getTime())) {
        cleaned.invoiceDate = date.toISOString().split('T')[0];
      } else {
        // If parsing fails, use current date
        cleaned.invoiceDate = new Date().toISOString().split('T')[0];
      }
    } catch (e) {
      cleaned.invoiceDate = new Date().toISOString().split('T')[0];
    }
  }
  
  if (cleaned.dueDate) {
    try {
      const date = new Date(cleaned.dueDate);
      if (!isNaN(date.getTime())) {
        cleaned.dueDate = date.toISOString().split('T')[0];
      }
    } catch (e) {
      // If due date is invalid, set it to 30 days from invoice date
      if (cleaned.invoiceDate) {
        const invoiceDate = new Date(cleaned.invoiceDate);
        invoiceDate.setDate(invoiceDate.getDate() + 30);
        cleaned.dueDate = invoiceDate.toISOString().split('T')[0];
      }
    }
  }
  
  // Clean line items: ensure they have the required properties and correct types
  if (Array.isArray(cleaned.lineItems) && cleaned.lineItems.length > 0) {
    cleaned.lineItems = cleaned.lineItems.map((item: any) => {
      // Helper function to convert string numbers to actual numbers
      const toNumber = (value: any): number => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const num = parseFloat(value.replace(/[$,£€]/g, '').trim());
          return isNaN(num) ? 0 : num;
        }
        return 0;
      };

      return {
        description: item.description || 'Unspecified item',
        quantity: toNumber(item.quantity) || 1,
        unitPrice: toNumber(item.unitPrice),
        total: toNumber(item.total),
      };
    });
  } else if (!cleaned.lineItems || cleaned.lineItems.length === 0) {
    // If no line items, create a default one based on the total amount
    cleaned.lineItems = [{
      description: 'Invoice total',
      quantity: 1,
      unitPrice: cleaned.amount,
      total: cleaned.amount,
    }];
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