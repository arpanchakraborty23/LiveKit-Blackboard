"""Unit tests for sliding-window conversation memory (src/memory.py)."""

from livekit.agents import ChatContext

import memory


class FakeSummarizer:
    def __init__(self, text="{topic: math, user_name: Sara}", fail=False):
        self.text = text
        self.fail = fail
        self.seen_inputs: list[str] = []

    def chat(self, chat_ctx=None, **kwargs):
        lines = []
        for item in chat_ctx.items:
            if item.type == "message":
                lines.append(item.text_content or "")
        self.seen_inputs.append("\n".join(lines))
        parent = self

        class Stream:
            async def collect(self):
                if parent.fail:
                    raise RuntimeError("summarizer down")

                class Response:
                    text = parent.text

                return Response()

        return Stream()


def make_dialogue(n_pairs: int, *, over_token_limit: bool = False) -> ChatContext:
    ctx = ChatContext()
    for i in range(n_pairs):
        question = f"question {i}"
        if over_token_limit and i == 0:
            question += " x" * (memory.TOKEN_LIMIT * 3)
        ctx.add_message(role="user", content=question)
        ctx.add_message(role="assistant", content=f"answer {i}")
    return ctx


async def test_under_threshold_is_noop():
    ctx = make_dialogue(4)  # Under the estimated token limit

    assert await memory.maybe_compact(ctx, summarizer=FakeSummarizer()) is False
    assert len(ctx.items) == 8


async def test_over_threshold_collapses_old_turns_to_key_value_summary():
    ctx = make_dialogue(5, over_token_limit=True)
    summarizer = FakeSummarizer()

    assert await memory.maybe_compact(ctx, summarizer=summarizer) is True

    # summary first, then the 5 most recent items untouched
    assert len(ctx.items) == 1 + memory.KEEP_RECENT
    first = ctx.items[0]
    assert first.role == "system"
    assert first.extra.get("is_summary") is True
    assert "Prior conversation summary:" in (first.text_content or "")
    assert "{topic: math" in (first.text_content or "")

    tail_texts = [i.text_content for i in ctx.items[1:]]
    assert tail_texts == [
        "answer 2",
        "question 3",
        "answer 3",
        "question 4",
        "answer 4",
    ]

    # summarizer saw old turns only, plus its own system prompt
    assert "question 0" in summarizer.seen_inputs[0]
    assert "question 4" not in summarizer.seen_inputs[0]


async def test_second_run_is_noop_and_summaries_never_resummarized():
    ctx = make_dialogue(5, over_token_limit=True)
    summarizer = FakeSummarizer()

    assert await memory.maybe_compact(ctx, summarizer=summarizer) is True
    assert await memory.maybe_compact(ctx, summarizer=summarizer) is False
    assert len(summarizer.seen_inputs) == 1


async def test_summarizer_failure_keeps_full_context():
    ctx = make_dialogue(5, over_token_limit=True)

    assert (
        await memory.maybe_compact(ctx, summarizer=FakeSummarizer(fail=True)) is False
    )
    assert len(ctx.items) == 10


async def test_region_without_user_turns_is_left_alone():
    ctx = ChatContext()
    for i in range(9):
        ctx.add_message(role="system", content=f"note {i}")

    assert await memory.maybe_compact(ctx, summarizer=FakeSummarizer()) is False
    assert len(ctx.items) == 9


# --- background compaction on the Assistant (never blocks the reply) ---


async def _make_agent_with_history(
    n_pairs: int, monkeypatch, *, over_token_limit: bool = False
):
    from agent import Assistant

    monkeypatch.setattr(memory, "get_summarizer", lambda: FakeSummarizer())
    agent = Assistant()
    ctx = make_dialogue(n_pairs, over_token_limit=over_token_limit)
    await agent.update_chat_ctx(ctx)
    return agent


async def test_background_compact_adopts_when_nothing_new_landed(monkeypatch):
    agent = await _make_agent_with_history(5, monkeypatch, over_token_limit=True)
    before_ids = [item.id for item in agent.chat_ctx.items]
    snapshot = agent.chat_ctx.copy()

    await agent._compact_in_background(snapshot, before_ids)

    items = agent.chat_ctx.items
    assert len(items) == 1 + memory.KEEP_RECENT
    assert items[0].extra.get("is_summary") is True


async def test_background_compact_merges_tail_that_landed_midway(monkeypatch):
    agent = await _make_agent_with_history(5, monkeypatch, over_token_limit=True)
    before_ids = [item.id for item in agent.chat_ctx.items]
    snapshot = agent.chat_ctx.copy()

    # A reply lands while the summarizer works: must be preserved.
    grown = agent.chat_ctx.copy()
    grown.add_message(role="assistant", content="fresh reply")
    await agent.update_chat_ctx(grown)

    await agent._compact_in_background(snapshot, before_ids)

    texts = [item.text_content for item in agent.chat_ctx.items]
    assert texts[0].startswith("Prior conversation summary:")
    assert texts[-1] == "fresh reply"
    assert len(agent.chat_ctx.items) == 1 + memory.KEEP_RECENT + 1


async def test_background_compact_skips_diverged_context(monkeypatch):
    agent = await _make_agent_with_history(5, monkeypatch, over_token_limit=True)
    stale_ids = [item.id for item in agent.chat_ctx.items]
    snapshot = agent.chat_ctx.copy()

    # Context was replaced underneath us (e.g. another update won).
    await agent.update_chat_ctx(make_dialogue(2))
    current_len = len(agent.chat_ctx.items)

    await agent._compact_in_background(snapshot, stale_ids)

    assert len(agent.chat_ctx.items) == current_len


async def test_on_user_turn_completed_returns_fast_and_schedules(monkeypatch):
    import asyncio

    agent = await _make_agent_with_history(5, monkeypatch, over_token_limit=True)
    turn_ctx = agent.chat_ctx.copy()
    turn_ctx.add_message(role="user", content="one more question")

    await agent.on_user_turn_completed(turn_ctx, turn_ctx.items[-1])

    assert len(agent._memory_tasks) == 1
    task = next(iter(agent._memory_tasks))
    await asyncio.wait_for(task, timeout=5)
    assert any(
        (item.extra or {}).get("is_summary") is True for item in agent.chat_ctx.items
    )
