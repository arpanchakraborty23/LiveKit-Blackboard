"""Config bundle shim re-exporting constants and services."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from constants.config import (
    DEFAULT_SNAPSHOT,
    PROJECT_ROOT,
    REQUEST_TIMEOUT_S,
    ConfigBundle,
    ConfigError,
    LLMConfig,
    STTConfig,
    TTSConfig,
    get_default_bundle,
)
from services.config_service import (
    _MEMO,
    fetch_bundle,
    load_snapshot,
    reset_memo,
    snapshot_path,
)

__all__ = [
    "DEFAULT_SNAPSHOT",
    "PROJECT_ROOT",
    "REQUEST_TIMEOUT_S",
    "ConfigBundle",
    "ConfigError",
    "LLMConfig",
    "STTConfig",
    "TTSConfig",
    "_MEMO",
    "fetch_bundle",
    "get_default_bundle",
    "load_snapshot",
    "reset_memo",
    "snapshot_path",
]
