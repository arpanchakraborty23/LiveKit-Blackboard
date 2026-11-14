
import time
import logging
from datetime import datetime, timezone
from typing import Dict, Any

from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.services.database import get_db, DATABASE_URL

health_router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@health_router.get("/health",status_code=status.HTTP_200_OK)
async def check_health(db: AsyncSession = Depends(get_db)):
    start_time = time.perf_counter()
    services: Dict[str, Any] = {}

    # Database health check
    db_status = "ok"
    db_latency = 0.0

    t0 = time.perf_counter()

    try:
        await db.execute(text("SELECT 1"))
        db_latency = round((time.perf_counter() - t0) * 1000, 2)

    except Exception:
        db_status = "error"
        db_latency = round((time.perf_counter() - t0) * 1000, 2)
        logger.exception("Database health check failed")

    db_type = (
        "postgresql"
        if "postgres" in DATABASE_URL.lower()
        else "sqlite"
    )

    services["database"] = {
        "status": db_status,
        "latency_ms": db_latency,
        "configured": bool(DATABASE_URL),
        "type": db_type,
    }

    # Overall health
    overall_status = (
        "healthy" if db_status == "ok" else "unhealthy"
    )

    total_latency = round(
        (time.perf_counter() - start_time) * 1000, 2
    )

    response = {
        "status": overall_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_ms": total_latency,
        "services": services,
    }

    return JSONResponse(
        status_code=200 if overall_status == "healthy" else 503,
        content=response,
    )
