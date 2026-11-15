
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.services.database import engine
from backend.constants.models import Base
from src.backend.routes.token import token_router
from src.backend.routes.health import health_router
from src.backend.routes.prompt import prompt_route
from src.backend.routes.skills import skills_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

logger = logging.getLogger("Autonomus-Agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        logger.info("Database initialized successfully")

    except Exception:
        logger.exception("Database initialization failed")
        raise

    yield

    await engine.dispose()


app = FastAPI(
    title="Autonomus Agent Backend",
    description="FastAPI Backend for Autonomus Agent",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(health_router, prefix="/api")
# Also expose health at the root so plain `/health` probes (and the UI's
# memory-service helper) do not 404.
app.include_router(health_router, include_in_schema=False)
app.include_router(token_router, prefix="/api")
app.include_router(prompt_route,prefix="/api")
app.include_router(skills_router, prefix="/api")



@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "LiveKit Blackboard API",
        "version": "1.0.0",
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
