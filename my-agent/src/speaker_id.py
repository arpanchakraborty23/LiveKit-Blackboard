"""Speechmatics speaker diarization and persistent speaker name assignment."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from livekit.agents import RunContext, ToolError, function_tool
from livekit.plugins import speechmatics
from livekit.plugins.speechmatics import SpeakerIdentifier, TurnDetectionMode

logger = logging.getLogger("speaker_id")

load_dotenv()

SPEAKERS_FILE = Path(__file__).parent / "speakers.json"


def _is_proper_name(label: Any) -> bool:
    """Known speaker labels must be human names, not temporary diarization IDs."""
    if not isinstance(label, str):
        return False
    label = label.strip()
    return bool(label) and not re.fullmatch(r"S\d+|UU", label, re.IGNORECASE)


def load_known_speakers() -> list[SpeakerIdentifier]:
    """Load previously assigned speaker identities for cross-session matching."""
    if not SPEAKERS_FILE.exists():
        return []

    try:
        data = json.loads(SPEAKERS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        logger.exception("Could not read saved speaker identities")
        return []

    if not isinstance(data, list):
        logger.warning("Saved speaker identities must be a JSON list")
        return []

    return [
        SpeakerIdentifier(
            label=entry["label"],
            speaker_identifiers=entry["speaker_identifiers"],
        )
        for entry in data
        if isinstance(entry, dict)
        and _is_proper_name(entry.get("label"))
        and entry.get("speaker_identifiers")
    ]


def _flatten_speakers(raw_speakers: Any) -> list[Any]:
    """Normalize Speechmatics' one or many stream responses to a flat list."""
    if not isinstance(raw_speakers, list):
        return []
    flattened: list[Any] = []
    for item in raw_speakers:
        if isinstance(item, list):
            flattened.extend(_flatten_speakers(item))
        else:
            flattened.append(item)
    return flattened


def _speaker_fields(speaker: Any) -> tuple[str, list[str]]:
    if isinstance(speaker, dict):
        label = speaker.get("label", "")
        identifiers = speaker.get("speaker_identifiers", [])
    else:
        label = getattr(speaker, "label", "")
        identifiers = getattr(speaker, "speaker_identifiers", [])
    return str(label), [str(identifier) for identifier in identifiers]


def save_speaker_name(raw_speakers: Any, label_id: str, name: str) -> bool:
    """Persist a name for a current diarization label, preserving other speakers."""
    records: dict[tuple[str, ...], dict[str, Any]] = {}
    if SPEAKERS_FILE.exists():
        try:
            saved = json.loads(SPEAKERS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.exception("Could not read saved speaker identities before update")
            saved = []
        for entry in saved:
            if not isinstance(entry, dict):
                continue
            identifiers = entry.get("speaker_identifiers") or []
            if _is_proper_name(entry.get("label")) and identifiers:
                key = tuple(str(identifier) for identifier in identifiers)
                records[key] = {
                    "label": str(entry["label"]),
                    "speaker_identifiers": list(key),
                }

    matched = False
    for speaker in _flatten_speakers(raw_speakers):
        label, identifiers = _speaker_fields(speaker)
        if not label or not identifiers:
            continue
        key = tuple(identifiers)
        if label == label_id:
            records[key] = {"label": name, "speaker_identifiers": identifiers}
            matched = True
        elif _is_proper_name(label):
            records[key] = {"label": label, "speaker_identifiers": identifiers}

    if not matched:
        return False

    SPEAKERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SPEAKERS_FILE.write_text(
        json.dumps(list(records.values()), indent=2), encoding="utf-8"
    )
    return True


stt = speechmatics.STT(
    api_key=os.environ.get("SPEECHMATICS_API_KEY"),
    turn_detection_mode=TurnDetectionMode.ADAPTIVE,
    enable_diarization=True,
    speaker_active_format="<{speaker_id}>{text}</{speaker_id}>",
    speaker_passive_format="<PASSIVE><{speaker_id}>{text}</{speaker_id}></PASSIVE>",
    known_speakers=load_known_speakers(),
)


@function_tool()
async def assign_name_2_speaker_ids(
    context: RunContext, label_id: str, name: str
) -> str:
    """Save the user's name for their current diarization label (such as S1).

    Args:
        label_id: The temporary speaker label in the transcript, for example S1.
        name: The name the speaker gave you.
    """
    label_id = label_id.strip()
    name = name.strip()
    if not label_id or not name:
        raise ToolError("I need both the speaker label and the name they provided.")

    try:
        speakers = await stt.get_speaker_ids()
        if not save_speaker_name(speakers, label_id, name):
            return (
                f"I couldn't match {label_id} to a voice yet. Ask them to speak a little "
                "more, then try assigning the name again."
            )
    except Exception as exc:
        logger.exception("Could not assign a name to speaker %s", label_id)
        raise ToolError("I couldn't save that speaker name right now.") from exc

    return f"Saved {name} for speaker {label_id}. Greet them by name in your reply."
