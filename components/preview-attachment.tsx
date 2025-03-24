import type { Attachment } from 'ai';

import { LoaderIcon, ImageIcon, FileIcon, CodeIcon, TrashIcon } from './icons';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

// Helper function to determine the appropriate icon based on content type
const getIconForContentType = (contentType: string) => {
  if (contentType.startsWith('image')) {
    return <ImageIcon size={24} />;
  }
  if (contentType === 'application/pdf') {
    return <FileIcon size={24} />;
  }
  if (contentType.includes('text') || contentType.includes('application/json')) {
    return <CodeIcon size={24} />;
  }
  return <FileIcon size={24} />;
};

export const PreviewAttachment = ({
  attachment,
  isUploading = false,
  onRemove,
}: {
  attachment: Attachment;
  isUploading?: boolean;
  onRemove?: () => void;
}) => {
  const { name, url, contentType } = attachment;

  return (
    <div className="group flex flex-col gap-2">
      <div className="w-32 h-16 aspect-video bg-muted rounded-md relative flex flex-col items-center justify-center">
        {contentType ? (
          contentType.startsWith('image') ? (
            // NOTE: it is recommended to use next/image for images
            <img
              key={url}
              src={url}
              alt={name ?? 'An image attachment'}
              className="rounded-md size-full object-cover"
            />
          ) : (
            <div className="text-muted-foreground">
              {getIconForContentType(contentType)}
            </div>
          )
        ) : (
          <div className="text-muted-foreground">
            <FileIcon size={24} />
          </div>
        )}

        {isUploading && (
          <div className="animate-spin absolute text-zinc-500">
            <LoaderIcon />
          </div>
        )}

        {onRemove && !isUploading && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute -top-2 -right-2 size-6 rounded-full bg-background border opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-destructive hover:text-destructive-foreground"
            )}
            onClick={(e) => {
              e.preventDefault();
              onRemove();
            }}
          >
            <TrashIcon size={12} />
          </Button>
        )}
      </div>
      <div className="text-xs text-zinc-500 w-32 text-center truncate">{name}</div>
    </div>
  );
};
