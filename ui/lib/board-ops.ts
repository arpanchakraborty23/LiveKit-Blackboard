export const BOARD_WIDTH = 1920;
export const BOARD_HEIGHT = 1080;

export type GeometryPack = 'math' | 'geometry' | 'science' | string;

export interface BaseOp {
  seq?: number;
  ttlMs?: number;
  color?: string;
}

export interface GeometryOp extends BaseOp {
  type: 'geometry';
  pack: GeometryPack;
  shapeId: string;
  position: [number, number];
  size: number;
}

export interface GraphOp extends BaseOp {
  type: 'graph';
  template?: string;
  expr?: string;
  domain?: [number, number];
  range?: [number, number];
}

export interface HighlightOp extends BaseOp {
  type: 'highlight';
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface LabelOp extends BaseOp {
  type: 'label';
  text: string;
  position: [number, number];
}

export interface LatexOp extends BaseOp {
  type: 'latex';
  latex: string;
  position: [number, number];
}

export interface LineOp extends BaseOp {
  type: 'line';
  from: [number, number];
  to: [number, number];
  dashed?: boolean;
}

export interface PointToOp extends BaseOp {
  type: 'point_to';
  position: [number, number];
  label?: string;
}

export interface ShapeOp extends BaseOp {
  type: 'shape';
  kind: string;
  rect?: [number, number, number, number];
}

export interface TextOp extends BaseOp {
  type: 'text';
  text: string;
  position: [number, number];
}

export type BoardOp =
  | GeometryOp
  | GraphOp
  | HighlightOp
  | LabelOp
  | LatexOp
  | LineOp
  | PointToOp
  | ShapeOp
  | TextOp
  | (BaseOp & { type: string; [key: string]: any });

export function isHighlightOp(op: any): op is HighlightOp {
  return op?.type === 'highlight';
}

export function isPointToOp(op: any): op is PointToOp {
  return op?.type === 'point_to';
}
