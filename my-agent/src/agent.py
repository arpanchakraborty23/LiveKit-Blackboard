"""LiveKit agent worker shim.

Re-exports Assistant and session handler from the agents package.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import AgentServer, JobContext, cli

SRC_DIR = Path(__file__).resolve().parent
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env.local")
load_dotenv(ROOT_DIR / ".env")
load_dotenv()

from agents.assistant import Assistant
from agents.session_handler import handle_agent_session, parse_dispatch_metadata

AGENT_NAME = os.getenv("AGENT_NAME", "my-agent")
server = AgentServer()


# Backward-compatible alias
def _parse_dispatch_metadata(raw: str | None):
    return parse_dispatch_metadata(raw)


@server.rtc_session(agent_name=AGENT_NAME)
async def my_agent(ctx: JobContext) -> None:
    await handle_agent_session(ctx)


if __name__ == "__main__":
    cli.run_app(server)
