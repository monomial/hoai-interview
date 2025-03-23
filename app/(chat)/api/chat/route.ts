import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
} from 'ai';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { processInvoice } from '@/lib/ai/tools/process-invoice';

export const maxDuration = 60;

export async function POST(request: Request) {
  console.log('[DEBUG] POST /api/chat called');
  
  const {
    id,
    messages,
    selectedChatModel,
  }: { id: string; messages: Array<Message>; selectedChatModel: string } =
    await request.json();

  console.log(`[DEBUG] Chat ID: ${id}, Selected model: ${selectedChatModel}`);
  
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    console.log('[DEBUG] Unauthorized request to chat API');
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    console.log('[DEBUG] No user message found');
    return new Response('No user message found', { status: 400 });
  }

  // Truncate messages to prevent rate limits
  const MAX_MESSAGES = 10; // Keep only the last 10 messages
  const truncatedMessages = messages.slice(-MAX_MESSAGES);
  console.log(`[DEBUG] Truncated messages from ${messages.length} to ${truncatedMessages.length}`);

  console.log(`[DEBUG] User message: "${typeof userMessage.content === 'string' ? userMessage.content : 'Non-string content'}"`);
  
  // Check for attachments
  const hasAttachments = userMessage.content && typeof userMessage.content !== 'string';
  if (hasAttachments) {
    console.log('[DEBUG] Message has attachments');
    const attachments = (userMessage.content as any).attachments || [];
    attachments.forEach((attachment: any, index: number) => {
      console.log(`[DEBUG] Attachment ${index + 1}: type=${attachment.type}, name=${attachment.name || 'unnamed'}`);
    });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    console.log('[DEBUG] Creating new chat');
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  // Check if the user is asking to process an invoice
  const isProcessingInvoice = typeof userMessage.content === 'string' && 
                             (userMessage.content.toLowerCase().includes('process this invoice') || 
                             userMessage.content.toLowerCase().includes('process invoice'));

  console.log(`[DEBUG] Is processing invoice: ${isProcessingInvoice}`);
  
  // If processing an invoice and has attachments, we should use the invoice block
  if (isProcessingInvoice && hasAttachments) {
    console.log('[DEBUG] Should use invoice block for this request - AI should call createDocument with kind: "invoice"');
    
    // Log attachment details for debugging
    if (typeof userMessage.content !== 'string') {
      const attachments = (userMessage.content as any).attachments || [];
      attachments.forEach((attachment: any, index: number) => {
        console.log(`[DEBUG] Invoice attachment ${index + 1}: type=${attachment.type}, name=${attachment.name || 'unnamed'}`);
      });
      
      // If we have a PDF attachment, we can process it directly
      const pdfAttachment = attachments.find((a: any) => a.type === 'application/pdf');
      if (pdfAttachment) {
        console.log('[DEBUG] Found PDF attachment, will process it after creating invoice block');
        // We'll process this after the invoice block is created
        // The AI model will handle this in its response
      }
    }
  }

  // Use the default chat model if processing an invoice
  const modelToUse = selectedChatModel;

  console.log(`[DEBUG] Using model: ${modelToUse} for chat. Processing invoice: ${isProcessingInvoice}`);

  return createDataStreamResponse({
    execute: (dataStream) => {
      console.log('[DEBUG] Starting stream execution');
      
      const result = streamText({
        model: myProvider.languageModel(modelToUse),
        system: systemPrompt({ selectedChatModel: modelToUse }),
        messages: truncatedMessages,
        maxSteps: 10,
        onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
          console.log('[DEBUG] Step finished', { text, toolCalls, toolResults, finishReason, usage });
        },
        experimental_activeTools:
          modelToUse === 'chat-model-reasoning'
            ? []
            : [
                'getWeather',
                'createDocument',
                'updateDocument',
                'requestSuggestions',
                'processInvoice',
              ],
        experimental_transform: smoothStream({ chunking: 'word' }),
        experimental_generateMessageId: generateUUID,
        tools: {
          getWeather,
          createDocument: createDocument({ 
            session: { 
              ...session, 
              expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
            }, 
            dataStream 
          }),
          updateDocument: updateDocument({ 
            session: { 
              ...session, 
              expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
            }, 
            dataStream 
          }),
          requestSuggestions: requestSuggestions({
            session: { 
              ...session, 
              expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
            },
            dataStream,
          }),
          processInvoice,
        },
        onFinish: async ({ response, reasoning }) => {
          console.log('[DEBUG] Stream finished');
          
          if (session.user?.id) {
            try {
              const sanitizedResponseMessages = sanitizeResponseMessages({
                messages: response.messages,
                reasoning,
              });

              await saveMessages({
                messages: sanitizedResponseMessages.map((message) => {
                  return {
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                  };
                }),
              });
              
              console.log('[DEBUG] Messages saved successfully');
            } catch (error) {
              console.error('[DEBUG] Failed to save chat', error);
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (error) => {
      console.error('[DEBUG] Error in chat API:', error);
      
      // Provide more detailed error message
      let errorMessage = 'Oops, an error occurred!';
      
      if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
        
        // Log the full error for debugging
        console.error('[DEBUG] Full error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
      
      return errorMessage;
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
