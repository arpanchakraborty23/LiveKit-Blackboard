"""Skills tool shim re-exporting tools.skills with sys.modules aliasing."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

import tools.skills as _target_module

# Alias in sys.modules so imports and state are shared
sys.modules[__name__] = _target_module
