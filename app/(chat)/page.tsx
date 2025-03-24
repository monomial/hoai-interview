import { cookies } from 'next/headers';

import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';

function InvoiceProcessingGuide() {
  return (
    <div className="p-4 bg-muted rounded-lg">
      <h2 className="text-xl font-semibold mb-2">Invoice Processing AI</h2>
      <p className="mb-3">
        Upload and process vendor invoices using AI to automatically extract key information.
      </p>
      <div className="text-sm">
        <p className="font-medium mb-1">How to use:</p>
        <ol className="list-decimal pl-5 space-y-0.5">
          <li>Upload an invoice PDF or image using the attachment button below</li>
          <li>Ask the AI to &quot;Process this invoice&quot;</li>
          <li>The AI will extract and validate the invoice information</li>
          <li>View and manage all processed invoices in the <strong>Invoices</strong> page</li>
        </ol>
      </div>
    </div>
  );
}

export default async function Page() {
  const id = generateUUID();
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get('chat-model');
  const selectedModel = modelIdFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-none p-4">
        <InvoiceProcessingGuide />
      </div>
      <div className="flex-1 overflow-hidden relative">
        <Chat
          key={id}
          id={id}
          initialMessages={[]}
          selectedChatModel={selectedModel}
          selectedVisibilityType="private"
        />
        <DataStreamHandler id={id} />
      </div>
    </div>
  );
}
