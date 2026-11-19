"""Skills runtime tools and prompt formatting."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

import httpx

try:
    from livekit.agents import function_tool
except ImportError:
    from livekit.agents.llm import function_tool

try:
    from constants.config import REQUEST_TIMEOUT_S
except ImportError:
    from ..constants.config import REQUEST_TIMEOUT_S

logger = logging.getLogger("tools_skills")

_DEFAULT_TOKEN_BUDGET = 500

# Cache: (assistant_id, skill_name, path_or_none) -> body text
_SKILLS_CACHE: dict[tuple[str, str, str | None], str] = {}
_ACTIVE_ASSISTANT_ID: str | None = None


def set_current_assistant(assistant_id: str | None) -> None:
    """Sets the assistant ID for subsequent read_skill invocations."""
    global _ACTIVE_ASSISTANT_ID
    _ACTIVE_ASSISTANT_ID = assistant_id


def register_skill_cache(
    assistant_id: str,
    name: str,
    body: str,
    path: str | None = None,
) -> None:
    """Test and snapshot hook to pre-populate skill content."""
    _SKILLS_CACHE[(assistant_id, name, path)] = body


def clear_skills_cache() -> None:
    """Test hook."""
    _SKILLS_CACHE.clear()


def estimate_tokens(text: str) -> int:
    """Rough heuristic: ~4 characters per token."""
    return (len(text) + 3) // 4


def format_skills_menu(
    skills: list[dict[str, Any]],
    token_budget: int = _DEFAULT_TOKEN_BUDGET,
) -> str:
    """Formats the compact skills menu to append to system instructions."""
    if not skills:
        return ""

    header = (
        "\n\n# Skills\n"
        "The following skills are available. When the user's request matches a description, "
        "call the read_skill tool with the skill's name to load the instructions before proceeding.\n"
    )

    lines: list[str] = []
    current_tokens = estimate_tokens(header)

    for item in skills:
        name = str(item.get("name") or "").strip()
        desc = str(item.get("description") or "").strip()
        if not name or not desc:
            continue

        line = f"- {name}: {desc}\n"
        line_tokens = estimate_tokens(line)

        if current_tokens + line_tokens > token_budget:
            remaining_chars = max(20, (token_budget - current_tokens) * 4 - len(name) - 10)
            truncated_desc = desc[:remaining_chars].rstrip() + "..."
            line = f"- {name}: {truncated_desc}\n"
            logger.warning(
                "Skills menu exceeded token budget (%d). Truncating skill '%s'.",
                token_budget,
                name,
            )
            lines.append(line)
            break

        lines.append(line)
        current_tokens += line_tokens

    return header + "".join(lines)


def append_skills_prompt(
    base_prompt: str,
    skills: list[dict[str, Any]],
    token_budget: int = _DEFAULT_TOKEN_BUDGET,
) -> str:
    """Appends the formatted skills menu to the base prompt."""
    menu = format_skills_menu(skills, token_budget)
    return base_prompt + menu


async def _fetch_skill_remote(
    assistant_id: str,
    name: str,
    path: str | None = None,
) -> str | None:
    """Fetches skill body from the assistant-config Edge Function or FastAPI backend."""
    url = os.getenv("AGENT_CONFIG_URL")
    key = os.getenv("AGENT_API_KEY")

    if url and key:
        headers = {"x-agent-key": key}
        params: dict[str, str] = {"assistant_id": assistant_id, "skill": name}
        if path:
            params["path"] = path

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                resp = await client.get(url, params=params, headers=headers)

            if resp.status_code == 200:
                data = resp.json()
                if path:
                    return str(data.get("content") or "")
                return str(data.get("body") or "")
            else:
                logger.warning(
                    "Skill fetch returned %d: %s", resp.status_code, resp.text[:100]
                )
        except Exception as exc:
            logger.warning("Remote skill fetch failed: %s", exc)

    # Check FastAPI backend
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    if backend_url:
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S) as client:
                resp = await client.get(f"{backend_url.rstrip('/')}/api/skills/active")
                if resp.status_code == 200:
                    data = resp.json()
                    skills = data.get("skills") or data.get("data") or []
                    for s in skills:
                        if s.get("name") == name:
                            return str(s.get("instructions") or s.get("description") or "")
        except Exception as exc:
            logger.debug("Backend skill fetch failed: %s", exc)

    return None


@function_tool
async def read_skill(name: str, path: str | None = None) -> str:
    """Load the full instructions for a skill. Call this when the user's
    request matches a skill description above.

    Args:
        name: The exact name of the skill to load (e.g. 'triage').
        path: Optional relative path of an ancillary file bundled with the skill.
    """
    assistant_id = _ACTIVE_ASSISTANT_ID or os.getenv("ASSISTANT_ID") or ""
    clean_name = name.strip()
    cache_key = (assistant_id, clean_name, path)

    # 1. Check in-memory cache
    if cache_key in _SKILLS_CACHE:
        logger.info("Serving skill '%s' (path=%s) from memory cache", clean_name, path)
        return _SKILLS_CACHE[cache_key]

    # Also check with any assistant ID in cache
    for (aid, sname, spath), body in _SKILLS_CACHE.items():
        if sname == clean_name and spath == path:
            return body

    # 2. Remote HTTP lookup
    if assistant_id:
        body = await _fetch_skill_remote(assistant_id, clean_name, path)
        if body is not None:
            _SKILLS_CACHE[cache_key] = body
            logger.info("Fetched and cached skill '%s' (path=%s)", clean_name, path)
            return body

    logger.warning("Skill '%s' (path=%s) could not be found", clean_name, path)
    return (
        f"Skill '{clean_name}'"
        + (f" file '{path}'" if path else "")
        + " could not be loaded. Please proceed with standard instructions."
    )
