from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from datetime import datetime

try:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, MemoryProfile, MemoryEpisode, Session as DbSession
    from backend.schemas import (
        MemoryUpdate,
        MemoryProfileResponse,
        MemoryEpisodeCreate,
        MemoryEpisodeResponse,
        SessionCreate,
        SessionUpdate,
        SessionResponse,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant
except ImportError:
    from backend.src.services.database import get_db
    from backend.src.constants.models import Assistant, MemoryProfile, MemoryEpisode, Session as DbSession
    from schemas import (
        MemoryUpdate,
        MemoryProfileResponse,
        MemoryEpisodeCreate,
        MemoryEpisodeResponse,
        SessionCreate,
        SessionUpdate,
        SessionResponse,
    )
    from backend.src.routes.assistant import get_or_create_default_assistant

router = APIRouter(tags=["memory"])


# --- Memory Profile ---

@router.get("/memory/profile", response_model=MemoryProfileResponse)
def get_memory_profile(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    profile = db.query(MemoryProfile).filter(MemoryProfile.assistant_id == assistant.id).first()
    if not profile:
        profile = MemoryProfile(
            assistant_id=assistant.id,
            facts=[],
            preferences={},
            summary="",
        )
        db.add(profile)
        db.commit()
        db.refresh(profile)

    return MemoryProfileResponse(
        id=profile.id,
        assistant_id=profile.assistant_id,
        user_id=profile.user_id,
        facts=profile.facts or [],
        preferences=profile.preferences or {},
        summary=profile.summary or "",
        updated_at=profile.updated_at,
    )


@router.put("/memory/profile", response_model=MemoryProfileResponse)
def update_memory_profile(
    payload: MemoryUpdate,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    profile = db.query(MemoryProfile).filter(MemoryProfile.assistant_id == assistant.id).first()
    if not profile:
        profile = MemoryProfile(assistant_id=assistant.id)
        db.add(profile)

    if payload.facts is not None:
        profile.facts = payload.facts
    if payload.preferences is not None:
        profile.preferences = payload.preferences
    if payload.summary is not None:
        profile.summary = payload.summary

    profile.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(profile)

    return MemoryProfileResponse(
        id=profile.id,
        assistant_id=profile.assistant_id,
        user_id=profile.user_id,
        facts=profile.facts or [],
        preferences=profile.preferences or {},
        summary=profile.summary or "",
        updated_at=profile.updated_at,
    )


@router.post("/memory/profile", response_model=MemoryProfileResponse)
async def post_memory_profile(
    request: Request,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    body = await request.json()
    payload = MemoryUpdate(
        facts=body.get("facts"),
        preferences=body.get("preferences"),
        summary=body.get("summary"),
    )
    return update_memory_profile(payload=payload, assistant_id=assistant_id, db=db)


# --- Memory Episodes ---

@router.get("/memory/episodes", response_model=Dict[str, Any])
def list_memory_episodes(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"episodes": []}

    episodes = (
        db.query(MemoryEpisode)
        .filter(MemoryEpisode.assistant_id == assistant.id)
        .order_by(MemoryEpisode.created_at.desc())
        .all()
    )

    return {
        "episodes": [
            {
                "id": ep.id,
                "assistant_id": ep.assistant_id,
                "session_id": ep.session_id,
                "content": ep.content,
                "source": ep.source,
                "created_at": ep.created_at,
            }
            for ep in episodes
        ]
    }


@router.post("/memory/episodes", response_model=MemoryEpisodeResponse)
def create_memory_episode(
    payload: MemoryEpisodeCreate,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    episode = MemoryEpisode(
        assistant_id=assistant.id,
        session_id=payload.session_id,
        content=payload.content,
        source=payload.source or "conversation",
    )
    db.add(episode)
    db.commit()
    db.refresh(episode)
    return episode


# --- Sessions ---

@router.get("/sessions", response_model=Dict[str, Any])
def list_sessions(
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    if not assistant:
        return {"sessions": []}

    sessions = (
        db.query(DbSession)
        .filter(DbSession.assistant_id == assistant.id)
        .order_by(DbSession.started_at.desc())
        .all()
    )

    formatted = []
    for s in sessions:
        duration_seconds = None
        if s.started_at and s.ended_at:
            duration_seconds = max(0, int((s.ended_at - s.started_at).total_seconds()))

        formatted.append({
            "id": s.id,
            "assistant_id": s.assistant_id,
            "room_name": s.room_name,
            "status": s.status,
            "started_at": s.started_at,
            "ended_at": s.ended_at,
            "duration_seconds": duration_seconds,
            "summary": s.summary,
            "stats": s.stats or {},
        })

    return {"sessions": formatted}


@router.post("/sessions", response_model=SessionResponse)
async def create_or_log_session(
    request: Request,
    assistant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    body = await request.json()

    if assistant_id:
        assistant = db.query(Assistant).filter(Assistant.id == assistant_id).first()
    else:
        assistant = get_or_create_default_assistant(db)

    room_name = body.get("room_name") or f"room_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

    # Check if existing session by room_name to update
    session_id = body.get("id")
    session = None
    if session_id:
        session = db.query(DbSession).filter(DbSession.id == session_id).first()

    if not session:
        session = DbSession(
            assistant_id=assistant.id if assistant else None,
            room_name=room_name,
            status=body.get("status", "active"),
            summary=body.get("summary"),
            stats=body.get("stats"),
        )
        db.add(session)
    else:
        if "status" in body:
            session.status = body["status"]
        if "summary" in body:
            session.summary = body["summary"]
        if "stats" in body:
            session.stats = body["stats"]
        if "ended_at" in body:
            session.ended_at = datetime.utcnow()

    db.commit()
    db.refresh(session)

    duration_seconds = None
    if session.started_at and session.ended_at:
        duration_seconds = max(0, int((session.ended_at - session.started_at).total_seconds()))

    return SessionResponse(
        id=session.id,
        assistant_id=session.assistant_id,
        room_name=session.room_name,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_seconds=duration_seconds,
        summary=session.summary,
        stats=session.stats or {},
    )


@router.put("/sessions/{session_id}", response_model=SessionResponse)
def update_session(
    session_id: str,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
):
    session = db.query(DbSession).filter(DbSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if payload.status is not None:
        session.status = payload.status
    if payload.ended_at is not None:
        session.ended_at = payload.ended_at
    elif payload.status in ["completed", "ended"] and not session.ended_at:
        session.ended_at = datetime.utcnow()
    if payload.summary is not None:
        session.summary = payload.summary
    if payload.stats is not None:
        session.stats = payload.stats

    db.commit()
    db.refresh(session)

    duration_seconds = None
    if session.started_at and session.ended_at:
        duration_seconds = max(0, int((session.ended_at - session.started_at).total_seconds()))

    return SessionResponse(
        id=session.id,
        assistant_id=session.assistant_id,
        room_name=session.room_name,
        status=session.status,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_seconds=duration_seconds,
        summary=session.summary,
        stats=session.stats or {},
    )
