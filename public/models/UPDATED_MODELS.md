# Updated Models - 2026-03-16

9 GLB models regenerated from pixel-forge to fix playtest issues (PLAYTEST_ISSUES.md #3 and #7).

## What Changed

### Towers (Issue #3 - broken scales/braces)

All 3 towers had cross braces that were floating/sticking out randomly. The original prompts used vague positioning ("diagonal between legs") which produced misaligned geometry.

**Fix:** Replaced diagonal X-braces with clean horizontal brace rings at multiple Y heights. Legs, platforms, sandbags, roofs unchanged.

| Model | File | Tris | Size | Change |
|-------|------|------|------|--------|
| Guard Tower | `structures/guard-tower.glb` | 412 | 54KB | 3 horizontal brace rings at Y=1.5, 3.0, 4.5. Ladder tilt fixed (leans against tower, not away). |
| Water Tower | `structures/water-tower.glb` | 392 | 48KB | 2 horizontal brace rings at Y=1.3, 2.7. Same tank/pipes/ladder. |
| Comms Tower | `structures/comms-tower.glb` | 208 | 25KB | Removed guy wires (compound Euler rotations couldn't connect endpoints correctly at 0.01 unit width). Kept anchor blocks as ground detail. Mast, cross arms, dipoles unchanged. |

### M60 Machine Gun (Issue #7)

Old model had bipod legs floating below and disconnected from the gun body, and the front iron sight was floating above the barrel.

| Model | File | Tris | Size | Change |
|-------|------|------|------|--------|
| M60 | `weapons/m60.glb` | 280 | 36KB | Bipod folded forward along barrel (not deployed). Sight has a base piece connecting it to barrel surface. Gas block repositioned to sit on barrel. |

### Bunkers (no doors)

TOC bunker, sandbag bunker, and NVA bunker had solid box walls with dark "entrance" boxes painted on - no actual door openings. Since boxGeo can't have holes, the fix splits front walls into segments with gaps.

| Model | File | Tris | Size | Change |
|-------|------|------|------|--------|
| TOC Bunker | `structures/toc-bunker.glb` | 272 | 37KB | Front wall split into left + right + lintel segments with door gap in center. Door frame added. |
| Sandbag Bunker | `structures/sandbag-bunker.glb` | 100 | 14KB | Front wall split into lower + upper with firing slit gap (Y=0.9 to Y=1.2). Open rear (U-shape). |
| NVA Bunker | `buildings/bunker-nva.glb` | 244 | 30KB | Mound split into rear + front-left + front-right + above-door sections. Actual entrance gap with log frame. |
| Ammo Bunker | `structures/ammo-bunker.glb` | 192 | 25KB | New model with split mound entrance, ajar door, vent pipe, revetment. |

### Perimeter Berm (new)

| Model | File | Tris | Size | Change |
|-------|------|------|------|--------|
| Perimeter Berm | `structures/perimeter-berm.glb` | 396 | 25KB | New model. Earth wall 8m long with front/back slopes, sandbag top, firing step, concertina wire stakes and coils. |

## Implementation Notes

- All models: Y-up, face +Z, ground at Y=0, flatShading materials
- These are drop-in replacements for existing models (same filenames, same paths)
- The perimeter-berm is new and needs to be registered in the structure registry if not already present
- Tower scale issue (PLAYTEST_ISSUES.md #3): the models themselves are correctly proportioned now. If the 3-layer scale chain (native * STRUCTURE_SCALE * displayScale) still produces wrong sizes, adjust displayScale values - the native GLB dimensions are intentional.
- Sandbag bunker is now only 100 tris (was 244) - the firing slit gap removed some wall geometry
- Comms tower is now 208 tris (was 244) - simpler without guy wires
