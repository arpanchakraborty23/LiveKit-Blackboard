'use client';

import { useEffect, useMemo, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { parse as parseMath } from 'mathjs';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardOp,
  type GeometryOp,
  type GraphOp,
  type HighlightOp,
  type LabelOp,
  type LatexOp,
  type LineOp,
  type PointToOp,
  type ShapeOp,
  type TextOp,
  isHighlightOp,
  isPointToOp,
} from '@/lib/board-ops';
import { cn } from '@/lib/shadcn/utils';
import { renderGeometryShape } from './geometry-shapes';

const CHALK = '#f2efe4';
const CHALK_FADED = 'rgba(242, 239, 228, 0.45)';
const BOARD_FONT = "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive";

/** Client-side expiry for pointer effects when the agent omits ttlMs. */
const EFFECT_TTL_FALLBACK_MS = 6000;

/* Entrance/reveal animations (fade + scale + drift), adapted from OpenMAIC's
   AnimatedElementBase curve — simplified to CSS keyframes on SVG groups. */
const BOARD_CSS = `
  .board-item-enter {
    animation: board-enter 450ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
    transform-box: fill-box;
    transform-origin: center;
  }
  @keyframes board-enter {
    from { opacity: 0; transform: translateY(8px) scale(0.92); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0) scale(1);     filter: blur(0); }
  }
  .board-fade-in { animation: board-fade-in 300ms ease-out backwards; }
  @keyframes board-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .board-pop-in {
    animation: board-pop-in 350ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards;
  }
  @keyframes board-pop-in {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  .board-pointer-draw {
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
    animation: board-draw 500ms ease-out forwards;
  }
  @keyframes board-draw { to { stroke-dashoffset: 0; } }
  .board-effect { animation: board-fade-in 250ms ease-out; }
`;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ---------------------------------- layout --------------------------------- */

// Graphs carry no position in the op vocabulary, so they get deterministic slots.
const GRAPH_BASE: Rect = { x: 205, y: 160, width: 380, height: 285 };

function graphBox(index: number): Rect {
  const offset = Math.min(index, 4);
  return {
    x: GRAPH_BASE.x + offset * 24,
    y: GRAPH_BASE.y + offset * 18,
    width: GRAPH_BASE.width,
    height: GRAPH_BASE.height,
  };
}

function buildGraphIndex(ops: BoardOp[]): Map<number, number> {
  const index = new Map<number, number>();
  let next = 0;
  for (const op of ops) {
    if (op.kind === 'graph') index.set(op.seq, next++);
    else if (op.kind === 'clear') next = 0;
  }
  return index;
}

function estimateOpRect(op: BoardOp, graphIndex: Map<number, number>): Rect | null {
  switch (op.kind) {
    case 'shape': {
      if (op.shape === 'rect')
        return { x: op.position[0], y: op.position[1], width: op.size, height: op.size };
      const half = op.size / 2;
      return {
        x: op.position[0] - half,
        y: op.position[1] - half,
        width: op.size,
        height: op.size,
      };
    }
    case 'line':
      return {
        x: Math.min(op.from_[0], op.to[0]) - 8,
        y: Math.min(op.from_[1], op.to[1]) - 8,
        width: Math.abs(op.to[0] - op.from_[0]) + 16,
        height: Math.abs(op.to[1] - op.from_[1]) + 16,
      };
    case 'text': {
      const fontSize = op.fontSize ?? 24;
      return {
        x: op.position[0] - 6,
        y: op.position[1] - 10,
        width: op.content.length * fontSize * 0.62 + 12,
        height: fontSize * 1.6,
      };
    }
    case 'latex':
      return {
        x: op.position[0] - 6,
        y: op.position[1] - 6,
        width: Math.min(op.content.length * 14 + 24, 420),
        height: 64,
      };
    case 'graph':
      return graphBox(graphIndex.get(op.seq) ?? 0);
    case 'geometry':
      return { x: op.position[0], y: op.position[1], width: op.size, height: op.size };
    default:
      return null;
  }
}

/* ----------------------------------- plot ---------------------------------- */

interface SampledPlot {
  path: string;
  yMin: number;
  yMax: number;
  valid: boolean;
}

