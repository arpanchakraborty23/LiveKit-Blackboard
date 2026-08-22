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
    last_sent = room.local_participant.published[-1]["payload"]
    assert last_sent == {"type": "op", "op": {"kind": "clear"}}


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
    result = await board_tools.draw_shape(
        None, shape="circle", x=100, y=200, size=50
    )

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
