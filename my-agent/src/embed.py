"""Embedding provider client mirroring ui/lib/embed/index.ts.

All vector generation originates from Ollama Cloud (/api/embed) or OpenAI fallback.
Pinecone never embeds anything — queries must be embedded here before Pinecone query.

Rules:
- Batches of 32 texts per request.
- Asserts length == EMBED_DIM for every returned vector.
- Uses `truncate: True` so long chunks do not produce 400.
"""

from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger("embed")

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

    for vec in embeddings:
        if not isinstance(vec, list) or len(vec) != dim:
            raise EmbedError(
                f"Embedding dimension mismatch: expected {dim}, got {len(vec) if isinstance(vec, list) else 0}",
                status_code=500,
            )

    return embeddings


async def _embed_openai_batch(
    client: httpx.AsyncClient, batch: list[str], model: str, dim: int
) -> list[list[float]]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise EmbedError("OPENAI_API_KEY is not configured", status_code=401)

    url = "https://api.openai.com/v1/embeddings"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload: dict[str, Any] = {
        "model": model,
        "input": batch,
    }
    if dim:
        payload["dimensions"] = dim

    try:
        res = await client.post(url, json=payload, headers=headers, timeout=30.0)
    except httpx.HTTPError as exc:
        raise EmbedError(f"Failed to reach OpenAI embeddings API: {exc!r}", status_code=503) from exc

    if not res.is_success:
        raise EmbedError(
            f"OpenAI embedding failed with HTTP {res.status_code}: {res.text}",
            status_code=res.status_code,
        )

    data = res.json()
    raw_data = data.get("data")
    if not isinstance(raw_data, list) or len(raw_data) != len(batch):
        raise EmbedError("OpenAI returned malformed data array", status_code=502)

    # Sort by index
    sorted_items = sorted(raw_data, key=lambda x: x.get("index", 0))
    embeddings = [item["embedding"] for item in sorted_items]

    for vec in embeddings:
        if not isinstance(vec, list) or len(vec) != dim:
            raise EmbedError(
                f"OpenAI embedding dimension mismatch: expected {dim}, got {len(vec) if isinstance(vec, list) else 0}",
                status_code=500,
            )

    return embeddings


async def embed(texts: list[str]) -> list[list[float]]:
    """Embed an array of texts in batches of 32.

    Returns unit-length vectors with length == EMBED_DIM.
    """
    if not texts:
        return []

    # Check cache for single-query scenario (typical for voice agent)
    if len(texts) == 1:
        key = _cache_key(texts[0])
        if key in _CACHE:
            return [_CACHE[key]]

    provider = get_embed_provider()
    model = get_embed_model()
    dim = get_embed_dim()

    batches = _chunk_list(texts, 32)
    all_embeddings: list[list[float]] = []

    async with httpx.AsyncClient() as client:
        for batch in batches:
            if provider == "openai":
                vectors = await _embed_openai_batch(client, batch, model, dim)
            else:
                vectors = await _embed_ollama_batch(client, batch, model, dim)
            all_embeddings.extend(vectors)

    # Populate cache for single texts
    if len(texts) == 1 and all_embeddings:
        if len(_CACHE) >= _MAX_CACHE_SIZE:
            _CACHE.pop(next(iter(_CACHE)))
        _CACHE[_cache_key(texts[0])] = all_embeddings[0]

    return all_embeddings


async def probe_embed() -> bool:
    """Probes the embedding provider at agent boot with a single 'ping'.

    Asserts that vector dimension exactly matches EMBED_DIM.
    """
    vectors = await embed(["ping"])
    if not vectors or len(vectors[0]) != get_embed_dim():
        raise EmbedError(
            f"Embedding probe returned invalid dimension: {len(vectors[0]) if vectors else 0} != {get_embed_dim()}"
        )
    return True
