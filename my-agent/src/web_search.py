"""Tavily web search with compact results for the voice agent."""

from __future__ import annotations

import logging
import os

import httpx
from livekit.agents import RunContext, ToolError, function_tool

logger = logging.getLogger("web_search")

SEARCH_URL = "https://api.tavily.com/search"
RESULT_LIMIT = 3
SNIPPET_CHARS = 500
HTTP_TIMEOUT = 15.0


def _api_key() -> str:
    return os.environ.get("TAVILY_API_KEY", "")


async def _tavily_search(query: str, key: str) -> dict:
    async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
        response = await client.post(
            SEARCH_URL,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "query": query,
                "max_results": RESULT_LIMIT,
                "search_depth": "basic",
                "include_answer": False,
                "include_raw_content": False,
            },
        )
    try:
        body = response.json()
    except ValueError:
        body = {}
    return {"status": response.status_code, "body": body}


def _compact_results(query: str, results: list) -> str:
    lines = []
    for index, item in enumerate(results[:RESULT_LIMIT], start=1):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "untitled").strip()
        content = str(item.get("content") or "").strip()
        if len(content) > SNIPPET_CHARS:
            content = content[:SNIPPET_CHARS].rstrip() + "…"
        url = str(item.get("url") or "").strip()
        lines.append(f"{index}. {title} — {content} ({url})".strip())
    if not lines:
        return f"I searched for {query} but found nothing useful."
    return f"Top results for {query}: " + " ".join(lines)


@function_tool()
async def search_web(context: RunContext, query: str) -> str:
    """Search the web with Tavily and return a few short, relevant snippets.

    Args:
        query: A concise search query for current or unfamiliar information.
    """
    query = (query or "").strip()
    if not query:
        raise ToolError("I need a search query first — what should I look up?")
    key = _api_key()
    if not key:
        raise ToolError("Web search is not configured right now.")

    await context.update(f"Let me find that for you — searching for {query} now.")
    try:
        async with context.with_filler("Still searching, hang on a sec.", delay=4):
            result = await _tavily_search(query, key)
    except Exception as exc:
        logger.warning("Tavily search failed: %s", exc)
        raise ToolError(f"The search for {query} ran into trouble, sorry.") from exc

    if result["status"] != 200:
        logger.warning("Tavily search status %s for %r", result["status"], query)
        raise ToolError(f"The search for {query} failed, sorry.")
    body = result["body"] if isinstance(result["body"], dict) else {}
    results = body.get("results") or []
    return _compact_results(query, results)
