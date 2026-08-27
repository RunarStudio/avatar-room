# Claude Code Hooks Integration

AI Avatar Room polls Claude Code session files every 2 seconds by default. For **instant** status updates — most importantly, an immediate alert the moment Claude is waiting on you — it also listens on a UDP socket that Claude Code hooks push events to.

This is live as of v0.5 (unlike `zz_cli_avatars`, where this was documented but never actually built).

---

## How it works

Claude Code runs registered hook commands at specific points in the agent lifecycle, passing event data as **JSON on stdin** (not as shell arguments — this tripped up the original `claude_hooks_example.py`, which read `sys.argv` and could never carry a `session_id`).

`hooks/avatar_room_hook.py` reads that stdin JSON and forwards a small UDP packet to `127.0.0.1:47200`, where `overlay.py`'s `UDPListener` picks it up and updates the right program avatar within one frame (~50ms).

---

## Setup

### Step 1 — Register the hooks

Add to `~/.claude/settings.json` (global — recommended, since the overlay watches all your Claude Code sessions) or a project's own `.claude/settings.json`:

```json
{
  "hooks": {
    "Notification":     [{"hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "UserPromptSubmit": [{"hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "Stop":             [{"hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "SessionEnd":       [{"hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "PreToolUse":       [{"matcher":"*","hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}],
    "PostToolUse":      [{"matcher":"*","hooks":[{"type":"command","command":"\"C:\\path\\to\\pythonw.exe\" \"C:\\path\\to\\zz_avatar_room\\hooks\\avatar_room_hook.py\""}]}]
  }
}
```

Two things that matter here, both easy to get wrong:

- **Use `pythonw.exe`, not `python.exe`.** `python.exe` pops a console window on every single tool call. `pythonw.exe` (same install, no console) runs silently. Find yours next to your normal `python.exe` — same folder, `pythonw.exe` instead.
- **Use an absolute path to the script.** Hooks run with the *project's* directory as cwd, not this one, so a relative path breaks depending on which project you're in.

### Step 2 — Run the overlay

```bash
python overlay.py
```

It binds UDP port 47200 on startup. If something else already has that port (a second overlay instance), it prints a warning and falls back to 2-second polling only — Claude Code is unaffected either way.

---

## Packet format

One UTF-8 JSON datagram per hook event, sent to `127.0.0.1:47200`:

```json
{"program": "claude", "event": "Notification", "session_id": "<full-uuid>",
 "cwd": "C:\\path\\to\\project", "message": "Claude needs your permission to use Bash",
 "tool": "", "ts": 1756240000.0}
```

`session_id` is the **full UUID** Claude Code assigns the session (matches the session's `.jsonl` filename exactly) — not the 8-character short id shown in the UI/HUD.

| Claude hook event | Effect |
|---|---|
| `Notification` | Marks the session as needing input. Avatar goes magenta, stops moving, blinks `!`. Fires a toast (rate-limited to one per 20s per session). |
| `UserPromptSubmit` | Clears needs-input for that session — you answered. |
| `PreToolUse` / `PostToolUse` | Clears needs-input, records the tool name for the HUD/avatar label. |
| `Stop` | Marks the turn ended. Does **not** toast by default (`TOAST_ON_STOP = False` at the top of `overlay.py`) — `Stop` fires after every single turn, and the real "needs input" sequence is `Notification → PreToolUse → … → Stop`, so `PreToolUse` already clears the flag before `Stop` arrives. Flip that constant if you'd rather be pinged whenever it's generally "your turn." |
| `SessionEnd` | Clears the session's hub entry entirely. |

Unknown/malformed packets are silently ignored — a hook can never crash or block the overlay, and the overlay can never block Claude Code (the hook script always exits 0 no matter what).

---

## Why hooks vs. polling

| Method | Latency | Setup |
|--------|---------|-------|
| Polling (always on) | ~2 seconds | None |
| Hooks (UDP) | ~1 frame (~50ms) | Register hooks once in `settings.json` |

Polling alone is fine for a passive "is Claude busy" glance. Hooks matter specifically for the needs-input alert — that's the case where a 2-second delay before you notice you're being ignored actually costs you something.

---

## Troubleshooting

**A console window flashes every tool call:** you registered with `python.exe` instead of `pythonw.exe`. Swap it.

**Nothing happens when Claude asks for permission:** confirm the overlay is running first (hooks fire regardless, but a UDP packet with nobody listening is just dropped — check the overlay's console output for `[overlay] UDP 47200 unavailable` on startup, meaning something else is bound to that port).

**Hooks fire in one project but not another:** you registered them in that project's local `.claude/settings.json` instead of the global `~/.claude/settings.json`. Move the config to global if you want every session watched.

**I want a different port:** change `PORT = 47200` in both `hooks/avatar_room_hook.py` and `udp_listener.py`.
