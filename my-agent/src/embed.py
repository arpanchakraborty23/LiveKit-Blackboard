"""Embeddings service shim re-exporting services.embed_service."""

from __future__ import annotations

import sys
from pathlib import Path

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from services.embed_service import (
    EmbedError,
    embed_query,
    embed_texts,
    get_embed_dim,
    get_embed_model,
    get_embed_provider,
    probe_embed_dim,
)

__all__ = [
    "EmbedError",
    "embed_query",
    "embed_texts",
    "get_embed_dim",
    "get_embed_model",
    "get_embed_provider",
    "probe_embed_dim",
]
