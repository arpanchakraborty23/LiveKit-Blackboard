"""Unit tests for blackboard state management and function tools."""

import json

import pytest
from livekit.agents.llm import ToolError

import board_state
import board_tools


class FakeParticipant:
    def __init__(self) -> None:
        self.published: list[dict] = []

    async def publish_data(
        self,
        payload,
        *,
        reliable=False,
        destination_identities=None,
        topic=None,
    ):
        self.published.append(
            {
                "payload": json.loads(payload.decode()),
                "reliable": reliable,
                "destination_identities": destination_identities,
                "topic": topic,
            }
        )


class FakeRoom:
    def __init__(self, name="test-room"):
        self.name = name
        self.local_participant = FakeParticipant()


class FakeJobContext:
    def __init__(self, room):
        self.room = room


@pytest.fixture(autouse=True)
def clean_state():
    board_state._seq_counters.clear()
    board_state._board_ops.clear()
    board_state._flow_cursors.clear()
    yield


@pytest.fixture
def room(monkeypatch):
    fake_room = FakeRoom()
    monkeypatch.setattr(
        board_tools, "get_job_context", lambda: FakeJobContext(fake_room)
    )
    return fake_room


# --- board_state ---


async def test_emit_op_assigns_monotonic_seq_per_room():
    room_a = FakeRoom("room-a")
    room_b = FakeRoom("room-b")

    first = await board_state.emit_op(room_a, {"kind": "text"})
    second = await board_state.emit_op(room_a, {"kind": "text"})
    other = await board_state.emit_op(room_b, {"kind": "text"})

    assert first["seq"] == 1
    assert second["seq"] == 2
    assert other["seq"] == 1


async def test_emit_op_broadcasts_to_board_topic_reliably():
    room = FakeRoom()

    await board_state.emit_op(room, {"kind": "shape", "shape": "circle"})

    sent = room.local_participant.published[0]
    assert sent["topic"] == "board"
    assert sent["reliable"] is True
    assert sent["payload"]["type"] == "op"
    assert sent["payload"]["op"]["kind"] == "shape"


async def test_get_snapshot_returns_ops_copy():
    room = FakeRoom()
    await board_state.emit_op(room, {"kind": "text"})

    snapshot = board_state.get_snapshot(room.name)
    snapshot.append({"tampered": True})

    assert len(board_state.get_snapshot(room.name)) == 1


async def test_broadcast_clear_resets_history_and_counter():
    room = FakeRoom()
    await board_state.emit_op(room, {"kind": "text"})

    await board_state.broadcast_clear(room)
    fresh = await board_state.emit_op(room, {"kind": "text"})

    assert board_state.get_snapshot(room.name) == [{"kind": "text", "seq": 1}]
    assert fresh["seq"] == 1
    clear_sent = room.local_participant.published[-2]["payload"]
    assert clear_sent == {"type": "op", "op": {"kind": "clear"}}


async def test_send_snapshot_targets_single_participant():
    room = FakeRoom()
    await board_state.emit_op(room, {"kind": "text"})

    await board_state.send_snapshot(room, "user-1")

    sent = room.local_participant.published[-1]
    assert sent["destination_identities"] == ["user-1"]
    assert sent["payload"]["type"] == "snapshot"
    assert sent["payload"]["ops"][0]["kind"] == "text"


# --- function tools ---


async def test_draw_shape_emits_shape_op(room):
    result = await board_tools.draw_shape(None, shape="circle", x=100, y=200, size=50)

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "shape"
    assert sent["shape"] == "circle"
    assert sent["position"] == [100, 200]
    assert sent["size"] == 50
    assert sent["color"] == "white"
    assert "#1" in result


async def test_draw_shape_rejects_unknown_shape(room):
    with pytest.raises(ToolError):
        await board_tools.draw_shape(None, shape="hexagon", x=0, y=0, size=10)


async def test_draw_line_emits_line_op(room):
    await board_tools.draw_line(None, from_x=1, from_y=2, to_x=3, to_y=4)

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "line"
    assert sent["from_"] == [1, 2]
    assert sent["to"] == [3, 4]


async def test_write_text_emits_text_op(room):
    await board_tools.write_text(None, content="hello", x=5, y=6)

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "text"
    assert sent["content"] == "hello"
    assert sent["position"] == [5, 6]
    assert sent["fontSize"] == 24


async def test_write_equation_emits_latex_op(room):
    await board_tools.write_equation(None, latex="x^2", x=7, y=8)

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "latex"
    assert sent["content"] == "x^2"


async def test_plot_function_emits_graph_op_with_domain(room):
    await board_tools.plot_function(None, expr="sin(x)", x_min=-5, x_max=5)

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "graph"
    assert sent["expr"] == "sin(x)"
    assert sent["domain"] == [-5, 5]


async def test_draw_labeled_geometry_rejects_unknown_pack(room):
    with pytest.raises(ToolError):
        await board_tools.draw_labeled_geometry(
            None, pack="art", shape_id="portrait", x=0, y=0
        )


async def test_highlight_targets_prior_seq(room):
    await board_tools.draw_shape(None, shape="rect", x=0, y=0, size=10)
    result = await board_tools.highlight(None, target_seq=1, color="yellow")

    sent = room.local_participant.published[-1]["payload"]["op"]
    assert sent["kind"] == "highlight"
    assert sent["targetSeq"] == 1
    assert sent["color"] == "yellow"
    assert "#1" in result


async def test_clear_board_resets_state(room):
    await board_tools.draw_shape(None, shape="circle", x=0, y=0, size=10)
    await board_tools.draw_shape(None, shape="circle", x=9, y=9, size=10)

    result = await board_tools.clear_board(None)

    assert result == "Cleared the board"
    assert board_state.get_snapshot(room.name) == []
    last_sent = room.local_participant.published[-1]["payload"]
    assert last_sent == {"type": "op", "op": {"kind": "clear"}}


