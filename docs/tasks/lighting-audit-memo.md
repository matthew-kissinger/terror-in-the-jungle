<!-- cycle-2026-06-09-lighting-rig-spike R1 -->
# lighting-audit-memo

The lighting-rig campaign (`docs/CAMPAIGN_2026-06-09-lighting-rig.md`) needs
its design ratified before any migration: today four material families light
themselves through divergent models off one snapshot. This memo is the
campaign's contract — Phase 1-4 briefs are authored from it.

## Files touched

- New design memo under `docs/rearch/` named
  `LIGHTING_RIG_SPIKE_2026-06-09` (docs only; read-only on `src/`)

## Scope

1. **Inventory:** every consumer of `AtmosphereLightingSnapshot` and every
   clamp / compression / emissive hack / second authority in the lighting
   path, each with a file reference. Start set (verify + extend):
   `src/systems/environment/AtmosphereSystem.ts` (snapshot build + scene
   lights), `src/systems/environment/AtmosphereLightingColor.ts`
   (`shapeDirectLightForRenderer` ~0.78 neutral compression),
   `src/systems/terrain/TerrainMaterial.ts` (night-fill emissive, horizon
   occlusion, roughness floor), `src/systems/world/billboard/BillboardNodeMaterial.ts`
   ([0.40, 0.78] clamps, fixed hemisphere blend),
   `src/systems/combat/CombatantShaders.ts` (`resolveNpcAtmosphereSnapshot`
   scene-children scan), `src/core/SystemUpdater.ts` (wiring points).
2. **Rig spec:** concrete fields + units for the unified lighting state (sun
   direction + radiance, sky/ground irradiance, ambient, fog), the shared TSL
   uniform-block binding API, and the wrapped-Lambert form for unlit-family
   migration. Name the new module (location under
   `src/systems/environment/`) and its update point in the frame.
3. **Exposure policy:** where energy is handled (AGX retained; one global
   TOD-aware exposure; no mid-pipeline compression), incl. the night floor.
4. **Migration order + deletion list:** map each inventory item to the
   campaign phase that absorbs or deletes it; flag any the campaign missed.
5. **Coherence band:** propose the numeric tolerance the TOD harness should
   enforce (per-family luminance correlation / range ratio vs terrain).

## Non-goals

- No code changes whatsoever (`src/` is read-only for this task).
- No water/weather speculation (water rework stays deferred).
- No re-litigating AGX or the Hosek-Wilkie backend — both are keepers.

## Acceptance

- [ ] Memo lands under `docs/rearch/`, ≤400 lines, every inventory row has a
      file reference that exists.
- [ ] `npm run check:doc-drift` and `npm run lint:docs` pass.
- [ ] `npm run lint && npm run test:run && npm run build` all pass (no-op on
      code, but proves a clean tree).
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Informs: `rig-prototype` (R2 of this cycle) and all Phase 1-4 briefs.
