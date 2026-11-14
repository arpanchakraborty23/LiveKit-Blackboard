"""Config resolution tests. No network, no LiveKit runtime."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import config as config_module  # noqa: E402
from config import ConfigBundle, ConfigError, fetch_bundle, load_snapshot  # noqa: E402


def _raw(version: int = 1, model: str = "google/gemma-4-31b-it") -> dict:
    return {
        "version": version,
        "assistant": {"id": "00000000-0000-0000-0000-000000000001", "name": "Test"},
        "prompt": "Be helpful.",
        "greeting": "Hi.",
        "llm": {"provider": "livekit-inference", "model": model, "temperature": 0.7},
        "stt": {"model": "assemblyai/universal-3-5-pro", "language": "en"},
        "tts": {"model": "fishaudio/s2.1-pro", "voice": "abc"},
        "expressive": True,
    }


@pytest.fixture(autouse=True)
def _clean(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    config_module.reset_memo()
    for name in ("AGENT_CONFIG_URL", "AGENT_API_KEY", "CONFIG_SNAPSHOT_PATH"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("CONFIG_SNAPSHOT_PATH", str(tmp_path / "snapshot.json"))
    yield
    config_module.reset_memo()


def test_from_dict_rejects_missing_sections() -> None:
    with pytest.raises(ConfigError):
        ConfigBundle.from_dict({"version": 1})


def test_etag_is_weak_and_versioned() -> None:
    assert ConfigBundle.from_dict(_raw(7)).etag == 'W/"7"'


def test_malformed_snapshot_is_ignored(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "broken.json"
    path.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv("CONFIG_SNAPSHOT_PATH", str(path))

    assert load_snapshot() is None


def test_snapshot_is_used_when_the_control_plane_is_unreachable(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "snapshot.json"
    path.write_text(json.dumps(_raw(3)), encoding="utf-8")
    monkeypatch.setenv("CONFIG_SNAPSHOT_PATH", str(path))
    monkeypatch.setenv("AGENT_CONFIG_URL", "http://127.0.0.1:9/functions/v1/assistant-config")
    monkeypatch.setenv("AGENT_API_KEY", "test-key")

    bundle, source = __import__("asyncio").run(
        fetch_bundle("00000000-0000-0000-0000-000000000001")
    )

    assert source == "snapshot"
    assert bundle.version == 3


def test_no_configuration_at_all_raises() -> None:
    with pytest.raises(ConfigError):
        __import__("asyncio").run(fetch_bundle("00000000-0000-0000-0000-000000000001"))
