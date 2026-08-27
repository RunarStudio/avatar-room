#!/usr/bin/env python3
"""
Session picker -- shown when a program avatar is clicked and it has more
than one session (or more than one session needing input), so the click
knows which window to focus. Styled to match overlay.py's skin picker.

No app imports -- everything the caller needs (root, program, callback,
which ids need input) is injected, so this module has no dependency on
OverlayApp/Avatar.
"""

import tkinter as tk
from pathlib import Path

BG = "#0d0d1a"
FG = "#aaccff"
SEL = "#223366"
NEEDS_INPUT_COLOR = "#ff44dd"
FONT = ("Courier", 9)


def _session_label(session) -> str:
    if session.cwd:
        name = Path(session.cwd).name or session.cwd
    else:
        name = session.workspace_hash or session.short_id
    tool = f" →{session.tool[:10]}" if session.tool else ""
    return f"{name}  [{session.short_id}]  {session.status}{tool}"


def open_session_picker(root, program, on_pick, needs_input_ids=frozenset()):
    """Open a Toplevel listing every session of `program`. Clicking a row
    calls on_pick(session) then closes the picker. Rows whose session_id is
    in needs_input_ids render in magenta and sort first."""
    win = tk.Toplevel(root)
    win.title(f"{program.name} sessions")
    win.geometry("360x320+120+120")
    win.resizable(False, True)
    win.attributes("-topmost", True)
    win.configure(bg=BG)

    tk.Label(win, text=f"  {program.name} — choose a session:", bg=BG, fg=FG,
             font=("Courier", 10, "bold"), anchor="w").pack(fill="x", padx=10, pady=(10, 4))
    tk.Frame(win, bg="#223366", height=1).pack(fill="x", padx=10, pady=(0, 6))

    scroll_outer = tk.Frame(win, bg=BG)
    scroll_outer.pack(fill="both", expand=True, padx=10, pady=4)

    sb = tk.Scrollbar(scroll_outer, orient="vertical", bg=SEL,
                       troughcolor=BG, highlightthickness=0, bd=0)
    sb.pack(side="right", fill="y")

    sc = tk.Canvas(scroll_outer, bg=BG, highlightthickness=0, yscrollcommand=sb.set)
    sc.pack(side="left", fill="both", expand=True)
    sb.config(command=sc.yview)

    sf = tk.Frame(sc, bg=BG)
    sf_id = sc.create_window((0, 0), window=sf, anchor="nw")

    def _on_inner_configure(_e):
        sc.configure(scrollregion=sc.bbox("all"))
    def _on_canvas_configure(e):
        sc.itemconfig(sf_id, width=e.width)
    sf.bind("<Configure>", _on_inner_configure)
    sc.bind("<Configure>", _on_canvas_configure)

    def _on_mousewheel(e):
        sc.yview_scroll(int(-1 * (e.delta / 120)), "units")
    for w in (sc, sf):
        w.bind("<MouseWheel>", _on_mousewheel)

    sessions = sorted(
        program.sessions,
        key=lambda s: (s.session_id not in needs_input_ids, -s.last_seen),
    )

    if not sessions:
        tk.Label(sf, text="No active sessions.", bg=BG, fg="#556677", font=FONT).pack(anchor="w")

    def _pick(s):
        win.destroy()
        on_pick(s)

    for s in sessions:
        needy = s.session_id in needs_input_ids
        row = tk.Frame(sf, bg=BG, cursor="hand2", pady=4)
        row.pack(fill="x")
        lbl = tk.Label(row, text=_session_label(s), bg=BG,
                        fg=NEEDS_INPUT_COLOR if needy else FG,
                        font=("Courier", 9, "bold" if needy else "normal"),
                        anchor="w", justify="left")
        lbl.pack(fill="x", padx=4)
        for widget in (row, lbl):
            widget.bind("<Button-1>", lambda _e, s=s: _pick(s))
            widget.bind("<MouseWheel>", _on_mousewheel)
            widget.bind("<Enter>", lambda _e, r=row: r.config(bg=SEL))
            widget.bind("<Leave>", lambda _e, r=row: r.config(bg=BG))

    win.bind("<Escape>", lambda _e: win.destroy())
    win.focus_force()
    return win
