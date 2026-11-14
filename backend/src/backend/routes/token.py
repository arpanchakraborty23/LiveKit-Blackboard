import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from livekit.api import AccessToken, VideoGrants
from livekit.protocol.agent_dispatch import RoomAgentDispatch
from livekit.protocol.room import RoomConfiguration

from backend.constants.config import settings
from backend.constants.models import Session
from backend.services.database import get_db
from backend.constants.schemas import TokenResponse, TokenRequest


token_router = APIRouter(tags=["token"])
logger = logging.getLogger(__name__)

# Livekit credentials LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, AGENT_NAME
LIVEKIT_URL = settings.LIVEKIT_URL
LIVEKIT_API_KEY = settings.LIVEKIT_API_KEY
LIVEKIT_API_SECRET = settings.LIVEKIT_API_SECRET
AGENT_NAME = settings.AGENT_NAME

# participent
participant_identity= settings.IDENTTY
participant_name= settings.USER

@token_router.post("/token", response_model=TokenResponse,status_code=status.HTTP_201_CREATED)
async def generate_token(
    payload: TokenRequest,
    db: AsyncSession = Depends(get_db),
):

    if not LIVEKIT_URL or not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        logger.error("LiveKit is not configured on the server. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.")
        raise HTTPException(
            status_code=500,
            detail="LiveKit is not configured on the server. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
        )

    # Extract parameters from payload
    session_id = payload.session_id if payload.session_id else None
    room_name = payload.session_id[3:8] if payload.session_id else None
        

    at = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(participant_identity)
        .with_name(participant_name)
        .with_grants(
            VideoGrants(
                room_join=True,
                room=str(room_name),
                can_publish=True,
                can_publish_data=True,
                can_subscribe=True,
            )
        )
    )


    room_config = RoomConfiguration(
            agents=[RoomAgentDispatch(agent_name=AGENT_NAME)]
        )
    at = at.with_room_config(room_config)
    participant_token = at.to_jwt()

    new_session = Session(
        session_id=session_id,
        token=participant_token,
        room_name=str(room_name),
    )

    db.add(new_session)
    await db.commit()

    return TokenResponse(
        serverUrl=LIVEKIT_URL,
        roomName=str(room_name),
        participantName=participant_name,
        participantToken=participant_token,
    )
