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

---

## Animals (new - `animals/` directory)

6 animal GLBs completely rebuilt with proper scene hierarchy for procedural animation. Old models had all parts as flat siblings under root - unusable for rigging.

### Hierarchy Convention

Every animal uses named meshes in a parent-child hierarchy:

```
root
  body              <- main parent, all parts are children
    head            <- rotation.y for look direction
    front_left_leg  <- rotation.x for walk cycle
    front_right_leg <- rotation.x for walk cycle
    back_left_leg   <- rotation.x for walk cycle
    back_right_leg  <- rotation.x for walk cycle
    tail            <- rotation.z for swish
```

### Animation Integration

```typescript
// Find parts by name via traverse
animal.traverse((child: THREE.Object3D) => {
  if (child.name === 'front_left_leg') child.rotation.x = legAngle;
});

// Diagonal gait: FL+BR swing together, FR+BL swing opposite
const phase = (time / walkCycleDuration) % 1;
const legAngle = Math.sin(phase * Math.PI * 2) * 0.2; // ~0.2 rad amplitude
// front_left_leg.rotation.x = legAngle
// back_right_leg.rotation.x = legAngle
// front_right_leg.rotation.x = -legAngle
// back_left_leg.rotation.x = -legAngle

// Head look: head.rotation.y = lookAngle
// Tail swish: tail.rotation.z = Math.sin(time * 3) * 0.15
// Body bob: body.position.y += Math.sin(phase * Math.PI * 4) * 0.02
```

### Animal Models

| Model | File | Tris | Size | Animated Parts | Notes |
|-------|------|------|------|----------------|-------|
| Water Buffalo | `animals/water-buffalo.glb` | 288 | 32KB | 4 legs, head, tail | Large work animal. Shoulder hump. Horns on head. |
| Tiger | `animals/tiger.glb` | 352 | 42KB | 4 legs, head, tail | Low stance predator. Stripes on body. Green eyes. |
| Wild Boar | `animals/wild-boar.glb` | 300 | 37KB | 4 legs, head, tail | Compact build, high shoulders. Tusks on head. |
| King Cobra | `animals/king-cobra.glb` | 168 | 17KB | neck (sway) | No legs. Body coils on ground, raised neck + hood. Animate neck.rotation.y for sway. |
| Macaque | `animals/macaque.glb` | 252 | 23KB | left_arm, right_arm, head, tail, front_left_leg, front_right_leg | Sitting pose. Arms instead of front legs. |
| Egret | `animals/egret.glb` | 188 | 23KB | front_left_leg, front_right_leg, head, left_wing, right_wing, tail | Wading bird. 2 long legs (no back legs). Wings for optional flap. |

### Special Cases

- **Cobra**: No legs. Animate `neck.rotation.y` for side-to-side sway. Head and hood are children of neck.
- **Macaque**: Sitting pose with `left_arm`/`right_arm` instead of front legs. `front_left_leg`/`front_right_leg` are bent sitting legs.
- **Egret**: Only 2 legs (`front_left_leg`, `front_right_leg`). Has `left_wing`/`right_wing` for optional flap animation.

### Leg Pivot Note

Legs pivot from their geometric center (cylinder midpoint), not from the hip joint. This is a limitation of the primitive geometry system. At the small amplitudes used (0.15-0.25 rad), it looks natural. Keep walk cycle amplitude below 0.3 rad to avoid visible clipping with body.

### Model Registry Addition Needed

```typescript
// Add to modelPaths.ts
export const AnimalModels = {
  WATER_BUFFALO: 'animals/water-buffalo.glb',
  TIGER: 'animals/tiger.glb',
  WILD_BOAR: 'animals/wild-boar.glb',
  KING_COBRA: 'animals/king-cobra.glb',
  MACAQUE: 'animals/macaque.glb',
  EGRET: 'animals/egret.glb',
} as const;
```
