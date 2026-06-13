<!-- Runtime release record. Source: current master + Fable5/TIJ world-system evidence, 2026-06-13. -->
# cycle-2026-06-13-world-systems-runtime-release

Status: active runtime release candidate with local proof complete. This cycle
converts the safe Fable/world-systems reference work into player-facing TIJ
improvements where the gate is strong enough, and marks every risky lane
default-off or no-go.

Worktree: `C:\Users\Mattm\X\games-3d\terror-in-the-jungle-fable-debug-proofs`
on `master`.

## Goal

Ship active gameplay/visual changes to production, not another docs-only
decision record. The release closes only after accepted code/docs are committed
to `master`, pushed, deployed with `npm run deploy:prod`, and proven live by
`npm run check:live-release`.

## Runtime Ship Scope

| Lane | Release action | Notes |
|---|---|---|
| Vegetation / grass / trees | Ship the existing accepted jungle vegetation aggregate LOD pass from `cycle-2026-06-13-jungle-vegetation-aggregate-lod`. | `JungleGroundRing`, far-canopy coverage, `fanPalm`/`coconut` canopy tier, and lower vegetation residency are accepted engineering scope. Broadleaf/rubber/banyan/mangrove/elephant-grass source assets remain blocked until accepted assets exist. |
| Forest strategy | Adapt strategy, not code wholesale. | Current release uses TIJ-owned ground ring, coverage-preserving thinning, far canopy coverage, and aggregate LOD planning. No Fable `Forests` port, no true meshlet Nanite. |
| Asset strategy | No new GLBs are imported in this runtime slice. | Existing accepted vegetation assets stay; rejected or source-blocked families remain documented. Any later asset change must go through `assets:import-war-catalog` or the vegetation atlas pipeline, not hand-copy. |
| Lighting / sky / clouds / post | Ship a safe sky-dome cloud contribution retune only. | The deeper WebGPU-only sky/cloud/post stack stays matrix-gated and default-off. This runtime slice improves cloud visibility inside the existing atmosphere path. |
| Terrain / heightfield / erosion | Keep diagnostic/reference-only. | No terrain ownership swap. `HeightfieldErosionAuthoritySpike` remains non-authoritative and non-mutating over TIJ terrain. |
| Water / hydrology | No runtime water. | Debug water proof remains diagnostic only. Gameplay water/hydrology stays stripped pending a dedicated first-principles water cycle. |
| WebGPU architecture | Preserve WebGPU-first policy without splitting the project. | Existing `RendererFeatureProfile` and sky/cloud/post proof gate keep new advanced visuals WebGPU-gated without forcing duplicate WebGL2 work. |
| Weapon pose | Lower all first-person weapon/viewmodel hip presentation. | Shared rig base position sits lower/farther down, and non-ADS pitch is reduced so barrels point lower. ADS remains level. |
| Vehicle feel | Ship arcade-hybrid baseline for wheeled and tracked vehicles. | Ground/tracked physics now add lateral grip, slope-drive floor, and reduced grounded slope gravity. M151, M35/ZIL, and M113 profiles are retuned for less drift and better hill authority. The shared ground follow camera is pulled back/up for trucks/APCs. |
| Truck / tank clarity | Verify in tests and docs; owner feel walk remains required. | M35/ZIL/M113 use the real ground-vehicle drive path when promoted by `WorldFeatureSystem`; Zone Control tank boardability/faction ambiguity remains a playtest item unless the runtime proof proves it cleanly. |

## No-Go / Default-Off Lanes

- No wholesale Fable assets or generated species copied into TIJ runtime.
- No runtime water or hydrology reactivation.
- No terrain authority swap.
- No default-on WebGPU cloud/post replacement.
- No full Forests port.
- No true meshlet Nanite.
- No new vegetation GLB imports in this slice without accepted source assets and
  importer proof.

## Evidence So Far

- Focused runtime suite PASS:
  `npm exec vitest -- run src/systems/player/weapon/WeaponAnimations.test.ts src/systems/player/weapon/WeaponModel.test.ts src/systems/vehicle/GroundVehiclePhysics.test.ts src/systems/vehicle/TrackedVehiclePhysics.test.ts src/core/RendererFeatureProfile.test.ts src/systems/environment/SkyCloudPostProofGate.test.ts src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/AtmosphereSystem.test.ts`
  (8 files / 157 tests).
