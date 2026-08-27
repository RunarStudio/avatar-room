# Avatar Roster — Curate This

Every skin/character asset imported so far. Mark keep/drop per row.

## Wired (Stage 1)

| Skin | Assigned to | Source | Status |
|---|---|---|---|
| `caine` | **Claude avatar** | `Sprites/caine.png` (auto-extracted from `Images/char_caine.png`) | Wired |
| `bubble` | **Cursor avatar** | `Sprites/bubble.png` (auto-extracted from `Images/char_Bubble.png`) | Wired |
| `amongo` | **Subagent avatar** (`SUBAGENT_SKIN` in `overlay.py`) | `Sprites/amongo.png` (auto-extracted from `Images/Amongo Cat.png`) | Wired |

## Ready to use, unassigned

| Skin | Source | Cell size | Keep? |
|---|---|---|---|
| `meowatar` | `Sprites/meowatar.png` | 60×50 | |
| `michimaru` | `Sprites/Michimaru.png` | 40×51 | |
| `ponmi` | `Sprites/ponmi.png` | 48×48 | |

## Unidentified, copied but unused

| File | Note |
|---|---|
| `Images/char_cc.png` | Copied early on a wrong guess that it was Amongo's source (it's actually `Images/Amongo Cat.png` — now also copied and correctly wired above). Not currently referenced by any extractor. Keep if you recognize the character, otherwise safe to delete. |

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

Once curated, tell me keep/drop per row and I'll wire the kept ones the same way `caine`/`bubble`/`amongo` already are.
