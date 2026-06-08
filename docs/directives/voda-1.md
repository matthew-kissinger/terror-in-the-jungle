# VODA-1 — Visible water surface and query API

Status: code-complete (owner playtest deferred)
Owning subsystem: environment / water
Opened: cycle-2026-05-04
Code-complete: cycle-voda-1-water-shader-and-acceptance 2026-05-16

## Latest evidence

5 PRs landed under `cycle-voda-1-water-shader-and-acceptance` — R1: #228 `dfee8d64` terrain-water-intersection-mask (terrain-side wet-sand soft-blend 1.5m + water-side foam line 0.8m, opt-in default-off binding so pre-VODA-1 visuals byte-identical when unbound), #229 `62db21c2` water-surface-shader (production `MeshStandardMaterial` + `onBeforeCompile` patch chosen over TSL node material to preserve `?renderer=webgl` escape hatch and avoid mobile node-material cost regression; composed with #228's foam patch into single `installWaterMaterialPatches()` callback at rebase time so both inject); R2: #231 `ca679273` hydrology-river-flow-visuals (per-vertex `aFlowDir`/`aFoamMask` attributes baked at geometry-build + `installHydrologyRiverFlowPatch` shader patch with UV-scrolled normal sampling), #232 `f14400d2` water-system-file-split (WaterSystem.ts 1125 LOC → 300 LOC orchestrator + 5 modules ≤300 LOC each: HydrologyRiverSurface 144, HydrologyRiverGeometry 222, HydrologyRiverFlowPatch 178, WaterSurfaceBinding 299, WaterSurfaceSampler 146; grandfather entry removed from `scripts/lint-source-budget.ts`; 11 existing WaterSystem.test.ts pass byte-identical + 17 new sibling tests across the new modules), #230 voda-1-playtest-evidence (`docs/playtests/cycle-voda-1-water-shader-and-acceptance.md` + `scripts/capture-voda-1-water-shots.ts` + PLAYTEST_PENDING.md row). **No `WebGLRenderTarget` reflection pass added anywhere** (mobile no-RT win documented in `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md` item 8 preserved). Owner walk-through deferred under autonomous-loop posture; full `done` promotion blocks on owner walk + `evidence:atmosphere` re-run + `terrain_water_exposure_review` resolution confirmation per PLAYTEST_PENDING row.

## Success criteria

- [x] `WaterSystem` renders a visible water surface across Open Frontier and A Shau, lit by `AtmosphereSystem`, with no clipping artifacts at terrain intersections (foam-line + terrain-side soft-blend land in #228; surface shader in #229).
- [x] Hydrology channels drive water-surface placement (already shipped pre-cycle; visible flow added in #231).
- [x] Public query API present: `isUnderwater(pos)`, `getWaterDepth(pos)`, `getWaterSurfaceY(pos)`, and `sampleWaterInteraction(pos)` for future physics/gameplay consumers (preserved through #232 split — `WaterSurfaceSampler.ts` owns the impl; `WaterSystem` orchestrator delegates).
- [ ] `evidence:atmosphere` regenerates with water visible and zero browser errors (owner-sweep verification deferred to PLAYTEST_PENDING).
- [ ] Open Frontier `terrain_water_exposure_review` overexposure flags resolved (owner-sweep verification deferred to PLAYTEST_PENDING).

## 2026-05-21 polish-pass amendment

The `water-hydrology-polish` doctor pass (PRs [#313](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/313) / [#314](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/314) / [#315](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/315), merged 2026-05-21) is now superseded as the gameplay-water authority by the terrain/vehicle/water foundation reset and the 2026-06-08 basin-water rearch. Open Frontier and A Shau accepted gameplay water comes from authored level/depth basin bodies with carved bathymetry and `water_body` samples; hydrology remains drainage/material input and a diagnostic source, not the visible accepted river surface. The global sea-level plane remains opt-in only. This directive **stays `code-complete (playtest deferred)`** because the water shader/sampler/flow work shipped, while owner playtest and the broader authored-water feel pass remain separate gates.
