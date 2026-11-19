"""Main entrypoint for the LiveKit voice agent worker.

Run with:
    python main.py dev     (for local development against LiveKit Cloud)
    python main.py start   (for production runner)
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import AgentServer, JobContext, cli

# Add src to sys.path so modules are resolvable
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Load environment configuration
APP_DIR = Path(__file__).resolve().parent
load_dotenv(APP_DIR / ".env.local")
load_dotenv(APP_DIR / ".env")
load_dotenv()

from agents.session_handler import handle_agent_session

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("voice_agent")

AGENT_NAME = os.getenv("AGENT_NAME", "my-agent")

server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await handle_agent_session(ctx)


if __name__ == "__main__":
    cli.run_app(server)
