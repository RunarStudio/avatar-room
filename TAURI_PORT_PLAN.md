# AI Avatar Room — Tauri Port Plan

Written for a fresh implementing agent (Haiku/Codex) with no prior context on this codebase. Companion to `STAGE1_PLAN.md` (the tkinter build this plan replaces) and `CLAUDE.md` (current architecture). Read both before starting.

**Status of this document: architecture + phased plan, not yet verified line-by-line against the current `overlay.py`.** `STAGE1_PLAN.md` was produced by a two-pass process (draft → verify-against-real-code) before implementation started — this plan skipped that second pass. Before writing code, re-run that verification: open `overlay.py` (now ~2300+ lines per the grepped `def`/`class` list below) and confirm every claim in Part 2 and Part 3 against the actual line numbers and logic, the same way `STAGE1_PLAN.md` Part 0 did for the tkinter→program-rollup change. Do not port from this document's assumptions alone.

---

## Part 0 — Decision and why

**Decision: Tauri via a Python sidecar first. Full Rust rewrite of the scanner is a Phase 2 stretch goal, not required to ship.**

Reasoning (full context in `AI Avatar Room - Design.md` Stage 2 §0):
- Tauri buys real cross-platform support, a much smaller bundle than the current ~82MB PyInstaller onedir build, native tray/notification/single-instance/updater instead of the `pystray` workarounds, and HTML/CSS/JS is a far better fit for the Stage 2 dashboard than tkinter `Canvas`.
- A full Rust rewrite means reimplementing avatar physics (gravity, wall-climbing, walking on window edges), sprite-sheet slicing, JSONL session scanning, and Windows process/window matching all in Rust before anything runs. That's a lot of unverified surface to port in one shot.
- The sidecar keeps `session_scanner.py`, `notify_hub.py`, and the UDP protocol working exactly as-is — Rust owns the window/tray/frontend, Python keeps doing the one thing it's already proven at (tailing JSONL files and matching PIDs), and the two talk over a narrow, well-defined boundary (Part 3).

This lets Phase 1 ship a working Tauri app quickly with low risk of silently breaking session detection, then Phase 2 removes the Python dependency once the Rust app is otherwise stable — not before.

---

## Part 1 — Current architecture (what's being ported)

Module DAG, per `CLAUDE.md`:

```
session_scanner.py   S, STATUS_COLOR, STATUS_PRIORITY, SessionInfo, ProgramInfo,
                      ProgramScanner(ABC), ClaudeCodeScanner, CursorScanner(stub),
                      MultiProgramScanner          [stdlib + psutil only]
notify_hub.py         NotificationHub              [stdlib only]
notifications.py      NotificationEvent, NotificationSink, TrayToastSink,
                       ConsoleSink, NotificationDispatcher   [stdlib only]
udp_listener.py        UDPListener  -> notify_hub, notifications
session_picker.py      open_session_picker()        [tkinter only]
hooks/avatar_room_hook.py   standalone, pure stdlib
overlay.py              -> all of the above + sprite_loader
```

`overlay.py` (biggest file, ~2300+ lines per current `def`/`class` grep) contains, roughly in this order:
- Sprite-sheet extraction helpers (`_extract_bubble_sheet`, `_extract_caine_sheet`, `_extract_amongo_sheet`, `_load_sprites`) — one-time PNG slicing from source art into per-status animation rows.
- `AgentInfo` dataclass (subagent avatars only — `ProgramInfo` from `session_scanner.py` covers the two permanent program avatars).
- Visual effects: `Particle`, `BurstEffect`, `GlitchFlash`.
- `Avatar` class — the core sim object. Physics constants (verify current values in code, these were true as of the last grep): `GRAVITY = 0.55`, `WALK_SPEED = 1.8`, `WALL_CLIMB_SPEED = 1.4`, `WALL_CLIMB_CHANCE = 0.4`. Handles gravity, walking, wall-climbing on window edges, "fly to target" animation (`start_fly`), status-driven animation row selection (`_anim_status`), and canvas drawing including the NEEDS_INPUT blink marker.
- `WindowTerrain` — scans OS windows to produce `floors`/`walls` geometry the avatars walk/climb on (`get_floors`, `get_walls`, background `loop`/`_scan`). This is the "avatars walk across your other windows" mechanic — almost certainly Windows-specific (the same file uses `ctypes.windll` elsewhere for focus, per `_focus_linked_console`).
- `OverlayApp` — the tkinter `Toplevel`/`Canvas` shell: `_tick()` (main 20 FPS loop — scanner snapshot, hub drain, avatar physics, redraw), HUD window (`_create_hud_win`, `_update_hud_win`, `_update_hud_sessions`), session/skin/config screens (`_open_session_picker_near`, `_open_skin_picker`, `_build_picker_ui`, `_open_config_screen`, `_build_config_ui`), tray (`_setup_tray`, `_on_tray_activate`), mouse handling (`_on_left_press/drag/release`, `_on_right_click`), and focus routing (`_resolve_focus_target`, `_focus_by_pid_program`, `_focus_linked_console` — the Windows-only raise-window logic).
- `sprite_loader.py` — `SpriteSheet` (PIL-based slicing, hue-rotate for skin recolor, blank-frame detection) and `SpriteRegistry` (loads/caches sheets, hands out `PhotoImage`s to `overlay.py`).

