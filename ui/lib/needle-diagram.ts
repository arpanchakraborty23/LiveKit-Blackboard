import type { BoardOp } from './board-ops';

export interface DiagramPlan {
  ops: BoardOp[];
  source?: string;
}

export async function planDiagramLocal(topic: string, detail?: string): Promise<DiagramPlan> {
  return { ops: [], source: 'local' };
}
