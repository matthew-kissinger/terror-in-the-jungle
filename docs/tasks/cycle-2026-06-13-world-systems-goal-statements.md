# cycle-2026-06-13-world-systems-goal-statements

Status: owner-facing alignment surface for branch
`task/fable5-world-systems-followup`.

Current overnight goal, 2026-06-14: reduce visible dropped-frame time while
maintaining the same game experience. The game should still run the same modes,
combat pressure, wildlife, vegetation, terrain visibility, assets, draw
distance, atmosphere, and player-facing feature set unless a feature is toggled
off only for an explicit A/B diagnostic. Do not count a perf win if it comes
from making the jungle emptier, hiding animals, reducing NPC pressure, reducing
visibility, disabling visual systems, or otherwise changing what the player is
supposed to experience.

Measurement posture: the perf harness, docs, and prior artifacts are sensors,
not truth. If player-visible dropped frames remain bad while the harness says a
run is healthy, assume the harness is missing a contributor until proven
otherwise. In particular, wildlife/animals, vegetation residency, render
submission churn, browser presentation cadence, texture uploads, terrain
streaming, and OS/background interference must all stay in the suspect set.
Current runtime observation and fresh artifacts outrank stale docs or stale
capture summaries.

Overnight research task:
`docs/tasks/cycle-2026-06-14-dropped-frame-time-perf-research.md`.

Cleanup note: the old `codex/vehicle-ac47-collision-polish` branch name was
misleading. This branch now tracks Fable/world-systems follow-up docs only.
Generated navmesh and repaint-provenance churn is out of scope for this pass.

Verification surface: `npm run check:world-systems-proof` guards the split
docs, the owner-facing summary, the renderer feature-profile lane policy, the
terrain/hydrology debug-proof scope, and the runtime-water-out-of-scope
invariant. `npm run check:world-systems-profile` writes a JSON/Markdown
artifact proving the current profile contract across representative WebGPU,
fallback, legacy, and failed-init backend states.
`npm run check:world-systems-release-readiness` writes the lane-by-lane
release-readiness artifact and is expected to report NO-GO until owner
selection, visual proof, quiet-machine perf, validation, deploy, and live
release gates pass.

Current code proof: `src/core/RendererFeatureProfile.ts` now names the
prototype lanes (`terrainHeightfieldErosion`, `debugWaterLevelProof`,
`renderPipelinePost`, `volumetricCloudPrototype`,
`vietnamSpeciesSourceSpecs`, `aggregateForestLod`,
`naniteLiteClusterStudy`, `hydrologyAnalysis`, and `runtimeWater`) with
required limits, proof hooks, and device-loss policy. Runtime water remains
disabled. Latest local profile proof:
`artifacts/perf/2026-06-14T04-26-53-648Z/world-systems-profile-proof/world-systems-profile-proof.json`
(`254/254` checks passed).

Species/source proof: `src/config/worldSystems/VietnamSpeciesSourceSpecs.ts`
keeps future vegetation diversity as TIJ-owned accepted-source requirements,
not Fable assets or generated Fable species. Latest local species-source
artifact:
`artifacts/perf/2026-06-14T04-26-54-182Z/vietnam-species-source-specs/vietnam-species-source-specs.json`
(`8/8` checks passed).

Terrain/hydrology proof: `src/config/worldSystems/TerrainHydrologyDebugProofSpec.ts`
keeps heightfield, erosion, hydrology-analysis, and debug water-level work as
default-off diagnostics while protecting TIJ terrain, A Shau DEM/navmesh,
Open Frontier navmesh/heightmap, and generated seed assets.
`npm run check:terrain-hydrology-debug-proof` writes the local scope artifact. Latest
local terrain/hydrology scope artifact:
`artifacts/perf/2026-06-14T04-26-53-418Z/terrain-hydrology-debug-proof/terrain-hydrology-debug-proof.json`
(`9/9` checks passed).

Visual/forest proof: `src/config/worldSystems/VisualForestWorldSystemsProofSpec.ts`
keeps sky/cloud/post and forest/Nanite-lite work default-off while protecting
the current atmosphere, lighting, sun-body, post-shim, vegetation, source-spec,
asset-review, and evidence-script authorities.
`npm run check:visual-forest-world-systems-proof` writes the local scope artifact.
Latest local visual/forest scope artifact:
`artifacts/perf/2026-06-14T04-26-53-966Z/visual-forest-world-systems-proof/visual-forest-world-systems-proof.json`
(`8/8` checks passed).
Supporting forest static audits:
`artifacts/perf/2026-06-14T04-26-54-746Z/vegetation-horizon-audit/horizon-audit.json`
and
`artifacts/perf/2026-06-14T04-26-54-920Z/vegetation-grounding-audit/summary.json`.
Current browser terrain/vegetation baseline:
`artifacts/perf/2026-06-14T04-30-24-574Z/projekt-143-terrain-horizon-baseline/summary.json`
(`4/4` elevated screenshots, renderer/terrain/vegetation metrics, visible
terrain content, and zero browser/page errors).

