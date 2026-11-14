"""Model Context Protocol (MCP) toolset loader for LiveKit Agents.

Connects to remote MCP servers over HTTP/SSE, applies allowed_tools filtering to
enforce the 30-tool budget, isolates connection failures, and builds MCPToolset instances.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("tools_mcp")

PER_SERVER_TIMEOUT_S = 8.0


@dataclass(frozen=True)
class MCPServerConfig:
    id: str
    name: str
    url: str
    transport: str = "streamable_http"
    headers: dict[str, str] = field(default_factory=dict)
    allowed_tools: list[str] = field(default_factory=list)

    @classmethod
    def from_item(cls, item: Any) -> MCPServerConfig | None:
        if isinstance(item, cls):
            return item
        if not isinstance(item, dict):
            return None
        url = item.get("url")
        if not url:
            return None
        return cls(
            id=str(item.get("id") or ""),
            name=str(item.get("name") or "mcp"),
            url=str(url),
            transport=str(item.get("transport") or "streamable_http"),
            headers=dict(item.get("headers") or {}),
            allowed_tools=list(item.get("allowed_tools") or []),
        )


async def _create_single_toolset(cfg: MCPServerConfig) -> Any:
    """Connect to a single MCP server with timeout and return the toolset.

    Raises TimeoutError or Exception on failure.
    """
    try:
        from livekit.agents import mcp
    except ImportError as exc:
        raise RuntimeError("livekit-agents[mcp] is not installed") from exc

    start = time.perf_counter()

    # Budget enforcement: only expose tools that were explicitly enabled
    server_http = mcp.MCPServerHTTP(
        cfg.url,
        transport_type=cfg.transport,
        headers=cfg.headers,
        allowed_tools=cfg.allowed_tools,
    )

    toolset = mcp.MCPToolset(
        id=cfg.id,
        mcp_server=server_http,
    )

    # If the toolset or server provides an async connect method, await it with timeout
    if hasattr(toolset, "connect") and callable(getattr(toolset, "connect")):
        connect_fn = getattr(toolset, "connect")
        if asyncio.iscoroutinefunction(connect_fn):
            await asyncio.wait_for(connect_fn(), timeout=PER_SERVER_TIMEOUT_S)
    elif hasattr(server_http, "connect") and callable(getattr(server_http, "connect")):
        connect_fn = getattr(server_http, "connect")
        if asyncio.iscoroutinefunction(connect_fn):
            await asyncio.wait_for(connect_fn(), timeout=PER_SERVER_TIMEOUT_S)

    elapsed_ms = round((time.perf_counter() - start) * 1000)
    logger.info(
        "mcp_connect_ms server=%s url=%s allowed_tools=%d ms=%d",
        cfg.name,
        cfg.url,
        len(cfg.allowed_tools),
        elapsed_ms,
    )
    return toolset


async def load_mcp_toolsets(mcp_configs: list[Any]) -> list[Any]:
    """Load MCP toolsets for all configured servers.

    Connects concurrently with per-server timeout (8s).
    Isolates errors so that a broken or unreachable MCP server never crashes
    the session.
    """
    if not mcp_configs:
        return []

    configs: list[MCPServerConfig] = []
    for item in mcp_configs:
        parsed = MCPServerConfig.from_item(item)
        if parsed is not None:
            # If server has no allowed_tools enabled, skip it to avoid overhead
            if not parsed.allowed_tools:
                logger.info("skipping mcp server %s: no tools enabled", parsed.name)
                continue
            configs.append(parsed)

    if not configs:
        return []

    async def _safe_load(cfg: MCPServerConfig) -> Any | None:
        try:
            return await asyncio.wait_for(
                _create_single_toolset(cfg),
                timeout=PER_SERVER_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "mcp server %s timed out after %ss (url=%s); dropping server",
                cfg.name,
                PER_SERVER_TIMEOUT_S,
                cfg.url,
            )
            return None
        except Exception as exc:
            logger.warning(
                "mcp server %s connection failed (url=%s): %s; dropping server",
                cfg.name,
                cfg.url,
                exc,
            )
            return None

    results = await asyncio.gather(
        *[_safe_load(cfg) for cfg in configs],
        return_exceptions=True,
    )

    toolsets: list[Any] = []
    for r in results:
        if r is not None and not isinstance(r, BaseException):
            toolsets.append(r)

    logger.info("loaded %d / %d mcp toolsets", len(toolsets), len(configs))
    return toolsets
