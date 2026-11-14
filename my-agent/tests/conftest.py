"""Shared fixtures.

`Assistant` no longer has a hardcoded prompt — it is built from a config bundle, so tests
need a realistic one. This fixture mirrors the shape `get_assistant_bundle()` returns.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from config import ConfigBundle  # noqa: E402


@pytest.fixture
def bundle() -> ConfigBundle:
    return ConfigBundle.from_dict(
        {
            "version": 1,
            "assistant": {"id": "00000000-0000-0000-0000-000000000001", "name": "Test Assistant"},
            "prompt": (
                "You are a friendly, reliable voice assistant that answers questions and helps "
                "the user get things done. Respond in plain text only, in one to three sentences. "
                "Refuse harmful requests briefly."
            ),
            "greeting": "Hey, I am ready when you are.",
            "llm": {"provider": "livekit-inference", "model": "google/gemma-4-31b-it", "temperature": 0.7},
            "stt": {"model": "assemblyai/universal-3-5-pro", "language": "en"},
            "tts": {"model": "fishaudio/s2.1-pro", "voice": "fa4c9eb3dccc4806b382b40d61c6b10a"},
            "expressive": True,
            "settings": {},
            "rag": {"enabled": False},
            "mcp": [],
            "skills": [],
            "memory": {"enabled": False},
        }
    )