Current TOD coherence proof:
`artifacts/lighting-rig/tod-sweep/gate/verdict.json`
(`8/8` TODs captured; hard gate passed for terrain, foliage, and NPC
coherence; GLB range-ratio remains advisory-only fail).

Current atmosphere evidence matrix:
`artifacts/architecture-recovery/cycle9-atmosphere/2026-06-14T04-53-55-705Z/summary.json`
(`15` screenshots across `5` scenarios, zero browser errors; one combat120
sky-coverage shot remains cloud-legibility `warn`).

Current asset-gallery proof:
`artifacts/asset-gallery/2026-06-14T04-49-26-157Z/summary.json`
(`108/108` assets passed, `0` failures).

Current validation:
`npm run validate:fast` passed on 2026-06-14T05:25Z, including source
typecheck, source lint, doc lint, doc-drift with `failing=0`, and `401` Vitest
files / `5947` tests.

Current quiet-machine perf attempt:
`artifacts/perf/2026-06-14T05-16-25-210Z/summary.json`
is a current-branch Open Frontier capture with `TIJ_QUIET_MACHINE=1`
attestation, but it is not release-grade proof: validation failed, zero runtime
samples were accepted after the measurement window opened, and measurement
trust failed. A prior Open Frontier attempt at
`artifacts/perf/2026-06-14T05-10-46-522Z/summary.json` captured 22 samples and
tail attribution before failing validation, including a fixed harness
`playerController` optional-lookup defect. A Shau quiet-machine proof remains
historical/missing for this branch.

Release-readiness proof: `scripts/check-world-systems-release-readiness.ts`
records the current lane decisions as default-off/deferred and keeps release
NO-GO until the full proof chain is present. Latest local release-readiness
artifact:
`artifacts/perf/2026-06-14T05-26-14-491Z/world-systems-release-readiness/world-systems-release-readiness.json`
(`outcome=no-go`, `6/6` checks passed, `7/7` static/supporting proof artifacts
found, `4/4` current browser-visual artifacts found, `1/2` perf-attribution
artifacts current but failed/untrusted).

## 1. Shipped Predecessor

Goal: Preserve `cycle-2026-06-13-fable5-webgpu-world-systems` as the shipped
R1 WebGPU feature-profile predecessor. Its completed result is the
`RendererFeatureProfile` policy surface and WebGPU-primary posture; the
remaining terrain, hydrology, water-proof, sky/cloud/post, generated-species,
forest LOD, and Nanite-lite topics are split into follow-up docs instead of
being treated as unfinished release gates on the predecessor.

## 2. Debug / Proof World-Systems Cycle

Goal: Fold the useful Fable5 heightfield, erosion, hydrology, debug-only
water-level proof, sky/cloud/post, generated-species, forest LOD, and
Nanite-style reference ideas into TIJ-owned WebGPU-primary debug/proof work.
Keep TIJ terrain, DEM, navmesh, lighting, and asset authority intact; keep
runtime gameplay water out of scope; use Vietnam species/source-asset specs
instead of Fable assets; prove any approved subset with quiet-machine perf and
visual evidence before release.

Current status: parked behind the dropped-frame objective. Do not promote any
world-system lane until the visible dropped-frame problem is measured and
reduced without changing the intended game experience.

## 3. Release-Decision Run

Goal: Take the owner-selected latest releasable code as the release candidate
and drive each Fable/world-systems lane to an explicit
ship/default-off/defer/no-go decision. Make only the smallest release-safe
modifications needed for evidence quality, keep risky lanes default-off unless
their gates pass, update docs to actual decision state, and either complete
CI/deploy/live-release proof or stop before deploy with a no-go artifact
report.

## 4. Overnight Dropped-Frame Perf Goal

Goal: reduce dropped-frame time and visible stutter in Open Frontier and A Shau
while keeping the current game experience intact. First make the harness
measure presentation cadence and 33ms frame misses directly; then run
quiet-machine A/B research against representative player-visible scenarios,
including wildlife/animals, vegetation, terrain streaming, renderer
submissions, combat pressure, and browser/OS interference. If the data looks
strange or contradicts what the player sees, improve the measurement before
trusting the result. Finish with a ranked root-cause report, patches only where
evidence is strong, and artifacts that prove both perf improvement and
experience preservation.
