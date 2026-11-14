"""LiveKit agent worker.

Every session is configured from the database: the signed dispatch metadata names the
assistant, `src.config.fetch_bundle` resolves its settings, and the prompt, models and voice
all come from that bundle. There is nothing to redeploy when a setting changes.

The worker knows no database credentials. If the control plane is unreachable the bundle
falls back to `config_snapshot.json` baked at build time.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
    room_io,
)
from livekit.plugins import ai_coustics

from config import ConfigBundle, ConfigError, fetch_bundle
import memory
from tools_skills import append_skills_prompt, read_skill, set_current_assistant
from tools_mcp import load_mcp_toolsets

logger = logging.getLogger("agent")

load_dotenv(".env.local")

AGENT_NAME = os.getenv("AGENT_NAME", "my-agent")


def _parse_dispatch_metadata(raw: str | None) -> dict[str, Any]:
    """Read the metadata the token route put inside the signed JWT.

    Failure here is fatal on purpose: without an assistant id the worker cannot know whose
    configuration to load, and guessing would be worse than refusing the job.
    """
    if not raw:
        raise ConfigError(
            "job metadata is empty — the token route must dispatch with "
            '{"assistant_id": "..."} in RoomAgentDispatch.metadata'
        )

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ConfigError(f"job metadata is not JSON: {raw[:200]!r}") from exc

    if not isinstance(data, dict) or not data.get("assistant_id"):
        raise ConfigError(f"job metadata has no assistant_id: {data!r}")

    return data


class Assistant(Agent):
    """Persona and model wiring, both taken from the bundle."""

    def __init__(self, bundle: ConfigBundle, extra_tools: list[Any] | None = None) -> None:
        # `temperature` is not a first-class argument on inference.LLM; it travels through
        # `extra_kwargs`, which is the OpenAI-compatible option bag the gateway forwards.
        llm = inference.LLM(
            model=bundle.llm.model,
            extra_kwargs={"temperature": bundle.llm.temperature},
        )

        instructions = append_skills_prompt(bundle.prompt, bundle.skills)
        memory_profile = bundle.memory.get("profile")
        if bundle.memory.get("enabled", True) and memory_profile:
            instructions = f"{instructions}\n\n# User Memory Profile\n{memory_profile}"

        tools = []
        if bundle.skills:
            tools.append(read_skill)
        if extra_tools:
            tools.extend(extra_tools)

        super().__init__(instructions=instructions, llm=llm, tools=tools)


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def my_agent(ctx: JobContext) -> None:
    ctx.log_context_fields = {"room": ctx.room.name}

    try:
        metadata = _parse_dispatch_metadata(ctx.job.metadata)
    except ConfigError:
        logger.exception("rejecting job: unusable dispatch metadata")
        return

    assistant_id = str(metadata["assistant_id"])
    expected_version = metadata.get("config_version")

    # Config fetch and room join are independent, so they overlap. The join is awaited
    # before the session starts: Session.start() wires RoomIO to a live room, and awaiting
    # it here keeps the ordering obvious instead of relying on RoomIO's internal wait.
    connect_task = asyncio.create_task(ctx.connect())

    try:
        bundle, source = await fetch_bundle(
            assistant_id,
            expected_version=expected_version if isinstance(expected_version, int) else None,
        )
    except ConfigError:
        logger.exception("rejecting job: no configuration available")
        connect_task.cancel()
        # Drain the task so its cancellation is not reported as an unretrieved exception.
        await asyncio.gather(connect_task, return_exceptions=True)
        return

    await connect_task

    set_current_assistant(bundle.assistant_id)

    logger.info(
        "session config assistant=%s version=%s source=%s skills=%d",
        bundle.assistant_id,
        bundle.version,
        source,
        len(bundle.skills),
    )

    session = AgentSession(
        stt=inference.STT(model=bundle.stt.model, language=bundle.stt.language),
        tts=inference.TTS(model=bundle.tts.model, voice=bundle.tts.voice),
        turn_handling=TurnHandlingOptions(
            # The turn detector combines semantics with acoustic cues so the agent does not
            # cut in during a pause for breath.
            turn_detection=inference.TurnDetector(),
            # Adaptive interruption ignores backchannels like "mhm" without letting a real
            # interruption through late.
            interruption={"mode": "adaptive"},
            preemptive_generation={"enabled": True},
        ),
        # Expressive mode injects the TTS markup guide into the prompt, so the model can
        # emit delivery tags. It is also what publishes the expression the UI's aura reads.
        expressive=bundle.expressive,
    )

    mcp_toolsets = await load_mcp_toolsets(bundle.mcp)

    try:
        await session.start(
            agent=Assistant(bundle, extra_tools=mcp_toolsets),
            room=ctx.room,
            room_options=room_io.RoomOptions(
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=ai_coustics.audio_enhancement(
                        model=ai_coustics.EnhancerModel.QUAIL_VF_S
                    ),
                ),
            ),
        )

        # Greeting last: the participant must be in the room to hear it, and the session must be
        # running before it can speak.
        if bundle.greeting:
            await session.say(bundle.greeting, allow_interruptions=True)
    finally:
        if bundle.memory.get("enabled", True):
            asyncio.create_task(
                memory.end_session_hook(bundle.assistant_id, getattr(session, "history", []))
            )


if __name__ == "__main__":
    cli.run_app(server)
