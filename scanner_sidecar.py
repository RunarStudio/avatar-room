#!/usr/bin/env python3
"""Emit AI Avatar Room session snapshots as newline-delimited JSON.

This is the first Tauri-port boundary.  It deliberately reuses the shipped
``MultiProgramScanner`` instead of duplicating JSONL parsing or PID matching.
The eventual Tauri backend owns UI, UDP notifications, tray integration, and
window focus; this process is only a snapshot producer.

Usage:
    python scanner_sidecar.py                 # emit every two seconds
    python scanner_sidecar.py --once          # emit one snapshot and exit
    python scanner_sidecar.py --scan-interval 1.0
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from typing import Any

from session_scanner import MultiProgramScanner, SESSION_SCAN_RATE


def _session_payload(session: Any) -> dict[str, Any]:
    """Return only stable, JSON-safe fields exposed across the IPC boundary."""
    return {
        "session_id": session.session_id,
        "short_id": session.short_id,
        "program": session.program,
        "status": session.status,
        "tool": session.tool,
        "subagents": session.subagents,
        "cwd": session.cwd,
        "pid": session.pid,
        "last_seen": session.last_seen,
    }


def snapshot(scanner: MultiProgramScanner) -> dict[str, Any]:
    """Build the versioned sidecar protocol payload from a fresh scan."""
    scanner.scan_once()
    programs = []
    for program in scanner.get_programs().values():
        programs.append(
            {
                "program_id": program.program_id,
                "name": program.name,
                "skin": program.skin,
                "status": program.base_status,
                "tool": program.tool,
                "subagents": program.subagents,
                "pid": program.pid,
                "sessions": [_session_payload(session) for session in program.sessions],
            }
        )
    return {"type": "scan", "version": 1, "ts": time.time(), "programs": programs}


def emit(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scan-interval", type=float, default=SESSION_SCAN_RATE,
                        help="seconds between snapshots (default: %(default)s)")
    parser.add_argument("--once", action="store_true", help="emit one snapshot then exit")
    args = parser.parse_args()
    if args.scan_interval <= 0:
        parser.error("--scan-interval must be greater than zero")
    return args


def _watch_stdin(stop_event: threading.Event) -> None:
    """Stop the producer when its Tauri parent closes the input pipe."""
    try:
        while sys.stdin.readline() != "":
            # Phase 1 has no sidecar commands. Consume any accidental input so
            # the parent cannot block on a full pipe, but do not invent a
            # command protocol before one is needed.
            pass
    except (OSError, ValueError):
        pass
    finally:
        stop_event.set()


def main() -> int:
    args = parse_args()
    scanner = MultiProgramScanner()
    stop_event = threading.Event()
    if not args.once:
        threading.Thread(target=_watch_stdin, args=(stop_event,), daemon=True).start()

    while not stop_event.is_set():
        emit(snapshot(scanner))
        if args.once:
            return 0
        stop_event.wait(args.scan_interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
