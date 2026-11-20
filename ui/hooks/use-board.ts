'use client';

import { useEffect, useState } from 'react';
import { type RemoteParticipant, RoomEvent } from 'livekit-client';
import { useRoomContext } from '@livekit/components-react';
import type { BoardOp } from '@/lib/board-ops';
import { applyBoardMessage } from '@/lib/board-reducer';

/**
 * Subscribes to the agent's "board" data-channel topic and returns the
 * current list of visible board ops. The agent replays a full snapshot on
 * join, so no fetch-back is needed here.
 */
export function useBoard(): BoardOp[] {
  const room = useRoomContext();
  const [ops, setOps] = useState<BoardOp[]>([]);

  useEffect(() => {
    if (!room) return;
    const decoder = new TextDecoder();

    const onData = (
      payload: Uint8Array,
      _participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string
    ) => {
      if (topic !== 'board') return;
      try {
        const message = JSON.parse(decoder.decode(payload));
        setOps((prev) => applyBoardMessage(prev, message));
      } catch (error) {
        console.warn('discarding malformed board message', error);
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room]);

  return ops;
}