# --- flow cursor ---


async def test_flow_cursor_advances_line_by_line():
    first = board_state.advance_flow_cursor("r", 100, 44)
    second = board_state.advance_flow_cursor("r", 100, 44)

    assert first["x"] == second["x"] == board_state.CURSOR_MARGIN_X
    assert second["y"] > first["y"]


async def test_flow_cursor_wraps_to_second_column():
    for _ in range(20):
        board_state.advance_flow_cursor("r", 200, 44)
    pos = board_state.advance_flow_cursor("r", 200, 44)

    assert pos["x"] > board_state.BOARD_WIDTH / 2
    assert pos["y"] >= board_state.CURSOR_MARGIN_TOP


async def test_broadcast_clear_resets_flow_cursor(room):
    board_state.advance_flow_cursor(room.name, 300, 44)
    high = board_state.get_flow_cursor(room.name)["y"]
    await board_state.broadcast_clear(room)

    assert board_state.get_flow_cursor(room.name)["y"] < high
    assert board_state.get_flow_cursor(room.name)["y"] == board_state.CURSOR_MARGIN_TOP


async def test_write_next_flows_without_coordinates(room):
    first = await board_tools.write_next(None, content="step one")
    second = await board_tools.write_next(None, content="step two")

    first_op = room.local_participant.published[0]["payload"]["op"]
    second_op = room.local_participant.published[1]["payload"]["op"]
    assert first_op["kind"] == "text"
    assert first_op["position"][0] == second_op["position"][0]
    assert (
        second_op["position"][1] - first_op["position"][1]
        == board_state.CURSOR_LINE_HEIGHT
    )
    assert "#1" in first and "#2" in second

    # both items are persisted in history (unlike effects)
    assert len(board_state.get_snapshot(room.name)) == 2


async def test_write_next_supports_latex_and_rejects_bad_kind(room):
    await board_tools.write_next(None, content="x^2", kind="latex")

    sent = room.local_participant.published[0]["payload"]["op"]
    assert sent["kind"] == "latex"
    assert sent["content"] == "x^2"

    with pytest.raises(ToolError):
        await board_tools.write_next(None, content="hi", kind="markdown")


# --- point_to / label / erase ---


async def test_point_to_is_transient_not_persisted(room):
    await board_tools.draw_shape(None, shape="circle", x=10, y=10, size=40)

    result = await board_tools.point_to(
        None, target_seq=1, style="arrow", note="radius"
    )

    sent = room.local_participant.published[-1]["payload"]
    assert sent["type"] == "effect"
    assert sent["op"]["kind"] == "point_to"
    assert sent["op"]["targetSeq"] == 1
    assert sent["op"]["style"] == "arrow"
    assert sent["op"]["ttlMs"] == board_state.effect_ttl_ms()
    assert "radius" in result
    # effects never enter board history / snapshots
    assert [op["kind"] for op in board_state.get_snapshot(room.name)] == ["shape"]

    with pytest.raises(ToolError):
        await board_tools.point_to(None, target_seq=1, style="sparkle")


async def test_label_anchors_to_item(room):
    await board_tools.draw_shape(None, shape="rect", x=0, y=0, size=50)

    result = await board_tools.label(
        None, target_seq=1, content="hypotenuse", anchor="right", offset=12
    )

    sent = room.local_participant.published[-1]["payload"]["op"]
    assert sent["kind"] == "label"
    assert sent["targetSeq"] == 1
    assert sent["anchor"] == "right"
    assert sent["offset"] == 12
    assert "#2" in result
    assert len(board_state.get_snapshot(room.name)) == 2

    with pytest.raises(ToolError):
        await board_tools.label(None, target_seq=1, content="x", anchor="diagonal")


async def test_erase_removes_only_targeted_item(room):
    await board_tools.draw_shape(None, shape="circle", x=0, y=0, size=10)
    await board_tools.write_text(None, content="keep me", x=5, y=5)

    result = await board_tools.erase(None, target_seq=1)

    assert result == "Erased item #1"
    snapshot = board_state.get_snapshot(room.name)
    assert [op["seq"] for op in snapshot] == [2]

    sent = room.local_participant.published[-1]["payload"]
    assert sent == {"type": "erase", "targetSeq": 1}


async def test_erase_unknown_item_is_noop(room):
    result = await board_tools.erase(None, target_seq=99)

    assert result == "Item #99 is not on the board"
    assert room.local_participant.published == []


# --- BlackboardToolset grouping + frontend RPC tool ---


def test_blackboard_toolset_groups_all_diagram_tools():
    toolset = board_tools.BlackboardToolset()

    assert toolset.id == "blackboard"
    assert sorted(t.id for t in toolset.tools) == [
        "clear_board",
        "draw_labeled_geometry",
        "draw_line",
        "draw_shape",
        "erase",
        "highlight",
        "label",
        "plan_diagram_via_frontend",
        "plot_function",
        "point_to",
        "write_equation",
        "write_next",
        "write_text",
    ]


class FakeRunContext:
    def __init__(self) -> None:
        self.updates: list[str] = []

    async def update(self, message: str) -> None:
        self.updates.append(message)

    def with_filler(self, *args, **kwargs):
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def _noop():
            yield

        return _noop()


async def test_plan_diagram_falls_back_with_no_frontend(room):
    room.remote_participants = {}

    result = await board_tools.plan_diagram_via_frontend(
        FakeRunContext(), topic="right triangle"
    )

    assert "draw directly" in result
    assert room.local_participant.published == []
