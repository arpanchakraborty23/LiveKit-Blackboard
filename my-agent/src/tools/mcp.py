"""Model Context Protocol (MCP) toolset loader for LiveKit Agents."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

try:
    from constants.mcp import MCPServerConfig, PER_SERVER_TIMEOUT_S
except ImportError:
    from ..constants.mcp import MCPServerConfig, PER_SERVER_TIMEOUT_S

logger = logging.getLogger("tools_mcp")


async def _create_single_toolset(cfg: MCPServerConfig) -> Any:
    """Connect to a single MCP server with timeout and return the toolset."""
    try:
        from livekit.agents import mcp
    except ImportError as exc:
        raise RuntimeError("livekit-agents[mcp] is not installed") from exc

    start = time.perf_counter()

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
    """Load MCP toolsets for all configured servers with timeout and error isolation."""
    if not mcp_configs:
        return []

    configs: list[MCPServerConfig] = []
    for item in mcp_configs:
        parsed = MCPServerConfig.from_item(item)
        if parsed is not None:
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
