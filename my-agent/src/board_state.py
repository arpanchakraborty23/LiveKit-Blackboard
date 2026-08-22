"""In-memory per-room blackboard state and data-channel broadcast helpers.

Board history lives inside the agent process keyed by room name. Ops are
broadcast over LiveKit's data channel on the "board" topic; late joiners and
reconnecting clients receive a full snapshot on join.

Transient ops (pointers) are broadcast but never persisted — like OpenMAIC's
spotlight/laser effects, they are self-expiring overlays, not board content.

Each room also carries a "flow cursor" (current_x/current_y) so tools like
write_next can lay out sequential lines without the LLM guessing coordinates.
"""

from __future__ import annotations

import itertools
import json
from typing import Any

from livekit.rtc import Room

BOARD_TOPIC = "board"

# Board canvas bounds (must match the frontend viewBox in ui/lib/board-ops.ts)
BOARD_WIDTH = 800
BOARD_HEIGHT = 600

# Flow-cursor layout constants (chalk-style writing grid)
CURSOR_MARGIN_X = 40
CURSOR_MARGIN_TOP = 60
CURSOR_LINE_HEIGHT = 44
CURSOR_CHAR_WIDTH = 11  # rough advance per character at fontSize 24
CURSOR_MAX_LINE_CHARS = int((BOARD_WIDTH - CURSOR_MARGIN_X * 2) / CURSOR_CHAR_WIDTH)
# When a column fills up, move to the next column instead of falling off-board
CURSOR_COLUMN_GAP = 40
CURSOR_COLUMN_WIDTH = (BOARD_WIDTH - CURSOR_MARGIN_X * 2 - CURSOR_COLUMN_GAP) / 2 + CURSOR_COLUMN_GAP

_seq_counters: dict[str, itertools.count[int]] = {}
_board_ops: dict[str, list[dict[str, Any]]] = {}
_flow_cursors: dict[str, dict[str, float]] = {}


def _next_seq(room_name: str) -> int:
    counter = _seq_counters.get(room_name)
    if counter is None:
        counter = itertools.count(1)
        _seq_counters[room_name] = counter
    return next(counter)


async def _publish(
    room: Room,
    message: dict[str, Any],
    destination_identities: list[str] | None = None,
):
    payload = json.dumps(message).encode()
    await room.local_participant.publish_data(
        payload,
        topic=BOARD_TOPIC,
        reliable=True,
        # the rtc SDK extends the list unconditionally, so it must never be None
        destination_identities=list(destination_identities or []),
    )


def effect_ttl_ms() -> int:
    """How long clients should display transient pointer effects (OpenMAIC uses 5s)."""
    return 6000


def reset_flow_cursor(room_name: str) -> None:
    """Move the flow cursor back to the top-left writing position."""
    _flow_cursors[room_name] = {
        "x": CURSOR_MARGIN_X,
        "y": CURSOR_MARGIN_TOP,
    }


def get_flow_cursor(room_name: str) -> dict[str, float]:
    cursor = _flow_cursors.get(room_name)
    if cursor is None:
        reset_flow_cursor(room_name)
        cursor = _flow_cursors[room_name]
    return dict(cursor)


def advance_flow_cursor(room_name: str, content_width: float, line_height: float) -> dict[str, float]:
    """Advance the cursor after writing something of content_width wide.

    Moves to the next line when the item would cross the right margin; moves to
    a fresh column when the bottom of the board is reached. Returns the position
    where the item that triggered the advance should be placed.
    """
    cursor = _flow_cursors.setdefault(
        room_name, {"x": CURSOR_MARGIN_X, "y": CURSOR_MARGIN_TOP}
    )

    if cursor["x"] + content_width > BOARD_WIDTH - CURSOR_MARGIN_X and cursor["x"] > CURSOR_MARGIN_X:
        cursor["x"] = CURSOR_MARGIN_X
        cursor["y"] += line_height

    if cursor["y"] > BOARD_HEIGHT - CURSOR_MARGIN_TOP / 2:
        # wrap to the top of the second column
        cursor["x"] = CURSOR_MARGIN_X + (
            BOARD_WIDTH - CURSOR_MARGIN_X * 2 - CURSOR_COLUMN_GAP
        ) / 2 + CURSOR_COLUMN_GAP
        cursor["y"] = CURSOR_MARGIN_TOP

    position = {"x": cursor["x"], "y": cursor["y"]}
    cursor["y"] += line_height
    return position


async def emit_op(room: Room, op: dict[str, Any]) -> dict[str, Any]:
    """Assign a sequence number, store the op, and broadcast it to everyone."""
    op["seq"] = _next_seq(room.name)
    _board_ops.setdefault(room.name, []).append(op)
    await _publish(room, {"type": "op", "op": op})
    return op


async def emit_effect(room: Room, op: dict[str, Any]) -> dict[str, Any]:
    """Broadcast a transient effect (pointer/spotlight-style op).

    Effects reference existing items by targetSeq and are rendered as
    self-expiring overlays; they are assigned seqs so tools can refer to them,
    but are NOT stored in board history and never appear in snapshots
    (mirrors OpenMAIC's fire-and-forget spotlight/laser pattern).
    """
    op["seq"] = _next_seq(room.name)
    op["ttlMs"] = effect_ttl_ms()
    await _publish(room, {"type": "effect", "op": op})
    return op


async def erase_item(room: Room, target_seq: int) -> bool:
    """Remove one item from board history and tell clients which seq vanished."""
    ops = _board_ops.get(room.name, [])
    remaining = [op for op in ops if op.get("seq") != target_seq]
    if len(remaining) == len(ops):
        return False
    _board_ops[room.name] = remaining
    await _publish(room, {"type": "erase", "targetSeq": target_seq})
    return True


async def broadcast_clear(room: Room) -> None:
    """Reset board history and tell clients to wipe their boards.

    The clear marker is broadcast but not persisted, so snapshots replayed by
    late joiners only ever contain ops that are still visible.
    """
    _board_ops[room.name] = []
    _seq_counters[room.name] = itertools.count(1)
    reset_flow_cursor(room.name)
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
