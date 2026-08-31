#!/usr/bin/env python3
"""
NotificationHub -- Lock-protected needs-input state shared between the
UDP listener thread and the tkinter main thread.

Threading contract (do not violate): every method here acquires self._lock
and touches only plain Python data structures. No canvas, no tkinter, no
pystray. All UI-affecting work happens on the main thread, which reads this
hub's state once per frame inside OverlayApp._tick().
"""

import threading
import time
from dataclasses import dataclass, field


NOTIFICATION_ANTI_FLAP_S = 20.0


@dataclass
class _Entry:
    needs_input:    bool  = False
    since:          float = 0.0
    message:        str   = ""
    program:        str   = ""
    last_tool:      str   = ""
    turn_ended_at:  float = 0.0
    last_notified_at: float = 0.0


@dataclass
class NotificationEvent:
    program:      str
    session_id:   str
    kind:         str            # "needs_input" (Stage 1); "pr_review"/"jira_assigned" reserved for Stage 3
    title:        str
    message:      str
    ts:           float = field(default_factory=time.time)
    focus_target: object = None  # opaque callable or None -- interpreted by the sink/caller


class NotificationHub:
    def __init__(self):
        self._lock = threading.Lock()
        self._state: dict[str, _Entry] = {}
        self._pending: list[NotificationEvent] = []

    # ── Listener-thread API (UDP thread calls these) ───────────────────

    def mark_needs_input(self, program: str, session_id: str, message: str = "") -> None:
        with self._lock:
            entry = self._state.setdefault(session_id, _Entry())
            was_needing = entry.needs_input
            now = time.time()
            entry.needs_input = True
            entry.since = entry.since or now
            entry.message = message
            entry.program = program
            # Preserve every state transition for the avatar/UI, but avoid a
            # clear → needs-input hook flap repeatedly firing a toast while
            # the user is already being alerted about this same session.
            if not was_needing and (now - entry.last_notified_at) >= NOTIFICATION_ANTI_FLAP_S:
                self._pending.append(NotificationEvent(
                    program=program, session_id=session_id, kind="needs_input",
                    title=f"{program.capitalize()} needs your input",
                    message=message or "Waiting for your response.",
                ))
                entry.last_notified_at = now

    def clear(self, session_id: str) -> None:
        with self._lock:
            entry = self._state.get(session_id)
            if entry:
                entry.needs_input = False
                entry.since = 0.0

    def note_turn_end(self, session_id: str) -> None:
        with self._lock:
            entry = self._state.setdefault(session_id, _Entry())
            entry.turn_ended_at = time.time()

    def note_tool(self, session_id: str, tool: str) -> None:
        with self._lock:
            entry = self._state.setdefault(session_id, _Entry())
            entry.last_tool = tool
            entry.needs_input = False
            entry.since = 0.0

    # ── Main-thread API (called once per frame from _tick()) ───────────

    def get_needs_input_session_ids(self) -> set:
        with self._lock:
            return {sid for sid, e in self._state.items() if e.needs_input}

    def take_pending(self) -> list:
        with self._lock:
            pending, self._pending = self._pending, []
            return pending

    def retain_only(self, session_ids: set) -> None:
        """Drop hub entries for sessions that no longer exist, so a stale
        UDP-driven flag can never outlive its session."""
        with self._lock:
            for sid in list(self._state.keys()):
                if sid not in session_ids:
                    del self._state[sid]

    def expire_stale(self, ttl: float = 900) -> None:
        """Safety-net auto-clear: if a hook that should have cleared
        needs_input never fires (crash, terminal closed), don't leave the
        avatar alerting forever."""
        now = time.time()
        with self._lock:
            for entry in self._state.values():
                if entry.needs_input and entry.since and (now - entry.since) > ttl:
                    entry.needs_input = False
                    entry.since = 0.0

    def entry(self, session_id: str):
        with self._lock:
            return self._state.get(session_id)
