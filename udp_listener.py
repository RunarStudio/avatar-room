#!/usr/bin/env python3
"""
UDP listener for AI Avatar Room's needs-input notifications.

Wire protocol: one UTF-8 JSON datagram per hook event, to 127.0.0.1:47200:

    {"program": "claude", "event": "Notification", "session_id": "<full-uuid>",
     "cwd": "C:\\path\\to\\project", "message": "...", "ts": 1756240000.0}

"program" is mandatory (forward-compatible for Cursor in Stage 2 -- adding
Cursor support later is "write a second hook script emitting program:cursor",
not a change to this file).

THREADING CONTRACT: this listener's thread must never touch tkinter, canvas,
widgets, or pystray. Its only side effects are socket I/O and calls into
NotificationHub, which is Lock-protected and pure-Python. All UI-affecting
work happens on the main thread inside OverlayApp._tick().
"""

import json
import socket
import threading

from notify_hub import NotificationHub

HOST = "127.0.0.1"
PORT = 47200
RECV_BUFSIZE = 4096
SOCK_TIMEOUT_S = 0.5

# Events that clear a session's needs-input flag. Stop is deliberately
# excluded here -- see TOAST_ON_STOP in overlay.py for why.
_CLEARING_EVENTS = {"UserPromptSubmit", "PreToolUse", "PostToolUse", "SessionEnd"}


class UDPListener:
    def __init__(self, hub: NotificationHub, host: str = HOST, port: int = PORT):
        self._hub = hub
        self._host = host
        self._port = port
        self._sock: socket.socket | None = None
        self._stop_flag = threading.Event()

    def bind(self) -> None:
        """Call on the main thread. Raises OSError if the port is taken
        (e.g. a second overlay instance) -- caller must catch and fall back
        to 2s polling only."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind((self._host, self._port))
        sock.settimeout(SOCK_TIMEOUT_S)
        self._sock = sock

    def stop(self) -> None:
        self._stop_flag.set()

    def loop(self) -> None:
        if self._sock is None:
            return
        while not self._stop_flag.is_set():
            try:
                data, _addr = self._sock.recvfrom(RECV_BUFSIZE)
            except socket.timeout:
                continue
            except OSError:
                break
            except Exception:
                continue

            try:
                payload = json.loads(data.decode("utf-8", errors="ignore"))
                session_id = payload.get("session_id")
                if not session_id:
                    continue
                program = payload.get("program", "claude")
                event = payload.get("event", "")
                message = payload.get("message", "")
                tool = payload.get("tool", "")

                if event == "Notification":
                    self._hub.mark_needs_input(program, session_id, message)
                elif event == "Stop":
                    self._hub.note_turn_end(session_id)
                elif event in _CLEARING_EVENTS:
                    if tool:
                        self._hub.note_tool(session_id, tool)
                    else:
                        self._hub.clear(session_id)
                # unknown event values are ignored, never fatal
            except Exception:
                continue

        try:
            self._sock.close()
        except Exception:
            pass
