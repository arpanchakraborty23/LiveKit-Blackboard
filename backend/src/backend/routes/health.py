import os
import time
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime

try:
    from backend.src.services.database import get_db, DATABASE_URL
    from backend.src.constants.schemas import HealthResponse
except ImportError:
    from backend.src.services.database import get_db, DATABASE_URL
    from backend.src.constants.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health")
def check_health(db: Session = Depends(get_db)):
    start_time = time.time()
    services: Dict[str, Any] = {}

    # 1. Database check
    db_status = "ok"
    db_latency = 0.0
    t0 = time.time()
    try:
        db.execute(text("SELECT 1"))
        db_latency = round((time.time() - t0) * 1000, 2)
    except Exception as err:
        db_status = "error"
        db_latency = round((time.time() - t0) * 1000, 2)

    db_type = "postgresql" if "postgres" in DATABASE_URL.lower() else "sqlite"
    services["database"] = {
        "status": db_status,
        "latency_ms": db_latency,
        "configured": True,
        "type": db_type,
    }
    # For UI compatibility which checks services.supabase
    services["supabase"] = {
        "status": db_status,
        "latency_ms": db_latency,
        "configured": True,
    }

    # 2. LiveKit check
    livekit_url = os.getenv("LIVEKIT_URL", "").strip()
    api_key = os.getenv("LIVEKIT_API_KEY", "").strip()
    api_secret = os.getenv("LIVEKIT_API_SECRET", "").strip()

    livekit_configured = bool(livekit_url and api_key and api_secret)
    livekit_status = "ok" if livekit_configured else "unconfigured"
    services["livekit"] = {
        "status": livekit_status,
        "latency_ms": 0,
        "configured": livekit_configured,
        "url": livekit_url if livekit_configured else None,
    }

    # 3. Pinecone check
    pinecone_key = os.getenv("PINECONE_API_KEY", "").strip()
    services["pinecone"] = {
        "status": "ok" if pinecone_key else "unconfigured",
        "latency_ms": 0,
        "configured": bool(pinecone_key),
    }

    # 4. Memory service check
    mem_url = os.getenv("MEMORY_SERVICE_URL", "").strip()
    services["memory_service"] = {
        "status": "ok" if mem_url else "unconfigured",
        "latency_ms": 0,
        "configured": bool(mem_url),
    }

    total_latency = round((time.time() - start_time) * 1000, 2)
    overall_status = "ok" if db_status == "ok" and livekit_configured else "degraded"

    return {
        "status": overall_status,
        "database": db_status,
        "livekit": livekit_status,
        "timestamp": datetime.utcnow().isoformat(),
        "total_ms": total_latency,
        "services": services,
    }
