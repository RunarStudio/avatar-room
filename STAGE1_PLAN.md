# AI Avatar Room — Stage 1 FINAL Implementation Plan

Produced via two-pass planning: Fable (draft) → Opus high-effort (verified against real code, corrected, decided the open Cursor question). Handed to Sonnet (medium effort) for implementation. Do not re-litigate architecture decisions here without a reason — this plan is final.

## Part 0 — Verification of Fable's pass-1 claims

### Confirmed correct

| Claim | Verdict |
|---|---|
| `overlay.py` is 2060 lines, single-file tkinter app | Confirmed (2060 lines exactly) |
| `S` enum with IDLE/THINKING/BUSY/SUBAGENT/ERROR/DONE + `STATUS_COLOR` | Confirmed L381-396 |
| Scanner only ever emits IDLE/THINKING/BUSY | Confirmed `_parse_tail` L889-909 returns only those three |
| `AgentInfo` dataclass, `agent_id = f.stem[:8]` | Confirmed L398-409, L819 |
| `SessionScanner` thread, 2s, globs `~/.claude/projects/*/*.jsonl`, `_match_pids` by workspace-dir-name hash, synthetic fallback | Confirmed L795-909; fallback key is `"demo"` (L840), skin `"amongo"`, name `"Caine"` |
| `WindowTerrain` same Lock-snapshot pattern | Confirmed L916-961 |
| `_tick()` at 20 FPS diffs `get_agents()` vs `self.avatars` | Confirmed L1079-1284 |
| Click routing is session-level via `_focus_linked_console(av.agent.pid)` | Confirmed L1552 and L1568 |
| `_hud_status_text` compares against `["caine"]` — real bug | Confirmed real. L985: `no_sess = (real == 0 and list(agents.keys()) == ["caine"])`. The demo key is `"demo"`, so `no_sess` is permanently `False` and the "Waiting for session..." line never renders. |
| Zero UDP/socket code in `overlay.py` | Confirmed via grep for `socket`/`UDP`/`47200` — zero hits |
| `claude_hooks_example.py` is argv-driven and cannot emit a session id | Confirmed L37-44 reads `sys.argv` only; never reads stdin |
| `overlay.spec` is onefile (no `COLLECT()`) | Confirmed — `EXE(pyz, a.scripts, a.binaries, a.zipfiles, a.datas, ...)`, `runtime_tmpdir=None`, `console=False` |
| `Sprites/` contents; `BunnyLot.png` referenced at L301 but absent from `Sprites/` | Confirmed (raw art is in `Images/BunnyLot.png`, but `_load_sprites` only looks in `Sprites/`) |
| `pystray` tray with Skins/Config/Show Status/Close | Confirmed L1365-1391 |

### Corrections — Fable got these wrong or missed them

