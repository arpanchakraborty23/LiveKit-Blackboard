"""Unit tests for tools_mcp.py (MCP toolset loading, filtering, error isolation)."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from tools_mcp import MCPServerConfig, load_mcp_toolsets  # noqa: E402


def test_mcp_server_config_parsing() -> None:
    # Valid dict
    cfg = MCPServerConfig.from_item(
        {
            "id": "srv-1",
            "name": "LiveKit Docs",
            "url": "https://docs.livekit.io/mcp",
            "transport": "streamable_http",
            "headers": {"Authorization": "Bearer token123"},
            "allowed_tools": ["search_docs", "read_page"],
        }
    )
    assert cfg is not None
    assert cfg.id == "srv-1"
    assert cfg.name == "LiveKit Docs"
    assert cfg.url == "https://docs.livekit.io/mcp"
    assert cfg.transport == "streamable_http"
    assert cfg.headers == {"Authorization": "Bearer token123"}
    assert cfg.allowed_tools == ["search_docs", "read_page"]

    # Invalid items
    assert MCPServerConfig.from_item(None) is None
    assert MCPServerConfig.from_item("not a dict") is None
    assert MCPServerConfig.from_item({"name": "No URL"}) is None


@pytest.mark.asyncio
async def test_load_mcp_toolsets_empty() -> None:
    # Empty configs list
    assert await load_mcp_toolsets([]) == []

    # Configs with no allowed tools should be skipped
    configs = [
        {
            "id": "srv-1",
            "name": "Test Server",
            "url": "https://example.com/mcp",
            "allowed_tools": [],
        }
    ]
    assert await load_mcp_toolsets(configs) == []


@pytest.mark.asyncio
async def test_load_mcp_toolsets_error_isolation() -> None:
    """A dead or failing MCP server should be dropped without crashing the session."""
    configs = [
        {
            "id": "srv-dead",
            "name": "Dead Server",
            "url": "https://unreachable.domain.test/mcp",
            "allowed_tools": ["tool_a"],
        }
    ]

    # Even if _create_single_toolset raises an exception, load_mcp_toolsets isolates it
    with patch("tools_mcp._create_single_toolset", side_effect=RuntimeError("Connection refused")):
        results = await load_mcp_toolsets(configs)
        assert results == []


@pytest.mark.asyncio
async def test_load_mcp_toolsets_timeout_isolation() -> None:
    """A hanging MCP server connection should time out and be dropped."""
    configs = [
        {
            "id": "srv-slow",
            "name": "Slow Server",
            "url": "https://slow.domain.test/mcp",
            "allowed_tools": ["tool_b"],
        }
    ]

    async def _hang(*args, **kwargs):
        await asyncio.sleep(100)

    with patch("tools_mcp._create_single_toolset", side_effect=_hang):
        with patch("tools_mcp.PER_SERVER_TIMEOUT_S", 0.05):
            results = await load_mcp_toolsets(configs)
            assert results == []


@pytest.mark.asyncio
async def test_load_mcp_toolsets_success() -> None:
    """Successful toolset is returned and filtered by allowed_tools."""
    configs = [
        {
            "id": "srv-ok",
            "name": "Ok Server",
            "url": "https://ok.domain.test/mcp",
            "allowed_tools": ["tool_c"],
        }
    ]

    mock_toolset = MagicMock()

    with patch("tools_mcp._create_single_toolset", return_value=mock_toolset):
        results = await load_mcp_toolsets(configs)
        assert len(results) == 1
        assert results[0] == mock_toolset
