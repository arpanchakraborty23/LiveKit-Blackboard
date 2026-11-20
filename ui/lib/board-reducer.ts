import type { BoardOp } from './board-ops';

export interface BoardMessage {
  type?: string;
  op?: BoardOp;
  ops?: BoardOp[];
  clear?: boolean;
}

export function applyBoardMessage(prev: BoardOp[], message: any): BoardOp[] {
  if (!message) return prev;
  if (message.clear) return [];
  if (Array.isArray(message.ops)) return message.ops;
  if (message.op) return [...prev, message.op];
  return prev;
}
