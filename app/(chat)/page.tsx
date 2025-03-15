import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';

export default async function Page() {
  const id = generateUUID();

  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');

  if (!modelIdFromCookie) {
    return (
      <>
        <div className="mb-8 p-4 bg-muted rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Invoice Processing AI</h2>
          <p className="mb-4">
            Upload and process vendor invoices using AI to automatically extract key information.
          </p>
          <div className="text-sm">
            <p className="font-medium mb-1">How to use:</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Upload an invoice PDF or image using the attachment button below</li>
              <li>Ask the AI to "Process this invoice"</li>
              <li>The AI will extract and validate the invoice information</li>
              <li>View and manage all processed invoices in the <strong>Invoices</strong> page</li>
            </ol>
          </div>
        </div>
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          selectedChatModel={DEFAULT_CHAT_MODEL}
          selectedVisibilityType="private"
          isReadonly={false}
        />
        <DataStreamHandler id={id} />
      </>
    );
  }

  return (
    <>
      <div className="mb-8 p-4 bg-muted rounded-lg">
        <h2 className="text-xl font-semibold mb-2">Invoice Processing AI</h2>
        <p className="mb-4">
          Upload and process vendor invoices using AI to automatically extract key information.
        </p>
        <div className="text-sm">
          <p className="font-medium mb-1">How to use:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Upload an invoice PDF or image using the attachment button below</li>
            <li>Ask the AI to "Process this invoice"</li>
            <li>The AI will extract and validate the invoice information</li>
            <li>View and manage all processed invoices in the <strong>Invoices</strong> page</li>
          </ol>
        </div>
      </div>
      <Chat
        key={id}
        id={id}
        initialMessages={[]}
        selectedChatModel={modelIdFromCookie.value}
        selectedVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
