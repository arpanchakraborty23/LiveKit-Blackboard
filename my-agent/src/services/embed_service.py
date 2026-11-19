"""Embedding provider client mirroring ui/lib/embed/index.ts."""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("embed_service")

# In-memory query cache: sha256(text) -> unit vector
_CACHE: dict[str, list[float]] = {}
_MAX_CACHE_SIZE = 1024


class EmbedError(RuntimeError):
    """Embedding generation error."""

    def __init__(self, message: str, status_code: int = 500) -> None:
        super().__init__(message)
        self.status_code = status_code


def get_embed_provider() -> str:
    prov = os.getenv("EMBED_PROVIDER", "").lower()
    if prov == "openai":
        return "openai"
    if os.getenv("OPENAI_API_KEY") and not os.getenv("OLLAMA_BASE_URL") and not os.getenv("OLLAMA_API_KEY"):
        return "openai"
    return "ollama"


def get_embed_model() -> str:
    default_model = "text-embedding-3-small" if get_embed_provider() == "openai" else "embeddinggemma"
    return os.getenv("EMBED_MODEL", default_model)


def get_embed_dim() -> int:
    default_dim = 1536 if get_embed_provider() == "openai" else 768
    return int(os.getenv("EMBED_DIM", default_dim))


def _chunk_list(items: list[str], chunk_size: int = 32) -> list[list[str]]:
    return [items[i : i + chunk_size] for i in range(0, len(items), chunk_size)]


def _cache_key(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


async def _embed_ollama_batch(
    client: httpx.AsyncClient, batch: list[str], model: str, dim: int
) -> list[list[float]]:
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    url = f"{base_url}/api/embed"
    headers = {"Content-Type": "application/json"}
    api_key = os.getenv("OLLAMA_API_KEY")
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "input": batch,
        "truncate": True,
    }

    try:
        res = await client.post(url, json=payload, headers=headers, timeout=30.0)
    except httpx.HTTPError as exc:
        raise EmbedError(f"Failed to reach Ollama at {base_url}: {exc!r}", status_code=503) from exc

    if res.status_code in (401, 403):
        raise EmbedError(
            "Your Ollama plan does not include embeddings (/api/embed). Please check your Ollama Cloud subscription or switch provider.",
            status_code=res.status_code,
        )

    if not res.is_success:
        raise EmbedError(
            f"Ollama embedding failed with HTTP {res.status_code}: {res.text}",
            status_code=res.status_code,
        )

    data = res.json()
    embeddings = data.get("embeddings")
    if not isinstance(embeddings, list) or len(embeddings) != len(batch):
        raise EmbedError(
            f"Ollama returned malformed embeddings array (expected {len(batch)}, got {len(embeddings) if isinstance(embeddings, list) else 0})",
            status_code=502,
        )

    for i, emb in enumerate(embeddings):
        if not isinstance(emb, list) or len(emb) != dim:
            raise EmbedError(
                f"Embedding dimension mismatch: expected {dim}, got {len(emb) if isinstance(emb, list) else 0} at index {i}",
                status_code=502,
            )

    return embeddings


async def _embed_openai_batch(
    client: httpx.AsyncClient, batch: list[str], model: str, dim: int
) -> list[list[float]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise EmbedError("OPENAI_API_KEY is not set", status_code=500)

    url = "https://api.openai.com/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "input": batch,
    }
    if "text-embedding-3" in model:
        payload["dimensions"] = dim

    try:
        res = await client.post(url, json=payload, headers=headers, timeout=30.0)
    except httpx.HTTPError as exc:
        raise EmbedError(f"Failed to reach OpenAI embeddings endpoint: {exc!r}", status_code=503) from exc

    if not res.is_success:
        raise EmbedError(
            f"OpenAI embedding failed with HTTP {res.status_code}: {res.text}",
            status_code=res.status_code,
        )

    data = res.json()
    raw_data = data.get("data")
    if not isinstance(raw_data, list) or len(raw_data) != len(batch):
        raise EmbedError(
            f"OpenAI returned malformed data array (expected {len(batch)}, got {len(raw_data) if isinstance(raw_data, list) else 0})",
            status_code=502,
        )

    results: list[list[float]] = []
    for item in raw_data:
        emb = item.get("embedding")
        if not isinstance(emb, list) or len(emb) != dim:
            raise EmbedError(
                f"Embedding dimension mismatch: expected {dim}, got {len(emb) if isinstance(emb, list) else 0}",
                status_code=502,
            )
        results.append(emb)

    return results


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed an array of text strings. Returns list of unit vectors."""
    if not texts:
        return []

    provider = get_embed_provider()
    model = get_embed_model()
    dim = get_embed_dim()

    batches = _chunk_list(texts, chunk_size=32)
    final_embeddings: list[list[float]] = []

    async with httpx.AsyncClient() as client:
        for batch in batches:
            if provider == "openai":
                emb_batch = await _embed_openai_batch(client, batch, model, dim)
            else:
                emb_batch = await _embed_ollama_batch(client, batch, model, dim)
            final_embeddings.extend(emb_batch)

    return final_embeddings


async def embed_query(query: str) -> list[float]:
    """Embed single query with in-memory caching."""
    clean = query.strip()
    if not clean:
        raise EmbedError("Query cannot be empty", status_code=400)

    key = _cache_key(clean)
    if key in _CACHE:
        return _CACHE[key]

    embs = await embed_texts([clean])
    emb = embs[0]

    if len(_CACHE) >= _MAX_CACHE_SIZE:
        _CACHE.pop(next(iter(_CACHE)))
    _CACHE[key] = emb

    return emb


async def probe_embed_dim() -> int:
    """Boot-time probe returning vector width."""
    sample = ["dimension probe"]
    embs = await embed_texts(sample)
    actual_dim = len(embs[0])
    expected_dim = get_embed_dim()
    if actual_dim != expected_dim:
        raise EmbedError(
            f"Dimension probe failed: model '{get_embed_model()}' produced dim {actual_dim}, but EMBED_DIM={expected_dim} is configured.",
            status_code=500,
        )
    return actual_dim
