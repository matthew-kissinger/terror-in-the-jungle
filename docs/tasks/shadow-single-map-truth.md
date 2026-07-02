<!-- 80 LOC cap per framework recovery Pass 2 R1.2. -->
# shadow-single-map-truth

Wave L2 of the `lighting-truth-and-shadows` campaign (owner-approved MIDDLE PATH,
see `docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md`). Owner symptom: "I
don't really see many things with actual shadows." Fixes the ONE directional
shadow map the game has, and adds near-field billboard shadow proxies. NO CSM —
explicitly deferred by owner decision.

## Root cause fixed

The single ortho shadow camera follows the player and is placed at
`sunDir * SUN_LIGHT_DISTANCE (500m)`, but its frustum was a FIXED box with
`far = 300`. 300 < 500, so the ground beneath the player sat BEYOND the far plane
— most casters were clipped out of the map entirely. At grazing sun the depth
column the footprint projects onto stretches without bound, crushing precision
into acne. Plus GPU billboard vegetation cast zero shadow (custom vertex
expansion three.js can't derive a depth pass from).

## Files touched

- `src/systems/environment/atmosphere/ShadowCameraFit.ts` (new — pure elevation-aware near/far + slope-scaled bias math)
- `src/systems/environment/atmosphere/ShadowCameraController.ts` (new — per-frame light placement + fit + kill-switch restore; keeps AtmosphereSystem under the 700-LOC ceiling)
- `src/systems/environment/atmosphere/ShadowTruthConfig.ts` (new — `cameraTruth` + `billboardProxies` kill-switches, both default-ON)
- `src/systems/environment/AtmosphereSystem.ts` (delegate shadow-camera placement to the controller; publish flags; `getShadowCameraFit` debug read)
- `src/systems/world/billboard/NearFieldShadowProxies.ts` (new — depth-only cross-quad proxy casters within a near ring)
- `src/systems/world/billboard/GPUBillboardSystem.ts` (drive proxies each frame, gated on the flag)
- `src/systems/world/billboard/BillboardBufferManager.ts` (expose card size + instance scales for proxy sizing)
- `*.test.ts` for the fit math, the controller restore behavior, and the proxy caster set

## Scope

1. Elevation-aware fit: near/far straddle the 500m light distance so the ground under the player is always inside the map; far grows at low sun but is capped at 2.4x light distance; near stays positive.
2. Slope-scaled bias + normalBias grow toward the horizon (clears low-sun acne) and scale up for coarser shadow maps; horizontal ortho half-extent left as GameRenderer set it per GPU tier.
3. Near-field billboard proxies: nearest <=96 billboards within ~68m cast depth-only cross-quads into the single map (invisible in the color pass, no depth occlusion). Bounded, allocation-free scan.
4. Two kill-switches (`window.__shadowTruth.cameraTruth` / `.billboardProxies`), both default-ON; OFF restores the exact legacy box / stops proxies.
5. Dev-only throttled `ShadowFit` log + `getShadowCameraFit()` read so the owner walk can verify the effective frustum.

## Composition note

`computeTerrainShadowBoundRadius` (TerrainRenderRuntime) derives the CDLOD terrain
caster radius FROM `shadow.camera.far` — so this fit makes the 640m terrain bound
elevation-aware for free (grows at low sun, tightens at noon). No terrain edits.

## Non-goals

- CSM / cascades (owner-deferred; reassess after the walk).
- Light radiance / elevation gating, TerrainMaterial / BillboardNodeMaterial shading response (sibling wave `sun-elevation-light-gating`).
- NPC impostor castShadow: DEFERRED (L3). Enabling it risks perturbing the CombatantRenderer materialization tiers (2459-LOC grandfathered god-module); not worth the risk for this pass.
- TOD impostor tinting (L3 wave). Mobile `shouldEnableShadows` unchanged.

## Perf flip

If the MAIN-worktree combat120 capture regresses p99 at close, flip
`billboardProxies: true -> false` in `ShadowTruthConfig.ts` (one line). The two
flags are separate so a proxy-cost regression never reverts the camera/bias fix.
