<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-29-cinematic-field-pass.md (Phase 6). -->
# cycle-2026-06-29-visual-post-stack

Phase 6 — the highest-leverage visual win: fill the currently no-op
post-processing shim (`PostProcessingManager` is empty; `setupPostProcessing()`
sets `postProcessing = undefined`) with a real TSL node post-stack — filmic color
grade, bloom, atmospheric depth — that ties terrain, foliage, NPCs and VFX
together for the first time. The only phase touching the combat hot path, so it
ships default-OFF behind a kill-switch and must prove a neutral `combat120` p99.

## Files touched

- `src/systems/effects/NodePostProcessing.ts`, `post/BloomPass.ts`, `post/ColorGradePass.ts`, `HeightFogNode.ts`, `AtmosphereScreenProjection.ts` (+ tests, new)
- `src/core/GameRenderer.ts`, `src/systems/effects/PostProcessingManager.ts`
- `src/systems/.../MuzzleFlashSystem.ts`, `ExplosionEffectFactory.ts`

## Scope

1. P6a — `NodePostProcessing` = filmic `ColorGradePass` (ship THREE grade LUTs behind `?post=`/WorldBuilder A/B for owner playtest) + tier-gated `BloomPass` + vignette; wire `setupPostProcessing`, read the LIVE `this.renderer`, handle device-loss/backend-swap teardown; default-OFF behind kill-switch, mobile-off.
2. P6b — `HeightFogNode` in a NEW sibling module (do NOT grow `TerrainMaterial.ts` 1192 / `AtmosphereSystem.ts` ~698, both at ceiling); raise muzzle/explosion luminance above the bloom threshold; ensure bloom runs after the `autoClear=false` weapon overlay.
3. Prove neutral p99 across MULTIPLE `combat120` captures behind the kill-switch, then flip default-on for desktop only.

## Non-goals

- NO fence change (`IGameRenderer.postProcessing?: any` already exists — filling the shim is additive).
- God-rays / heat-haze / DOF are DEFERRED to a P6c escalation (owner-gated).
- Post is scoped to the unified WebGPURenderer (+ its internal WebGL2 fallback) ONLY; the `?renderer=webgl` diagnostic path gets no post.

## Acceptance

- [ ] Post stack renders; all 3 grade LUTs A/B-switchable; muzzle/explosion bloom visible.
- [ ] `combat120` p99 neutral across multiple captures with the stack on (behind kill-switch), then default-on-desktop.
- [ ] `check:tod-coherence` re-validated after the grade lands; `lint && test:run && build` green; fence-safe.
- [ ] Owner picks the LUT in playtest (deferred to `docs/PLAYTEST_PENDING.md`).

## Dependencies

- Depends on: `cycle-2026-06-29-cinematic-foundations` (TSL lib). Hot-path → lands last, perf-gated.
