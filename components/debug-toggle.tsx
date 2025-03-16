'use client';

import { useDebugMode } from '@/hooks/use-debug-mode';
import { Button } from './ui/button';
import { BugIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function DebugToggle() {
  const { isDebugMode, toggleDebugMode } = useDebugMode();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isDebugMode ? "default" : "ghost"}
          size="icon"
          onClick={toggleDebugMode}
          className={isDebugMode ? "bg-amber-500 hover:bg-amber-600 text-white" : "text-muted-foreground"}
        >
          <BugIcon size={18} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDebugMode ? 'Disable Debug Mode' : 'Enable Debug Mode'}
      </TooltipContent>
    </Tooltip>
  );
} 