function sampleFunction(expr: string, domain: [number, number], box: Rect): SampledPlot {
  try {
    const compiled = parseMath(expr).compile();
    const steps = 220;
    const points: Array<[number, number | null]> = [];
    for (let i = 0; i <= steps; i++) {
      const x = domain[0] + ((domain[1] - domain[0]) * i) / steps;
      let y: number;
      try {
        y = Number(compiled.evaluate({ x }));
      } catch {
        y = NaN;
      }
      points.push([x, Number.isFinite(y) ? y : null]);
    }

    const finiteYs = points.flatMap(([, y]) => (y !== null ? [y] : [])).sort((a, b) => a - b);
    if (finiteYs.length === 0) return { path: '', yMin: -1, yMax: 1, valid: false };

    const lo = finiteYs[Math.floor(finiteYs.length * 0.02)] ?? finiteYs[0];
    const hi = finiteYs[Math.floor(finiteYs.length * 0.98)] ?? finiteYs.at(-1)!;
    let yMin = lo;
    let yMax = hi === lo ? lo + 1 : hi;
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;

    const margin = { left: 44, right: 14, top: 34, bottom: 28 };
    const sx = (x: number) =>
      box.x +
      margin.left +
      ((x - domain[0]) / (domain[1] - domain[0])) * (box.width - margin.left - margin.right);
    const sy = (y: number) =>
      box.y +
      margin.top +
      (1 - (y - yMin) / (yMax - yMin)) * (box.height - margin.top - margin.bottom);

    let path = '';
    let penDown = false;
    for (const [x, y] of points) {
      if (y === null || y < yMin - (yMax - yMin) || y > yMax + (yMax - yMin)) {
        penDown = false;
        continue;
      }
      const px = sx(x).toFixed(1);
      const py = sy(y).toFixed(1);
      path += `${penDown ? 'L' : 'M'}${px} ${py}`;
      penDown = true;
    }
    return { path, yMin, yMax, valid: true };
  } catch {
    return { path: '', yMin: -1, yMax: 1, valid: false };
  }
}

