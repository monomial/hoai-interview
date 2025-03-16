import { NextRequest, NextResponse } from 'next/server';
import { processInvoice } from '@/lib/ai/tools/process-invoice';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  console.log('[DEBUG] /api/process-invoice endpoint called');
  
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      console.log('[DEBUG] Unauthorized request to process invoice');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
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
    
    // Process the invoice
    console.log('[DEBUG] Calling processInvoice.invoke');
    const result = await processInvoice.invoke({
      fileContent: fileBase64,
      fileType: file.type,
      fileName: file.name,
      updateIfExists: true
    });
    
    console.log(`[DEBUG] Invoice processing result: ${JSON.stringify(result, null, 2)}`);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[DEBUG] Error processing invoice:', error);
    return NextResponse.json(
      { error: 'Failed to process invoice' },
      { status: 500 }
    );
  }
} 