"""Assistant agent definition."""

from __future__ import annotations

from typing import Any

from livekit.agents import Agent, inference

try:
    from constants.config import ConfigBundle
    from tools.skills import append_skills_prompt, read_skill, register_skill_cache
except ImportError:
    from ..constants.config import ConfigBundle
    from ..tools.skills import append_skills_prompt, read_skill, register_skill_cache


class Assistant(Agent):
    """Persona, instructions, and tools wiring taken from the bundle."""

    def __init__(self, bundle: ConfigBundle, extra_tools: list[Any] | None = None) -> None:
        llm = inference.LLM(
            model=bundle.llm.model,
            extra_kwargs={"temperature": bundle.llm.temperature},
        )

        instructions = append_skills_prompt(bundle.prompt, bundle.skills)
        memory_profile = bundle.memory.get("profile")
        if bundle.memory.get("enabled", False) and memory_profile:
            instructions = f"{instructions}\n\n# User Memory Profile\n{memory_profile}"

        tools = []
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
