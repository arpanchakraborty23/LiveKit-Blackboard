'use client';

import type { ReactElement } from 'react';

import type { GeometryPack } from '@/lib/board-ops';

/**
 * Minimal curriculum shape library for the "geometry" board op.
 * Shapes are authored in a 100x100 local space centered at the origin;
 * the parent group handles translation and scaling.
 */
type ShapeRenderer = () => ReactElement;

const rightTriangle = () => (
  <g>
    <path d="M -38 38 L 42 38 L -38 -34 Z" />
    <path d="M -38 24 L -24 24 L -24 38" />
    <path d="M 42 38 L 42 30" strokeDasharray="4 4" />
    <path d="M -38 -34 L -30 -34" strokeDasharray="4 4" />
  </g>
);

const equilateralTriangle = () => <path d="M 0 -44 L 40 32 L -40 32 Z" />;

const parallelogram = () => (
  <path d="M -28 30 L 44 30 L 28 -30 L -44 -30 Z" />
);

const trapezoid = () => <path d="M -26 34 L 26 34 L 42 -34 L -42 -34 Z" />;

const rectangle = () => <rect x={-44} y={-28} width={88} height={56} rx={2} />;

const circle = () => <circle cx={0} cy={0} r={42} />;

const coordinatePlane = () => (
  <g>
    {[-30, 0, 30].map((y) => (
      <line key={`h${y}`} x1={-45} y1={y} x2={45} y2={y} strokeWidth={0.75} opacity={0.35} />
    ))}
    {[-30, 0, 30].map((x) => (
      <line key={`v${x}`} x1={x} y1={-45} x2={x} y2={45} strokeWidth={0.75} opacity={0.35} />
    ))}
    <line x1={-45} y1={0} x2={48} y2={0} />
    <line x1={0} y1={48} x2={0} y2={-48} />
    <path d="M 48 0 l -6 -3 v 6 z" fill="currentColor" stroke="none" />
    <path d="M 0 -48 l -3 6 h 6 z" fill="currentColor" stroke="none" />
  </g>
);

const numberLine = () => (
  <g>
    <line x1={-46} y1={0} x2={50} y2={0} />
    <path d="M 50 0 l -7 -3.5 v 7 z" fill="currentColor" stroke="none" />
    {Array.from({ length: 9 }, (_, i) => i * 11.5 - 46).map((tick) => (
      <line key={tick} x1={tick} y1={-6} x2={tick} y2={6} />
    ))}
  </g>
);

const parabola = () => (
  <g>
    <line x1={-46} y1={30} x2={46} y2={30} strokeWidth={0.9} opacity={0.5} />
    <line x1={0} y1={46} x2={0} y2={-46} strokeWidth={0.9} opacity={0.5} />
    <path d="M -42 -38 Q 0 92 42 -38" transform="translate(0 -8)" />
  </g>
);

const barChart = () => {
  const bars: Array<[number, number]> = [
    [-36, 22],
    [-12, 40],
    [12, 30],
    [36, 14],
  ];
  return (
    <g>
      <line x1={-46} y1={40} x2={48} y2={40} />
      {bars.map(([cx, h]) => (
        <rect
          key={cx}
          x={cx - 10}
          y={40 - h}
          width={20}
          height={h}
          fill="currentColor"
          fillOpacity={0.18}
        />
      ))}
    </g>
  );
};

const normalDistribution = () => (
  <g>
    <line x1={-46} y1={34} x2={48} y2={34} />
    <path d="M -46 33 C -20 31, -14 30, -8 8 C -3 -10, 3 -10, 8 8 C 14 30, 20 31, 46 33" />
    <line x1={0} y1={-16} x2={0} y2={34} strokeDasharray="4 4" opacity={0.7} />
  </g>
);

const pieChart = () => (
  <g>
    <circle cx={0} cy={0} r={42} />
    <line x1={0} y1={0} x2={0} y2={-42} />
    <line x1={0} y1={0} x2={36.4} y2={21} />
    <line x1={0} y1={0} x2={-42} y2={0} />
    <path d="M 0 0 L 0 -42 A 42 42 0 0 1 36.4 21 Z" fill="currentColor" fillOpacity={0.15} />
  </g>
);

const pendulum = () => (
  <g>
    <line x1={-30} y1={-40} x2={30} y2={-40} />
    <line x1={0} y1={-40} x2={22} y2={28} />
    <circle cx={22} cy={28} r={13} fill="currentColor" fillOpacity={0.15} />
    <circle cx={0} cy={-40} r={3} fill="currentColor" stroke="none" />
    <path d="M 0 -40 A 70 70 0 0 1 30 -25" strokeDasharray="3 3" opacity={0.6} />
  </g>
);

const inclinedPlane = () => (
  <g>
    <path d="M -44 36 L 44 36 L 44 -20 Z" />
    <g transform="rotate(-27 22 -8) translate(22 -8)">
      <rect x={-9} y={-18} width={18} height={18} fill="currentColor" fillOpacity={0.15} />
    </g>
  </g>
);

const wave = () => (
  <path d="M -46 0 C -38 -34, -30 -34, -23 0 C -16 34, -8 34, 0 0 C 8 -34, 16 -34, 23 0 C 30 34, 38 34, 46 0" />
);

const simpleCircuit = () => (
  <g>
    <path d="M -30 -34 H 34 V 34 H -34 V -22 Z" />
    <line x1={-30} y1={-34} x2={-22} y2={-34} strokeWidth={3.5} />
    <line x1={-14} y1={-34} x2={-6} y2={-34} strokeWidth={3.5} />
    <path
      d="M -22 -40 V -28 M -14 -40 V -28 M -18 -44 V -24"
      strokeWidth={2}
      opacity={0.85}
    />
    <rect x={10} y={-42} width={16} height={16} fill="none" />
    <circle cx={-34} cy={-22} r={2.5} fill="currentColor" stroke="none" />
  </g>
);

