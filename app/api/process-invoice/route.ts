import { NextRequest, NextResponse } from 'next/server';
import { processInvoiceImplementation } from '@/lib/ai/tools/process-invoice';

export async function POST(req: NextRequest): Promise<Response> {
  console.log('[DEBUG] /api/process-invoice endpoint called');

  try {
    // Get the form data from the request
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Get file details
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;

    console.log('[DEBUG] Processing file:', fileName, 'type:', fileType, 'size:', fileSize, 'bytes');

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');
    console.log('[DEBUG] File converted to base64, length:', base64Content.length);

    // Process the invoice
    console.log('[DEBUG] Calling processInvoiceImplementation');
    const result = await processInvoiceImplementation({
      fileContent: base64Content,
      fileType,
      fileName,
      updateIfExists: false
    });
    
    console.log(`[DEBUG] Invoice processing result: ${JSON.stringify(result, null, 2)}`);
    
    // Return the result directly
    return NextResponse.json(result);
  } catch (error) {
    console.error('[DEBUG] Error in process-invoice route:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process invoice',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 