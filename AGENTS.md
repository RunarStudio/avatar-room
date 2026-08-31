# AI Avatar Room — Codex Project Guide

Forked from `../zz_cli_avatars/` (v0.4). Full vision: `../10 - Projects/AI Avatar Room - Design.md`. Full Stage 1 implementation plan (Fable draft → Opus-verified final): `STAGE1_PLAN.md`. Shared history/architecture reference: `../zz_cli_avatars/AGENTS.md`.

**Current state: Stage 1 shipped (v0.5).** One-avatar-per-program aggregation, the UDP listener, and the needs-input notification pipeline are all live and have been exercised end-to-end (UDP packet → hub → avatar visuals → toast → clear). Packaging (`overlay.spec`, onedir) is written; run `pyinstaller overlay.spec --noconfirm` to build. Real Cursor detection is a deliberate stub — see below.

## What changed vs. `zz_cli_avatars`

- **One avatar per program, not per session.** `session_scanner.py`'s `MultiProgramScanner` replaces the old per-session `SessionScanner`. `ClaudeCodeScanner` aggregates every live Codex session into one `ProgramInfo` per program; the rollup uses `STATUS_PRIORITY = [NEEDS_INPUT, ERROR, BUSY, THINKING, DONE, IDLE]` — worst case wins when sessions disagree. Both `"Codex"` and `"cursor"` `ProgramInfo`s are created once at scanner init and never removed, so avatars don't pop in/out.
- **v1 skins**: `caine` = Codex avatar, `bubble` = Cursor avatar (`PROGRAM_SKINS` in `session_scanner.py`). Subagent avatars use `amongo` (`SUBAGENT_SKIN` in `overlay.py`) — Bubble was the old subagent skin, freed up for Cursor.
- **UDP listener is real now.** `udp_listener.py`'s `UDPListener` binds `127.0.0.1:47200` and consumes events from `hooks/avatar_room_hook.py` (the old `claude_hooks_example.py` read `sys.argv` and could never carry a session id — replaced, not extended). See `docs/Codex-hooks.md` for hook registration.
- **Needs-input pipeline**: `notify_hub.py`'s `NotificationHub` is a Lock-protected dict the UDP thread writes to; `OverlayApp._tick()` reads it *every frame* (not on the scanner's 2s cadence) and overrides the displayed status — this is what actually delivers the UDP latency win (~1 frame vs ~2s). `notifications.py`'s `NotificationDispatcher` fans out to `ConsoleSink` and `TrayToastSink` (uses `pystray.Icon.notify()` — zero new dependencies; `win11toast`/`winotify`/`plyer` were all rejected as unmaintained or incompatible with this machine's Python 3.14).
- **Threading contract** (do not violate this when touching the listener): the UDP listener thread only ever does socket I/O and calls into `NotificationHub`'s Lock-protected methods. It never touches tkinter, canvas, widgets, or pystray directly. All UI-affecting work — including the toast dispatch — happens on the main thread inside `_tick()`.
- **Click routing**: `_resolve_focus_target(program)` in `overlay.py` focuses directly if there's exactly one session (or one needing input), opens `session_picker.py`'s picker if there are several. Both double-click and right-click on a program avatar route through it; subagent avatars still focus directly (they're `AgentInfo`, not `ProgramInfo`, and have no `.sessions`).
- **Cursor is a stub** (`CursorScanner` in `session_scanner.py`, always returns `[]`) — deliberately deferred to Stage 2/3 by direct user instruction, not an oversight. Cursor actually has a hook system since 1.7 (`~/.cursor/hooks.json`) that Stage 2 should plug into the *same* UDP pipeline (`program: "cursor"`) rather than polling Cursor's local chat DB.

## Roster

See `ROSTER.md` — full imported asset list. `caine`/`bubble`/`amongo` are wired; the rest is optional and pending curation.

## Run

Dev: `pip install -r requirements.txt && python overlay.py`. Packaged: see `docs/running.md`.
