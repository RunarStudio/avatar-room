# overlay.spec
# Build a standalone Windows app folder:
#   pip install pyinstaller   (>= 6.16 required for Python 3.14)
#   pyinstaller overlay.spec --noconfirm
#
# Output: dist/avatar_room/avatar_room.exe  (folder build, not a single file)
#
# Deliberately onedir, not onefile (unlike zz_cli_avatars/overlay.spec):
# a onefile exe self-extracts to a fresh %TEMP% dir on EVERY launch, which
# is fine for an occasional manual run but wrong for something auto-started
# at every Windows login (unpack + AV-scan tax on every boot). Onedir still
# means one double-click / one Startup-folder shortcut, just faster.
#
# Debug build: copy this file, flip console=False -> True below, so
# print()/tracebacks are visible instead of swallowed by the windowed exe.

import os

block_cipher = None

SPRITES_DIR = "Sprites"
SPRITES = [
    (os.path.join(SPRITES_DIR, f), SPRITES_DIR)
    for f in os.listdir(SPRITES_DIR)
    if f.lower().endswith(".png")
]

IMAGES_DIR = "Images"
IMAGES = [
    (os.path.join(IMAGES_DIR, f), IMAGES_DIR)
    for f in os.listdir(IMAGES_DIR)
    if f.lower().endswith(".png")
] if os.path.isdir(IMAGES_DIR) else []

a = Analysis(
    ["overlay.py"],
    pathex=["."],
    binaries=[],
    datas=SPRITES + IMAGES + [
        ("sprite_loader.py", "."),
        ("session_scanner.py", "."),
        ("notify_hub.py", "."),
        ("notifications.py", "."),
        ("udp_listener.py", "."),
        ("session_picker.py", "."),
        ("Caine_Icon.ico", "."),
        ("Caine_Icon.png", "."),
    ],
    hiddenimports=["PIL._tkinter_finder", "pystray", "pystray._win32"],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,   # onedir: binaries/data go to COLLECT() below, not into the exe itself
    name="avatar_room",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,      # no terminal window on launch -- flip to True for a debug build
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="Caine_Icon.ico",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="avatar_room",
)
