"""Blackboard function tools: the tutor LLM's drawing interface."""

from typing import Optional

from livekit.agents import RunContext, ToolError, function_tool, get_job_context

import board_state

SHAPES = ("circle", "rect", "triangle")
GEOMETRY_PACKS = (
    "geometry",
    "algebra",
    "statistics",
    "physics",
    "biology",
    "chemistry",
)
POINT_STYLES = ("arrow", "circle", "underline", "box")
LABEL_ANCHORS = ("top", "bottom", "left", "right")


@function_tool()
async def draw_shape(
    context: RunContext,
    shape: str,
    x: float,
    y: float,
    size: float,
    color: str = "white",
) -> str:
    """Draw a basic shape on the blackboard.

    Args:
        shape: The shape type — circle, rect, or triangle
        x: X position on the board, roughly 0 to 800
        y: Y position on the board, roughly 0 to 600
        size: Size of the shape in pixels
        color: Stroke color as a CSS color name or hex value
    """
    if shape not in SHAPES:
        raise ToolError(f"Unknown shape '{shape}'. Use one of: {', '.join(SHAPES)}.")
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": "shape",
            "shape": shape,
            "position": [x, y],
            "size": size,
            "color": color,
        },
    )
    return f"Drew a {color} {shape} at ({int(x)}, {int(y)}) (item #{op['seq']})"


@function_tool()
async def draw_line(
    context: RunContext,
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    color: str = "white",
) -> str:
    """Draw a straight line on the blackboard.

    Args:
        from_x: Starting X position
        from_y: Starting Y position
        to_x: Ending X position
        to_y: Ending Y position
        color: Line color as a CSS color name or hex value
    """
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": "line",
            "from_": [from_x, from_y],
            "to": [to_x, to_y],
            "color": color,
        },
    )
    return f"Drew a line from ({int(from_x)},{int(from_y)}) to ({int(to_x)},{int(to_y)}) (item #{op['seq']})"


@function_tool()
async def write_text(
    context: RunContext,
    content: str,
    x: float,
    y: float,
    font_size: float = 24,
) -> str:
    """Write plain text on the blackboard.

    Args:
        content: The text to write
        x: X position on the board, roughly 0 to 800
        y: Y position on the board, roughly 0 to 600
        font_size: Font size in pixels
    """
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": "text",
            "content": content,
            "position": [x, y],
            "fontSize": font_size,
        },
    )
    return f"Wrote '{content}' at ({int(x)}, {int(y)}) (item #{op['seq']})"


@function_tool()
async def write_equation(
    context: RunContext,
    latex: str,
    x: float,
    y: float,
) -> str:
    """Write a math equation on the blackboard, rendered with proper math typesetting.

    Args:
        latex: The LaTeX source of the equation, e.g. "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"
        x: X position on the board, roughly 0 to 800
        y: Y position on the board, roughly 0 to 600
    """
    op = await board_state.emit_op(
        get_job_context().room,
        {"kind": "latex", "content": latex, "position": [x, y]},
    )
    return f"Wrote the equation at ({int(x)}, {int(y)}) (item #{op['seq']})"


@function_tool()
async def plot_function(
    context: RunContext,
    expr: str,
    x_min: float = -10,
    x_max: float = 10,
    template: Optional[str] = None,
) -> str:
    """Plot a function graph on the blackboard with labeled axes.

    Args:
        expr: The function expression using standard math notation, e.g. "x^2 - 4", "sin(x)"
        x_min: Left bound of the x-axis
        x_max: Right bound of the x-axis
        template: Optional preset — "parabola", "trig", "unit_circle", "number_line",
                  "exponential", "absolute_value", or "linear". Leave unset for a plain plot.
    """
    op: dict = {"kind": "graph", "expr": expr, "domain": [x_min, x_max]}
    if template:
        op["template"] = template
    saved = await board_state.emit_op(get_job_context().room, op)
    return f"Plotted {expr} on the board (item #{saved['seq']})"


@function_tool()
async def draw_labeled_geometry(
    context: RunContext,
    pack: str,
    shape_id: str,
    x: float,
    y: float,
    size: float = 100,
) -> str:
    """Insert a curriculum shape onto the blackboard.

    Args:
        pack: Which shape library pack — geometry, algebra, statistics, physics, biology, or chemistry
        shape_id: The specific shape identifier within that pack, e.g. "right_triangle" or "venn_diagram"
        x: X position on the board, roughly 0 to 800
        y: Y position on the board, roughly 0 to 600
        size: Size of the shape in pixels
    """
    if pack not in GEOMETRY_PACKS:
        raise ToolError(
            f"Unknown pack '{pack}'. Use one of: {', '.join(GEOMETRY_PACKS)}."
        )
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": "geometry",
            "pack": pack,
            "shape_id": shape_id,
            "position": [x, y],
            "size": size,
        },
    )
    return f"Drew {shape_id} from the {pack} pack (item #{op['seq']})"


