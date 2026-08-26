# Avatar Roster — Curate This

Every skin/character asset imported so far. Mark keep/drop per row. Nothing here is wired into code yet except the two v1 defaults.

## Assigned (v1 defaults)

| Skin | Assigned to | Source | Status |
|---|---|---|---|
| `caine` | **Claude avatar** | `Sprites/caine.png` (auto-extracted from `Images/char_caine.png`) | Wired in `zz_cli_avatars`, carries over as-is |
| `bubble` | **Cursor avatar** | `Sprites/bubble.png` (auto-extracted from `Images/char_Bubble.png`) | Wired in `zz_cli_avatars`, carries over as-is |

## Ready to use, unassigned

| Skin | Source | Cell size | Keep? |
|---|---|---|---|
| `amongo` | `Sprites/amongo.png` (from `Images/char_cc.png` — Amongo Cat) | 40×40 | |
| `meowatar` | `Sprites/meowatar.png` | 60×50 | |
| `michimaru` | `Sprites/Michimaru.png` | 40×51 | |
| `ponmi` | `Sprites/ponmi.png` | 48×48 | |

## Referenced but missing on disk

| Skin | Note |
|---|---|
| `bunnylot` | `overlay.py` expects `Sprites/BunnyLot.png` (40×56 cells) — not present in `zz_cli_avatars/Sprites/`. Raw art now copied to `zz_avatar_room/Images/BunnyLot.png`, but needs frame-mapping (like the `caine`/`amongo` extractors) before it'd actually load. |

## Newly found, not wired at all (from the archived PixelCircus project)

Copied into `zz_avatar_room/Sprites_import/` as raw source art — none of these have a Stream-Avatars-format sheet or an extractor function yet. Curate first; only build extractors for the ones you keep.

| File | Likely character | Keep? |
|---|---|---|
| `char_AmongoCat.png` | Amongo (alt/PixelCircus version — compare against `amongo` above, may be redundant) | |
| `char_bubble_circus.png` | Bubble, circus-outfit variant | |
| `char_caine_circus.png` | Caine, circus-outfit variant | |
| `char_Meowatar.png` | Meowatar (alt/PixelCircus version — compare against `meowatar` above) | |
| `char_Michimaru.png` | Michimaru (alt/PixelCircus version) | |
| `char_ponmi.png` | Ponmi (alt/PixelCircus version) | |
| `char_Sinner.png` | Sinner — new character, no existing `zz_cli_avatars` skin at all | |

## Preview GIFs (reference only, not skins)

Copied as-is: `meowatar_preview/`, `ponmi_preview/` — animation reference GIFs for those two skins, not separate characters.

---

Once curated, tell me keep/drop per row and I'll wire the kept ones into `sprite_loader.py`'s `_load_sprites()` the same way `caine`/`bubble`/`amongo` already are.
