import { generateUUID } from '@/lib/utils';
import { type DataStreamWriter, tool } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import { blockKinds, documentHandlersByBlockKind } from '@/lib/blocks/server';

interface CreateDocumentProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      'Create a document for a writing or content creation activities. This tool will call other functions that will generate the contents of the document based on the title and kind.',
    parameters: z.object({
      title: z.string(),
      kind: z.enum(blockKinds),
    }),
    execute: async ({ title, kind }) => {
      console.log(`[DEBUG] createDocument tool called with title: "${title}", kind: "${kind}"`);
      
      // Special debug for invoice processing
      if (kind === 'invoice') {
        console.log('[DEBUG] *** INVOICE BLOCK CREATION REQUESTED! ***');
        console.log('[DEBUG] This log should appear when the AI calls createDocument with kind="invoice"');
      }
      
      const id = generateUUID();

      dataStream.writeData({
        type: 'kind',
        content: kind,
      });

      dataStream.writeData({
        type: 'id',
        content: id,
      });

      dataStream.writeData({
        type: 'title',
        content: title,
      });

      dataStream.writeData({
        type: 'clear',
        content: '',
      });

      const documentHandler = documentHandlersByBlockKind.find(
        (documentHandlerByBlockKind) =>
          documentHandlerByBlockKind.kind === kind,
      );

      if (!documentHandler) {
        console.error(`[DEBUG] No document handler found for kind: ${kind}`);
        throw new Error(`No document handler found for kind: ${kind}`);
      }
      
      console.log(`[DEBUG] Found document handler for kind: ${kind}, proceeding with creation`);

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
      });

      dataStream.writeData({ type: 'finish', content: '' });
      console.log(`[DEBUG] Document creation completed for id: ${id}`);

      return {
        id,
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      };
    },
  });
