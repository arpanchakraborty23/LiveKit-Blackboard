# Blackboard Feature — Implementation Doc for Coding Agent

Copy everything below into your coding agent (standalone test project first, integrate into the main tutor agent after it's validated).

---

## What we're building

A real-time "blackboard" for a LiveKit voice tutor agent. The agent draws (shapes, equations, function graphs, geometry) by calling plain **LiveKit function tools**. Each tool broadcasts a structured "board op" over LiveKit's existing data channel to whichever frontend is in the room. The frontend renders ops onto a canvas (Excalidraw + ExcaliMath, or a custom SVG renderer — pick one per Step 5).

**No MCP server. No separate WebSocket server. No second session concept.**
The LiveKit room *is* the session (`room.name` is the only key used anywhere). Function tools live inside the same agent process as the rest of the tutor's tools and call `room.local_participant.publish_data(...)` directly.

---

## Architecture

```
┌──────────────────────────────┐
│   LiveKit Agent (Python)     │
│                               │
│   LLM ──calls──► function     │
│                   tools        │
│                     │          │
│                     ▼          │
│         room.local_participant │
│           .publish_data(       │
│             topic="board")     │
└──────────────┬────────────────┘
               │  LiveKit data channel (existing room, no new connection)
               ▼
┌──────────────────────────────┐
│   Frontend (React)            │
│   Same LiveKit room,          │
│   subscribes to               │
│   RoomEvent.DataReceived,     │
│   topic="board"               │
│         │                     │
│         ▼                     │
│   Board reducer → renderer    │
└──────────────────────────────┘
```

Two message types travel over the data channel, both JSON-encoded:
- `{"type": "op", "op": {...}}` — a single new drawing operation, broadcast live.
- `{"type": "snapshot", "ops": [...]}` — full history, sent to a participant on join/reconnect so they don't miss earlier drawing.

---

## Step 1 — Fixed op vocabulary (define first, don't skip)

All drawing tools must emit one of these `kind`s. Keep this list small and stable — new pedagogical behavior should be new *combinations* of these ops, not new `kind` values invented ad hoc by individual tools.

```python
# agent/board_ops.py
from typing import TypedDict, Literal, Optional

class BoardOp(TypedDict, total=False):
    kind: Literal["shape", "line", "text", "latex", "graph", "geometry", "highlight", "clear"]
    seq: int                     # assigned by the emit helper, never by the tool
    # shape-specific
    shape: Literal["circle", "rect", "triangle"]
    position: list[float]        # [x, y]
    size: float
    color: str
    # line-specific
    from_: list[float]
    to: list[float]
    # text/latex-specific
    content: str
    fontSize: Optional[float]
    # graph-specific
    expr: str
    domain: list[float]          # [x_min, x_max]
    template: Optional[str]      # e.g. "parabola", "unit_circle" if using ExcaliMath presets
    # geometry-specific
    pack: str                    # "geometry" | "algebra" | "statistics" | "physics" | "biology" | "chemistry"
    shape_id: str
    # highlight-specific
    targetSeq: int
```

Mirror this shape as a TypeScript type on the frontend (`ui/src/lib/board-ops.ts`) — the two must stay in sync manually since there's no shared schema codegen in this POC.

---

## Step 2 — Board state module

One in-memory store per room, living inside the agent process. No Redis, no external DB for this stage — if you later run multiple agent instances behind a load balancer, this is the first thing that needs to move to Redis, but don't build that now.

```python
# agent/board_state.py
import itertools
import json
from livekit.rtc import Room

_seq_counters: dict[str, itertools.count] = {}
_board_ops: dict[str, list[dict]] = {}

def _next_seq(room_name: str) -> int:
    return next(_seq_counters.setdefault(room_name, itertools.count(1)))

async def emit_op(room: Room, op: dict) -> dict:
    """Assign a seq, store it, and broadcast it to everyone in the room."""
    op["seq"] = _next_seq(room.name)
    _board_ops.setdefault(room.name, []).append(op)
    await room.local_participant.publish_data(
        payload=json.dumps({"type": "op", "op": op}).encode(),
        topic="board",
        reliable=True,
    )
    return op

def get_snapshot(room_name: str) -> list[dict]:
    return _board_ops.get(room_name, [])

def clear_room(room_name: str):
    _board_ops[room_name] = []
    _seq_counters[room_name] = itertools.count(1)

async def send_snapshot(room: Room, participant_identity: str):
    ops = get_snapshot(room.name)
    await room.local_participant.publish_data(
        payload=json.dumps({"type": "snapshot", "ops": ops}).encode(),
        topic="board",
        reliable=True,
        destination_identities=[participant_identity],
    )
```

Wire the snapshot send to participant join, so reconnects/late joiners never miss earlier board history:

```python
# agent/main.py, inside your job entrypoint after `room` is available
@room.on("participant_connected")
def _on_participant_joined(participant):
    import asyncio
    asyncio.create_task(send_snapshot(room, participant.identity))
```

---

## Step 3 — Function tools

These are the tools the tutor LLM calls. Register them alongside whatever other tools your agent already has (no separate tool registry needed — same `function_tool()` pattern you already use).

```python
# agent/board_tools.py
from livekit.agents import function_tool, get_job_context, RunContext
from . import board_state

@function_tool()
async def draw_shape(
    context: RunContext,
    shape: str,      # "circle" | "rect" | "triangle"
    x: float,
    y: float,
    size: float,
    color: str = "white",
):
    """Draw a basic shape on the blackboard.

    Args:
        shape: The shape type — circle, rect, or triangle
        x: X position on the board (canvas coordinates)
        y: Y position on the board (canvas coordinates)
        size: Size of the shape
        color: Stroke color (CSS color name or hex)
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "shape", "shape": shape, "position": [x, y], "size": size, "color": color,
    })
    return f"Drew a {color} {shape} at ({x}, {y})"


@function_tool()
async def draw_line(context: RunContext, from_x: float, from_y: float, to_x: float, to_y: float, color: str = "white"):
    """Draw a straight line on the blackboard.

    Args:
        from_x: Starting X position
        from_y: Starting Y position
        to_x: Ending X position
        to_y: Ending Y position
        color: Line color
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "line", "from_": [from_x, from_y], "to": [to_x, to_y], "color": color,
    })
    return f"Drew a line from ({from_x},{from_y}) to ({to_x},{to_y})"


@function_tool()
async def write_text(context: RunContext, content: str, x: float, y: float, font_size: float = 24):
    """Write plain text on the blackboard.

    Args:
        content: The text to write
        x: X position on the board
        y: Y position on the board
        font_size: Font size in pixels
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "text", "content": content, "position": [x, y], "fontSize": font_size,
    })
    return f"Wrote text on the board"


@function_tool()
async def write_equation(context: RunContext, latex: str, x: float, y: float):
    """Write a math equation on the blackboard, rendered with proper math typesetting.

    Args:
        latex: The LaTeX source of the equation, e.g. "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
        x: X position on the board
        y: Y position on the board
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "latex", "content": latex, "position": [x, y],
    })
    return "Wrote the equation on the board"


@function_tool()
async def plot_function(context: RunContext, expr: str, x_min: float = -10, x_max: float = 10, template: str | None = None):
    """Plot a function graph on the blackboard with labeled axes.

    Args:
        expr: The function expression using standard math notation, e.g. "x^2 - 4", "sin(x)"
        x_min: Left bound of the x-axis
        x_max: Right bound of the x-axis
        template: Optional preset — "parabola", "trig", "unit_circle", "number_line",
                  "exponential", "absolute_value", "linear". Leave unset for a plain plot.
    """
    room = get_job_context().room
    op = {"kind": "graph", "expr": expr, "domain": [x_min, x_max]}
    if template:
        op["template"] = template
    await board_state.emit_op(room, op)
    return f"Plotted {expr} on the board"


@function_tool()
async def draw_labeled_geometry(context: RunContext, pack: str, shape_id: str, x: float, y: float, size: float = 100):
    """Insert a curriculum shape (geometry, algebra, statistics, physics, biology, or chemistry) onto the board.

    Args:
        pack: Which shape library pack — "geometry", "algebra", "statistics", "physics", "biology", "chemistry"
        shape_id: The specific shape identifier within that pack, e.g. "right_triangle", "venn_diagram"
        x: X position on the board
        y: Y position on the board
        size: Size of the shape
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "geometry", "pack": pack, "shape_id": shape_id, "position": [x, y], "size": size,
    })
    return f"Drew {shape_id} from the {pack} pack"


@function_tool()
async def highlight(context: RunContext, target_seq: int, color: str = "yellow"):
    """Highlight something already on the board, by referring to what was drawn earlier.

    Args:
        target_seq: The sequence number of the earlier board item to highlight
                    (use the number returned in the confirmation of a prior draw call)
        color: Highlight color
    """
    room = get_job_context().room
    await board_state.emit_op(room, {
        "kind": "highlight", "targetSeq": target_seq, "color": color,
    })
    return f"Highlighted item #{target_seq}"


@function_tool()
async def clear_board(context: RunContext):
    """Clear everything currently drawn on the blackboard."""
    room = get_job_context().room
    board_state.clear_room(room.name)
    await board_state.emit_op(room, {"kind": "clear"})
    return "Cleared the board"
```

**Important detail for the LLM's sake**: each tool's return string should stay short and confirm what happened — the LLM uses this to decide what to say out loud next ("I've drawn a parabola on the board — see how it dips below zero between x=-2 and x=2"). Don't return raw JSON or op dicts from these tools; keep returns human-readable one-liners.

Register in your agent entrypoint the same way as your existing tools:

```python
# agent/main.py
from .board_tools import draw_shape, draw_line, write_text, write_equation, plot_function, draw_labeled_geometry, highlight, clear_board

# wherever you currently build your tool list / Agent(...) config:
tools = [
    # ...your existing tools...
    draw_shape, draw_line, write_text, write_equation,
    plot_function, draw_labeled_geometry, highlight, clear_board,
]
```

---

## Step 4 — System prompt addition

Add a short block to the tutor's instructions so the LLM knows the board exists and roughly how to use it — don't over-specify positions, let it use reasonable coordinates.

```
You have access to a shared visual blackboard the student can see in real time.
Use it to support your explanations — draw shapes, write equations, plot functions,
or insert labeled geometry/diagram shapes when a visual would help understanding.
The board canvas is roughly 0–800 in x and 0–600 in y; place items so they don't
overlap. Call clear_board() before starting a new, unrelated topic so the board
doesn't get cluttered. Reference earlier items by their sequence number if you
want to highlight something you already drew.
```

---

## Step 5 — Frontend renderer

Pick one now for the POC. Both consume the exact same `board_ops.ts` reducer and `RoomEvent.DataReceived` subscription — only the final rendering call differs.

### Option A — Excalidraw + ExcaliMath (richer visuals, less code to write for graphs/equations/shapes)

```tsx
// ui/src/lib/livekit-board.ts
import { Room, RoomEvent } from "livekit-client";

export function connectBoard(room: Room, onMessage: (msg: any) => void) {
  room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
    if (topic !== "board") return;
    onMessage(JSON.parse(new TextDecoder().decode(payload)));
  });
}
```

```tsx
// ui/src/lib/board-reducer.ts
export function applyBoardMessage(ops: any[], msg: any): any[] {
  if (msg.type === "snapshot") return msg.ops;
  if (msg.type === "op") {
    if (msg.op.kind === "clear") return [];
    return [...ops, msg.op];
  }
  return ops;
}
```

```tsx
// ui/src/components/BoardCanvas.tsx
import { Excalidraw } from "@excalidraw/excalidraw";
import { ExcaliMath } from "@excalimath/core";
import { useState, useEffect, useCallback } from "react";
import { opToExcalidrawElement } from "../lib/op-to-element"; // write per Step 5a below

export function BoardCanvas({ ops }: { ops: any[] }) {
  const [api, setApi] = useState<any>(null);

  const apply = useCallback((ops: any[]) => {
    if (!api) return;
    const elements = ops.map(opToExcalidrawElement).filter(Boolean);
    api.updateScene({ elements });
  }, [api]);

  useEffect(() => { apply(ops); }, [ops, apply]);

  return (
    <Excalidraw
      excalidrawAPI={setApi}
      viewModeEnabled
      renderTopRightUI={() => null /* hide ExcaliMath's own UI — agent drives everything */}
    />
  );
}
```

**Step 5a — `opToExcalidrawElement`**: for `shape`/`line`/`text` ops, build plain Excalidraw elements directly (as in the earlier draft). For `latex` and `graph` ops, call ExcaliMath's underlying renderer functions from `@excalimath/core`'s `plugins/equation/` and `plugins/graph/` to produce the SVG, then wrap as an `imageElement` (see `elementFactory.ts` in that package for the exact conversion pattern). For `geometry` ops, look up the shape from ExcaliMath's `plugins/geometry/` shape registry by `pack` + `shape_id`.

**Verify before committing to this path**: confirm `@excalimath/core`'s graph (Plotly) and equation (KaTeX) renderers work when called directly (not through their UI panels) inside a plain React effect — check their exports in `packages/core/src/plugins/*/index.ts`. If they turn out to be too tightly coupled to their own panel components, fall back to Option B for graphs/equations only, and keep Excalidraw + this same op-to-element pattern for `shape`/`line`/`text`.

### Option B — Custom SVG (fewer dependencies, more code, full control over "live drawing" feel)

```tsx
// ui/src/components/BoardCanvas.tsx
export function BoardCanvas({ ops }: { ops: any[] }) {
  return (
    <svg viewBox="0 0 800 600" className="w-full h-full bg-black">
      {ops.map((op) => {
        switch (op.kind) {
          case "shape":
            if (op.shape === "circle")
              return <circle key={op.seq} cx={op.position[0]} cy={op.position[1]} r={op.size / 2} stroke={op.color} fill="none" />;
            if (op.shape === "rect")
              return <rect key={op.seq} x={op.position[0]} y={op.position[1]} width={op.size} height={op.size} stroke={op.color} fill="none" />;
            return null;
          case "line":
            return <line key={op.seq} x1={op.from_[0]} y1={op.from_[1]} x2={op.to[0]} y2={op.to[1]} stroke={op.color} />;
          case "text":
            return <text key={op.seq} x={op.position[0]} y={op.position[1]} fontSize={op.fontSize} fill="white">{op.content}</text>;
          // "latex" and "graph" need KaTeX/plotting libraries wired in separately — see note below
          default:
            return null;
        }
      })}
    </svg>
  );
}
```

For `latex` ops here, render via `katex.renderToString(op.content)` into a `<foreignObject>`. For `graph` ops, use a lightweight plotting lib (JSXGraph or a small D3 scale-based renderer) targeting an inline `<svg>` or nested container at `op.position`.

---

## Step 6 — App shell

```tsx
// ui/src/App.tsx
import { Room } from "livekit-client";
import { useEffect, useState } from "react";
import { BoardCanvas } from "./components/BoardCanvas";
import { connectBoard } from "./lib/livekit-board";
import { applyBoardMessage } from "./lib/board-reducer";

export default function App() {
  const [ops, setOps] = useState<any[]>([]);

  useEffect(() => {
    const room = new Room();
    const roomName = new URLSearchParams(window.location.search).get("room") ?? "test-room";

    async function connect() {
      const token = await fetchDevToken(roomName); // stub: your dev token endpoint
      await room.connect(process.env.VITE_LIVEKIT_URL!, token);
      connectBoard(room, (msg) => setOps((prev) => applyBoardMessage(prev, msg)));
    }
    connect();
    return () => { room.disconnect(); };
  }, []);

  return <BoardCanvas ops={ops} />;
}
```

---

## Step 7 — Test plan (manual, then Playwright)

Manual first:
1. Run the agent against a local/dev LiveKit server.
2. Open the UI at `?room=test-1` in two browser tabs.
3. Trigger a tool call (talk to the agent, or add a dev-only HTTP trigger endpoint that calls a tool function directly, bypassing the LLM, for deterministic testing).
4. Confirm the drawing appears in both tabs simultaneously.
5. Reload one tab — confirm the snapshot replay reproduces the full board history.

Then automate the same sequence with Playwright once the manual pass is clean — this is the part worth locking down with a real test, since the snapshot/reconnect path is the most likely thing to silently break later.

---

## Explicitly out of scope for this pass

- No MCP server, no separate WebSocket server — function tools + LiveKit data channel only.
- No Redis / multi-instance scaling — single agent process, in-memory board state.
- No production auth — dev token stub is fine for the standalone test.
- No animated "live drawing" reveal — ops render fully formed on arrival; revisit only if the pedagogical feel of watching strokes appear turns out to matter.