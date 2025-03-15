import {NextResponse} from 'next/server';
import {z} from 'zod';
import {auth} from '@/app/(auth)/auth';

// Use Blob instead of File since File is not available in Node.js environment
const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= 10 * 1024 * 1024, {
      message: 'File size should be less than 10MB',
    })
    // Update the file type to include PDF files
    .refine((file) => ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type), {
      message: 'File type should be JPEG, PNG, or PDF',
    }),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (request.body === null) {
    return new Response('Request body is empty', { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(', ');

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Get filename from formData since Blob doesn't have name property
    const filename = (formData.get('file') as File).name;
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    try {
      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const uniqueFilename = `${timestamp}-${filename}`;

      // Create data URL for immediate preview
      const dataURL = `data:${file.type};base64,${buffer.toString('base64')}`;

      return NextResponse.json({
        url: dataURL,
        pathname: `/uploads/${uniqueFilename}`,
        contentType: file.type
      });
    } catch (error) {
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 },
    );
  }
}
