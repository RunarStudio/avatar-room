#!/usr/bin/env python3
"""
Program-level session scanning for AI Avatar Room.

Replaces zz_cli_avatars' one-avatar-per-session SessionScanner with a
one-avatar-per-program model: every active Claude Code (and, from Stage 2,
Cursor) session rolls up into a single ProgramInfo per program, so the
overlay always shows exactly one avatar per tool rather than one per window.
"""

import json
import re
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# ═══════════════════════════════════════════════════════════════
#  STATUS
# ═══════════════════════════════════════════════════════════════

class S:
    IDLE        = "idle"
    THINKING    = "thinking"
    BUSY        = "busy"
    SUBAGENT    = "subagent"
    ERROR       = "error"
    DONE        = "done"
    NEEDS_INPUT = "needs_input"

STATUS_COLOR = {
    S.IDLE:        "#44ff88",
    S.THINKING:    "#ffdd44",
    S.BUSY:        "#ff8844",
    S.SUBAGENT:    "#aa44ff",
    S.ERROR:       "#ff4444",
    S.DONE:        "#44aaff",
    S.NEEDS_INPUT: "#ff44dd",
}

# Worst-case-wins rollup order when a program has multiple sessions in
# different states — the lowest index in this list wins.
STATUS_PRIORITY = [S.NEEDS_INPUT, S.ERROR, S.BUSY, S.THINKING, S.DONE, S.IDLE]


def rollup_status(statuses) -> str:
    statuses = list(statuses)
    if not statuses:
        return S.IDLE
    for s in STATUS_PRIORITY:
        if s in statuses:
            return s
    return S.IDLE


PROGRAM_SKINS = {"claude": "caine", "cursor": "bubble"}
ENABLED_PROGRAMS = ["claude", "cursor"]
SESSION_SCAN_RATE = 2.0

_SUBAGENT_CUTOFF_S = 1800   # 30 min — subagent still counts as "active"
_SESSION_MAX_AGE_S = 28800  # 8 hours — jsonl older than this is ignored


# ═══════════════════════════════════════════════════════════════
#  DATA MODEL
# ═══════════════════════════════════════════════════════════════

@dataclass
class SessionInfo:
    session_id:     str            # FULL uuid (jsonl stem) -- matches hook stdin session_id
    program:        str
    status:         str   = S.IDLE
    tool:           str   = ""
    subagents:      int   = 0
    cwd:            str   = ""
    workspace_hash: str   = ""
    pid:            int   = 0
    last_seen:      float = field(default_factory=time.time)

    @property
    def short_id(self) -> str:
        return self.session_id[:8]


@dataclass
class ProgramInfo:
    """Duck-compatible with the read-surface Avatar/_hud_status_text expect
    from the old AgentInfo: agent_id, name, status, tool, subagents, skin,
    is_demo, pid."""
    program_id:  str
    name:        str
    skin:        str
    sessions:    list = field(default_factory=list)   # list[SessionInfo]
    base_status: str  = S.IDLE
    status:      str  = S.IDLE   # overwritten every frame by _tick()'s NEEDS_INPUT override
    tool:        str  = ""
    subagents:   int  = 0
    pid:         int  = 0
    is_demo:     bool = True
    needs_input_sessions: list = field(default_factory=list)   # list[SessionInfo]

    @property
    def agent_id(self) -> str:
        return self.program_id


# ═══════════════════════════════════════════════════════════════
#  PROGRAM SCANNERS
# ═══════════════════════════════════════════════════════════════

class ProgramScanner(ABC):
    program_id: str
    display_name: str

    @abstractmethod
    def scan(self) -> list:
        """Return the current list[SessionInfo] for this program."""
        raise NotImplementedError