@function_tool()
async def highlight(
    context: RunContext,
    target_seq: int,
    color: str = "yellow",
) -> str:
    """Highlight something already on the board, by referring to what was drawn earlier.

    Args:
        target_seq: The sequence number of the earlier board item to highlight.
                    Use the number returned in the confirmation of a prior draw call.
        color: Highlight color as a CSS color name or hex value
    """
    op = await board_state.emit_op(
        get_job_context().room,
        {"kind": "highlight", "targetSeq": target_seq, "color": color},
    )
    return f"Highlighted item #{target_seq} in {color} (item #{op['seq']})"


@function_tool()
async def clear_board(context: RunContext) -> str:
    """Clear everything currently drawn on the blackboard."""
    room = get_job_context().room
    await board_state.broadcast_clear(room)
    return "Cleared the board"


@function_tool()
async def write_next(
    context: RunContext,
    content: str,
    kind: str = "text",
) -> str:
    """Write the next line of a step-by-step explanation without specifying coordinates.

    Use this for sequential derivations and worked examples: each call writes
    below the previous one, automatically flowing to a new line, wrapping to a
    second column when the board fills up.

    Args:
        content: The text or equation to write. For kind="latex", provide LaTeX
                 source, e.g. "x = \\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"
        kind: What to write — "text" for plain writing, "latex" for an equation
    """
    if kind not in ("text", "latex"):
        raise ToolError(f"Unknown kind '{kind}'. Use 'text' or 'latex'.")

    room_name = get_job_context().room.name
    line_height = board_state.CURSOR_LINE_HEIGHT
    if kind == "latex":
        line_height = max(line_height, 56)
    width = len(content) * board_state.CURSOR_CHAR_WIDTH
    position = board_state.advance_flow_cursor(room_name, width, line_height)

    op_kind = "text" if kind == "text" else "latex"
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": op_kind,
            "content": content,
            "position": [position["x"], position["y"]],
        },
    )
    return f"Wrote '{content}' (item #{op['seq']})"


@function_tool()
async def point_to(
    context: RunContext,
    target_seq: int,
    style: str = "arrow",
    note: str = "",
) -> str:
    """Point at something already on the board to draw attention to it.

    The pointer appears anchored to that item, then fades away after a few
    seconds — use it while explaining, not as permanent board content.

    Args:
        target_seq: Sequence number of the earlier item, from its draw confirmation
        style: Pointer visual — arrow, circle, underline, or box around the item
        note: Optional short caption spoken alongside, e.g. "this coefficient"
    """
    if style not in POINT_STYLES:
        raise ToolError(
            f"Unknown style '{style}'. Use one of: {', '.join(POINT_STYLES)}."
        )
    await board_state.emit_effect(
        get_job_context().room,
        {
            "kind": "point_to",
            "targetSeq": target_seq,
            "style": style,
            "note": note,
        },
    )
    suffix = f" — {note}" if note else ""
    return f"Pointed at item #{target_seq} with a {style}{suffix}"


@function_tool()
async def label(
    context: RunContext,
    target_seq: int,
    content: str,
    anchor: str = "top",
    offset: int = 10,
) -> str:
    """Attach a short text label next to something already on the board.

    The label stays anchored to that item's position, so you never need to
    guess coordinates. Keep labels to a few words.

    Args:
        target_seq: Sequence number of the item to annotate
        content: The label text
        anchor: Which side of the item — top, bottom, left, or right
        offset: Distance in pixels away from the item
    """
    if anchor not in LABEL_ANCHORS:
        raise ToolError(
            f"Unknown anchor '{anchor}'. Use one of: {', '.join(LABEL_ANCHORS)}."
        )
    op = await board_state.emit_op(
        get_job_context().room,
        {
            "kind": "label",
            "targetSeq": target_seq,
            "content": content,
            "anchor": anchor,
            "offset": offset,
        },
    )
    return f"Labeled item #{target_seq} '{content}' on its {anchor} (item #{op['seq']})"


@function_tool()
async def erase(context: RunContext, target_seq: int) -> str:
    """Erase one specific item from the blackboard, keeping everything else.

    Prefer this over clear_board when only part of the board is wrong.

    Args:
        target_seq: Sequence number of the item to remove
    """
    removed = await board_state.erase_item(get_job_context().room, target_seq)
    if not removed:
        return f"Item #{target_seq} is not on the board"
    return f"Erased item #{target_seq}"
