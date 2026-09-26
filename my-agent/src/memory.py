"""Sliding-window conversation memory: summarize-then-trim.

Policy: when the estimated chat context exceeds ``TOKEN_LIMIT`` (10,000), the
most recent ``KEEP_RECENT`` (5) items are kept untouched and everything older
is collapsed into one compact key-value summary holding only main points, e.g.
``{topic: quadratic equations, user_name: Sara, decision: practice at 6pm}``.

Summaries are tagged ``extra={"is_summary": True}`` so later compactions never
re-summarize them. A cheap, fast nano model does the summarizing so the main
voice model stays fast and per-turn token cost stays roughly flat instead of
growing with session length. Board drawing truth lives in ``board_state`` and
snapshots, so tool-call payloads are excluded from summary input.
"""

from __future__ import annotations

import logging

from livekit.agents import ChatContext, inference

logger = logging.getLogger("memory")

TOKEN_LIMIT = 10_000
# Three characters per token errs high for URLs and other token-dense payloads.
CHARS_PER_TOKEN_ESTIMATE = 3
TOKEN_OVERHEAD_PER_ITEM = 4
KEEP_RECENT = 5
SUMMARY_MODEL = "openai/gpt-4.1-nano"

SUMMARIZER_SYSTEM = (
    "Summarize ONLY the main points of this voice conversation as flat "
    "key-value pairs inside curly braces, e.g. "
    "{topic: quadratic equations, user_name: Sara, decision: practice at 6pm}. "
    "Rules: short snake_case keys, each value under 12 words, at most 8 pairs, "
    "nothing outside the braces, skip greetings and small talk."
)

_summarizer = None


def estimate_tokens(items) -> int:
    """Estimate context tokens from text and tool payloads (not model-token exact)."""
    characters = 0
    item_overhead = 0
    for item in items:
        item_overhead += TOKEN_OVERHEAD_PER_ITEM
        item_type = getattr(item, "type", "")
        if item_type == "message":
            content = getattr(item, "raw_text_content", None) or getattr(
                item, "text_content", None
            )
        elif item_type == "function_call":
            content = getattr(item, "arguments", "")
        elif item_type == "function_call_output":
            content = getattr(item, "output", "")
        else:
            content = ""
        characters += len(content or "")
    return (
        characters + CHARS_PER_TOKEN_ESTIMATE - 1
    ) // CHARS_PER_TOKEN_ESTIMATE + item_overhead


def should_compact(chat_ctx: ChatContext) -> bool:
    """Return whether the estimated context has reached the compaction limit."""
    return estimate_tokens(chat_ctx.items) >= TOKEN_LIMIT


def get_summarizer():
    """Shared cheap summarizer instance (created once, reused every cycle)."""
    global _summarizer
    if _summarizer is None:
        _summarizer = inference.LLM(model=SUMMARY_MODEL)
    return _summarizer


def _summarizable_lines(chat_ctx: ChatContext, items) -> list[str]:
    lines: list[str] = []
    for item in items:
        if item.type != "message":
            continue
        if item.role not in ("user", "assistant"):
            continue
        if (item.extra or {}).get("is_summary") is True:
            continue
        text = (item.text_content or "").strip()
        if text:
            lines.append(f"{item.role}: {text}")
    return lines


async def maybe_compact(chat_ctx: ChatContext, summarizer=None) -> bool:
    """Collapse old turns into a key-value summary over ``TOKEN_LIMIT``.

    Returns True when the context was modified (caller should persist via
    ``update_chat_ctx``), False when nothing needed doing.
    """
    items = chat_ctx.items
    if not should_compact(chat_ctx):
        return False

    # Cut point: keep the newest KEEP_RECENT items, never splitting ahead of a
    # leading tool-call fragment (avoids orphaned function_call_output).
    cut = len(items) - KEEP_RECENT
    while cut < len(items) and items[cut].type != "message":
        cut += 1
    if cut <= 0 or cut >= len(items):
        return False

    old_region = items[:cut]
    lines = _summarizable_lines(chat_ctx, old_region)
    if not lines:
        return False

    llm = summarizer if summarizer is not None else get_summarizer()
    summary_ctx = ChatContext()
    summary_ctx.add_message(role="system", content=SUMMARIZER_SYSTEM)
    summary_ctx.add_message(role="user", content="\n".join(lines))
    try:
        response = await llm.chat(chat_ctx=summary_ctx).collect()
        summary = (response.text or "").strip()
    except Exception:
        logger.warning(
            "memory summarization failed; keeping full context", exc_info=True
        )
        return False
    if not summary:
        return False

    summary_msg = chat_ctx.add_message(
        role="system",
        content=f"Prior conversation summary: {summary}",
        extra={"is_summary": True},
    )
    del items[:cut]
    items.remove(summary_msg)
    items.insert(0, summary_msg)
    return True
