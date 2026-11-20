'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/shadcn/utils';

/** Self-drawing chalk SVG board preview */
function BoardPreviewSVG() {
  const BOARD_PREVIEW_CSS = `
    .chalk-draw {
      stroke-dasharray: 600;
      stroke-dashoffset: 600;
      animation: chalk-draw 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .chalk-draw-2 { animation-delay: 0.5s; }
    .chalk-draw-3 { animation-delay: 1.0s; }
    .chalk-fade {
      opacity: 0;
      animation: chalk-fade-in 0.5s ease-out 1.6s forwards;
    }
    @keyframes chalk-draw { to { stroke-dashoffset: 0; } }
    @keyframes chalk-fade-in { to { opacity: 1; } }
  `;

  return (
    <svg
      viewBox="0 0 540 300"
      className="h-full w-full"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <style>{BOARD_PREVIEW_CSS}</style>
        <pattern id="preview-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.07"
          />
        </pattern>
        <filter id="preview-glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Grid background */}
      <rect width="540" height="300" fill="url(#preview-grid)" />

      {/* Coordinate axes */}
      <line x1="60" y1="240" x2="500" y2="240" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
      <line x1="80"  y1="30"  x2="80"  y2="250" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />

      {/* Parabola y = x² */}
      <path
        d="M 100 220 Q 200 20 290 140 Q 380 260 480 60"
        fill="none"
        stroke="#ffd66e"
        strokeWidth="3"
        strokeLinecap="round"
        className="chalk-draw"
      />

      {/* Circle */}
      <circle
        cx="390" cy="130" r="52"
        stroke="oklch(0.68 0.17 235)"
        strokeWidth="2.5"
        className="chalk-draw chalk-draw-2"
      />

      {/* LaTeX label — fade in after curve is drawn */}
      <text
        x="90" y="68"
        fill="currentColor"
        fontSize="20"
        fontFamily="'Bradley Hand', 'Segoe Print', cursive"
        className="chalk-fade"
      >
        y = x²
      </text>

      {/* Vertex dot */}
      <circle
        cx="290" cy="140" r="5"
        fill="#ffd66e"
        filter="url(#preview-glow)"
        className="chalk-fade"
      />

      {/* Annotation */}
      <text
        x="300" y="130"
        fill="#ffd66e"
        fontSize="13"
        fontFamily="'Bradley Hand', 'Segoe Print', cursive"
        className="chalk-fade"
      >
        vertex
      </text>

      {/* Triangle (geometry op) */}
      <path
        d="M 170 230 L 220 150 L 270 230 Z"
        fill="none"
        stroke="oklch(0.72 0.22 350)"
        strokeWidth="2"
        strokeLinejoin="round"
        className="chalk-draw chalk-draw-3"
      />
    </svg>
  );
}

/** Animated status indicator */
function StatusPill() {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border/60
                 bg-background/60 px-4 py-1.5 backdrop-blur-sm"
    >
      <span className="relative flex size-2">
        <span
          className="absolute inline-flex size-full animate-ping rounded-full
                     bg-emerald-400 opacity-75"
        />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        Agent ready · LiveKit connected
      </span>
    </div>
  );
}

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  return (
    <div ref={ref} className="flex flex-col items-center gap-8 px-4 text-center">
      {/* ── Animated board preview card ── */}
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border
                   border-border/40 bg-card/40 shadow-xl backdrop-blur-sm
                   dark:bg-card/20 dark:shadow-primary/5"
        style={{ aspectRatio: '16/9' }}
      >
        <BoardPreviewSVG />

        {/* "board · live" pill in top-left */}
        <div
          className="absolute left-3 top-3 rounded-lg border border-border/40
                     bg-background/80 px-2 py-1 font-mono text-[10px]
                     text-muted-foreground backdrop-blur-sm"
        >
          board · preview
        </div>
      </div>

      {/* ── Headline + tagline ── */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Voice ·{' '}
          <span className="text-primary">Blackboard</span>
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          Talk to your AI tutor. It draws shapes, graphs, and equations
          on a shared canvas — in real time.
        </p>
      </div>

      {/* ── Status + CTA ── */}
      <div className="flex flex-col items-center gap-4">
        <StatusPill />
        <Button
          size="lg"
          onClick={onStartCall}
          className={cn(
            'w-56 rounded-full font-mono text-xs font-bold tracking-wider uppercase',
            'shadow-lg shadow-primary/20 transition-shadow',
            'hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98]',
            'transition-[box-shadow,transform] duration-200'
          )}
        >
          {startButtonText}
        </Button>
      </div>
    </div>
  );
};
