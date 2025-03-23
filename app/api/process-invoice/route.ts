import { NextRequest, NextResponse } from 'next/server';
import { processInvoiceImplementation } from '@/lib/ai/tools/process-invoice';
import { auth } from '@/app/(auth)/auth';

export async function POST(req: NextRequest) {
  console.log('[DEBUG] /api/process-invoice endpoint called');
  
  try {
    // Skip authentication in development mode
    if (process.env.NODE_ENV !== 'development') {
      const session = await auth();
      
      if (!session?.user) {
        console.log('[DEBUG] Unauthorized request to process invoice');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.log('[DEBUG] No file provided in request');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    console.log(`[DEBUG] Processing file: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
    
    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      console.log(`[DEBUG] Invalid file type: ${file.type}`);
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, JPEG, and PNG files are supported.' },
        { status: 400 }
      );
    }
    
    // Convert file to base64
    const fileBuffer = await file.arrayBuffer();
    const fileBase64 = Buffer.from(fileBuffer).toString('base64');
    console.log(`[DEBUG] File converted to base64, length: ${fileBase64.length}`);
    
    // Create a TransformStream for streaming the response
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();
    
    // Process the invoice
    console.log('[DEBUG] Calling processInvoiceImplementation');
    const result = await processInvoiceImplementation({
      fileContent: fileBase64,
      fileType: file.type,
      fileName: file.name,
      updateIfExists: true,
      dataStream: {
        writeData: async (data) => {
          const jsonStr = JSON.stringify(data);
          await writer.write(encoder.encode(`data: ${jsonStr}\n\n`));
          
          // If this is the final result, close the writer
          if (data.type === 'invoice-processed') {
            console.log('[DEBUG] Final result received, closing writer...');
            await writer.close();
            console.log('[DEBUG] Writer closed');
          }
        }
      }
    });
    
    console.log(`[DEBUG] Invoice processing result: ${JSON.stringify(result, null, 2)}`);
    
    // Return the stream response using Next.js's Response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[DEBUG] Error processing invoice:', error);
    return NextResponse.json(
      { error: 'Failed to process invoice' },
      { status: 500 }
    );
  }
} 