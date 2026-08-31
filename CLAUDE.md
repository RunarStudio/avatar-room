# AI Avatar Room — Claude Code Project Guide

Forked from `../zz_cli_avatars/` (v0.4). Full vision: `../10 - Projects/AI Avatar Room - Design.md`. Full Stage 1 implementation plan (Fable draft → Opus-verified final): `STAGE1_PLAN.md`. Tauri port plan (Stage 2 packaging decision): `TAURI_PORT_PLAN.md`. Shared history/architecture reference: `../zz_cli_avatars/CLAUDE.md`.

CI: `.github/workflows/build.yml` builds the PyInstaller exe on every PR into `master`, uploaded as a workflow artifact.

**Current state: Stage 1 shipped (v0.5, Tkinter), Stage 2 (Tauri port) SCAFFOLDED.** 

*Stage 1 (Tkinter):* One-avatar-per-program aggregation, the UDP listener, and the needs-input notification pipeline are all live and exercised end-to-end (UDP packet → hub → avatar visuals → toast → clear). Packaging (`overlay.spec`, onedir) is written; run `pyinstaller overlay.spec --noconfirm` to build. Real Cursor detection is a deliberate stub — see below.

*Stage 2 (Tauri port):* `tauri_app/` exists with basic scaffolding (Tauri config, Rust shell, TypeScript frontend placeholder). Implementation is **early-stage** — tasks 2-13 of Part 4 (TAURI_PORT_PLAN.md) remain to be built. Do not claim this ready for testing; confirm with the user before each major subsystem goes live (sidecar/UDP/frontend rendering/tray/focus routing).  See TAURI_PORT_PLAN.md for the full breakdown and unresolved open questions.

## What changed vs. `zz_cli_avatars`

