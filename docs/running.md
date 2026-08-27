# Running AI Avatar Room Day to Day

Two ways to run it: for development, plain `python overlay.py`. For actual daily use, a packaged exe that starts with Windows so it's just always there — that's what this doc covers.

---

## Dev mode

```bash
pip install -r requirements.txt
python overlay.py
```

Fine for iterating on code. Not what you want for daily use — see below for why.

---

## Building the packaged app

Requires PyInstaller 6.16+ (for Python 3.14 support):

```bash
pip install pyinstaller
pyinstaller overlay.spec --noconfirm
```

Output: `dist/avatar_room/avatar_room.exe` — a folder, not a single file. That's deliberate (see the comment at the top of `overlay.spec`): a single-file exe re-extracts itself to a fresh temp directory on every launch, which is fine occasionally but pays an unpack-and-antivirus-scan cost every time — wrong for something that starts automatically at every Windows login. The onedir build still launches with one double-click.

**Debug build**: if something breaks in the packaged exe but not in `python overlay.py`, copy `overlay.spec`, flip `console=False` to `console=True`, and rebuild — with `console=False` every `print()` and unhandled exception is invisible.

---

## Running at login

1. Build as above.
2. Press `Win+R`, type `shell:startup`, hit enter — this opens your Startup folder.
3. Create a shortcut to `dist/avatar_room/avatar_room.exe` inside it.

That's it — it now launches automatically every time you log in and sits in the tray.

---

## Known limitations (documented, not solved in Stage 1)

**Windows SmartScreen warning on first run.** The exe isn't code-signed, so Windows will show "Windows protected your PC" the first time you run it. Click "More info" → "Run anyway". This is a one-time prompt per machine.

**Can't focus an elevated terminal.** If a Claude Code session is running in a terminal launched "as Administrator" and the overlay itself is not elevated, clicking its avatar will silently fail to bring that window forward. This is Windows UIPI (User Interface Privilege Isolation) blocking `SetForegroundWindow` across integrity levels, not a bug in the overlay — there's no fix here short of running the overlay elevated too, which isn't worth the tradeoff for Stage 1.

**No auto-update.** Rebuilding and re-copying the exe after a code change is a manual step. Given this is built at night and used during the day, that's an acceptable rhythm for now — revisit if it becomes annoying.
