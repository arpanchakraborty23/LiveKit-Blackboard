"""Agent memory interface.

Provides memory recall, non-blocking remember operations, and session-end
distillation into Graphiti via memory-service.

Memory operations never block the voice path or add latency to the first word.
The denormalized memory profile is already preloaded in the ConfigBundle at session start.
Detailed recall is model-initiated via function tool.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("memory")

MEMORY_SERVICE_URL = os.getenv("MEMORY_SERVICE_URL", "http://localhost:8000")
MEMORY_SERVICE_TOKEN = os.getenv("MEMORY_SERVICE_TOKEN", "memory_secret_dev")
HTTP_TIMEOUT_S = 2.0


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {MEMORY_SERVICE_TOKEN}",
        "Content-Type": "application/json",
    }


def _group_id(assistant_id: str) -> str:
    cleaned = assistant_id.replace("-", "_")
    return f"a_{cleaned}" if not cleaned.startswith("a_") else cleaned


async def remember(assistant_id: str, fact: str) -> None:
    """Fire-and-forget durable fact storage.

    Never blocks a conversational turn or raises exceptions to the caller.
    """
    if not fact or not fact.strip():
        return

    gid = _group_id(assistant_id)

    async def _post() -> None:
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
                resp = await client.post(
                    f"{MEMORY_SERVICE_URL}/episodes",
                    headers=_headers(),
                    json={
                        "group_id": gid,
                        "name": f"remember_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                        "body": fact.strip(),
                        "reference_time": datetime.now(timezone.utc).isoformat(),
                    },
                )
                if not resp.is_success:
                    logger.warning("remember() failed status=%s: %s", resp.status_code, resp.text)
                else:
                    logger.info("remember() stored fact for assistant=%s", assistant_id)
        except Exception as exc:
            logger.warning("remember() request failed: %s", exc)

    # Fire as background task without blocking
    asyncio.create_task(_post())


async def recall(assistant_id: str, query: str) -> str:
    """Model-initiated temporal search over graph memories.

    Returns concise, spoken-safe plain text. On failure or timeout, returns
    a graceful natural language fallback instead of raising or returning stack traces.
    """
    if not query or not query.strip():
        return "I don't have enough context to search memories for that."

    gid = _group_id(assistant_id)

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_S) as client:
            resp = await client.post(
                f"{MEMORY_SERVICE_URL}/search",
                headers=_headers(),
                json={
                    "group_id": gid,
                    "query": query.strip(),
                    "limit": 5,
                },
            )

            if not resp.is_success:
                logger.warning("recall() failed status=%s: %s", resp.status_code, resp.text)
                return "I couldn't recall specific past details about that right now."

            raw_data = resp.json()
            if asyncio.iscoroutine(raw_data):
                data = await raw_data
            else:
                data = raw_data
            results = data.get("results") or []

            if not results:
                return "I don't recall any specific past notes about that."

            # Format into natural, spoken-safe summary
            facts: list[str] = []
            for r in results:
                fact_text = r.get("fact")
                if fact_text and fact_text not in facts:
                    facts.append(fact_text)

            if not facts:
                return "I don't have recorded details on that topic."

            return "Here is what I remember: " + "; ".join(facts) + "."

    except asyncio.TimeoutError:
        logger.warning("recall() timed out after %s s", HTTP_TIMEOUT_S)
        return "Memory lookup took too long, so let's continue."
    except Exception as exc:
        logger.warning("recall() failed with exception: %s", exc)
        return "I am unable to reach the memory service right now."


async def end_session_hook(assistant_id: str, transcript: list[Any]) -> None:
    """Post-session background task distilling conversation into an episode.

    Extracts durable facts/preferences from the conversation transcript, adds an episode
    to the memory-service, and triggers profile rebuilding.
    """
    if not transcript:
        logger.info("end_session_hook: empty transcript, skipping")
        return

    gid = _group_id(assistant_id)

    # Filter and format dialogue turns
    dialogue_lines: list[str] = []
    for item in transcript:
        if isinstance(item, dict):
            role = item.get("role", "speaker")
            text = item.get("text") or item.get("content", "")
            if text:
                dialogue_lines.append(f"{role}: {text}")
        elif isinstance(item, str) and item.strip():
            dialogue_lines.append(item.strip())

    if not dialogue_lines:
        return

    conversation_body = "\n".join(dialogue_lines)
    session_time = datetime.now(timezone.utc)
    session_name = f"session_{session_time.strftime('%Y%m%d_%H%M%S')}"

    logger.info(
        "end_session_hook: distilling %d turns for assistant=%s",
        len(dialogue_lines),
        assistant_id,
    )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # 1. Post episode
            ep_resp = await client.post(
                f"{MEMORY_SERVICE_URL}/episodes",
                headers=_headers(),
                json={
                    "group_id": gid,
                    "name": session_name,
                    "body": conversation_body,
                    "reference_time": session_time.isoformat(),
                },
            )

            if not ep_resp.is_success:
                logger.warning(
                    "end_session_hook: episode submission failed status=%s: %s",
                    ep_resp.status_code,
                    ep_resp.text,
                )
                return

            logger.info("end_session_hook: episode created successfully")

            # 2. Trigger profile rebuild
            rebuild_resp = await client.post(
                f"{MEMORY_SERVICE_URL}/profile/rebuild",
                headers=_headers(),
                json={"group_id": gid},
            )

            if rebuild_resp.is_success:
                logger.info(
                    "end_session_hook: memory profile rebuilt successfully for assistant=%s",
                    assistant_id,
                )
            else:
                logger.warning(
                    "end_session_hook: profile rebuild failed status=%s: %s",
                    rebuild_resp.status_code,
                    rebuild_resp.text,
                )

    except Exception as exc:
        logger.warning("end_session_hook: memory distillation encountered error: %s", exc)