1. **`overlay.spec` does not exist in the fork.** It's only in `zz_cli_avatars/`. It must be copied in, not just edited.
2. **`.gitignore` ignores `*.spec` and `dist/`** (fork `.gitignore` L9, L14, L41). A copied `overlay.spec` will be silently untracked. Needs a `!overlay.spec` negation.
3. **Spring physics is dead code.** `_apply_spring` (L1291) is never called. Subagents are constructed with `spring_mode=False` (L1199) and run normal walk AI; only the decorative `_draw_elastic` zigzag remains. Do not preserve or port "spring physics" — there is none.
4. **Session-id truncation mismatch — critical.** `agent_id = f.stem[:8]` (L819) truncates to 8 chars, but a Claude hook's stdin `session_id` is the full UUID. Verified the JSONL filename stem *is* the full `sessionId`. `SessionInfo.session_id` must be the full `f.stem`; `[:8]` is display-only.
5. **`bubble` is already the subagent skin** (L1195 `skin="bubble"`), and the skin picker explicitly filters it out (L1818-1820 `if sn != "bubble"`). Assigning Bubble to Cursor collides with subagents — resolved via `SUBAGENT_SKIN = "amongo"` (see Part 2).
6. **`ANIM_ROW` has no `needs_input` key.** `sprite_loader.py` L85-92; `get_photo` does `ANIM_ROW.get(status, 0)` (L302), so a new `S.NEEDS_INPUT` would silently render the idle row. Fable's plan omitted this — the new status would be visually invisible without the fix in item 5 of Part 5.
7. **`GlitchFlash` does not follow a moving avatar.** It captures `mx/my` at construction (L524-526) and never updates them. Fable's "re-trigger GlitchFlash every 15 frames" would strobe rectangles at stale positions behind a walking avatar. Rejected — replaced with an in-`draw()` marker (Part 5, item 8).
8. **The 5-minute vanish will break stable program avatars.** L1120: `if not av.agent.is_demo and time.time() - av.last_active > 300` -> avatar floats off, is popped from `self.avatars` (L1137), and the very next frame respawns it at a random position (L1090-1093). With always-present program entries this becomes a teleport-every-5-minutes bug. Must be removed for program avatars (Part 5, item 6).
9. **Sprite extraction reads outside the repo.** L134/L189/L242 use `Path(__file__).parent.parent / "Images"` -> resolves to the vault's `RuneIsaRaido/Images/`, not the fork's own `zz_avatar_room/Images/` (which exists and contains `char_caine.png`, `char_Bubble.png`, `char_cc.png`, `BunnyLot.png`). Works today only by coincidence — fix in Part 5, item 15.
10. **`win11toast` is the wrong pick.** This machine runs Python 3.14.3; `win11toast` depends on the compiled `winsdk`/`winrt` package, which lags new CPython releases. Verified installed set: `pystray, psutil, pywinctl, PIL, numpy` present; `win11toast, winotify, plyer, win10toast` all missing. Replaced with `pystray.Icon.notify()` — zero new dependencies (Part 4).
11. **Fable's "direct same-thread toast dispatch, no queue needed" is unsafe.** The UDP listener thread must never touch pystray or tkinter — see Part 3 threading design.
12. **Rate limit of 5 minutes is too coarse.** Replaced with edge-transition + a 20s anti-flap floor (Part 4).
13. **`docs/claude-hooks.md` uses an obsolete `settings.json` hook schema** (flat `"command"` strings, L44-57). Real Claude Code uses `{"matcher": ..., "hooks": [{"type":"command","command": ...}]}`. Rewrite per Part 5, item 13.

### Also verified (new facts Fable didn't have)

- Claude JSONL records carry `cwd` (real absolute path) alongside `sessionId` — usable for human-readable picker labels without any hashing.
- The `<session-uuid>/subagents/` sibling directory really exists on this machine, so the `subagents` counting logic (L821-827) is valid and should be ported unchanged.
- `~/.claude/settings.json` currently has no `hooks` key — this is a clean add, not a merge.
- `_setup_tray` already passes `on_activate=...` (L1386) — a ready-made click handler hook.

---

## Part 1 — Cursor: resolved

**Decision: Stage 1 ships a `CursorScanner` stub only. Real Cursor detection is explicitly deferred to Stage 2/3 by direct user instruction** ("don't bother too much with Cursor for now, leave it for stage 2 or 3") — this is a scope decision, not an oversight.

- Cursor is not installed on this machine — any code path written now would be untestable.
- Worth recording for Stage 2 (already researched, costs nothing to carry forward): the design doc's premise that Cursor has "no hook system" is out of date. Cursor added [Hooks](https://cursor.com/docs/hooks) in 1.7. Config: `~/.cursor/hooks.json` / `<project>/.cursor/hooks.json`, schema `{"version":1,"hooks":{"<eventName>":[{"command":...,"type":"command"}]}}`. Relevant events: `sessionStart`, `sessionEnd`, `stop`, `beforeSubmitPrompt`, `preToolUse`, `postToolUse`, `subagentStart`, `subagentStop`. **Stage 2 should reuse the exact same UDP pipeline** — a second ~20-line stdin-reading hook script pointed at `127.0.0.1:47200`, emitting `{"program":"cursor", ...}`. No SQLite log-polling of `state.vscdb` — schema churns between Cursor versions, DB is WAL-locked, and it carries no "waiting for you" signal anyway.

**Stage 1 consequence:** the UDP protocol includes a mandatory `"program"` field from day one, so Stage 2 is purely "write a second hook script" with zero changes to `udp_listener.py`, `notify_hub.py`, or `notifications.py`. The Bubble avatar stands idle (`is_demo=True`) until then.

---

## Part 2 — Code structure

### Module DAG (no cycles)

