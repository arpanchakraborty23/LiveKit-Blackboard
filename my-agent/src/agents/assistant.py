"""Assistant agent definition."""

from __future__ import annotations

import asyncio
from datetime import datetime
import logging
from typing import Any

from livekit.agents import Agent, inference
from livekit.agents.beta.tools import EndCallTool

try:
    from constants.config import ConfigBundle, get_default_bundle
    from tools.skills import append_skills_prompt, read_skill, register_skill_cache
except ImportError:
    from ..constants.config import ConfigBundle, get_default_bundle
    from ..tools.skills import append_skills_prompt, read_skill, register_skill_cache

try:
    from speaker_id import assign_name_2_speaker_ids
except ImportError:
    assign_name_2_speaker_ids = None

try:
    from web_search import search_web
except ImportError:
    search_web = None

logger = logging.getLogger("assistant")


class Assistant(Agent):
    """Persona, instructions, and tools wiring taken from the bundle."""

    def __init__(
        self,
        bundle: ConfigBundle | None = None,
        extra_tools: list[Any] | None = None,
    ) -> None:
        if bundle is None:
            bundle = get_default_bundle("default")

        self.bundle = bundle
        self._memory_tasks: set = set()

        llm = inference.LLM(
            model=bundle.llm.model,
            extra_kwargs={"temperature": bundle.llm.temperature},
        )

        instructions = append_skills_prompt(bundle.prompt, bundle.skills)
        memory_profile = bundle.memory.get("profile")
        if bundle.memory.get("enabled", False) and memory_profile:
            instructions = f"{instructions}\n\n# User Memory Profile\n{memory_profile}"

        tools = []
        if assign_name_2_speaker_ids is not None:
            tools.append(assign_name_2_speaker_ids)
        if search_web is not None:
            tools.append(search_web)
        try:
            tools.append(EndCallTool().tools)
        except Exception:
            pass

        if bundle.skills:
            # Pre-cache active skill instructions so read_skill does not need extra HTTP calls
            for s in bundle.skills:
                if isinstance(s, dict) and s.get("name"):
                    inst = s.get("instructions") or s.get("description") or ""
                    register_skill_cache(bundle.assistant_id, s["name"], inst)
            tools.append(read_skill)

        if extra_tools:
            tools.extend(extra_tools)

        super().__init__(instructions=instructions, llm=llm, tools=tools)

    async def on_enter(self) -> None:
        """Greet first on join, opening with the time of day, so the user never faces silence."""
        hour = datetime.now().hour
        if 5 <= hour < 12:
            part = "morning"
        elif 12 <= hour < 17:
            part = "afternoon"
        else:
            part = "evening"
        if hasattr(self, "session") and self.session is not None:
            await self.session.generate_reply(
                instructions=f"Greet the user briefly as Exia: open with good {part}, one warm sentence, "
                "one short line on what you can do (answer, look things up), "
                "then ask how you can help. Do not call any tools during greeting (no tools)."
            )

    async def on_user_turn_completed(self, turn_ctx, new_message) -> None:
        """Compact long conversations in the background so replies stay fast."""
        import memory

        if not memory.should_compact(turn_ctx):
            return
        try:
            before_ids = [item.id for item in self.chat_ctx.items]
        except Exception:
            logger.warning(
                "memory compaction skipped (unreadable context)", exc_info=True
            )
            return
        snapshot = turn_ctx.copy()
        task = asyncio.create_task(self._compact_in_background(snapshot, before_ids))
        self._memory_tasks.add(task)
        task.add_done_callback(self._memory_tasks.discard)

    async def _compact_in_background(self, snapshot, before_ids: list[str]) -> None:
        import memory

        try:
            if not await memory.maybe_compact(snapshot):
                return
            current = self.chat_ctx
            current_ids = [item.id for item in current.items]
            if current_ids[: len(before_ids)] != before_ids:
                return  # replaced underneath us; a later turn retries
            # Preserve turns that landed while we summarized, then adopt.
            snapshot.items.extend(current.items[len(before_ids) :])
            await self.update_chat_ctx(snapshot)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.warning("background memory compaction failed", exc_info=True)
