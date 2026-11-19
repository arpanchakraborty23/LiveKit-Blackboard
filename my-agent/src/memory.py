"""Memory module shim re-exporting services.memory_service with sys.modules aliasing."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import services.memory_service as _target_module

# Alias in sys.modules so imports and state are shared
sys.modules[__name__] = _target_module
