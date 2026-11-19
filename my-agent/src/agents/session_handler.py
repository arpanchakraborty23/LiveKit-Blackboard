"""Agent session lifecycle handler."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from livekit.agents import (
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    inference,
    room_io,
)
from livekit.plugins import ai_coustics

try:
    from constants.config import ConfigError, get_default_bundle
    from services.config_service import fetch_bundle
    from services.memory_service import end_session_hook
    from tools.skills import set_current_assistant
    from tools.mcp import load_mcp_toolsets
    from agents.assistant import Assistant
except ImportError:
    from ..constants.config import ConfigError, get_default_bundle
    from ..services.config_service import fetch_bundle
    from ..services.memory_service import end_session_hook
    from ..tools.skills import set_current_assistant
    from ..tools.mcp import load_mcp_toolsets
    from .assistant import Assistant

logger = logging.getLogger("session_handler")


def parse_dispatch_metadata(raw: str | None) -> dict[str, Any]:
    """Read dispatch metadata, defaulting gracefully if not supplied."""
    if not raw:
        return {"assistant_id": "default"}

    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            if not data.get("assistant_id"):
                data["assistant_id"] = "default"
            return data
    except Exception:
        logger.warning("Unparseable job metadata: %r; using default", raw)

    return {"assistant_id": "default"}


async def handle_agent_session(ctx: JobContext) -> None:
    """Entry point for an individual RTC room session."""
    ctx.log_context_fields = {"room": ctx.room.name}

    metadata = parse_dispatch_metadata(ctx.job.metadata)
    assistant_id = str(metadata["assistant_id"])
    expected_version = metadata.get("config_version")

    # Connect to room and resolve config concurrently
    connect_task = asyncio.create_task(ctx.connect())

    try:
        bundle, source = await fetch_bundle(
            assistant_id,
            expected_version=expected_version if isinstance(expected_version, int) else None,
        )
    except ConfigError:
        logger.warning("No remote configuration available; using default fallback bundle")
        bundle = get_default_bundle(assistant_id)
        source = "default"

    await connect_task

    set_current_assistant(bundle.assistant_id)

    logger.info(
        "session config assistant=%s version=%s source=%s skills=%d mcp_servers=%d",
        bundle.assistant_id,
        bundle.version,
        source,
        len(bundle.skills),
        len(bundle.mcp),
    )

    session = AgentSession(
        stt=inference.STT(model=bundle.stt.model, language=bundle.stt.language),
        tts=inference.TTS(model=bundle.tts.model, voice=bundle.tts.voice),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            interruption={"mode": "adaptive"},
            preemptive_generation={"enabled": True},
        ),
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

        # Greet user once connected to room
        if bundle.greeting:
            await session.say(bundle.greeting, allow_interruptions=True)
    finally:
        # Minimal memory hook: only fired if memory is explicitly enabled
        if bundle.memory.get("enabled", False):
            asyncio.create_task(
                end_session_hook(bundle.assistant_id, getattr(session, "history", []))
            )