const cell = () => (
  <g>
    <ellipse cx={0} cy={0} rx={46} ry={32} />
    <circle cx={-8} cy={2} r={13} fill="currentColor" fillOpacity={0.15} />
    <circle cx={-8} cy={2} r={4} fill="currentColor" fillOpacity={0.4} stroke="none" />
    <ellipse cx={22} cy={-12} rx={8} ry={4} fill="currentColor" fillOpacity={0.2} stroke="none" />
    <ellipse cx={26} cy={14} rx={6} ry={3.5} fill="currentColor" fillOpacity={0.2} stroke="none" />
    <ellipse cx={-28} cy={-14} rx={6} ry={3} fill="currentColor" fillOpacity={0.2} stroke="none" />
  </g>
);

const dnaHelix = () => {
  const rungs = Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const y = -40 + t * 80;
    const phase = Math.sin(t * Math.PI * 2);
    return (
      <g key={t}>
        <line x1={phase * 16 - 2} y1={y} x2={-phase * 16 + 2} y2={y} opacity={0.65} />
        <circle cx={phase * 16} cy={y} r={3} fill="currentColor" stroke="none" />
        <circle cx={-phase * 16} cy={y} r={3} fill="currentColor" stroke="none" />
      </g>
    );
  });
  return (
    <g>
      <path d="M -16 -44 C 16 -30, 16 -14, -16 0 C 16 14, 16 30, -16 44" />
      <path d="M 16 -44 C -16 -30, -16 -14, 16 0 C -16 14, -16 30, 16 44" opacity={0.7} />
      {rungs}
    </g>
  );
};

const leaf = () => (
  <g>
    <path d="M 0 44 C -34 20, -34 -20, 0 -44 C 34 -20, 34 20, 0 44 Z" />
    <line x1={0} y1={44} x2={0} y2={-44} />
    {[24, 8, -8, -24].map((y) => (
      <g key={y}>
        <line x1={0} y1={y} x2={Math.abs(y) * 0.55} y2={y - 10} opacity={0.7} />
        <line x1={0} y1={y} x2={-Math.abs(y) * 0.55} y2={y - 10} opacity={0.7} />
      </g>
    ))}
  </g>
);

const atom = () => (
  <g>
    <circle cx={0} cy={0} r={6} fill="currentColor" stroke="none" />
    <ellipse cx={0} cy={0} rx={44} ry={17} transform="rotate(30)" />
    <ellipse cx={0} cy={0} rx={44} ry={17} transform="rotate(-30)" />
    <circle cx={38} cy={-22} r={3.5} fill="currentColor" stroke="none" />
    <circle cx={-38} cy={22} r={3.5} fill="currentColor" stroke="none" />
  </g>
);

const waterMolecule = () => (
  <g>
    <circle cx={0} cy={8} r={20} />
    <circle cx={-24} cy={-20} r={11} />
    <circle cx={24} cy={-20} r={11} />
    <line x1={-14} y1={-4} x2={-18} y2={-11} opacity={0.8} />
    <line x1={14} y1={-4} x2={18} y2={-11} opacity={0.8} />
  </g>
);

const beaker = () => (
  <g>
    <path d="M -26 -38 V 26 Q -26 36 -16 36 H 16 Q 26 36 26 26 V -38" />
    <path d="M 26 -30 H -26 V 24 Q -26 30 -16 30 H 16 Q 26 30 26 24 Z" fill="currentColor" fillOpacity={0.12} stroke="none" />
    <line x1={-26} y1={-24} x2={26} y2={-24} strokeDasharray="3 4" opacity={0.7} />
  </g>
);

const REGISTRY: Partial<Record<GeometryPack, Record<string, ShapeRenderer>>> = {
  geometry: {
    right_triangle: rightTriangle,
    equilateral_triangle: equilateralTriangle,
    parallelogram,
    trapezoid,
    rectangle,
    circle,
  },
  algebra: {
    coordinate_plane: coordinatePlane,
    number_line: numberLine,
    parabola_curve: parabola,
  },
  statistics: {
    bar_chart: barChart,
    normal_distribution: normalDistribution,
    pie_chart: pieChart,
  },
  physics: {
    pendulum,
    inclined_plane: inclinedPlane,
    wave,
    simple_circuit: simpleCircuit,
  },
  biology: {
    cell,
    dna_helix: dnaHelix,
    leaf,
  },
  chemistry: {
    atom,
    water_molecule: waterMolecule,
    beaker,
  },
};

export function renderGeometryShape(
  pack: GeometryPack,
  shapeId: string,
  position: [number, number],
  size: number
): ReactElement | null {
  const renderer = REGISTRY[pack]?.[shapeId];

  if (!renderer) {
    const half = size / 2;
    return (
      <g transform={`translate(${position[0] + half} ${position[1] + half})`}>
        <rect
          x={-half / 2}
          y={-half / 2}
          width={half}
          height={half}
          strokeDasharray="6 5"
          rx={6}
          opacity={0.8}
        />
        <text
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={13}
          fill="currentColor"
          stroke="none"
          opacity={0.85}
        >
          {shapeId}
        </text>
      </g>
    );
  }

  const scale = size / 100;
  const half = size / 2;
  return (
    <g
      transform={`translate(${position[0] + half} ${position[1] + half}) scale(${scale})`}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5 / scale}
    >
      {renderer()}
    </g>
  );
}
