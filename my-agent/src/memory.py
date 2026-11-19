"""Memory module shim re-exporting memory_service."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from services.memory_service import (
    HTTP_TIMEOUT_S,
    MEMORY_SERVICE_TOKEN,
    MEMORY_SERVICE_URL,
    _group_id,
    _headers,
    end_session_hook,
    recall,
    remember,
)

__all__ = [
    "HTTP_TIMEOUT_S",
    "MEMORY_SERVICE_TOKEN",
    "MEMORY_SERVICE_URL",
    "_group_id",
    "_headers",
    "end_session_hook",
    "recall",
    "remember",
]