---

## Part 2 — Target architecture

```
┌─────────────────────────────┐        stdout, one JSON line per scan       ┌──────────────────────────────┐
│  Python sidecar               │ ───────────────────────────────────────►   │  Rust (Tauri) backend          │
│  session_scanner.py, mostly    │                                            │  - owns the window, tray,       │
│  unchanged (ClaudeCodeScanner, │        stdin, control commands             │    notifications, autostart,    │
│  CursorScanner stub, psutil    │ ◄───────────────────────────────────────   │    updater, single-instance      │
│  PID matching)                 │                                            │  - UDP listener (127.0.0.1:47200)│
└─────────────────────────────┘                                            │    — reimplemented natively,     │
                                                                             │    not sidecar responsibility    │
                                                                             │  - NotificationHub equivalent    │
                                                                             │  - focus/raise-window (native    │
                                                                             │    `windows` crate, replaces      │
                                                                             │    ctypes.windll calls)          │
                                                                             └───────────────┬──────────────────┘
                                                                                              │ Tauri IPC
                                                                                              │ (invoke + emit)
                                                                                 ┌────────────▼──────────────────┐
                                                                                 │  Web frontend (HTML/CSS/TS)     │
                                                                                 │  - canvas: avatar physics/render │
                                                                                 │    (ported from Avatar class)    │
                                                                                 │  - dashboard: session list,       │
                                                                                 │    task panel, PR tab (Stage 3)   │
                                                                                 │  - config screen                  │
                                                                                 └────────────────────────────────┘
```

Key call: **UDP listening, the notification hub, and window-focus all move to Rust in Phase 1**, not left in the sidecar. They're small, they're the parts most naturally suited to native code (sockets, OS window handles), and keeping them in Rust means the sidecar's only job is JSONL scanning — the narrowest, safest possible boundary. The sidecar should not need `tkinter` at all once ported; drop that dependency.

### What moves where

| Current (`overlay.py` / modules) | Phase 1 destination | Notes |
|---|---|---|
| `ClaudeCodeScanner`, `CursorScanner`, `MultiProgramScanner`, `SessionInfo`/`ProgramInfo` | **Python sidecar**, unchanged | Only interface changes: emit results as JSON over stdout instead of an in-process `get_programs()` call. |
| `NotificationHub`, `UDPListener` | **Rust** | Simple enough to reimplement natively (`tokio::net::UdpSocket`, a `Mutex<HashMap<...>>`). Removes a cross-process hop for the latency-sensitive needs-input path. |
| `notifications.py` (`TrayToastSink`, `ConsoleSink`, dispatcher) | **Rust**, using `tauri-plugin-notification` | Replaces the `pystray.Icon.notify()` workaround with a native notification API. |
| `_focus_linked_console`, `_focus_by_pid_program` (Windows `ctypes.windll`) | **Rust**, using the `windows` crate | Same OS calls, native crate instead of `ctypes`. This is also the piece that unlocks real cross-platform later (macOS/Linux equivalents), which was a stated reason for the port. |
| `WindowTerrain` (floors/walls from OS window geometry) | **Rust**, `windows` crate for enumeration; **decide scope before porting** | See Part 5, open question 1 — consider shipping Phase 1 with a simplified floor (screen edges only) and deferring full window-walking if it adds too much risk. |
| `Avatar` physics + draw, `Particle`/`BurstEffect`/`GlitchFlash` | **Frontend (canvas/TS)** | Port the physics constants and state machine as-is first; visual polish (particles, glitch flash) can be simplified or cut for a v1 parity build and restored after. |
| `sprite_loader.py` (`SpriteSheet`, `SpriteRegistry`) | **Frontend (canvas/TS)** | PIL slicing → canvas `drawImage` with source-rect slicing; hue-rotate → CSS filter or a canvas pixel-shader pass. Keep the one-time sheet-extraction step (`_extract_*_sheet`) as a **build-time script**, not runtime logic — no reason to re-slice sprite sheets on every launch in either version. |
| HUD/session-list/skin-picker/config screens | **Frontend (HTML/CSS)** | This is the actual payoff of the port — plain DOM/CSS instead of tkinter `Toplevel` layout code. |
| Tray menu (`_setup_tray`) | **Rust**, `tauri::tray` | Native tray API. |
| Autostart-at-login (currently a manual `shell:startup` shortcut per `docs/running.md`) | **Rust**, `tauri-plugin-autostart` | Was a documented manual step before; now a real feature. |
| Skin persistence, personal to-do list (Stage 2 scope) | **Rust** (file I/O) or frontend `localStorage`/Tauri store plugin | Not yet built in the tkinter version either — build it directly in the new architecture rather than porting something that doesn't exist yet. |

