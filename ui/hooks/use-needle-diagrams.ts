'use client';

import { useEffect } from 'react';
import { RpcError, type RpcInvocationData } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';
import { planDiagramLocal } from '@/lib/needle-diagram';

/** Set NEXT_PUBLIC_NEEDLE_DIAGRAMS=0 to disable the on-device planner. */
const ENABLED = process.env.NEXT_PUBLIC_NEEDLE_DIAGRAMS !== '0';

/**
 * Registers the `planDiagram` RPC method so the agent's
 * `plan_diagram_via_frontend` tool can delegate multi-item diagrams to the
 * on-device planner. The agent rebroadcasts returned ops on the data channel,
 * keeping snapshots and history authoritative server-side.
 */
export function useNeedleDiagrams(): void {
  const room = useRoomContext();

  useEffect(() => {
    if (!room || !ENABLED) return;

    const handler = async (data: RpcInvocationData): Promise<string> => {
      let topic = '';
      let detail = '';
      try {
        const parsed = JSON.parse(data.payload) as { topic?: unknown; detail?: unknown };
        if (typeof parsed.topic === 'string') topic = parsed.topic;
        if (typeof parsed.detail === 'string') detail = parsed.detail;
      } catch {
        throw new RpcError(400, 'bad planDiagram payload');
      }
      if (!topic.trim()) throw new RpcError(400, 'missing topic');

      const plan = await planDiagramLocal(topic, detail);
      if (plan.ops.length === 0) throw new RpcError(404, 'no diagram for topic');
      return JSON.stringify({ ops: plan.ops, source: plan.source });
    };

    room.registerRpcMethod('planDiagram', handler);
    return () => {
      room.unregisterRpcMethod('planDiagram');
    };
  }, [room]);
}