class ClaudeCodeScanner(ProgramScanner):
    program_id = "claude"
    display_name = "Claude"

    CLAUDE_DIR = Path.home() / ".claude" / "projects"

    def scan(self) -> list:
        sessions: dict[str, SessionInfo] = {}

        if self.CLAUDE_DIR.exists():
            for f in self.CLAUDE_DIR.glob("*/*.jsonl"):
                try:
                    if time.time() - f.stat().st_mtime > _SESSION_MAX_AGE_S:
                        continue
                    session_id = f.stem  # FULL uuid -- must match hook stdin session_id exactly
                    status, tool, cwd = self._parse_tail(f)
                    sub_dir = f.parent / f.stem / "subagents"
                    if sub_dir.exists():
                        cutoff = time.time() - _SUBAGENT_CUTOFF_S
                        subs = sum(1 for sf in sub_dir.glob("*.jsonl")
                                   if sf.stat().st_mtime > cutoff)
                    else:
                        subs = 0
                    sessions[session_id] = SessionInfo(
                        session_id=session_id,
                        program=self.program_id,
                        status=status, tool=tool, subagents=subs, cwd=cwd,
                        last_seen=f.stat().st_mtime,
                        workspace_hash=f.parent.name)
                except Exception:
                    pass

        self._match_pids(sessions)

        # Drop sessions with no live process -- avoids ghost sessions from closed terminals
        return [s for s in sessions.values() if s.pid]

    def _match_pids(self, sessions: dict):
        hash_of = lambda p: re.sub(r'[^a-zA-Z0-9]', '-', str(p).lower())
        try:
            import psutil
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
                try:
                    name = (proc.info['name'] or '').lower()
                    cmdline = ' '.join(proc.info['cmdline'] or []).lower()
                    if 'node' not in name and 'claude' not in name:
                        continue
                    if 'claude' not in cmdline:
                        continue
                    cwd = proc.info['cwd']
                    if not cwd:
                        continue
                    h = hash_of(cwd)
                    for s in sessions.values():
                        if s.workspace_hash and s.workspace_hash.lower() == h:
                            s.pid = proc.info['pid']  # sessions sharing a workspace share a pid
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            pass

    def _parse_tail(self, path) -> tuple:
        cwd = ""
        try:
            with open(path, "rb") as f:
                size = f.seek(0, 2)
                f.seek(max(0, size - 4096))
                lines = f.read().decode("utf-8", errors="ignore").splitlines()
            for line in reversed(lines[-30:]):
                if not cwd and '"cwd"' in line:
                    try:
                        obj = json.loads(line)
                        cwd = obj.get("cwd", "") or cwd
                    except Exception:
                        pass
                if '"tool_use"' in line:
                    try:
                        obj = json.loads(line)
                        cwd = obj.get("cwd", "") or cwd
                        for block in obj.get("message", {}).get("content", []):
                            if isinstance(block, dict) and block.get("type") == "tool_use":
                                return S.BUSY, block.get("name", ""), cwd
                    except Exception:
                        pass
                    return S.BUSY, "", cwd
                if '"thinking"' in line:
                    return S.THINKING, "", cwd
        except Exception:
            pass
        return S.IDLE, "", cwd


class CursorScanner(ProgramScanner):
    """Stage 1 stub. Real Cursor detection is deferred to Stage 2/3 by
    explicit user direction ("don't bother too much with Cursor for now,
    leave it for stage 2 or 3").

    Cursor has had a hook system since 1.7 (~/.cursor/hooks.json /
    <project>/.cursor/hooks.json, stdin JSON with conversation_id /
    workspace_roots / hook_event_name). Stage 2 should add a second hook
    script emitting {"program": "cursor", ...} to the same UDP port
    (127.0.0.1:47200) that avatar_room_hook.py already uses -- not SQLite
    log-polling of Cursor's local chat DB (the schema churns between
    versions, the DB is WAL-locked, and it carries no "waiting for you"
    signal anyway).
    """
    program_id = "cursor"
    display_name = "Cursor"

    def scan(self) -> list:
        return []


# ═══════════════════════════════════════════════════════════════
#  MULTI-PROGRAM AGGREGATOR
# ═══════════════════════════════════════════════════════════════

class MultiProgramScanner:
    SCANNERS = {
        "claude": ClaudeCodeScanner,
        "cursor": CursorScanner,
    }

    def __init__(self):
        self._lock = threading.Lock()
        self._scanners = {pid: self.SCANNERS[pid]() for pid in ENABLED_PROGRAMS}
        self._programs: dict[str, ProgramInfo] = {
            pid: ProgramInfo(
                program_id=pid,
                name=self._scanners[pid].display_name,
                skin=PROGRAM_SKINS.get(pid, "amongo"),
            )
            for pid in ENABLED_PROGRAMS
        }

    def get_programs(self) -> dict:
        with self._lock:
            return dict(self._programs)

    def set_skin(self, program_id: str, skin: str) -> None:
        with self._lock:
            if program_id in self._programs:
                self._programs[program_id].skin = skin

    def loop(self):
        while True:
            self._scan()
            time.sleep(SESSION_SCAN_RATE)

    def _scan(self):
        with self._lock:
            for pid, prog in self._programs.items():
                try:
                    sessions = self._scanners[pid].scan()
                except Exception:
                    sessions = []

                prog.sessions = sessions
                prog.is_demo = (len(sessions) == 0)
                prog.base_status = rollup_status(s.status for s in sessions)
                # prog.status is intentionally NOT set here -- OverlayApp._tick()
                # overwrites it every frame (NEEDS_INPUT override else base_status),
                # at up to 20 FPS vs. this scan's 2s cadence. Touching it here would
                # just get immediately clobbered, and does so from a different
                # thread without _tick()'s frame ordering.

                prog.subagents = sum(s.subagents for s in sessions)

                active = [s for s in sessions if s.tool]
                prog.tool = max(active, key=lambda s: s.last_seen).tool if active else ""

                pid_sessions = [s for s in sessions if s.pid]
                prog.pid = max(pid_sessions, key=lambda s: s.last_seen).pid if pid_sessions else 0