---

## Part 3 — Sidecar IPC protocol

Deliberately narrow. The sidecar's only responsibility: emit the current program/session snapshot on a fixed interval (mirrors the existing `SESSION_SCAN_RATE = 2.0`), and exit cleanly on stdin close.

**Sidecar → Rust (stdout, one JSON object per line, newline-delimited):**
```json
{"type": "scan", "ts": 1756240000.0, "programs": [
  {"program_id": "claude", "name": "Claude", "sessions": [
    {"session_id": "<full-uuid>", "short_id": "<8-char>", "status": "busy",
     "tool": "Bash", "subagents": 0, "cwd": "C:\\path", "pid": 1234, "last_seen": 1756239998.0}
  ]},
  {"program_id": "cursor", "name": "Cursor", "sessions": []}
]}
```
This is close to today's `ProgramInfo`/`SessionInfo` shape (`session_scanner.py` Part 2 of `STAGE1_PLAN.md`) — reuse the field names, just serialize instead of returning Python objects.

**Rust → sidecar (stdin, newline-delimited JSON):** not needed for Phase 1 — the sidecar is a pure producer. Leave the channel open for a future `{"type": "set_skin", ...}`-style command only if a real need shows up; don't build it speculatively.

**Process lifecycle:** Rust spawns the sidecar via `tauri-plugin-shell`'s sidecar API on app start, reads stdout line-by-line, restarts it if it exits unexpectedly (log the restart, don't retry-loop silently forever), and kills it on app quit. The sidecar must never require the Rust side to send it anything to start scanning — same "just run" simplicity as today's `SessionScanner` thread.

