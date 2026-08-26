# AI Avatar Room — Claude Code Project Guide

Forked from `../zz_cli_avatars/` (v0.4). Full vision: `../10 - Projects/AI Avatar Room - Design.md`. Shared history/architecture reference: `../zz_cli_avatars/CLAUDE.md`.

**Current state: draft fork, pre-refactor.** `overlay.py`/`sprite_loader.py` are unmodified copies of `zz_cli_avatars` as of the fork date — the one-avatar-per-program rework, UDP listener, and notification pipeline described in the design doc are not yet implemented here. See the Stage 1 implementation plan (produced via a Fable→Opus planning pass) for the exact file-by-file breakdown before writing code.

## What changes vs. `zz_cli_avatars`

- One avatar per **program** (Claude, Cursor), not per session — `SessionScanner` gets replaced by a `MultiProgramScanner` that aggregates sessions per program.
- v1 skins: `caine` = Claude avatar, `bubble` = Cursor avatar (see `ROSTER.md` for the rest of the imported roster, pending curation).
- A UDP listener on `127.0.0.1:47200` actually gets wired up this time (`zz_cli_avatars` sends events via `claude_hooks_example.py` but nothing has ever consumed them).
- Windows toast notifications on "needs input," structured so Stage 3 (Jira/Bitbucket) can plug into the same dispatcher later.

## Roster

See `ROSTER.md` — full imported asset list, curate keep/drop before wiring anything beyond the two v1 defaults.

## Run (current, unmodified fork)

```bash
pip install -r requirements.txt
python overlay.py
```

Same behavior as `zz_cli_avatars` today until the Stage 1 refactor lands.
