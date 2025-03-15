import { saveFileFromBase64 } from '@/lib/files';
import { 
  saveInvoice, 
  saveLineItems, 
  findDuplicateInvoice, 
  updateInvoice,
  deleteLineItemsByInvoiceId
} from '@/lib/db/queries';
import { tool, generateText } from 'ai';
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

export const processInvoice = tool({
  description: 'Process an invoice from an uploaded file and extract key information',
  parameters: z.object({
    fileContent: z.string().describe('Base64 encoded file content'),
    fileType: z.string().describe('MIME type of the file'),
    fileName: z.string().describe('Name of the file'),
    updateIfExists: z.boolean().optional().describe('Whether to update the invoice if it already exists')
  }),
  execute: async ({ fileContent, fileType, fileName, updateIfExists = false }) => {
    try {
      console.log('Starting invoice processing for file:', fileName);
      
      // First, validate that this is an invoice using AI
      const isInvoice = await validateIsInvoice(fileContent, fileType);
      console.log('Is document an invoice:', isInvoice);
      
      if (!isInvoice) {
        return {
          error: "The uploaded document does not appear to be an invoice."
        };
      }
      
      // Extract invoice data using AI
      let extractedData;
      try {
        extractedData = await extractInvoiceData(fileContent, fileType);
        console.log('Extracted data:', JSON.stringify(extractedData, null, 2));
      } catch (extractionError) {
        console.error('Error during invoice data extraction:', extractionError);
        return {
          error: "Failed to extract invoice data. The document may not be in a readable format.",
          details: extractionError instanceof Error ? extractionError.message : String(extractionError)
        };
      }
      
      // Clean and normalize the extracted data
      const cleanedData = cleanInvoiceData(extractedData);
      console.log('Cleaned data:', JSON.stringify(cleanedData, null, 2));
      
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
      const validationResult = invoiceDataSchema.safeParse(processedData);
      
      if (!validationResult.success) {
        console.error('Validation error:', validationResult.error.format());
        return {
          error: "Failed to extract valid invoice data. Please check the document and try again.",
          details: validationResult.error.format()
        };
      }
      
      const invoiceData = validationResult.data;
      
      // Save file to disk
      const filePath = await saveFileFromBase64(fileContent, fileName);
      
      // Check if invoice with the same invoice number already exists
      const existingInvoice = await findDuplicateInvoice({
        invoiceNumber: invoiceData.invoiceNumber,
        vendorName: invoiceData.vendorName
      });
      
      if (existingInvoice) {
        console.log('Duplicate invoice detected:', invoiceData.invoiceNumber);
        if (updateIfExists) {
          console.log('Updating existing invoice:', existingInvoice.id);
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
          
          return {
            success: true,
            message: "Invoice updated successfully",
            invoice: {
              id: existingInvoice.id,
              ...invoiceData
            }
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
      const { id: invoiceId } = await saveInvoice({
        customerName: invoiceData.customerName,
        vendorName: invoiceData.vendorName,
        invoiceNumber: invoiceData.invoiceNumber,
        invoiceDate: invoiceData.invoiceDate,
        dueDate: invoiceData.dueDate,
        amount: invoiceData.amount,
        filePath,
      });
      
      // Save line items if available
      if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
        await saveLineItems({
          invoiceId,
          items: invoiceData.lineItems,
        });
      }
      
      return {
        success: true,
        message: "Invoice processed successfully",
        invoice: {
          id: invoiceId,
          ...invoiceData
        }
      };
    } catch (error) {
      console.error('Error processing invoice:', error);
      return {
        error: "Failed to process invoice",
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Helper function to validate if the document is an invoice
async function validateIsInvoice(fileContent: string, fileType: string): Promise<boolean> {
  try {
    console.log('Processing invoice: true');
    // Use AI to determine if the document is an invoice
    const response = await generateText({
      model: invoiceModel as any, // Type cast to resolve compatibility issues
      messages: [{
        role: 'user',
        content: `Is this document an invoice? Please respond with only "yes" or "no".

Base64 encoded ${fileType} document: ${fileContent.substring(0, 100)}...`
      }]
    });
    
    // Extract the text from the response
    const responseText = response.text || '';
    console.log('Invoice validation response:', responseText);
    
    const answer = responseText.toLowerCase().trim();
    return answer === 'yes';
  } catch (error) {
    console.error('Error validating invoice:', error);
    // Default to false on error
    return false;
  }
}

// Helper function to extract invoice data using AI
async function extractInvoiceData(fileContent: string, fileType: string) {
  try {
    // For PDFs, use a specialized two-step approach
    if (fileType.includes('pdf')) {
      return await extractPdfInvoiceData(fileContent);
    }
    
    // For non-PDF files, use the standard approach
    const contentPreview = fileContent.substring(0, 100) + '...';
    
    // Use AI to extract structured data from the invoice
    const response = await generateText({
      model: invoiceModel as any, // Type cast to resolve compatibility issues
      messages: [{
        role: 'user',
        content: `You are an invoice data extraction specialist. You need to carefully analyze this ${fileType} document and extract ALL information accurately.

Required fields (must be included):
- customerName: The name of the customer/client receiving the invoice
- vendorName: The name of the vendor/supplier issuing the invoice
- invoiceNumber: The invoice number or ID
- invoiceDate: The date the invoice was issued (in YYYY-MM-DD format)
- amount: The total amount due as a number (no currency symbols)

Optional fields:
- dueDate: The payment due date if available (in YYYY-MM-DD format)
- lineItems: An array of items on the invoice, each with:
  - description: Description of the item
  - quantity: Quantity of the item (if available)
  - unitPrice: Price per unit (if available)
  - total: Total price for this line item

Important instructions:
1. For dates, convert any format to YYYY-MM-DD
2. For amount, extract only the number (e.g., 1234.56, not $1,234.56)
3. NEVER return 0 for amount unless the invoice explicitly states the amount is zero
4. NEVER return empty arrays for lineItems unless the invoice has no line items
5. Look carefully through the entire document for all information
6. If you cannot find a specific required field, make your best educated guess rather than returning null or placeholder values
7. Format the response as valid JSON only, with no additional text or explanations

Base64 encoded ${fileType} document: ${contentPreview}`
      }]
    });
    
    // Extract the text from the response
    const responseText = response.text || '';
    console.log('Invoice extraction raw response:', responseText);
    
    // Try different approaches to extract valid JSON
    let extractedJson;
    
    // First try: Extract JSON if it's wrapped in code blocks
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
      const cleanJson = jsonMatch[1].trim();
      extractedJson = JSON.parse(cleanJson);
    } catch (jsonError) {
      console.log('Failed to parse JSON from code blocks, trying direct parsing');
      
      // Second try: Direct JSON parsing of the whole response
      try {
        extractedJson = JSON.parse(responseText.trim());
      } catch (directJsonError) {
        console.log('Failed direct JSON parsing, trying to find JSON object in text');
        
        // Third try: Look for anything that looks like a JSON object
        try {
          const possibleJson = responseText.match(/(\{[\s\S]*\})/) || [null, '{}'];
          extractedJson = JSON.parse(possibleJson[1]);
        } catch (lastAttemptError) {
          console.error('All JSON parsing attempts failed:', lastAttemptError);
          throw new Error('Failed to parse any valid JSON from AI response');
        }
      }
    }
    
    return extractedJson;
  } catch (error) {
    console.error('Error extracting invoice data:', error);
    throw error;
  }
}

// Specialized function for PDF extraction using a two-step approach
async function extractPdfInvoiceData(fileContent: string) {
  try {
    // Step 1: First have the model read and describe the PDF content in detail
    const textExtractionResponse = await generateText({
      model: invoiceModel as any,
      messages: [{
        role: 'user',
        content: `You are a PDF content extraction specialist. First, carefully read this PDF document and extract ALL text content, including headers, tables, line items, dates, amounts, and any other relevant information. 

Describe the content in extreme detail, making sure to capture:
1. All header information (invoice number, dates, etc.)
2. Customer and vendor details
3. Complete line item details with descriptions, quantities, prices
4. All totals, subtotals, taxes, and final amounts
5. Payment terms and methods
6. Any notes or additional information

Format your response as plain text, capturing as much detail as possible from the PDF.

Base64 encoded PDF document: ${fileContent}`
      }]
    });
    
    const extractedText = textExtractionResponse.text || '';
    console.log('PDF text extraction result length:', extractedText.length);
    
    // Step 2: Now have the model structure this information into JSON
    const jsonExtractionResponse = await generateText({
      model: invoiceModel as any,
      messages: [{
        role: 'user',
        content: `You are an invoice data structuring specialist. Based on the following extracted text from a PDF invoice, create a properly structured JSON object with the following fields:

Required fields:
- customerName: The name of the customer/client
- vendorName: The name of the vendor/supplier
- invoiceNumber: The invoice number or ID
- invoiceDate: The date the invoice was issued (in YYYY-MM-DD format)
- amount: The total amount due as a number (no currency symbols)

Optional fields:
- dueDate: The payment due date if available (in YYYY-MM-DD format)
- lineItems: An array of items on the invoice, each with:
  - description: Description of the item
  - quantity: Quantity of the item (if available)
  - unitPrice: Price per unit (if available)
  - total: Total price for this line item

Important instructions:
1. For dates, convert any format to YYYY-MM-DD
2. For amount, extract only the number (e.g., 1234.56, not $1,234.56)
3. NEVER return 0 for amount unless the invoice explicitly states the amount is zero
4. NEVER return empty arrays for lineItems unless the invoice has no line items
5. If you cannot find a specific required field, make your best educated guess rather than returning null or placeholder values
6. Format the response as valid JSON only, with no additional text or explanations

Extracted PDF content:
${extractedText}`
      }]
    });
    
    const responseText = jsonExtractionResponse.text || '';
    console.log('PDF JSON extraction response length:', responseText.length);
    
    // Try different approaches to extract valid JSON
    let extractedJson;
    
    // First try: Extract JSON if it's wrapped in code blocks
    try {
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
      const cleanJson = jsonMatch[1].trim();
      extractedJson = JSON.parse(cleanJson);
    } catch (jsonError) {
      console.log('Failed to parse JSON from code blocks, trying direct parsing');
      
      // Second try: Direct JSON parsing of the whole response
      try {
        extractedJson = JSON.parse(responseText.trim());
      } catch (directJsonError) {
        console.log('Failed direct JSON parsing, trying to find JSON object in text');
        
        // Third try: Look for anything that looks like a JSON object
        try {
          const possibleJson = responseText.match(/(\{[\s\S]*\})/) || [null, '{}'];
          extractedJson = JSON.parse(possibleJson[1]);
        } catch (lastAttemptError) {
          console.error('All JSON parsing attempts failed:', lastAttemptError);
          throw new Error('Failed to parse any valid JSON from AI response');
        }
      }
    }
    
    return extractedJson;
  } catch (error) {
    console.error('Error in PDF extraction:', error);
    throw error;
  }
}

// Helper function to clean and normalize invoice data
function cleanInvoiceData(data: any) {
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
  
  // Clean line items: ensure they have the required properties
  if (Array.isArray(cleaned.lineItems) && cleaned.lineItems.length > 0) {
    cleaned.lineItems = cleaned.lineItems.map((item: any) => ({
      description: item.description || 'Unspecified item',
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      unitPrice: typeof item.unitPrice === 'number' ? item.unitPrice : (item.total || 0),
      total: typeof item.total === 'number' ? item.total : (item.unitPrice || 0),
    }));
  } else if (!cleaned.lineItems || cleaned.lineItems.length === 0) {
    // If no line items, create a default one based on the total amount
    cleaned.lineItems = [{
      description: 'Invoice total',
      quantity: 1,
      unitPrice: cleaned.amount,
      total: cleaned.amount,
    }];
  }
  
  return cleaned;
} 