function GraphView({ op, index }: { op: GraphOp; index: number }) {
  const box = graphBox(index);

  if (op.template === 'unit_circle') {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const r = Math.min(box.width, box.height) * 0.36;
    return (
      <g key={op.seq}>
        <line x1={box.x} y1={cy} x2={box.x + box.width} y2={cy} stroke={CHALK_FADED} />
        <line x1={cx} y1={box.y} x2={cx} y2={box.y + box.height} stroke={CHALK_FADED} />
        <circle cx={cx} cy={cy} r={r} />
        <line
          x1={cx}
          y1={cy}
          x2={cx + r * Math.SQRT1_2}
          y2={cy - r * Math.SQRT1_2}
          strokeDasharray="5 5"
        />
        <circle
          cx={cx + r * Math.SQRT1_2}
          cy={cy - r * Math.SQRT1_2}
          r={3.5}
          fill={CHALK}
          stroke="none"
        />
        <text x={cx + r + 8} y={cy + 4} fill={CHALK} fontSize={15} fontFamily={BOARD_FONT}>
          {'(1, 0)'}
        </text>
        <text x={cx + 6} y={cy - r - 6} fill={CHALK} fontSize={15} fontFamily={BOARD_FONT}>
          {'(0, 1)'}
        </text>
        <text
          x={cx + 34}
          y={cy - 42}
          fill={CHALK}
          fontSize={14}
          fontFamily={BOARD_FONT}
          opacity={0.85}
        >
          θ
        </text>
      </g>
    );
  }

  if (op.template === 'number_line') {
    const yMid = box.y + box.height / 2;
    const ticks = 10;
    const start = box.x + 40;
    const end = box.x + box.width - 40;
    return (
      <g key={op.seq}>
        <line
          x1={start - 20}
          y1={yMid}
          x2={end + 24}
          y2={yMid}
          stroke={CHALK}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path d={`M ${end + 24} ${yMid} l -10 -5 v 10 z`} fill={CHALK} />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const tx = start + ((end - start) * i) / ticks;
          const value = op.domain[0] + ((op.domain[1] - op.domain[0]) * i) / ticks;
          return (
            <g key={i}>
              <line x1={tx} y1={yMid - 7} x2={tx} y2={yMid + 7} stroke={CHALK} />
              <text
                x={tx}
                y={yMid + 26}
                textAnchor="middle"
                fill={CHALK}
                fontSize={13}
                fontFamily={BOARD_FONT}
              >
                {Math.round(value * 100) / 100}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  const plot = sampleFunction(op.expr, op.domain, box);

  return (
    <g key={op.seq}>
      <text
        x={box.x + 2}
        y={box.y + 18}
        fill={CHALK}
        fontSize={17}
        fontFamily={BOARD_FONT}
        opacity={0.9}
      >
        y = {op.expr}
      </text>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={8}
        stroke={CHALK_FADED}
        strokeWidth={1}
        strokeDasharray="2 6"
      />
      {/* zero axes */}
      {plot.valid && (
        <>
          {plot.yMin < 0 && plot.yMax > 0 && (
            <ZeroLine box={box} horizontal fraction={(0 - plot.yMin) / (plot.yMax - plot.yMin)} />
          )}
          {op.domain[0] < 0 && op.domain[1] > 0 && (
            <ZeroLine box={box} fraction={(0 - op.domain[0]) / (op.domain[1] - op.domain[0])} />
          )}
        </>
      )}
      {plot.valid ? (
        <path d={plot.path} fill="none" stroke="#ffd66e" strokeWidth={3} strokeLinecap="round" />
      ) : (
        <text
          x={box.x + box.width / 2}
          y={box.y + box.height / 2}
          textAnchor="middle"
          fill={CHALK}
          fontSize={16}
          fontFamily={BOARD_FONT}
        >
          cannot plot &quot;{op.expr}&quot;
        </text>
      )}
    </g>
  );
}

function ZeroLine({
  box,
  horizontal,
  fraction,
}: {
  box: Rect;
  horizontal?: boolean;
  fraction: number;
}) {
  if (horizontal) {
    const y = box.y + 34 + fraction * (box.height - 34 - 28);
    return <line x1={box.x + 44} y1={y} x2={box.x + box.width - 14} y2={y} stroke={CHALK_FADED} />;
  }
  const x = box.x + 44 + fraction * (box.width - 44 - 14);
  return <line x1={x} y1={box.y + 34} x2={x} y2={box.y + box.height - 28} stroke={CHALK_FADED} />;
}

/* ---------------------------------- views ---------------------------------- */

function ShapeView({ op }: { op: ShapeOp }) {
  const common = {
    stroke: op.color || CHALK,
    strokeWidth: 3,
    vectorEffect: 'non-scaling-stroke' as const,
    fill: 'none',
  };
  if (op.shape === 'rect')
    return (
      <rect
        key={op.seq}
        x={op.position[0]}
        y={op.position[1]}
        width={op.size}
        height={op.size}
        rx={4}
        {...common}
      />
    );
  if (op.shape === 'triangle') {
    const [x, y] = op.position;
    const half = op.size / 2;
    return (
      <path
        key={op.seq}
        d={`M ${x} ${y - half} L ${x + half * 0.87} ${y + half * 0.5} L ${x - half * 0.87} ${y + half * 0.5} Z`}
        {...common}
        strokeLinejoin="round"
      />
    );
  }
  return (
    <circle key={op.seq} cx={op.position[0]} cy={op.position[1]} r={op.size / 2} {...common} />
  );
}

function LineView({ op }: { op: LineOp }) {
  return (
    <line
      key={op.seq}
      x1={op.from_[0]}
      y1={op.from_[1]}
      x2={op.to[0]}
      y2={op.to[1]}
      stroke={op.color || CHALK}
      strokeWidth={3}
      strokeLinecap="round"
    />
  );
}

function TextView({ op }: { op: TextOp }) {
  return (
    <text
      key={op.seq}
      x={op.position[0]}
      y={op.position[1]}
      fill={CHALK}
      fontSize={op.fontSize ?? 24}
      fontFamily={BOARD_FONT}
    >
      {op.content}
    </text>
  );
}

function LatexView({ op }: { op: LatexOp }) {
  const html = useMemo(
    () =>
      katex.renderToString(op.content, {
        throwOnError: false,
        displayMode: false,
        output: 'html',
      }),
    [op.content]
  );
  const width = Math.min(Math.max(op.content.length * 14 + 24, 80), 430);
  return (
    <foreignObject
      key={op.seq}
      x={op.position[0]}
      y={op.position[1] - 14}
      width={width}
      height={70}
    >
      <div
        dangerouslySetInnerHTML={{ __html: html }}
        style={{ color: CHALK, fontSize: (op.fontSize ?? 21) + 'px', lineHeight: 1 }}
      />
    </foreignObject>
  );
}

function GeometryView({ op }: { op: GeometryOp }) {
  return (
    <g key={op.seq} style={{ color: CHALK }}>
      {renderGeometryShape(op.pack, op.shape_id, op.position, op.size)}
      <text
        x={op.position[0] + op.size / 2}
        y={op.position[1] + op.size + 18}
        textAnchor="middle"
        fill={CHALK}
        fontSize={14}
        fontFamily={BOARD_FONT}
        opacity={0.75}
      >
        {op.shape_id.replaceAll('_', ' ')}
      </text>
    </g>
  );
}

function HighlightView({ op, rect }: { op: HighlightOp; rect: Rect | null }) {
  if (!rect) return null;
  const pad = 10;
  return (
    <g key={op.seq}>
      <rect
        x={rect.x - pad}
        y={rect.y - pad}
        width={rect.width + pad * 2}
        height={rect.height + pad * 2}
        rx={12}
        stroke={op.color || 'yellow'}
        strokeWidth={4}
        fill="none"
        filter="url(#board-glow)"
        opacity={0.95}
      />
      <text
        x={rect.x - pad + 6}
        y={rect.y - pad - 8}
        fill={op.color || 'yellow'}
        fontSize={13}
        fontWeight={700}
        fontFamily={BOARD_FONT}
      >
        ★ #{op.targetSeq}
      </text>
    </g>
  );
}

/* ------------------------- transient pointer effects ----------------------- */
/* Adapted from OpenMAIC's spotlight/laser pattern: the op only references a
   target element; the renderer resolves its bounding box and renders an
   overlay that self-expires (see EFFECT_TTL_FALLBACK_MS + ts stamping in the
   reducer). Effects are never part of persistent board content. */

const POINTER_COLOR = '#ffd66e';

function arrowTargetPoint(rect: Rect): { from: [number, number]; to: [number, number] } {
  // Come in from the left margin toward the vertical center of the target.
  const toX = rect.x - 8;
  const toY = rect.y + rect.height / 2;
  const fromX = Math.max(24, rect.x - rect.width / 2 - 90);
  const fromY = Math.max(30, toY - 60);
  return { from: [fromX, fromY], to: [toX, toY] };
}

function PointToView({ op, rect }: { op: PointToOp; rect: Rect | null }) {
  if (!rect) return null;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  let shape: React.ReactNode = null;
  if (op.style === 'arrow') {
    const { from, to } = arrowTargetPoint(rect);
    shape = (
      <>
        <line
          x1={from[0]}
          y1={from[1]}
          x2={to[0]}
          y2={to[1]}
          stroke={POINTER_COLOR}
          strokeWidth={3.5}
          strokeLinecap="round"
          className="board-pointer-draw"
        />
        {/* arrowhead */}
        <path
          d={`M ${to[0]} ${to[1]} l -12 -6 l 3 6 l -3 6 Z`}
          fill={POINTER_COLOR}
          className="board-fade-in"
        />
      </>
    );
  } else if (op.style === 'circle') {
    shape = (
      <ellipse
        cx={cx}
        cy={cy}
        rx={rect.width / 2 + 16}
        ry={rect.height / 2 + 12}
        stroke={POINTER_COLOR}
        strokeWidth={3.5}
        fill="none"
        filter="url(#board-glow)"
        className="board-pop-in"
        style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      />
    );
  } else if (op.style === 'underline') {
    shape = (
      <path
        d={`M ${rect.x - 4} ${rect.y + rect.height + 8} Q ${cx} ${rect.y + rect.height + 18} ${
          rect.x + rect.width + 4
        } ${rect.y + rect.height + 8}`}
        stroke={POINTER_COLOR}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        className="board-pointer-draw"
      />
    );
  } else {
    const pad = 8;
    shape = (
      <rect
        x={rect.x - pad}
        y={rect.y - pad}
        width={rect.width + pad * 2}
        height={rect.height + pad * 2}
        rx={10}
        stroke={POINTER_COLOR}
        strokeWidth={3.5}
        strokeDasharray="10 7"
        fill="none"
        filter="url(#board-glow)"
        className="board-fade-in"
      />
    );
  }

  return (
    <g key={op.seq} className="board-effect">
      {shape}
      {op.note && (
        <text
          x={Math.min(Math.max(cx, 60), BOARD_WIDTH - 60)}
          y={Math.max(rect.y - 14, 20)}
          textAnchor="middle"
          fill={POINTER_COLOR}
          fontSize={16}
          fontFamily={BOARD_FONT}
          className="board-fade-in"
        >
          {op.note}
        </text>
      )}
    </g>
  );
}

function LabelView({ op, rect }: { op: LabelOp; rect: Rect | null }) {
  if (!rect) return null;
  const offset = op.offset ?? 10;
  const fontSize = op.fontSize ?? 15;

  let x = rect.x;
  let y = rect.y;
  let anchor: 'start' | 'middle' | 'end' = 'start';
  switch (op.anchor) {
    case 'top':
      x = rect.x + rect.width / 2;
      y = rect.y - offset - 4;
      anchor = 'middle';
      break;
    case 'bottom':
      x = rect.x + rect.width / 2;
      y = rect.y + rect.height + offset + fontSize;
      anchor = 'middle';
      break;
    case 'left':
      x = rect.x - offset;
      y = rect.y + rect.height / 2 + fontSize / 3;
      anchor = 'end';
      break;
    case 'right':
      x = rect.x + rect.width + offset;
      y = rect.y + rect.height / 2 + fontSize / 3;
      anchor = 'start';
      break;
  }

  return (
    <g key={op.seq} className="board-item-enter">
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fill="#a8e6a1"
        fontSize={fontSize}
        fontFamily={BOARD_FONT}
        fontStyle="italic"
      >
        {op.content}
      </text>
    </g>
  );
}

/* ---------------------------------- canvas --------------------------------- */

export interface BoardCanvasProps {
  ops: BoardOp[];
  className?: string;
}

export function BoardCanvas({ ops, className }: BoardCanvasProps) {
  const items = ops.filter((op) => op.kind !== 'clear' && !isHighlightOp(op) && !isPointToOp(op));
  const highlights = ops.filter(isHighlightOp);
  const graphIndex = useMemo(() => buildGraphIndex(ops), [ops]);

  // Transient pointer effects expire client-side (OpenMAIC's auto-clear), so we
  // need a ticking clock while any effect is on screen to re-render on expiry.
  const effects = ops.filter(isPointToOp);
  const [now, setNow] = useState(() => Date.now());
  const hasLiveEffect = effects.some(
    (e) => now - (e.ts ?? 0) < (e.ttlMs ?? EFFECT_TTL_FALLBACK_MS)
  );
  useEffect(() => {
    if (!hasLiveEffect) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [hasLiveEffect]);
  const liveEffects = effects.filter(
    (e) => now - (e.ts ?? 0) < (e.ttlMs ?? EFFECT_TTL_FALLBACK_MS)
  );

  const rectBySeq = useMemo(() => {
    const map = new Map<number, Rect>();
    for (const op of items) {
      const rect = estimateOpRect(op, graphIndex);
      if (rect) map.set(op.seq, rect);
    }
    return map;
  }, [items, graphIndex]);

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-xl border border-white/10 bg-[#212720] shadow-[inset_0_0_60px_rgba(0,0,0,0.55)]',
        className
      )}
    >
      <svg
        viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Shared blackboard drawn by the voice agent"
      >
        <defs>
          <style>{BOARD_CSS}</style>
          <filter id="board-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="board-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="rgba(242,239,228,0.05)"
              strokeWidth="1"
            />
          </pattern>
        </defs>

        <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="url(#board-grid)" />

        {items.map((op) => {
          switch (op.kind) {
            case 'shape':
              return (
                <g key={op.seq} className="board-item-enter">
                  <ShapeView op={op} />
                </g>
              );
            case 'line':
              return (
                <g key={op.seq} className="board-item-enter">
                  <LineView op={op} />
                </g>
              );
            case 'text':
              return (
                <g key={op.seq} className="board-item-enter">
                  <TextView op={op} />
                </g>
              );
            case 'latex':
              return (
                <g key={op.seq} className="board-item-enter">
                  <LatexView op={op} />
                </g>
              );
            case 'graph':
              return (
                <g key={op.seq} className="board-item-enter">
                  <GraphView op={op} index={graphIndex.get(op.seq) ?? 0} />
                </g>
              );
            case 'geometry':
              return (
                <g key={op.seq} className="board-item-enter">
                  <GeometryView op={op} />
                </g>
              );
            case 'label':
              return null; // rendered below, anchored to its target rect
            default:
              return null;
          }
        })}

        {/* anchored labels — resolved against their target's bounding box */}
        {items
          .filter((op): op is LabelOp => op.kind === 'label')
          .map((op) => (
            <LabelView key={op.seq} op={op} rect={rectBySeq.get(op.targetSeq) ?? null} />
          ))}

        {highlights.map((op) => (
          <HighlightView key={op.seq} op={op} rect={rectBySeq.get(op.targetSeq) ?? null} />
        ))}

        {/* transient pointer overlays — on top of everything */}
        {liveEffects.map((op) => (
          <PointToView key={op.seq} op={op} rect={rectBySeq.get(op.targetSeq) ?? null} />
        ))}
      </svg>

      {items.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <p
            className="max-w-xs text-center text-lg opacity-50"
            style={{ fontFamily: BOARD_FONT, color: CHALK }}
          >
            The board is empty — ask me to draw something!
          </p>
        </div>
      )}

      <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1 backdrop-blur-sm">
        <span className="size-2 rounded-full bg-emerald-400/80" aria-hidden />
        <span className="text-xs font-medium tracking-wide text-white/70">
          Blackboard · {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
