import { createDocumentHandler } from "@/lib/blocks/server";
import { processInvoice } from "@/lib/ai/tools/process-invoice";
import { z } from "zod";
import { streamObject } from "ai";
import { myProvider } from "@/lib/ai/models";

export const invoiceDocumentHandler = createDocumentHandler<"invoice">({
  kind: "invoice",
  onCreateDocument: async ({ title, dataStream }) => {
    console.log(`[DEBUG] Invoice block onCreateDocument called with title: "${title}"`);
    
    // For initial creation, we just return an empty object
    // The actual invoice processing happens when a file is uploaded
    dataStream.writeData({
      type: "processing-status",
      content: "idle"
    });
    
    console.log(`[DEBUG] Invoice block initialized with empty content`);
    return "{}";
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    console.log(`[DEBUG] Invoice block onUpdateDocument called with description: "${description}"`);
    
    // This would handle updates to the invoice document
    // For example, when a user wants to process a new invoice or refresh the list
    
    if (description.toLowerCase().includes("refresh") || description.toLowerCase().includes("update")) {
      console.log(`[DEBUG] Invoice block refreshing content`);
      // Just refresh the current content
      return document.content;
    }
    
    // If the description contains "process this invoice" or similar, we would
    // normally extract file information and process it, but that's handled by the
    // client-side code directly through the API endpoint
    
    dataStream.writeData({
      type: "processing-status",
      content: "idle"
    });
    
    console.log(`[DEBUG] Invoice block returning current content`);
    return document.content;
  }
}); 