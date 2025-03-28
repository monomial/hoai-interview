import { Block } from "@/components/create-block";
import { InvoicesTable } from "@/components/invoices-table";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Copy, Upload } from "lucide-react";

interface InvoiceBlockMetadata {
  currentInvoiceId: string | null;
  invoices: any[];
  isProcessing: boolean;
}

export const invoiceBlock = new Block<"invoice", InvoiceBlockMetadata>({
  kind: "invoice",
  description: "Process and manage invoices with AI-powered data extraction",
  initialize: async ({ documentId, setMetadata }) => {
    console.log(`[DEBUG] Invoice block initialize called with documentId: ${documentId}`);
    try {
      // Fetch existing invoices when the block is initialized
      const response = await fetch('/api/invoices');
      if (response.ok) {
        const invoices = await response.json();
        console.log(`[DEBUG] Fetched ${invoices.length} invoices`);
        setMetadata({
          currentInvoiceId: null,
          invoices,
          isProcessing: false
        });
      } else {
        console.log(`[DEBUG] Failed to fetch invoices, status: ${response.status}`);
        setMetadata({
          currentInvoiceId: null,
          invoices: [],
          isProcessing: false
        });
      }
    } catch (error) {
      console.error("[DEBUG] Error initializing invoice block:", error);
      setMetadata({
        currentInvoiceId: null,
        invoices: [],
        isProcessing: false
      });
    }
  },
  onStreamPart: ({ streamPart, setMetadata, setBlock }) => {
    console.log(`[DEBUG] Invoice block onStreamPart called with type: ${streamPart.type}`);
    
    if (streamPart.type === "invoice-processed") {
      const invoiceData = streamPart.content as any;
      console.log(`[DEBUG] Received processed invoice data for ID: ${invoiceData.id}`);
      
      setMetadata((metadata) => ({
        ...metadata,
        currentInvoiceId: invoiceData.id,
        isProcessing: false,
        invoices: [
          invoiceData,
          ...metadata.invoices.filter(inv => inv.id !== invoiceData.id)
        ]
      }));
      
      setBlock((draftBlock) => ({
        ...draftBlock,
        content: JSON.stringify(invoiceData, null, 2),
        status: "idle",
      }));
    }
    
    if (streamPart.type === "processing-status") {
      console.log(`[DEBUG] Received processing status: ${streamPart.content}`);
      
      setMetadata((metadata) => ({
        ...metadata,
        isProcessing: streamPart.content === "processing"
      }));
      
      setBlock((draftBlock) => ({
        ...draftBlock,
        status: streamPart.content === "processing" ? "streaming" : "idle",
      }));
    }
  },
  content: ({ content, metadata, setMetadata }) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    
    useEffect(() => {
      console.log('[DEBUG] Invoice block content rendered');
    }, []);
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        console.log(`[DEBUG] File selected: ${e.target.files[0].name}`);
        setSelectedFile(e.target.files[0]);
      }
    };
    
    const handleProcessInvoice = async () => {
      if (!selectedFile) {
        console.log('[DEBUG] No file selected for processing');
        toast.error("Please select an invoice file first");
        return;
      }
      
      console.log(`[DEBUG] Processing invoice file: ${selectedFile.name}`);
      setMetadata((metadata) => ({
        ...metadata,
        isProcessing: true
      }));
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      
      let reader: ReadableStreamDefaultReader | null = null;
      
      try {
        console.log('[DEBUG] Sending request to /api/process-invoice');
        const response = await fetch('/api/process-invoice', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          console.log(`[DEBUG] API request failed with status: ${response.status}`, errorData);
          toast.error(errorData.error || "Failed to process invoice");
          return;
        }
        
        // Handle streaming response
        if (!response.body) {
          throw new Error('No response body available');
        }
        
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log('[DEBUG] Stream complete');
            break;
          }
          
          // Convert the chunk to text and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete lines from the buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              // Remove the "data: " prefix if present (SSE format)
              const jsonStr = line.replace(/^data: /, '').trim();
              const data = JSON.parse(jsonStr);
              console.log(`[DEBUG] Received stream data:`, data);
              
              if (data.type === 'invoice-processed') {
                const invoiceData = data.content;
                console.log(`[DEBUG] Received processed invoice data for ID: ${invoiceData.id}`);
                
                setMetadata((metadata) => ({
                  ...metadata,
                  currentInvoiceId: invoiceData.id,
                  isProcessing: false,
                  invoices: [
                    invoiceData,
                    ...metadata.invoices.filter(inv => inv.id !== invoiceData.id)
                  ]
                }));
                
                toast.success("Invoice processed successfully");
              } else if (data.type === 'error') {
                console.log(`[DEBUG] Received error: ${data.content}`);
                toast.error(data.content);
                setMetadata((metadata) => ({
                  ...metadata,
                  isProcessing: false
                }));
              }
            } catch (e) {
              console.error('[DEBUG] Error parsing stream data:', e);
              toast.error("Error processing invoice data");
            }
          }
        }
      } catch (error) {
        console.error("[DEBUG] Error processing invoice:", error);
        toast.error(error instanceof Error ? error.message : "Error processing invoice");
      } finally {
        // Clean up
        if (reader) {
          reader.releaseLock();
        }
        setMetadata((metadata) => ({
          ...metadata,
          isProcessing: false
        }));
        setSelectedFile(null);
      }
    };
    
    return (
      <div className="flex flex-col p-6 gap-6">
        {/* Upload section */}
        <div className="border border-dashed rounded-lg p-6 bg-muted/30">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Upload an invoice file to process
            </p>
            <div className="mt-4">
              <input
                type="file"
                id="invoice-file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                onClick={(e) => {
                  // Reset the input value to allow selecting the same file again
                  e.currentTarget.value = '';
                }}
              />
              <label htmlFor="invoice-file" className="cursor-pointer">
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => {
                    // Trigger the file input click
                    document.getElementById('invoice-file')?.click();
                  }}
                >
                  Select File
                </Button>
              </label>
              {selectedFile && (
                <p className="mt-2 text-sm font-medium">
                  Selected: {selectedFile.name}
                </p>
              )}
            </div>
          </div>
          
          <div className="mt-4 flex justify-center">
            <Button 
              onClick={handleProcessInvoice}
              disabled={!selectedFile || metadata?.isProcessing}
            >
              {metadata?.isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Process Invoice"
              )}
            </Button>
          </div>
        </div>
        
        {/* Invoices table */}
        <div className="flex-1 overflow-auto">
          <InvoicesTable />
        </div>
      </div>
    );
  },
  actions: [
    {
      icon: <RefreshCw size={18} />,
      description: "Refresh invoices",
      onClick: async ({ setMetadata }) => {
        console.log('[DEBUG] Refresh invoices action clicked');
        try {
          const response = await fetch('/api/invoices');
          if (response.ok) {
            const invoices = await response.json();
            console.log(`[DEBUG] Refreshed ${invoices.length} invoices`);
            setMetadata((metadata) => ({
              ...metadata,
              invoices
            }));
            toast.success("Invoices refreshed");
          } else {
            console.log(`[DEBUG] Failed to refresh invoices, status: ${response.status}`);
            toast.error("Failed to refresh invoices");
          }
        } catch (error) {
          console.error("[DEBUG] Error refreshing invoices:", error);
          toast.error("Error refreshing invoices");
        }
      }
    },
    {
      icon: <Copy size={18} />,
      description: "Copy invoice data to clipboard",
      onClick: ({ content }) => {
        console.log('[DEBUG] Copy invoice data action clicked');
        navigator.clipboard.writeText(content);
        toast.success("Invoice data copied to clipboard");
      },
      isDisabled: ({ content }) => !content || content === "{}"
    }
  ],
  toolbar: [
    {
      icon: <RefreshCw />,
      description: "Refresh invoices list",
      onClick: ({ appendMessage }) => {
        console.log('[DEBUG] Refresh invoices toolbar action clicked');
        appendMessage({
          role: "user",
          content: "Please refresh the invoice list"
        });
      }
    }
  ]
}); 