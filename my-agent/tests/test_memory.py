"""Tests for memory agent runtime module."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import memory  # noqa: E402


@pytest.mark.asyncio
async def test_recall_successful() -> None:
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {
        "results": [
            {"fact": "User lives in Berlin", "score": 0.95},
            {"fact": "User is vegetarian", "score": 0.88},
        ]
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        recalled = await memory.recall("00000000-0000-0000-0000-000000000001", "where do I live?")
        assert "lives in Berlin" in recalled
        assert "vegetarian" in recalled


@pytest.mark.asyncio
async def test_recall_fallback_on_empty() -> None:
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {"results": []}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        recalled = await memory.recall("00000000-0000-0000-0000-000000000001", "unknown query")
        assert "don't recall" in recalled.lower()


@pytest.mark.asyncio
async def test_recall_graceful_on_error() -> None:
    with patch("httpx.AsyncClient.post", side_effect=Exception("Connection refused")):
        recalled = await memory.recall("00000000-0000-0000-0000-000000000001", "query")
        assert "unable to reach" in recalled.lower()


@pytest.mark.asyncio
async def test_remember_fire_and_forget() -> None:
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {"ok": True}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        await memory.remember("00000000-0000-0000-0000-000000000001", "User likes spicy food")
        await asyncio.sleep(0.05)


@pytest.mark.asyncio
async def test_end_session_hook() -> None:
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {"ok": True, "summary": "User moved to Berlin."}

    transcript = [
        {"role": "user", "text": "Actually I moved to Berlin last week."},
        {"role": "assistant", "text": "Got it, hope you enjoy Berlin!"},
    ]

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        await memory.end_session_hook("00000000-0000-0000-0000-000000000001", transcript)
