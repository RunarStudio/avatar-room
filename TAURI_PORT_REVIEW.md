# Tauri Port Review — 2026-08-30

## Recommendation

Proceed with the existing **Tauri shell + Python scanner sidecar** decision.
It preserves the only production-proven part of the Python app (Claude JSONL
scanning and PID matching) while replacing the parts that limit the current
Windows experience: tkinter windows, `pystray` notifications, manual startup,
and the canvas-only configuration surface.

The first implemented artifact is `scanner_sidecar.py`. It emits a versioned,
newline-delimited JSON snapshot and has no UI imports. A Tauri backend can
spawn it and forward every `scan` object to the frontend as a Tauri event.

## What was verified against the shipped code

- `MultiProgramScanner` owns permanent `claude` and `cursor` program entries
  and performs the status roll-up. The sidecar reuses it; no scanner logic was
  copied.
- `ClaudeCodeScanner` parses Claude JSONL files and performs `psutil` PID
  matching. This remains Python in port phase 1.
- `NotificationHub` is a lock-protected, edge-triggered state store, and
  `UDPListener` is independent from tkinter. Both can move to Rust without
  a UI dependency.
- Cursor remains a deliberate empty scanner and must remain so in this port.

## Corrections to make before Rust implementation

1. The 20-second notification anti-flap rule is now explicit in
   `notify_hub.py`: the needs-input visual state updates immediately, but a
   clear → needs-input transition for the same session cannot produce another
   toast until its cooldown expires. Port this rule alongside `clear`,
   `note_tool`, `retain_only`, and the 900-second stale expiry.
2. `MultiProgramScanner` currently exposes its synchronous refresh as private
   `_scan()`. `scanner_sidecar.py` uses it temporarily. Before packaging the
   sidecar, promote this to a small public `scan_once()` method so the IPC
   boundary never depends on a private implementation detail.
3. Do not port `WindowTerrain` in the initial Tauri milestone. Start avatars
   inside the overlay/dashboard bounds, then add cross-window terrain behind a
   feature flag after focus routing and dashboard use are proven.

## Dashboard shape

The dashboard should be a normal, maximizable Tauri window (not a constrained
HUD) with tabs:

1. **Overview** — program avatars, status, and sessions needing input.
2. **Sessions & agent tasks** — current sessions plus read-only `TodoWrite`
   extraction when that scanner enhancement lands.
3. **My work** — locally persisted personal release-manager checklist.
4. **Pull requests** — read-only Bitbucket work only after the planned auth
   and API research pass.
5. **Settings** — program visibility, skins, notifications, and later
   explicit integration credentials.

For a release-manager workflow, the maximized Overview should put the
attention queue first: items requiring a decision, blocked work, PR changes,
and the next release checkpoint. PR titles, descriptions, commits, and other
remote text must be rendered as data, never treated as instructions.

## Next implementation sequence

1. Install the Rust toolchain and Tauri Windows prerequisites.
2. Scaffold the Tauri app and wire its Rust backend to `scanner_sidecar.py`.
3. Add the maximizable dashboard shell and scan-event state store.
4. Port UDP input alerts, native notifications, tray, and focus routing.
5. Port avatar rendering and then the release-manager tabs incrementally.
