"""Unit tests for the instant-ack Tavily search tool."""

import pytest
from livekit.agents.llm import ToolError

import web_search


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


def _web(items):
    return {"status": 200, "body": {"results": items}}


async def test_ack_is_spoken_before_search_runs(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    calls: list[str] = []

    async def fake_search(query, key):
        calls.append(query)
        return _web([{"title": "T", "content": "D", "url": "https://x.test"}])

    monkeypatch.setattr(web_search, "_tavily_search", fake_search)
    ctx = FakeRunContext()

    result = await web_search.search_web(ctx, query="mars")

    assert calls == ["mars"]
    assert ctx.updates == ["Let me find that for you — searching for mars now."]
    assert "Top results for mars" in result


async def test_results_compacted_for_voice(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")

    async def fake_search(query, key):
        return _web(
            [
                {"title": "Alpha", "content": "First fact", "url": "https://a.test"},
                {"title": "Beta", "content": "x" * 2000, "url": "https://b.test"},
            ]
        )

    monkeypatch.setattr(web_search, "_tavily_search", fake_search)
    result = await web_search.search_web(FakeRunContext(), query="mars")

    assert "Alpha — First fact (https://a.test)" in result
    assert "…" in result
    assert "x" * 2000 not in result


async def test_empty_results_says_so(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")

    async def fake_search(query, key):
        return _web([])

    monkeypatch.setattr(web_search, "_tavily_search", fake_search)
    result = await web_search.search_web(FakeRunContext(), query="mars")
    assert "found nothing" in result


async def test_missing_key_fails(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    ctx = FakeRunContext()

    with pytest.raises(ToolError):
        await web_search.search_web(ctx, query="mars")

    assert ctx.updates == []


async def test_blank_query_rejected(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")
    with pytest.raises(ToolError):
        await web_search.search_web(FakeRunContext(), query="  ")


async def test_http_failure_becomes_tool_error(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")

    async def fake_search(query, key):
        return {"status": 500, "body": {}}

    monkeypatch.setattr(web_search, "_tavily_search", fake_search)
    with pytest.raises(ToolError):
        await web_search.search_web(FakeRunContext(), query="mars")


async def test_search_exception_becomes_tool_error(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "test-key")

    async def fake_search(query, key):
        raise TimeoutError("slow")

    monkeypatch.setattr(web_search, "_tavily_search", fake_search)
    with pytest.raises(ToolError):
        await web_search.search_web(FakeRunContext(), query="mars")
