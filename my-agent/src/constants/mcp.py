"""MCP configuration constants and data classes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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
