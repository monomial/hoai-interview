'use client';

import { useChat } from 'ai/react';
import { useEffect, useRef } from 'react';
import { blockDefinitions, type BlockKind } from './block';
import type { Suggestion } from '@/lib/db/schema';
import { initialBlockData, useBlock } from '@/hooks/use-block';

export type DataStreamDelta = {
  type:
    | 'text-delta'
    | 'code-delta'
    | 'sheet-delta'
    | 'image-delta'
    | 'title'
    | 'id'
    | 'suggestion'
    | 'clear'
    | 'finish'
    | 'kind'
    | 'invoice-processed'
    | 'processing-status';
  content: string | Suggestion;
};

export function DataStreamHandler({ id }: { id: string }) {
  // Get the data stream from the chat API
  const { data: dataStream } = useChat({ id });
  
  // Get the current block state and methods to update it
  const { block, setBlock, setMetadata } = useBlock();
  
  // Keep track of which deltas we've already processed
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    // Skip if there's no data stream
    if (!dataStream?.length) return;

    // Get only the new deltas we haven't processed yet
    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    // Process each new delta
    (newDeltas as DataStreamDelta[]).forEach((delta: DataStreamDelta) => {
      // Find the block definition that matches the current block's kind
      const blockDefinition = blockDefinitions.find(
        (blockDefinition) => blockDefinition.kind === block.kind,
      );

      // If we found a block definition and it has an onStreamPart handler,
      // call it with the current delta
      if (blockDefinition?.onStreamPart) {
        blockDefinition.onStreamPart({
          streamPart: delta,
          setBlock,
          setMetadata,
        });
      }

      // Update the block state based on the delta type
      setBlock((draftBlock) => {
        // If no block exists, create a new one with initial state
        if (!draftBlock) {
          return { ...initialBlockData, status: 'streaming' };
        }

        // Handle different types of deltas
        switch (delta.type) {
          case 'id':
            // Update the document ID
            return {
              ...draftBlock,
              documentId: delta.content as string,
              status: 'streaming',
            };

          case 'title':
            // Update the block title
            return {
              ...draftBlock,
              title: delta.content as string,
              status: 'streaming',
            };

          case 'kind':
            // Update the block kind (e.g., from 'text' to 'invoice')
            return {
              ...draftBlock,
              kind: delta.content as BlockKind,
              status: 'streaming',
            };

          case 'clear':
            // Clear the block content
            return {
              ...draftBlock,
              content: '',
              status: 'streaming',
            };

          case 'finish':
            // Mark the block as finished processing
            return {
              ...draftBlock,
              status: 'idle',
            };

          default:
            // No changes needed for other delta types
            return draftBlock;
        }
      });
    });
  }, [dataStream, setBlock, setMetadata, block]);

  // This component doesn't render anything
  return null;
}