Bundling: the sidecar ships as a PyInstaller-built exe (reuse the existing `overlay.spec`-style onedir/onefile build for just the scanner module, much smaller than today's full-app build since it drops `tkinter`/`Pillow`/`pystray`), registered as a Tauri "external binary" per-platform.

---

## Part 4 — Phase 1 task breakdown

Ordered so nothing depends on something not yet built. Each item should get its own verification pass against current `overlay.py`/`session_scanner.py` before porting — this plan gives the shape, not exact line numbers.

1. **Scaffold** — `cargo create-tauri-app`, TypeScript + vanilla or a minimal framework (no strong opinion here; avoid pulling in something heavy like a full React/Redux stack for what's fundamentally a canvas + a few panels).
2. **Sidecar extraction** — pull `session_scanner.py` (+ its `psutil` dependency) into a standalone script with a `--scan-interval` arg and the stdout protocol from Part 3. Verify it still detects real Claude Code sessions before touching Rust at all.
3. **Rust: spawn + read sidecar**, forward each scan line to the frontend via `app.emit("scan", payload)`.
4. **Rust: UDP listener + notification hub**, port `notify_hub.py`'s edge-transition + 20s anti-flap logic faithfully (this is the part most likely to have subtle timing bugs if rewritten from memory instead of read from source) — emit `needs_input` state changes to the frontend the same way as scans.
5. **Rust: native notification** on the needs-input edge transition (`tauri-plugin-notification`), and native tray with the existing menu items (Skins/Config/Show Status/Close — verify current tray menu contents in `_setup_tray` before assuming this list is complete).
6. **Frontend: canvas avatar rendering** — port `Avatar.update`/`draw` physics and the sprite animation state machine. Get one avatar (Claude/Caine) walking and responding to status changes before adding Cursor/subagents.
7. **Frontend: NEEDS_INPUT visuals** — blinking marker, avatar stops moving, per the existing `_anim_status`/`draw` behavior.
8. **Rust: focus-on-click** — `windows` crate port of `_focus_linked_console`. Verify the current elevated-window UIPI limitation (documented in `docs/running.md`) still applies and stays documented, not silently dropped.
9. **Frontend: session picker, skin picker** as HTML dialogs/modals, replacing `session_picker.py` and `_build_picker_ui`.
10. **Rust: tray click-to-focus routing** (`_on_tray_activate`/`_resolve_focus_target` equivalent).
11. **`WindowTerrain` decision** (see Part 5, open question 1) — implement or deliberately stub, document the choice either way.
12. **Packaging**: `tauri.conf.json` bundle config, code-signing question (Phase 1 can ship unsigned like today, same SmartScreen caveat), `tauri-plugin-autostart`, `tauri-plugin-single-instance`.
13. **Parity checklist** (mirror `STAGE1_PLAN.md`'s manual verification checklist): two permanent avatars, live status within ~2s of a real session change, needs-input alert within ~1 frame of a hook firing, click-to-focus works, tray works, packaged build launches clean on a machine without a dev Python/Rust toolchain installed.

---

## Part 5 — Open questions to resolve during implementation (not here)

1. **`WindowTerrain` scope.** Full port (enumerate all OS windows, avatars walk their edges) is the most OS-API-heavy single piece of this whole plan and the easiest place to lose a week to platform quirks. Consider shipping Phase 1 with avatars confined to the app's own window/screen bounds (floor = screen bottom, no wall-climbing across arbitrary windows) and treating full terrain parity as its own follow-up, not a Phase 1 blocker. Get Ryuu's call on this trade-off before deciding unilaterally — it's a visible behavior change, not an implementation detail.
2. **Frontend framework choice** — left open above; whoever implements this should pick based on what's fastest to work in (Haiku/Codex's own judgment), not over-architect for a dashboard this size.
3. **Sidecar Python version/runtime** — confirm what Python the sidecar bundles (match the main app's current 3.14 requirement noted in `docs/running.md`, or pin independently) and how large the sidecar-only PyInstaller build ends up once `tkinter`/`Pillow`/`pystray` are dropped from it.
4. **`Sprites/` asset pipeline** — decide whether sheet-slicing (`_extract_*_sheet`) becomes a one-time Node/Python build script that emits pre-sliced frame PNGs (recommended — keeps the frontend simple) or is ported to run client-side.
5. **Cursor stub** — `CursorScanner` stays a stub returning nothing in the sidecar, same as today; no behavior change expected from this port, just confirm nothing implicitly relies on tkinter timing.

---

## Part 6 — Phase 2 (stretch, not required to ship Phase 1)

Eliminate the Python sidecar entirely: reimplement `ClaudeCodeScanner`'s JSONL tail-parsing and psutil-based PID matching natively in Rust (`sysinfo` crate covers most of `psutil`'s surface). Payoff: true single-binary distribution, no bundled Python runtime, smallest possible bundle size, and the last barrier to real macOS/Linux support (JSONL parsing is trivial to port; the PID/workspace-matching logic needs the most care since it's the part `STAGE1_PLAN.md` already flagged as having a known limitation — shared PID across sessions in the same workspace). Do not start this before Phase 1 is stable and in daily use — the sidecar boundary exists specifically so Phase 1 doesn't have to get this right on the first attempt.

---

## Related

- `STAGE1_PLAN.md` — the tkinter build this replaces; same rigor expected (verify-before-port, not port-from-memory).
- `CLAUDE.md` — current shipped architecture.
- `../10 - Projects/AI Avatar Room - Design.md` — Stage 2 §0 packaging decision, full roadmap.
- `docs/running.md` — current packaging/distribution caveats (SmartScreen, UIPI, no auto-update) that this port is meant to reduce, not just relocate.
