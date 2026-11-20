'use client';

import { useBoard } from '@/hooks/use-board';
import { BoardCanvas } from '@/components/board/board-canvas';
import { cn } from '@/lib/shadcn/utils';

interface SessionSplitViewProps {
  chatPanel: React.ReactNode;
  className?: string;
}

/**
 * Splits the active session into a chat panel (left) and
 * the live blackboard (right). Collapses to stacked layout
 * on narrow screens using CSS Grid.
 *
 * Modern Web Guidance applied:
 *   css-layout       — grid with fr units, named areas
 *   interactions-in-complex-layouts — content-visibility: auto on board panel
 *   size-aware-styling — board collapses on mobile when empty
 */
export function SessionSplitView({ chatPanel, className }: SessionSplitViewProps) {
  const ops = useBoard();
  const hasBoard = ops.length > 0;

  return (
    <div
      className={cn(
        // MWG css-layout: 2-column grid on md+, stacked on mobile
        'grid h-svh w-full overflow-hidden bg-background',
        'grid-rows-[1fr_auto] md:grid-rows-1',
        'md:grid-cols-[minmax(320px,1fr)_2fr]',
        className
      )}
    >
      {/* ── Left column: Voice chat + controls ── */}
      <div className="relative z-10 flex flex-col overflow-hidden border-r border-border/40">
        {chatPanel}
      </div>

      {/* ── Right column: Live blackboard ── */}
      <div
        className={cn(
          'relative flex flex-col overflow-hidden',
          // Board surface
          'bg-background dark:bg-black',
          // MWG interactions-in-complex-layouts: isolate reflow
          '[content-visibility:auto]',
          '[contain-intrinsic-size:auto_240px_auto_600px]',
          // Collapse on mobile when board is empty
          hasBoard ? 'min-h-[220px]' : 'max-md:hidden'
        )}
        aria-label="Live blackboard drawn by the voice agent"
      >
        {/* Panel header */}
        <div
          className="flex h-10 shrink-0 items-center justify-between border-b
                     border-border/40 bg-background/80 px-4 backdrop-blur-sm
                     dark:bg-black/80"
        >
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span
              className={cn(
                'size-2 rounded-full transition-colors duration-500',
                hasBoard ? 'bg-emerald-500' : 'bg-muted-foreground/30'
              )}
            />
            <span>blackboard</span>
          </div>
          {hasBoard && (
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {ops.length} element{ops.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Canvas area */}
        {hasBoard ? (
          <BoardCanvas ops={ops} className="flex-1" />
        ) : (
          // Empty state — shown while agent hasn't drawn yet
          <div
            className="flex flex-1 select-none flex-col items-center
                       justify-center gap-3 text-muted-foreground/30"
          >
            <svg
              viewBox="0 0 64 64"
              className="size-14"
              aria-hidden="true"
              fill="none"
            >
              <rect
                x="4" y="12" width="56" height="40" rx="4"
                stroke="currentColor" strokeWidth="1.5"
              />
              <line
                x1="12" y1="32" x2="52" y2="32"
                stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"
              />
              <circle
                cx="32" cy="32" r="6"
                stroke="currentColor" strokeWidth="1"
              />
              <line
                x1="32" y1="4" x2="32" y2="12"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round"
              />
              <line
                x1="32" y1="52" x2="32" y2="60"
                stroke="currentColor" strokeWidth="1" strokeLinecap="round"
              />
            </svg>
            <p className="text-xs font-mono">
              Waiting for agent to draw…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