```
session_scanner.py   S, STATUS_COLOR, STATUS_PRIORITY, SessionInfo, ProgramInfo,
                     ProgramScanner(ABC), ClaudeCodeScanner, CursorScanner(stub),
                     MultiProgramScanner          [stdlib + psutil only]
notify_hub.py        NotificationHub              [stdlib only]
notifications.py     NotificationEvent, NotificationSink, TrayToastSink,
                     ConsoleSink, NotificationDispatcher   [stdlib only]
udp_listener.py      UDPListener  -> notify_hub, notifications
session_picker.py    open_session_picker()        [tkinter only; callbacks injected]
hooks/avatar_room_hook.py   standalone, pure stdlib, imports nothing from the app
overlay.py           -> all of the above + sprite_loader
```

`S` and `STATUS_COLOR` move out of `overlay.py` into `session_scanner.py`; `overlay.py` does `from session_scanner import S, STATUS_COLOR, ...`. `session_scanner` must never import `overlay` (prevents the cycle).

### Key decision: keep `AgentInfo`, make `ProgramInfo` duck-compatible

Do **not** replace `AgentInfo` with `ProgramInfo` everywhere (Fable's original proposal). `AgentInfo` is still constructed for subagent avatars and `Avatar` reads it in five places.

- `AgentInfo` stays in `overlay.py`, unchanged, serving only subagent avatars.
- `ProgramInfo` exposes the same read-surface `Avatar`/`_hud_status_text` touch: `agent_id, name, status, tool, subagents, skin, is_demo, pid`.
- `Avatar.__init__`'s `agent: AgentInfo` type annotation is loosened (un-annotated).

Result: `Avatar` needs no structural changes beyond the NEEDS_INPUT marker in `draw()`.

### Data model

```
SessionInfo:      session_id (FULL uuid = f.stem), short_id (=[:8]), program,
                  status, tool, subagents, cwd, workspace_hash, pid, last_seen
ProgramInfo:      program_id ("claude"|"cursor"), agent_id (== program_id),
                  name ("Claude"|"Cursor"), skin, sessions: list[SessionInfo],
                  base_status, status, tool, subagents, pid, is_demo,
                  needs_input_sessions: list[SessionInfo]
```

- `base_status` is written by the scanner thread (2s cadence). `status` is written by `_tick()` every frame (NEEDS_INPUT override, else `base_status`). Storing both makes the per-frame override idempotent.
- `is_demo == (len(sessions) == 0)` — reuses the existing field name so `Avatar.draw`'s dashed-outline/grey-label branches (L753, L783) keep working unmodified. Only change: drop the `"[D] "` prefix (L766) to `""`.
- Program ids are stable strings (`"claude"`, `"cursor"`), always present, created once, never despawned — no pop-in/pop-out.

### Rollup rules

```python
STATUS_PRIORITY = [S.NEEDS_INPUT, S.ERROR, S.BUSY, S.THINKING, S.DONE, S.IDLE]
```
`rollup_status(statuses)` returns the entry with the lowest index (worst case wins); empty -> `S.IDLE`.

- `ProgramInfo.tool` — tool of the most-recently-active session (`max(sessions, key=last_seen)`) with a non-empty tool; else `""`.
- `ProgramInfo.subagents` — sum across sessions.
- `ProgramInfo.pid` — pid of the most-recently-active session with a non-zero pid.
- Session liveness — port L817 (jsonl mtime <= 8h) and L847-850 (drop sessions with no live pid) unchanged, applied per session.
- Skin persistence — `MultiProgramScanner.set_skin(program_id, skin)` public method, replacing `_apply_skin`'s reach into `scanner._lock`/`scanner._agents` (L1866-1869). `PROGRAM_SKINS = {"claude": "caine", "cursor": "bubble"}` replaces `REAL_SESSION_SKINS` (L106).
- Subagent skin collision — `SUBAGENT_SKIN = "amongo"` module constant, used at L1195. Remove the `sn != "bubble"` filter at L1818-1820 so Bubble is selectable in the picker.

---

## Part 3 — UDP listener integration and threading

### Wire protocol

Hook -> `127.0.0.1:47200`, one UTF-8 JSON datagram, under 1500 bytes:

```json
{"program":"claude","event":"Notification","session_id":"<full-uuid>",
 "cwd":"C:\\path\\to\\project","message":"Claude needs your permission to use Bash","ts":1756240000.0}
```

`program` is mandatory (forward-compat for Cursor in Stage 2). Unknown `event` values are ignored, never fatal.

### Event -> state mapping

| Claude hook event | Hub action | Toast? |
|---|---|---|
| `Notification` | `mark_needs_input(session_id, message)` | Yes, on edge transition only |
| `UserPromptSubmit` | `clear(session_id)` | no |
| `PreToolUse` / `PostToolUse` | `clear(session_id)` + record tool name | no |
| `Stop` | `note_turn_end(session_id)` -> status DONE; does not touch needs_input | no (gated by `TOAST_ON_STOP = False` module constant) |
| `SessionEnd` | `clear(session_id)` | no |

`Stop` fires after every turn — toasting on it would spam, since `PreToolUse` already clears the flag after a permission prompt's real sequence (`Notification -> PreToolUse -> ... -> Stop`). `TOAST_ON_STOP` gives a one-line opt-in if preferred later.

Safety net: `expire_stale(ttl=900)` auto-clears a needs-input entry after 15 min, called once per frame from `_tick()`.

### Threading design

Tkinter's Tcl interpreter may only be touched from the thread that created it. **The UDP thread never touches tkinter, canvas, widgets, or pystray.** Its entire set of side effects:

1. `sock.recvfrom(4096)`
2. `json.loads` inside a bare `except Exception: continue`
3. under `NotificationHub._lock`: mutate a plain `dict[str, Entry]` and `list.append` a `NotificationEvent` onto `_pending`

Everything with a UI effect happens on the main thread inside `_tick()`:

```
_tick():
    programs = scanner.get_programs()               # Lock-protected snapshot (existing pattern)
    hub.expire_stale(900)
    hub.retain_only({s.session_id for p in programs.values() for s in p.sessions})
    needy = hub.get_needs_input_session_ids()        # Lock-protected copy

    for prog in programs.values():                   # per-frame override, idempotent
        prog.needs_input_sessions = [s for s in prog.sessions if s.session_id in needy]
        prog.status = S.NEEDS_INPUT if prog.needs_input_sessions else prog.base_status

    for ev in hub.take_pending():                    # drains under Lock, returns a list
        dispatcher.dispatch(ev)                      # touches pystray -- MAIN THREAD ONLY

    ... existing avatar loop, unchanged ...
```

Latency: <=50ms (one frame at 20 FPS) versus the 2s polling it replaces — the latency argument for UDP is fully preserved without breaking the threading contract.

**Pre-existing risk, do not extend:** `_setup_tray`'s menu callbacks already call `self.root.after(0, ...)` from the pystray thread (L1378-1386) — technically unsafe but works today, out of scope. Do not add any new cross-thread `after` calls.

### Socket lifecycle

- Bind on the main thread inside `OverlayApp.__init__`, wrapped in `try/except OSError`. If the port is taken (a second overlay instance), print a warning, set `self.listener = None`, continue running on 2s polling alone.
- Pass the already-bound socket to the thread. `sock.settimeout(0.5)`; loop on `while not self._stop:` with `except socket.timeout: continue`.
- `_quit()` (L1557) calls `listener.stop()` before `root.quit()`. `daemon=True` remains the backstop.

---

## Part 4 — Notification mechanism

**Zero new dependencies.** Rejecting `win11toast` (needs compiled `winsdk`, unreliable on Python 3.14), `winotify` (PowerShell subprocess per toast, no callback), `plyer` (stale).

**Use `pystray.Icon.notify(message, title=...)`** on the tray icon that already exists at `self._tray`. On Windows this issues `Shell_NotifyIcon` with `NIF_INFO`, rendered as a real toast by Windows 10/11. Already in `requirements.txt`, already installed, already instantiated — `requirements.txt` needs no changes.

### `notifications.py`

```
NotificationEvent(program, session_id, kind, title, message, ts, focus_target)
NotificationSink (ABC): send(event) -> bool
ConsoleSink        -- always registered; prints a timestamped line (debug + headless fallback)
TrayToastSink      -- holds a callable returning the live pystray Icon (created later
                     by _setup_tray); no-ops and returns False if the icon is None
                     or if HAS_PIL is False; wraps notify() in try/except
NotificationDispatcher -- fan-out to sinks, owns the anti-flap floor
```

**Rate limiting:** toast fires only on the not-needing -> needing edge transition (enforced in `NotificationHub.mark_needs_input`), plus a hard 20s floor per `session_id` in the dispatcher. Toast fires unconditionally regardless of window focus — no focus detection is built; the overlay is meant to be ignorable, which is why the toast exists.

### Click-to-jump

`Icon.notify` balloon-click delivery isn't reliable enough to depend on. Extend the tray icon's already-wired `on_activate` (L1386):

```
_on_tray_activate():
    if any session currently needs input -> _resolve_focus_target() (focus or picker)
    else -> existing _bring_all_to_front()
```

### Stage 3 plug-in story

A future `JiraBitbucketPoller` constructs its own `NotificationEvent(kind="pr_review", ...)` and calls `dispatcher.dispatch(...)`. Zero changes to `notifications.py`. `kind` is free-form; `focus_target` is an opaque callable or `None`.

---

## Part 5 — File-by-file breakdown

Ordered so nothing depends on something not yet built.

**1. `session_scanner.py` — NEW**
- `S` class (port L381-388) plus `NEEDS_INPUT = "needs_input"`.
- `STATUS_COLOR` (port L389-396) plus `S.NEEDS_INPUT: "#ff44dd"` (hot magenta).
- `STATUS_PRIORITY`; `rollup_status(statuses) -> str`.
- `PROGRAM_SKINS = {"claude": "caine", "cursor": "bubble"}`; `ENABLED_PROGRAMS = ["claude", "cursor"]`; `SESSION_SCAN_RATE = 2.0`.
- `@dataclass SessionInfo` and `@dataclass ProgramInfo` per Part 2.
- `class ProgramScanner(ABC)`: `program_id`, `display_name`, `scan() -> list[SessionInfo]`.
- `class ClaudeCodeScanner(ProgramScanner)` — port `SessionScanner._scan` (L810-836), `_match_pids` (L864-887), `_parse_tail` (L889-909):
  - `session_id = f.stem` (FULL uuid), `short_id = f.stem[:8]`.
  - `_parse_tail` returns `(status, tool, cwd)` — grab `cwd` from the same tail scan.
  - Drop the `found["demo"]` fallback entirely (handled at the program level now).
  - Keep the 8h mtime filter and the `subagents/` glob.
- `class CursorScanner(ProgramScanner)` — STUB. `scan()` returns `[]`. Docstring: real Cursor detection deferred to Stage 2/3 per explicit user direction; Cursor has had a hook system since 1.7 (`~/.cursor/hooks.json`); Stage 2 should add a second hook script emitting `program:"cursor"` to the same UDP port, not SQLite log polling.
- `class MultiProgramScanner` — owns `Lock`, `_programs: dict[str, ProgramInfo]`, one entry per `ENABLED_PROGRAMS` created at `__init__`, never removed. `loop()`, `_scan()` (calls each sub-scanner, rebuilds `sessions`, recomputes `base_status`/`tool`/`subagents`/`pid`/`is_demo`, preserves `skin` and `status`), `get_programs()` (Lock-protected `dict(...)`), `set_skin(program_id, skin)`.

**2. `notify_hub.py` — NEW**
`NotificationHub`, one `threading.Lock` guarding `_state: dict[str, Entry]` (`needs_input, since, message, program, last_tool, turn_ended_at`) and `_pending: list[NotificationEvent]`.
Listener-thread API: `mark_needs_input(program, session_id, message)` (appends to `_pending` only on edge transition), `clear(session_id)`, `note_turn_end(session_id)`, `note_tool(session_id, tool)`.
Main-thread API: `get_needs_input_session_ids() -> set[str]`, `take_pending() -> list`, `retain_only(ids)`, `expire_stale(ttl=900)`, `entry(session_id)`.
Every method acquires the Lock. No I/O, no imports beyond `time`/`threading`/`dataclasses`.

**3. `notifications.py` — NEW** — exactly as specified in Part 4.

**4. `udp_listener.py` — NEW**
`UDPListener(hub, host="127.0.0.1", port=47200)`. `bind()` (main thread, raises `OSError`), `loop()` (daemon), `stop()`. `settimeout(0.5)`. Body: `json.loads` -> require `session_id` -> dispatch on `event` per Part 3's table -> hub call -> `continue`. Every iteration wrapped in `except Exception: continue`. Never imports `overlay` or `tkinter`.

**5. `sprite_loader.py` — EDIT (one line)**
Add `"needs_input": 3,` to `ANIM_ROW` (L85-92) — the stand row. Without this, `get_photo` silently falls back to idle (L302) and the new status is invisible.

**6. `overlay.py` — remove the old scanner, wire in the new one**
- Delete `class SessionScanner` (L795-909) wholesale.
- Delete the local `S` and `STATUS_COLOR` (L381-396); replace with `from session_scanner import S, STATUS_COLOR, STATUS_PRIORITY, MultiProgramScanner, PROGRAM_SKINS, ENABLED_PROGRAMS`.
- Delete `REAL_SESSION_SKINS` (L106); add `SUBAGENT_SKIN = "amongo"` and `TOAST_ON_STOP = False`.
- Keep `AgentInfo` (L398-409) as-is. Loosen `Avatar.__init__`'s `agent: AgentInfo` annotation (L594).
- L1029: `self.scanner = MultiProgramScanner()`. L1063 thread target becomes `self.scanner.loop`.
- L1080: `programs = self.scanner.get_programs()`. Rename local `agents` -> `programs` throughout `_tick`, `aid` -> `pid_key` where it means program id.
- L1192-1196: subagent `AgentInfo(..., skin=SUBAGENT_SKIN)`.
- Delete the vanish block (L1119-1124) and the `_vanishing` branch (L1103-1117) for program avatars, plus the `vanished_aids` cleanup (L1137-1141). Program avatars are permanent. Subagent float-away (L1214-1236) and lingering-sub logic (L1246-1270) stay untouched.
- L1677 (`_build_picker_ui`) -> `self.scanner.get_programs()`; labels become `f"{p.name} ({len(p.sessions)} session(s))"`.
- L1818-1820: remove the `sn != "bubble"` filter.
- L1866-1869 `_apply_skin` -> `self.scanner.set_skin(program_id, skin)`.
- L1291 `_apply_spring`: delete (dead code).

**Checkpoint: the app should run here** — two permanent avatars, Claude rolling up live sessions, Cursor idle. Verify before continuing.

**7. `overlay.py` — HUD rewrite**
Rewrite `_hud_status_text` (L977-995) to take `programs`. One row per program: `f"  {p.name:8}: {p.status}  ({len(p.sessions)} sess)"`, colored by `STATUS_COLOR[p.status]`, plus a `Needs input : N` summary row. This deletes the `["caine"]` bug (L985) rather than patching it. Update `_update_hud_win` (L1494-1498) accordingly. Also L1431: `f"  AI Overlay v{VERSION}"` so the title can't drift again.

**8. `overlay.py` — NEEDS_INPUT visuals**
- `Avatar._anim_status` (L641-645): explicit early return for `S.NEEDS_INPUT` so the "idle+moving -> busy" rule can't mask it.
- `Avatar.update` (L687): when `self.agent.status == S.NEEDS_INPUT`, set `self.vx = 0.0` and skip the walk-AI block — avatar stops so it's easy to click, row 3 (stand) plays.
- `Avatar.draw` (L762-784): when status is NEEDS_INPUT, create/update an extra canvas text item `self.alert_id` at `(px + aw//2, py - 30)` showing `"!"` in `#ff44dd`, `("Courier", 16, "bold")`, visible only when `(self.frame // 4) % 2 == 0` (~2.5Hz blink at 20 FPS). Delete it when status leaves NEEDS_INPUT. Add `self.alert_id` to `cleanup()` (L786-788).
- L766: change `pfx = "[D] "` -> `pfx = ""`.
- Do NOT use `GlitchFlash` for this — it does not track a moving avatar (Correction 7).

**9. `session_picker.py` — NEW**
`open_session_picker(root, program, on_pick, needs_input_ids)` -> `tk.Toplevel`, styled to match `_open_skin_picker` (L1665-1672: `bg="#0d0d1a"`, `fg="#aaccff"`, `Courier`, `-topmost`). One row per `SessionInfo`: `Path(s.cwd).name` (falls back to `s.workspace_hash`), `s.short_id`, `s.status`, `s.tool`; needs-input rows rendered in `#ff44dd`, sorted first. Click -> `on_pick(session)` then `destroy()`. Escape closes. No app imports — everything injected.

**10. `overlay.py` — focus routing**
Add `_resolve_focus_target(program)`:
1. `needy = program.needs_input_sessions` — exactly 1 -> `_focus_linked_console(s.pid)`; more than 1 -> picker.
2. Else `len(program.sessions) == 1` -> focus it; `> 1` -> picker.
3. Else (0 sessions) -> no-op.

Rewrite `_on_double_click` (L1548-1553) and `_on_right_click` (L1563-1570) to call `_resolve_focus_target(av.agent)` instead of `_focus_linked_console(av.agent.pid)`. Right-click on empty canvas still quits (L1570) — preserve. Subagent right-clicks (L1564) keep calling `_focus_linked_console(av.agent.pid)` directly since `AgentInfo` has no `.sessions`; guard with `isinstance`/`hasattr`.

**Known limitation, documented not fixed:** `_match_pids` (L881-883) matches by workspace directory, so all sessions in the same project share one PID. The picker lists them separately but focusing any raises the same window. Acceptable for Stage 1.

**11. `overlay.py` — wire hub / dispatcher / listener**
In `__init__` after L1030:
```python
self.hub = NotificationHub()
self.dispatcher = NotificationDispatcher([ConsoleSink(), TrayToastSink(lambda: self._tray)])
self.listener = UDPListener(self.hub)
try:
    self.listener.bind()
    threading.Thread(target=self.listener.loop, daemon=True).start()
except OSError as e:
    print(f"[overlay] UDP 47200 unavailable ({e}) -- polling only")
    self.listener = None
```
`TrayToastSink` takes a callable, not the icon — `self._tray` is still `None` at this point, only populated later by `_setup_tray` on the deferred-init path (L1067/L1075).

Insert the per-frame block from Part 3 at the top of `_tick` (L1080). Extend `_quit` (L1557) to call `self.listener.stop()`. Replace `on_activate` (L1386) with `_on_tray_activate` per Part 4.

**12. `hooks/avatar_room_hook.py` — NEW (replaces `claude_hooks_example.py`)**
~25 lines, pure stdlib (`sys, json, socket, time`), no third-party imports, no printing to stdout.
```python
payload = json.load(sys.stdin)                     # NOT sys.argv
out = {"program": "claude",
       "event":       payload.get("hook_event_name", ""),
       "session_id":  payload.get("session_id", ""),
       "cwd":         payload.get("cwd", ""),
       "message":     payload.get("message", ""),
       "tool":        payload.get("tool_name", ""),
       "ts": time.time()}
socket.socket(AF_INET, SOCK_DGRAM).sendto(json.dumps(out).encode(), ("127.0.0.1", 47200))
sys.exit(0)                                        # always 0 -- never block Claude Code
```
Whole body in `try/except BaseException: pass` then `sys.exit(0)`. A hook that errors or returns non-zero can disrupt the agent turn; this one must be incapable of that.

**Delete `claude_hooks_example.py`** — misleading (argv-based, cannot carry a session id).

**13. `docs/claude-hooks.md` — REWRITE**
Real registration in `~/.claude/settings.json` (verified: currently no `hooks` key, clean add):
```json
{
  "hooks": {
    "Notification":     [{"hooks":[{"type":"command","command":"\"C:\\...\\pythonw.exe\" \"C:\\...\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "UserPromptSubmit": [{"hooks":[{"type":"command","command":"...same..."}]}],
    "Stop":             [{"hooks":[{"type":"command","command":"...same..."}]}],
    "SessionEnd":       [{"hooks":[{"type":"command","command":"...same..."}]}],
    "PreToolUse":       [{"matcher":"*","hooks":[{"type":"command","command":"...same..."}]}],
    "PostToolUse":      [{"matcher":"*","hooks":[{"type":"command","command":"...same..."}]}]
  }
}
```
Must state: use `pythonw.exe`, not `python.exe` (otherwise a console window flashes on every tool call). Must use an absolute path (hooks run with cwd = the project dir). Document the packet schema, the event->status table from Part 3, and that hooks fail silently when the overlay isn't running (UDP is fire-and-forget).

**14. `overlay.spec` — COPY IN and convert to onedir**
- Copy `zz_cli_avatars/overlay.spec` -> `zz_avatar_room/overlay.spec` (doesn't exist in the fork yet).
- Add `!overlay.spec` to `.gitignore` (currently ignores `*.spec` at L9) — otherwise silently untracked.
- Convert onefile -> onedir: strip `a.binaries, a.zipfiles, a.datas` from `EXE(...)`, add `exclude_binaries=True`, append `COLLECT(exe, a.binaries, a.zipfiles, a.datas, name="avatar_room")`. Onefile self-extracts to a fresh temp dir on every launch — wrong for something in the Startup folder.
- `name="avatar_room"`, keep `icon="Caine_Icon.ico"`.
- No new `hiddenimports` needed — `session_scanner`, `notify_hub`, `notifications`, `udp_listener`, `session_picker` are statically imported from `overlay.py`, bundled automatically. Explicitly not `win11toast` (rejected, see Part 4).
- Keep `datas` including `sprite_loader.py`; verify `SPRITES_DIR = Path(__file__).parent / "Sprites"` resolves under onedir (it does — `_MEIPASS` == `_internal/`).
- Document a debug build variant: same spec with `console=True` (with `console=False`, every `print()` and unhandled exception is invisible).

**15. `overlay.py` — small fixes bundled here**
- L134 / L189 / L242: `src_path` should prefer `Path(__file__).parent / "Images" / ...` (the fork's own — has `char_caine.png`, `char_Bubble.png`, `char_cc.png`) and only fall back to `.parent.parent / "Images"`. Currently reads the vault's Images folder, outside the git repo.
- L1336-1356 `_load_bubble_icon`: rename to `_load_menu_icon`, load `Caine_Icon.png` (already present, already the tray/window icon) instead of a Bubble sprite frame — with Bubble now the Cursor avatar, a static Bubble in the corner reads as a second Cursor. Rename tag `"bubble_icon"` and its three `tag_bind` calls (L1349-1354) with it.
- `VERSION = "0.5"` (L41); update module docstring (L3) and the `run()` banner (L2052) to interpolate `VERSION`.

**16. `docs/running.md` — NEW**
Build (`pip install pyinstaller`, `pyinstaller overlay.spec --noconfirm`, output `dist/avatar_room/avatar_room.exe`), then a shortcut in `shell:startup`. Document, don't solve: (a) unsigned exe -> SmartScreen prompt on first run, "More info -> Run anyway", once; (b) an elevated terminal can't be focused from a non-elevated overlay — UIPI blocks `SetForegroundWindow` across integrity levels, `_focus_linked_console` silently no-ops. No auto-update in scope. Note PyInstaller >= 6.16 required for Python 3.14.

**17. `CLAUDE.md` — UPDATE**
Replace "draft fork, pre-refactor" with the shipped architecture: module map, the program-vs-session model, the UDP protocol, the threading contract ("the UDP listener thread touches only NotificationHub's Lock-guarded dict; every canvas/pystray call happens on the main thread inside `_tick()`"), and the Cursor deferral with its Stage 2 pointer to `~/.cursor/hooks.json`.

**18. `ROSTER.md` — UPDATE**
Mark `caine` and `bubble` as wired; add a row for `amongo` = subagent skin. Leave the rest of the curation table untouched (user's pending decision).

---

## Manual verification checklist

1. `python overlay.py` with no Claude sessions -> two avatars (Caine + Bubble), both dashed/grey, HUD reads "Waiting for session..." (proves the `["caine"]` bug is dead).
2. Start one Claude session -> Caine turns solid, HUD shows `1 sess`, status flips busy/thinking within 2s.
3. Start a second Claude session in another project, one idle one running a tool -> single Caine avatar shows the worse status (busy).
4. Register the hook, trigger a permission prompt -> within ~100ms: magenta avatar, blinking `!`, avatar stops walking, one tray toast. Approve -> returns to busy, toast doesn't repeat.
5. Two sessions needing input -> double-click Caine -> picker lists both with project names; clicking one raises that window.
6. Kill the overlay, trigger a hook -> Claude Code unaffected (no error, no hang).
7. Launch a second overlay instance -> prints the "UDP 47200 unavailable" warning, still runs.
8. Leave everything idle for 10 minutes -> no avatar teleports (proves the vanish removal).
9. `pyinstaller overlay.spec --noconfirm` -> `dist/avatar_room/avatar_room.exe` launches with sprites and a working tray.

---

## Deliberately out of scope for Stage 1

Real Cursor detection (Stage 2/3, per user direction) · dashboard · config persistence to disk · in-app config page (Stage 3) · Jira/Bitbucket (Stage 3) · code signing · auto-update · elevated-window focus (blocked by Windows UIPI) · fixing the per-workspace shared-PID limitation · `_hud_win`'s "R-click avatar -> see bubble menu" hint (L1458), which describes a feature that has never existed.

## Sources for Cursor hooks findings
[Hooks | Cursor Docs](https://cursor.com/docs/hooks) · [Cursor 1.7 Adds Hooks for Agent Lifecycle Control — InfoQ](https://www.infoq.com/news/2025/10/cursor-hooks/) · [how-cursor-stores-chats.md — Callum-Ward/cursaves](https://github.com/Callum-Ward/cursaves/blob/main/docs/how-cursor-stores-chats.md)
