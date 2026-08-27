#!/usr/bin/env python3
"""
Claude Code hook -> AI Avatar Room UDP bridge.

Register this under Notification / UserPromptSubmit / PreToolUse /
PostToolUse / Stop / SessionEnd in settings.json (see ../docs/claude-hooks.md
for the exact config). Claude Code passes the hook event as JSON on STDIN --
not argv -- which is why this replaces claude_hooks_example.py (that script
read sys.argv and could never carry a session_id).

Pure stdlib, no third-party imports: this has to work standalone via
pythonw.exe with no venv. Must never fail loudly or block Claude Code --
the whole body is wrapped and always exits 0.
"""

import json
import socket
import sys
import time

HOST = "127.0.0.1"
PORT = 47200


def main() -> None:
    payload = json.load(sys.stdin)
    out = {
        "program":    "claude",
        "event":      payload.get("hook_event_name", ""),
        "session_id": payload.get("session_id", ""),
        "cwd":        payload.get("cwd", ""),
        "message":    payload.get("message", ""),
        "tool":       payload.get("tool_name", ""),
        "ts":         time.time(),
    }
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.sendto(json.dumps(out).encode("utf-8"), (HOST, PORT))
    sock.close()


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        pass  # never disrupt the agent turn -- UDP is fire-and-forget
    sys.exit(0)  # always 0 -- a non-zero exit here can block Claude Code
