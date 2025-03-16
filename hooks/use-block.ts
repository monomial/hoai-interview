'use client';

import useSWR from 'swr';
import type { UIBlock } from '@/components/block';
import { useCallback, useMemo } from 'react';

export const initialBlockData: UIBlock = {
  documentId: 'init',
  content: '',
  kind: 'text',
  title: '',
  status: 'idle',
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

type Selector<T> = (state: UIBlock) => T;

export function useBlockSelector<Selected>(selector: Selector<Selected>) {
  const { data: localBlock } = useSWR<UIBlock>('block', null, {
    fallbackData: initialBlockData,
  });

  const selectedValue = useMemo(() => {
    if (!localBlock) return selector(initialBlockData);
    return selector(localBlock);
  }, [localBlock, selector]);

  return selectedValue;
}

export function useBlock() {
  const { data: localBlock, mutate: setLocalBlock } = useSWR<UIBlock>(
    'block',
    null,
    {
      fallbackData: initialBlockData,
    },
  );

  const block = useMemo(() => {
    if (!localBlock) return initialBlockData;
    console.log(`[DEBUG] Block state: kind=${localBlock.kind}, isVisible=${localBlock.isVisible}, status=${localBlock.status}`);
    return localBlock;
  }, [localBlock]);

  const setBlock = useCallback(
    (updaterFn: UIBlock | ((currentBlock: UIBlock) => UIBlock)) => {
      setLocalBlock((currentBlock) => {
        const blockToUpdate = currentBlock || initialBlockData;
        
        const newBlock = typeof updaterFn === 'function' 
          ? updaterFn(blockToUpdate)
          : updaterFn;
        
        console.log(`[DEBUG] Setting block: kind=${newBlock.kind}, isVisible=${newBlock.isVisible}, status=${newBlock.status}`);
        
        if (typeof updaterFn === 'function') {
          return updaterFn(blockToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalBlock],
  );

  const { data: localBlockMetadata, mutate: setLocalBlockMetadata } =
    useSWR<any>(
      () => (block.documentId ? `block-metadata-${block.documentId}` : null),
      null,
      {
        fallbackData: null,
      },
    );

  return useMemo(
    () => ({
      block,
      setBlock,
      metadata: localBlockMetadata,
      setMetadata: setLocalBlockMetadata,
    }),
    [block, setBlock, localBlockMetadata, setLocalBlockMetadata],
  );
}
