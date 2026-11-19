"""Agent memory service interface.

Provides minimal memory recall, remember operations, and session-end hooks.
For advanced memory, a separate dedicated engine is planned in the root directory.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("memory_service")

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
    """Fire-and-forget durable fact storage."""
    if not fact or not fact.strip() or not MEMORY_SERVICE_URL:
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
                    logger.debug("remember() failed status=%s: %s", resp.status_code, resp.text)
                else:
                    logger.info("remember() stored fact for assistant=%s", assistant_id)
        except Exception as exc:
            logger.debug("remember() request failed: %s", exc)

    asyncio.create_task(_post())


async def recall(assistant_id: str, query: str) -> str:
    """Search over memory. Graceful spoken fallback if memory engine is offline."""
    if not query or not query.strip():
        return "I don't have enough context to search memories for that."

    if not MEMORY_SERVICE_URL:
        return "I don't recall any specific past notes about that."

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
                logger.debug("recall() failed status=%s: %s", resp.status_code, resp.text)
                return "I couldn't recall specific past details about that right now."

            raw_data = resp.json()
            if asyncio.iscoroutine(raw_data):
                data = await raw_data
            else:
                data = raw_data
            results = data.get("results") or []

            if not results:
                return "I don't recall any specific past notes about that."

            facts: list[str] = []
            for r in results:
                fact_text = r.get("fact")
                if fact_text and fact_text not in facts:
                    facts.append(fact_text)

            if not facts:
                return "I don't have recorded details on that topic."

            return "Here is what I remember: " + "; ".join(facts) + "."

    except asyncio.TimeoutError:
        logger.debug("recall() timed out after %s s", HTTP_TIMEOUT_S)
        return "Memory lookup took too long, so let's continue."
    except Exception as exc:
        logger.debug("recall() failed with exception: %s", exc)
        return "I am unable to reach the memory service right now."


async def end_session_hook(assistant_id: str, transcript: list[Any]) -> None:
    """Post-session background task distilling conversation into an episode."""
    if not transcript or not MEMORY_SERVICE_URL:
        return

    gid = _group_id(assistant_id)
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

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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
                return

            await client.post(
                f"{MEMORY_SERVICE_URL}/profile/rebuild",
                headers=_headers(),
                json={"group_id": gid},
            )
    except Exception as exc:
        logger.debug("end_session_hook: memory distillation encountered error: %s", exc)
