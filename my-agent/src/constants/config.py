"""Configuration data models and constants."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

REQUEST_TIMEOUT_S = 1.5
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_SNAPSHOT = PROJECT_ROOT / "config_snapshot.json"


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
    """Configuration bundle defining the assistant's runtime behavior."""

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


def get_default_bundle(assistant_id: str = "default") -> ConfigBundle:
    """Fallback default bundle used when control plane is unreachable."""
    return ConfigBundle(
        version=1,
        assistant_id=assistant_id,
        assistant_name=os.getenv("AGENT_NAME", "Assistant"),
        prompt=os.getenv(
            "AGENT_PROMPT",
            "You are a helpful, friendly voice assistant. Respond clearly and concisely in natural spoken language.",
        ),
        greeting=os.getenv("AGENT_GREETING", "Hello, I am ready when you are."),
        llm=LLMConfig(
            provider=os.getenv("LLM_PROVIDER", "livekit-inference"),
            model=os.getenv("LLM_MODEL", "google/gemma-4-31b-it"),
            temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
        ),
        stt=STTConfig(
            model=os.getenv("STT_MODEL", "assemblyai/universal-3-5-pro"),
            language=os.getenv("STT_LANGUAGE", "en"),
        ),
        tts=TTSConfig(
            model=os.getenv("TTS_MODEL", "fishaudio/s2.1-pro"),
            voice=os.getenv("TTS_VOICE", "fa4c9eb3dccc4806b382b40d61c6b10a"),
        ),
        expressive=os.getenv("EXPRESSIVE", "true").lower() == "true",
        settings={},
        rag={},
        mcp=[],
        skills=[],
        memory={"enabled": False},
    )
