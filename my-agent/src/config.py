"""Config bundle fetching and snapshot fallback.

The agent worker holds no database credentials. At session start it asks one Edge Function
for the assistant's configuration and caches the answer for the life of the process.

Resolution order, cheapest first:

    job memo (same process, same version)  ->  HTTP with If-None-Match  ->  config_snapshot.json  ->  fail

The memo exists because LiveKit runs a *new process per job*, so anything in-process only
helps when one worker reuses a process across jobs — which it does in development and can do
in production. The snapshot exists because a control-plane outage must not mean a dead agent.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger("config")

REQUEST_TIMEOUT_S = 1.5
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_SNAPSHOT = _PROJECT_ROOT / "config_snapshot.json"


class ConfigError(RuntimeError):
    """No usable configuration could be produced."""


@dataclass(frozen=True)
class LLMConfig:
    provider: str
    model: str
    temperature: float


@dataclass(frozen=True)
class STTConfig:
    model: str
    language: str


@dataclass(frozen=True)
class TTSConfig:
    model: str
    voice: str


@dataclass(frozen=True)
class ConfigBundle:
    """Mirror of `get_assistant_bundle()` in supabase/migrations/0002_bundle.sql."""

    version: int
    assistant_id: str
    assistant_name: str
    prompt: str
    greeting: str
    llm: LLMConfig
    stt: STTConfig
    tts: TTSConfig
    expressive: bool
    settings: dict[str, Any] = field(default_factory=dict)
    rag: dict[str, Any] = field(default_factory=dict)
    mcp: list[Any] = field(default_factory=list)
    skills: list[Any] = field(default_factory=list)
    memory: dict[str, Any] = field(default_factory=dict)

    @property
    def etag(self) -> str:
        return f'W/"{self.version}"'

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> ConfigBundle:
        try:
            assistant = raw["assistant"]
            llm = raw["llm"]
            stt = raw["stt"]
            tts = raw["tts"]

            return cls(
                version=int(raw["version"]),
                assistant_id=str(assistant["id"]),
                assistant_name=str(assistant.get("name") or "Assistant"),
                prompt=str(raw.get("prompt") or ""),
                greeting=str(raw.get("greeting") or ""),
                llm=LLMConfig(
                    provider=str(llm.get("provider") or "livekit-inference"),
                    model=str(llm["model"]),
                    temperature=float(llm.get("temperature") or 0.7),
                ),
                stt=STTConfig(
                    model=str(stt["model"]),
                    language=str(stt.get("language") or "en"),
                ),
                tts=TTSConfig(
                    model=str(tts["model"]),
                    voice=str(tts.get("voice") or ""),
                ),
                expressive=bool(raw.get("expressive", True)),
                settings=dict(raw.get("settings") or {}),
                rag=dict(raw.get("rag") or {}),
                mcp=list(raw.get("mcp") or []),
                skills=list(raw.get("skills") or []),
                memory=dict(raw.get("memory") or {}),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ConfigError(f"malformed config bundle: {exc!r}") from exc


# assistant_id -> (etag, bundle). One process, a handful of jobs.
_MEMO: dict[str, tuple[str, ConfigBundle]] = {}


def snapshot_path() -> Path:
    raw = os.getenv("CONFIG_SNAPSHOT_PATH")
    return Path(raw) if raw else _DEFAULT_SNAPSHOT


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


async def fetch_bundle(
    assistant_id: str,
    expected_version: int | None = None,
) -> tuple[ConfigBundle, str]:
    """Resolve the bundle and report where it came from: memo | etag | snapshot.

    `expected_version` comes from the signed JWT metadata. When the memo already holds that
    exact version there is nothing to ask the network — the token was minted moments ago, so
    a newer config version cannot exist yet for this session.
    """
    memo = _MEMO.get(assistant_id)

    if memo is not None and expected_version is not None and memo[1].version == expected_version:
        logger.info("config source=memo version=%s", memo[1].version)
        return memo[1], "memo"

    # Only send If-None-Match when a cached copy actually exists. A 304 for a version we do
    # not hold would leave us with nothing to serve, so `expected_version` alone is not
    # enough to justify a conditional request.
    etag = memo[0] if memo is not None else None

    try:
        status, bundle = await asyncio.wait_for(
            _fetch_http(assistant_id, etag), timeout=REQUEST_TIMEOUT_S + 0.5
        )
    except (ConfigError, asyncio.TimeoutError, httpx.HTTPError, json.JSONDecodeError) as exc:
        logger.warning("config fetch failed (%s); falling back to snapshot", exc)
        bundle = None
        status = 0

    if status == 304 and memo is not None:
        logger.info("config source=etag version=%s (304)", memo[1].version)
        return memo[1], "etag"

    if bundle is not None:
        _MEMO[assistant_id] = (bundle.etag, bundle)
        logger.info("config source=etag version=%s", bundle.version)
        return bundle, "etag"

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
        "no configuration available: the config endpoint failed and no snapshot exists. "
        "Set AGENT_CONFIG_URL/AGENT_API_KEY, or bake config_snapshot.json at build time."
    )


def reset_memo() -> None:
    """Test hook."""
    _MEMO.clear()