- `npm run validate:fast` PASS on the final runtime tree
  (404 files / 5967 tests; doc-drift warnings only, failing=0).
- `npm run validate` PASS on the final runtime tree, including lint, full
  Vitest, retail build, asset manifest, and local production smoke.
- Land-vehicle runtime proof PASS after the support-vehicle camera retune:
  `npx tsx scripts/check-land-vehicle-runtime.ts --port=9146`, artifact
  `artifacts/playtests/land-vehicle-runtime-proof/land-vehicle-runtime-proof.json`.
- Vegetation gates PASS:
  `npm run check:vegetation-horizon`
  (`artifacts/perf/2026-06-13T22-19-57-523Z/vegetation-horizon-audit/horizon-audit.json`)
  and `npm run check:vegetation-grounding`
  (`artifacts/perf/2026-06-13T22-19-57-677Z/vegetation-grounding-audit/summary.json`).
- Lighting/cloud safety gate PASS:
  `npm run check:tod-coherence`
  (`artifacts/lighting-rig/tod-sweep/gate/verdict.json`); GLB range-ratio
  remains advisory while foliage/NPC hard checks pass.
- Browser smoke/playtest PASS with the standard `develop-web-game` Playwright
  client against a perf preview:
  `artifacts/playtests/web-game-client-world-release-clean/shot-0.png` and
  `state-0.json` show AI Sandbox gameplay with vegetation, sky, HUD, and the
  lowered weapon visible; no blocking console/page errors were recorded.
- Startup gate PASS:
  `npm run perf:startup:openfrontier`,
  `artifacts/perf/2026-06-13T23-07-48-749Z/startup-ui-open-frontier`;
  mode-click-to-playable measured about 4.88s.
- Perf/no-go classification:
  `npm run perf:quick` produced trusted telemetry but failed strict all-green
  only on heap recovery (16.4% reclaimed before end) with p99 warning
  (32.20ms) and no >50ms/>100ms hitches, no console errors, and 0% over-budget
  frames. A CDP forced-GC diagnostic at
  `artifacts/perf/2026-06-13T23-11-04-911Z` showed heap recovery passes
  (99.1%) but is diagnostic-only because CDP overhead distorted frame-tail and
  harness counts. `npm run check:memory` is stale against current deploy flows
  and is not release evidence this cycle.

## Required Local Gates Before Push

- `npm run validate:fast` - PASS.
- `npm run validate` - PASS.
- Focused runtime suite above, if broader test failure needs isolation.
- `npm run check:tod-coherence` - PASS.
- `npm run check:vegetation-horizon` - PASS.
- `npm run check:vegetation-grounding` - PASS.
- Land-vehicle runtime proof over Open Frontier and A Shau, plus Zone Control
  tank/truck spot-check if the harness supports it - Open Frontier / A Shau
  support-vehicle proof PASS; Zone Control tank ownership/boardability remains
  an owner playtest clarity item.
- Browser smoke/playtest screenshot pass for the changed player-facing surfaces
  using the standard Playwright client - PASS.
- Perf captures as feasible for Open Frontier and A Shau; strict memory helper
  and p99 all-green are no-go/carry-forward items, not silent blockers for the
  safe runtime fixes.

## Release Closeout

The cycle is not complete at local green. Close only after:

- Commit accepted code/docs on `master`.
- Push `master`.
- Run exact-HEAD CI, using `npm run ci:manual` if the push does not trigger a
  blocking CI run.
- Run `npm run deploy:prod`.
- Run `npm run check:live-release` and record the deployed SHA.

## Acceptance

- [x] Runtime changes exist for weapon pose, vehicle feel, and sky/cloud
      readability.
- [x] Existing vegetation aggregate LOD release scope is retained and documented
      as the vegetation pass for this release.
- [x] Risky Fable-derived lanes are explicitly default-off or no-go.
- [x] Local validation gates pass for the final tree.
- [x] Browser/playtest screenshots are inspected after runtime changes.
- [ ] Accepted code/docs are committed and pushed to `master`.
- [ ] Production deploy succeeds.
- [ ] `npm run check:live-release` passes for the deployed SHA.
