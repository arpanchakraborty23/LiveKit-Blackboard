"""Service for fetching, caching, and snapshot resolution of ConfigBundle."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Any

import httpx

try:
    from constants.config import (
        DEFAULT_SNAPSHOT,
        REQUEST_TIMEOUT_S,
        ConfigBundle,
        ConfigError,
        get_default_bundle,
    )
except ImportError:
    from ..constants.config import (
        DEFAULT_SNAPSHOT,
        REQUEST_TIMEOUT_S,
        ConfigBundle,
        ConfigError,
        get_default_bundle,
    )

logger = logging.getLogger("config_service")

# assistant_id -> (etag, bundle). One process, a handful of jobs.
_MEMO: dict[str, tuple[str, ConfigBundle]] = {}


def snapshot_path() -> Path:
    raw = os.getenv("CONFIG_SNAPSHOT_PATH")
    return Path(raw) if raw else DEFAULT_SNAPSHOT


def load_snapshot() -> ConfigBundle | None:
    path = snapshot_path()
    if not path.exists():
        return None

    try:
        return ConfigBundle.from_dict(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ConfigError) as exc:
        logger.warning("config snapshot at %s is unusable: %s", path, exc)
        return None


async def _fetch_http(assistant_id: str, etag: str | None) -> tuple[int, ConfigBundle | None]:
    """Returns (status, bundle). A 304 deliberately returns no bundle."""
    url = os.getenv("AGENT_CONFIG_URL")
    key = os.getenv("AGENT_API_KEY")

    if not url or not key:
        raise ConfigError("AGENT_CONFIG_URL and AGENT_API_KEY must be set")

    headers = {"x-agent-key": key}
    if etag:
        headers["If-None-Match"] = etag

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
        response = await client.get(url, params={"assistant_id": assistant_id}, headers=headers)

    if response.status_code == 304:
        return 304, None

    if response.status_code == 200:
        return 200, ConfigBundle.from_dict(response.json())

    raise ConfigError(f"config endpoint returned {response.status_code}: {response.text[:200]}")


async def _fetch_from_backend(backend_url: str, assistant_id: str) -> ConfigBundle | None:
    """Fetch active prompt, skills, and MCP tools from the FastAPI backend."""
    base = backend_url.rstrip("/")
    headers = {"Content-Type": "application/json"}

    prompt_text = os.getenv("AGENT_PROMPT", "You are a helpful, friendly voice assistant.")
    skills: list[dict[str, Any]] = []
    mcp_configs: list[dict[str, Any]] = []

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
            # 1. Fetch active prompt
            try:
                r = await client.get(f"{base}/api/prompt/active", headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    combined = data.get("combined_prompt") or data.get("system_prompt")
                    if combined and combined.strip():
                        prompt_text = combined.strip()
            except Exception as exc:
                logger.debug("Backend prompt fetch failed: %s", exc)

            # 2. Fetch active skills
            try:
                r = await client.get(f"{base}/api/skills/active", headers=headers)
                if r.status_code == 200:
                    data = r.json()
                    skills = data.get("skills") or data.get("data") or []
            except Exception as exc:
                logger.debug("Backend skills fetch failed: %s", exc)

            # 3. Fetch MCP servers & tools
            try:
                r_srv = await client.get(f"{base}/api/mcp/mcpservers", headers=headers)
                r_tools = await client.get(f"{base}/api/mcp/tools", headers=headers)
                if r_srv.status_code in (200, 202):
                    servers_data = r_srv.json().get("servers") or []
                    tools_by_server: dict[str, list[str]] = {}
                    if r_tools.status_code in (200, 202):
                        tools_data = r_tools.json().get("tools") or []
                        for t in tools_data:
                            if t.get("is_enabled", False):
                                srv_name = t.get("mcp_server")
                                if srv_name:
                                    tools_by_server.setdefault(srv_name, []).append(t.get("name"))

                    for srv in servers_data:
                        if srv.get("is_enabled", False):
                            sname = srv.get("name")
                            mcp_configs.append(
                                {
                                    "id": sname,
                                    "name": sname,
                                    "url": srv.get("url"),
                                    "transport": "streamable_http",
                                    "allowed_tools": tools_by_server.get(sname, []),
                                }
                            )
            except Exception as exc:
                logger.debug("Backend MCP fetch failed: %s", exc)
    except Exception as exc:
        logger.debug("Backend connection error: %s", exc)
        return None

    default_b = get_default_bundle(assistant_id)
    return ConfigBundle(
        version=1,
        assistant_id=assistant_id,
        assistant_name=default_b.assistant_name,
        prompt=prompt_text,
        greeting=default_b.greeting,
        llm=default_b.llm,
        stt=default_b.stt,
        tts=default_b.tts,
        expressive=default_b.expressive,
        settings={},
        rag={},
        mcp=mcp_configs,
        skills=skills,
        memory={"enabled": False},
    )


async def fetch_bundle(
    assistant_id: str,
    expected_version: int | None = None,
) -> tuple[ConfigBundle, str]:
    """Resolve the bundle and report where it came from: memo | backend | etag | snapshot.

    Raises ConfigError if no configuration is found (the agent caller falls back to get_default_bundle).
    """
    memo = _MEMO.get(assistant_id)

    if memo is not None and expected_version is not None and memo[1].version == expected_version:
        logger.info("config source=memo version=%s", memo[1].version)
        return memo[1], "memo"

    etag = memo[0] if memo is not None else None
    bundle: ConfigBundle | None = None
    status: int = 0

    # 1. Try AGENT_CONFIG_URL if explicitly set
    if os.getenv("AGENT_CONFIG_URL"):
        try:
            status, bundle = await asyncio.wait_for(
                _fetch_http(assistant_id, etag), timeout=REQUEST_TIMEOUT_S + 0.5
            )
        except (ConfigError, asyncio.TimeoutError, httpx.HTTPError, json.JSONDecodeError) as exc:
            logger.warning("config fetch from AGENT_CONFIG_URL failed (%s); trying backend/snapshot", exc)
            bundle = None
            status = 0

    # 2. Try FastAPI BACKEND_URL
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    if bundle is None and backend_url:
        try:
            bundle = await asyncio.wait_for(
                _fetch_from_backend(backend_url, assistant_id), timeout=REQUEST_TIMEOUT_S + 0.5
            )
            if bundle is not None:
                status = 200
        except Exception as exc:
            logger.debug("FastAPI backend fetch failed (%s); trying snapshot", exc)

    if status == 304 and memo is not None:
        logger.info("config source=etag version=%s (304)", memo[1].version)
        return memo[1], "etag"

    if bundle is not None:
        _MEMO[assistant_id] = (bundle.etag, bundle)
        logger.info("config source=backend version=%s", bundle.version)
        return bundle, "backend"

    snapshot = load_snapshot()
    if snapshot is not None:
        logger.warning(
            "config source=snapshot version=%s (control plane unreachable)", snapshot.version
        )
        return snapshot, "snapshot"

    if memo is not None:
        logger.warning("config source=memo version=%s (stale, control plane unreachable)", memo[1].version)
        return memo[1], "memo"

    raise ConfigError(
        "no configuration available: backend endpoint failed and no snapshot exists."
    )


def reset_memo() -> None:
    """Test hook."""
    _MEMO.clear()
