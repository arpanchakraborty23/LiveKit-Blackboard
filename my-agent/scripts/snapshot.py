#!/usr/bin/env python3
"""Bake the config bundle into the image.

Run at build time (see Dockerfile). The result is the last-resort configuration the agent
falls back to when the Edge Function is unreachable, so a control-plane outage degrades into
"slow to update" instead of "no sessions".

Exits 0 whether or not a snapshot was produced: a missing snapshot must not break an image
build, and a stale snapshot is still better than nothing.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx

SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from config import ConfigBundle, snapshot_path  # noqa: E402

TIMEOUT_S = 15.0


def main() -> int:
    url = os.getenv("AGENT_CONFIG_URL")
    key = os.getenv("AGENT_API_KEY")
    assistant_id = os.getenv("SNAPSHOT_ASSISTANT_ID")

    missing = [
        name
        for name, value in (
            ("AGENT_CONFIG_URL", url),
            ("AGENT_API_KEY", key),
            ("SNAPSHOT_ASSISTANT_ID", assistant_id),
        )
        if not value
    ]

    if missing:
        print(f"snapshot: skipping, missing {', '.join(missing)}", file=sys.stderr)
        return 0

    try:
        with httpx.Client(timeout=TIMEOUT_S) as client:
            response = client.get(
                url,  # type: ignore[arg-type]
                params={"assistant_id": assistant_id},
                headers={"x-agent-key": key},  # type: ignore[dict-item]
            )
        response.raise_for_status()
        bundle = ConfigBundle.from_dict(response.json())
    except Exception as exc:  # noqa: BLE001 - any failure means "no snapshot", not "fail build"
        print(f"snapshot: could not fetch bundle: {exc}", file=sys.stderr)
        return 0

    target = snapshot_path()
    target.write_text(json.dumps(response.json(), indent=2), encoding="utf-8")
    print(f"snapshot: wrote {target} (version {bundle.version})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
