"""Config module shim re-exporting constants and config_service."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import services.config_service as _target_module
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

# Populate constants onto config_service so aliasing covers all symbols
_target_module.PROJECT_ROOT = PROJECT_ROOT
_target_module.LLMConfig = LLMConfig
_target_module.STTConfig = STTConfig
_target_module.TTSConfig = TTSConfig

# Alias in sys.modules
sys.modules[__name__] = _target_module
