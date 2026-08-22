"""In-memory per-room blackboard state and data-channel broadcast helpers.

Board history lives inside the agent process keyed by room name. Ops are
broadcast over LiveKit's data channel on the "board" topic; late joiners and
reconnecting clients receive a full snapshot on join.
"""

from __future__ import annotations

import itertools
import json
from typing import Any

from livekit.rtc import Room

BOARD_TOPIC = "board"

_seq_counters: dict[str, itertools.count[int]] = {}
_board_ops: dict[str, list[dict[str, Any]]] = {}


def _next_seq(room_name: str) -> int:
    counter = _seq_counters.get(room_name)
    if counter is None:
        counter = itertools.count(1)
        _seq_counters[room_name] = counter
    return next(counter)


async def _publish(room: Room, message: dict[str, Any], destination_identities=None):
    payload = json.dumps(message).encode()
    await room.local_participant.publish_data(
        payload,
        topic=BOARD_TOPIC,
        reliable=True,
        destination_identities=destination_identities,
    )


async def emit_op(room: Room, op: dict[str, Any]) -> dict[str, Any]:
    """Assign a sequence number, store the op, and broadcast it to everyone."""
    op["seq"] = _next_seq(room.name)
    _board_ops.setdefault(room.name, []).append(op)
    await _publish(room, {"type": "op", "op": op})
    return op


async def broadcast_clear(room: Room) -> None:
    """Reset board history and tell clients to wipe their boards.

    The clear marker is broadcast but not persisted, so snapshots replayed by
    late joiners only ever contain ops that are still visible.
    """
    _board_ops[room.name] = []
    _seq_counters[room.name] = itertools.count(1)
    await _publish(room, {"type": "op", "op": {"kind": "clear"}})


def get_snapshot(room_name: str) -> list[dict[str, Any]]:
    """Return a copy of the ops currently visible in the room."""
    return list(_board_ops.get(room_name, []))


async def send_snapshot(room: Room, participant_identity: str) -> None:
    """Send the full board history to a single participant."""
    await _publish(
        room,
        {"type": "snapshot", "ops": get_snapshot(room.name)},
        destination_identities=[participant_identity],
    )