- **One avatar per program, not per session.** `session_scanner.py`'s `MultiProgramScanner` replaces the old per-session `SessionScanner`. `ClaudeCodeScanner` aggregates every live Claude Code session into one `ProgramInfo` per program; the rollup uses `STATUS_PRIORITY = [NEEDS_INPUT, ERROR, BUSY, THINKING, DONE, IDLE]` — worst case wins when sessions disagree. Both `"claude"` and `"cursor"` `ProgramInfo`s are created once at scanner init and never removed, so avatars don't pop in/out.
- **v1 skins**: `caine` = Claude avatar, `bubble` = Cursor avatar (`PROGRAM_SKINS` in `session_scanner.py`). Subagent avatars use `amongo` (`SUBAGENT_SKIN` in `overlay.py`) — Bubble was the old subagent skin, freed up for Cursor.
- **UDP listener is real now.** `udp_listener.py`'s `UDPListener` binds `127.0.0.1:47200` and consumes events from `hooks/avatar_room_hook.py` (the old `claude_hooks_example.py` read `sys.argv` and could never carry a session id — replaced, not extended). See `docs/claude-hooks.md` for hook registration.
- **Needs-input pipeline**: `notify_hub.py`'s `NotificationHub` is a Lock-protected dict the UDP thread writes to; `OverlayApp._tick()` reads it *every frame* (not on the scanner's 2s cadence) and overrides the displayed status — this is what actually delivers the UDP latency win (~1 frame vs ~2s). `notifications.py`'s `NotificationDispatcher` fans out to `ConsoleSink` and `TrayToastSink` (uses `pystray.Icon.notify()` — zero new dependencies; `win11toast`/`winotify`/`plyer` were all rejected as unmaintained or incompatible with this machine's Python 3.14).
- **Threading contract** (do not violate this when touching the listener): the UDP listener thread only ever does socket I/O and calls into `NotificationHub`'s Lock-protected methods. It never touches tkinter, canvas, widgets, or pystray directly. All UI-affecting work — including the toast dispatch — happens on the main thread inside `_tick()`.
- **Click routing**: `_resolve_focus_target(program)` in `overlay.py` focuses directly if there's exactly one session (or one needing input), opens `session_picker.py`'s picker if there are several. Both double-click and right-click on a program avatar route through it; subagent avatars still focus directly (they're `AgentInfo`, not `ProgramInfo`, and have no `.sessions`).
- **Cursor is a stub** (`CursorScanner` in `session_scanner.py`, always returns `[]`) — deliberately deferred to Stage 2/3 by direct user instruction, not an oversight. Cursor actually has a hook system since 1.7 (`~/.cursor/hooks.json`) that Stage 2 should plug into the *same* UDP pipeline (`program: "cursor"`) rather than polling Cursor's local chat DB.

## Roster

See `ROSTER.md` — full imported asset list. `caine`/`bubble`/`amongo` are wired; the rest is optional and pending curation.

## Tauri Port (Stage 2) Progress Tracking

Scope decisions made (do not re-litigate): avatars stay inside the app window/screen
bounds — no cross-window `WindowTerrain` port; sprite sheets are sliced by a build-time
script, never at runtime. The tab-bar dashboard was replaced by a browse/focus/rail
column model (see below) — do not reintroduce tabs.

| Task | Status | Notes |
|------|--------|-------|
| 1. Scaffold | Done | `tauri_app/` + config + Rust/TS boilerplate |
| 2. Sidecar extraction | Done | `scanner_sidecar.py` — versioned NDJSON on stdout, `--once`, exits with its parent |
| 3. Rust: spawn + read sidecar | Done | `sidecar.rs` — spawns it, **pipes stdin and holds it open** (see bug #1 below), forwards each line as a `scan` event |
| 4. Rust: UDP listener + hub | Done | `udp_listener.rs`, edge-triggered; verified end-to-end with real packets |
| 5. Rust: native notifications | Pending | `tauri-plugin-notification` on needs-input edges |
| 6. Frontend: canvas avatars | Done | `avatar.ts` — real Caine/Bubble sprite frames (not placeholder rectangles), status-driven, verified live against a real UDP needs-input packet |
| 6b. Dashboard shell | Done | Browse/focus/rail column model, real scan+PR data wired in — see below |
| 7. Frontend: NEEDS_INPUT visuals | Partial | Blink marker + stand frame work and are verified live. **Gap:** state is edge-triggered only — a frontend reload (HMR, crash, future multi-window) loses in-flight needs-input flags until the *next* transition, because Rust never exposes a query for the hub's current snapshot. `NotificationHub::get_needs_input_session_ids`/`retain_only`/`expire_stale` exist for exactly this but are unused — wiring a `get_status` request (emit on frontend startup) is the fix, not yet done. |
| 8. Rust: focus-on-click | Pending | `windows` crate port of `_focus_linked_console` |
| 9. Frontend: picker modals | Pending | Session picker, skin picker as HTML dialogs |
| 10. Rust: tray + routing | Pending | `tauri::tray` menu, click-to-focus |
| 11. WindowTerrain | Descoped | Screen-bounds only, by decision above |
| 12. Packaging | Pending | Sidecar PyInstaller build, bundle config, code-signing |
| 13. Parity checklist | Pending | Manual verification against `STAGE1_PLAN.md` |

## Dashboard architecture (Tauri)

The window is **one stage, one rail, always** — not tabs. `focused === null` (browse)
puts Attention/Programs/Sessions on stage side by side; focusing any column gives it
the whole stage and collapses the rest into the rail. Pull Requests and My Work are
never browsable — a PR table is unreadable at a third of the window's width, so they
only ever open full-width. Settings is reached from the top-bar gear, not a rail icon.
Column definitions live in `COLUMNS` in `main.ts`; `#panels` is the CSS grid, and its
`grid-template-columns` is set from JS in `selectColumn()` to match how many columns
are on stage (1 or 3) — each column's own `<section>` is a grid *item*, it does not
host its own internal grid.

**To add a dashboard tab:** drop a self-contained page at
`tauri_app/public/dashboards/<name>.html`, add one entry to `src/dashboards.ts`, add
its id to `COLUMNS` in `main.ts`. Vite copies `public/` verbatim into the bundle, so
the file needs no import and no build step, and it still opens directly in a browser.

**Pull Requests mounts its iframe immediately at startup, not lazily on first focus**
(the one deliberate exception to the lazy-mount pattern) — its whole job is watching
for PR approvals in the background so they reach the Attention Queue before the user
ever opens that tab.

**The PR-approval bridge is real, not mocked.** `public/dashboards/bitbucket.html`
already tracked PR review-status via the Bitbucket Cloud API (`__reviewRequested`
per participant); this session added `__approvedByMe`, a "watch for approval"
branch checklist (`watchBranches`, persisted in the page's own localStorage), a
scoped build-status fetch limited to watched-branch PRs, and a same-origin
`window.parent.postMessage({type:'avatar-room:pr-status', connected, attentionPRs,
runningJobs}, ...)` broadcast after every refresh (and once on load, so an
unconfigured dashboard still reports "not connected" rather than staying silent).
`main.ts` validates `event.origin` and `event.source === prFrame.contentWindow`
before trusting it, merges `attentionPRs` with session-based attention items, and
renders "Pull Requests not connected" (not a fabricated number) until the user
supplies real Bitbucket credentials in that tab. **No PR data is ever invented** —
if you see items in the Attention Queue or a jobs count, it came from a real API
response.

## Two Windows-specific bugs fixed here (do not regress)

1. **Sidecar stdin must be piped and held open.** `scanner_sidecar.py:_watch_stdin`
   stops the producer when its stdin closes. A windowed Tauri app has no valid stdin
   to inherit, so without `.stdin(Stdio::piped())` plus a held handle the sidecar
   produces **zero** snapshots. Measured: 0 snapshots with stdin closed vs 7 in 6s
   with it piped.
2. **Windows reports socket read timeouts as `TimedOut`, not `WouldBlock`.** Matching
   only `WouldBlock` in `udp_listener.rs` killed the listener thread after its first
   500ms tick, silently ending all needs-input alerts.
3. **The Tauri scaffold shipped with no `capabilities/` directory at all.** Without
   an explicit ACL, the webview has zero IPC permissions — `@tauri-apps/api/event`'s
   `listen()` for `scan`/`notification` silently never fires (no error, no rejection
   visible without devtools; the canvas animation loop keeps running since it's pure
   client-side, which made this look like "the app works" at a glance). Fixed by
   adding `src-tauri/capabilities/default.json` granting `core:default` +
   `core:event:default` to the `dashboard` window. **If you add a new Tauri command
   or event, check this file grants it** — the default Tauri v2 posture is deny-all.

## Run

**Tkinter (Stage 1, current production):** `pip install -r requirements.txt && python overlay.py`. Packaged: see `docs/running.md`.

**Tauri (Stage 2, in progress):** `cd tauri_app && npm install && npm run tauri dev`.
Runs today: browse/focus/rail dashboard (not tabs — see Dashboard architecture above),
real Caine/Cursor sprites driven by live status, live scanner sidecar, UDP needs-input
listener, Attention Queue merging real sessions + a real (optional) Bitbucket
PR-approval bridge. Verified end-to-end with real UDP packets and real session data —
see the bug list above before touching `sidecar.rs`/`udp_listener.rs`/`capabilities/`.
Still missing: tray, native notifications, focus-on-click, picker modals, packaging,
needs-input snapshot-on-reload. Requires the Rust toolchain and Python on PATH.
