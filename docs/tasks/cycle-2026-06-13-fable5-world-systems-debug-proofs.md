<!-- Proposed next cycle. Source audit: TIJ current docs + examples/fable5-world-demo, 2026-06-13. -->
# cycle-2026-06-13-fable5-world-systems-debug-proofs

Status: aligned draft; static terrain/hydrology and visual/forest scope
guards added; owner approval still required before runtime implementation.

Predecessor: `docs/tasks/cycle-2026-06-13-fable5-webgpu-world-systems.md`
shipped the initial `RendererFeatureProfile` policy surface. This cycle folds
the remaining Fable5 topics into TIJ-owned debug/prototype work without
wholesale ports.

Goal statement: Fold the Fable5 heightfield, erosion, hydrology, debug-only
water-level proof, sky/cloud/post, generated-species, forest LOD, and
Nanite-style reference ideas into a TIJ-owned WebGPU-primary world-systems
cycle by hardening renderer capability/device-loss/limits policy, spiking
heightfield and erosion against the existing TIJ terrain authority, rebuilding
water-proof instrumentation from first principles as debug-only
level/basin/river proofs, prototyping sky/cloud/post behind WebGPU-only proof
gates, translating generated-species concepts into Vietnam species and
source-asset specs, adapting forest GPU culling/LOD and Nanite-lite aggregate
concepts without Fable assets or full ports, proving the approved subset with
quiet-machine perf and visual evidence, then committing, pushing, merging to
`master`, deploying production, and passing `npm run check:live-release`.

## Scope Posture

- One repo, one game. Do not split WebGPU and WebGL2 projects.
- WebGPU is the primary implementation path. WebGL2 fallback is compatibility
  and may disable or degrade new WebGPU-only features.
- Fable5 is reference code, not source code to import.
- TIJ terrain, DEM, navmesh, scenario, lighting, and asset-acceptance
  authority stay in TIJ.
- Runtime gameplay water is still out of scope. This cycle may add debug-only
  water level and basin/river proof surfaces, not boats, swimming, water
  combat, or default production water visuals.
- Gun/viewmodel height and ground-vehicle arcade handling are important
  follow-up feel cycles, but not part of this world-systems architecture cycle.

## Initial Proof Surface

`npm run check:world-systems-proof` verifies the split from the shipped
predecessor, the owner-facing goal surface, the renderer feature-profile lane
classifications, and the absence of obvious runtime water system paths.
`npm run check:world-systems-profile` evaluates the real
`buildRendererFeatureProfile` code against representative WebGPU, fallback,
legacy, and failed-init backend states and writes a JSON/Markdown artifact
under `artifacts/perf/**/world-systems-profile-proof/`. These are alignment
and profile-policy guards only; they do not replace quiet-machine perf, visual
evidence, owner approval, or live-release proof for any default-on change.

Latest local profile proof:
`artifacts/perf/2026-06-14T04-26-53-648Z/world-systems-profile-proof/world-systems-profile-proof.json`
(`254/254` checks passed).

`src/config/worldSystems/VietnamSpeciesSourceSpecs.ts` records the current
approved runtime impostor species plus future TIJ-owned source-only species
families for aggregate LOD and Nanite-lite study. It keeps future broadleaf,
riverbank, grass, paddy-edge, palm-clump, and vine/deadfall work as accepted
source requirements instead of Fable assets or generated Fable species.
`npm run check:vietnam-species-source-specs` writes a JSON/Markdown artifact
under `artifacts/perf/**/vietnam-species-source-specs/`.

Latest local species-source proof:
`artifacts/perf/2026-06-14T04-26-54-182Z/vietnam-species-source-specs/vietnam-species-source-specs.json`
(`8/8` checks passed).

`src/config/worldSystems/TerrainHydrologyDebugProofSpec.ts` records the
heightfield, erosion, hydrology-analysis, and debug water-level lanes as
default-off diagnostic proof only. It protects `TerrainSystem`,
`TerrainSurfaceRuntime`, `HeightProviderFactory`, A Shau DEM/navmesh authority,
Open Frontier seeded navmesh/heightmap authority, `MapSeedRegistry`, and the
prebaked navmesh/heightmap assets. `npm run check:terrain-hydrology-debug-proof`
writes a JSON/Markdown artifact under
`artifacts/perf/**/terrain-hydrology-debug-proof/`.

Latest local terrain/hydrology scope proof:
`artifacts/perf/2026-06-14T04-26-53-418Z/terrain-hydrology-debug-proof/terrain-hydrology-debug-proof.json`
(`9/9` checks passed).

`src/config/worldSystems/VisualForestWorldSystemsProofSpec.ts` records the
sky/cloud/post and forest/Nanite-lite lanes as default-off diagnostic or
source-spec work. It protects `AtmosphereSystem`, `LightingRig`,
`ScenarioAtmospherePresets`, `SunDiscMesh`, the no-op `PostProcessingManager`
shim, TOD and atmosphere evidence scripts, the billboard vegetation runtime,
`VietnamSpeciesSourceSpecs`, asset acceptance/gallery review, and vegetation
horizon/grounding audits. `npm run check:visual-forest-world-systems-proof`
writes a JSON/Markdown artifact under
`artifacts/perf/**/visual-forest-world-systems-proof/`.

Latest local visual/forest scope proof:
`artifacts/perf/2026-06-14T04-26-53-966Z/visual-forest-world-systems-proof/visual-forest-world-systems-proof.json`
(`8/8` checks passed).

Supporting static forest audits:
`artifacts/perf/2026-06-14T04-26-54-746Z/vegetation-horizon-audit/horizon-audit.json`
and
`artifacts/perf/2026-06-14T04-26-54-920Z/vegetation-grounding-audit/summary.json`.
These audits cover horizon reach and grounding/atlas safety; they do not
replace browser screenshot review or quiet-machine perf attribution.

Current browser terrain/vegetation baseline:
`artifacts/perf/2026-06-14T04-30-24-574Z/projekt-143-terrain-horizon-baseline/summary.json`
(`4/4` elevated screenshots, renderer/terrain/vegetation metrics, visible
terrain content, and zero browser/page errors). This is before/baseline visual
evidence only; TOD, atmosphere, asset-gallery, human review, and quiet-machine
release attribution remain separate gates.

Current TOD coherence proof:
`artifacts/lighting-rig/tod-sweep/gate/verdict.json`
(`8/8` TODs captured; hard gate passed for terrain, foliage, and NPC
coherence; GLB range-ratio remains advisory-only fail). This makes sky/foliage
coherence current for this branch, but atmosphere matrix, asset-gallery, human
review, and quiet-machine release attribution remain separate gates.

Current atmosphere evidence matrix:
`artifacts/architecture-recovery/cycle9-atmosphere/2026-06-14T04-53-55-705Z/summary.json`
(`15` screenshots across A Shau, Open Frontier, TDM, Zone Control, and
combat120; zero browser errors; one combat120 sky-coverage shot remains
cloud-legibility `warn`). This is current branch visual evidence, not human
acceptance.

Current asset-gallery proof:
`artifacts/asset-gallery/2026-06-14T04-49-26-157Z/summary.json`
(`108/108` assets passed, `0` failures). Future source-only species still need
accepted source assets before runtime promotion.

`npm run check:world-systems-release-readiness` writes the lane-by-lane
release-readiness artifact. It is allowed to pass while reporting a NO-GO
release outcome: that means the branch is safely default-off/deferred, not that
quiet-machine perf, browser visual evidence, owner approval, deploy, or
`check:live-release` are complete.

Latest local release-readiness artifact:
`artifacts/perf/2026-06-14T05-26-14-491Z/world-systems-release-readiness/world-systems-release-readiness.json`
(`outcome=no-go`, `6/6` checks passed, `7/7` static/supporting proof artifacts
found, `4/4` current browser-visual artifacts found, `1/2` current
perf-attribution artifacts found but failed/untrusted).

Current perf-attribution attempt:

- `artifacts/perf/2026-06-14T05-10-46-522Z/summary.json`: current-branch
  Open Frontier capture with `TIJ_QUIET_MACHINE=1`; captured 22 runtime
  samples and tail attribution before validation failed. It exposed a harness
  `playerController` optional-lookup crash path, now patched in
  `scripts/perf-active-driver.cjs`.
- `artifacts/perf/2026-06-14T05-16-25-210Z/summary.json`: current-branch
  Open Frontier rerun with `TIJ_QUIET_MACHINE=1`; the original pageerror did
  not recur, but the page/context closed as measurement began, zero runtime
  samples were accepted, and measurement trust failed. This is evidence of a
  remaining perf-harness trust blocker, not release proof.
- A Shau current quiet-machine capture has not been accepted on this branch.

`src/core/RendererFeatureProfile.ts` now exposes required-limit floors, proof
hooks, and device-loss policy per world-system lane. The profile names
`terrainHeightfieldErosion`, `debugWaterLevelProof`, `renderPipelinePost`,
`volumetricCloudPrototype`, `vietnamSpeciesSourceSpecs`,
`aggregateForestLod`, `naniteLiteClusterStudy`, `hydrologyAnalysis`, and
`runtimeWater` explicitly so scripts and browser diagnostics can audit the
same gate language.

## Prototype Lane Contract

| Lane | Profile feature id | Current contract |
|---|---|---|
| Heightfield / erosion | `terrainHeightfieldErosion` | Diagnostic-only WebGPU world-field spike; cannot replace TIJ terrain, A Shau DEM, or navmesh authority. |
| Debug water level / basin / river proof | `debugWaterLevelProof`, `hydrologyAnalysis` | Diagnostic-only proof buffers for future VODA design; owner approval required; no gameplay water. |
| Sky / cloud / post | `renderPipelinePost`, `volumetricCloudPrototype` | WebGPU-only proof gates with TOD/atmosphere evidence before any default-on decision. |
| Generated species | `vietnamSpeciesSourceSpecs` | Vietnam source-asset specification lane only; no Fable generated species or assets. |
| Forest LOD / culling | `gpuForestCulling`, `aggregateForestLod` | TIJ-owned culling/LOD proof with terrain, asset, gallery, and perf hooks; no full Fable `Forests` port. |
| Nanite-lite | `naniteLiteClusterStudy` | Cluster/aggregate study only; true meshlet Nanite remains out of scope. |
| Runtime water | `runtimeWater` | Disabled until a future owner-approved VODA cycle. |

## Folded Fable Topics

| Topic | Reference idea | Cycle shape | Controlled burn |
|---|---|---|---|
| Heightfield / erosion | GPU-authored world field plus hydraulic/thermal erosion. | Spike against TIJ terrain authority; document where a future authoring/offline pass would attach. | No terrain ownership swap; no A Shau DEM mutation. |
| Hydrology / water | Moisture, flow, river depth, and water-surface buffers. | Rebuild from first principles as debug-only water level, basin fill, and river proof. | No gameplay water, no watercraft reactivation, no Fable water material. |
| Sky / cloud / post | Compute clouds, cloud shadows, half-res raymarch, RenderPipeline post. | WebGPU-only visual spike behind proof flags; matrix-gated before default-on. | No second lighting authority; no default-on cloud/post replacement without proof. |
| Generated species | Parameterized species, atlas bake, impostor capture. | Translate into Vietnam species definitions, accepted source-asset requirements, and bake specs. | No Fable generated species or assets. |
| WebGPU assumptions | Feature policy, limits, device loss, diagnostic hooks. | Extend `RendererFeatureProfile` with device-loss/limits and per-feature proof hooks. | Do not block fallback users from the app shell; fallback may degrade feature scope. |
| Forests | GPU culling, terrain occlusion, LOD rings, shadow proxies, impostor bands. | Adapt culling/LOD strategy incrementally around TIJ vegetation runtime. | No full Fable `Forests` port. |
| Nanite-lite | Hero close trees, clustered crown proxies, aggregate impostors. | Evaluate cluster/aggregate LOD and indirect-culling feasibility. | No true meshlet Nanite implementation. |

## Cycle Plan

1. R0 quiet baseline and attribution:
   - Run only when the owner is not also playtesting in a browser.
   - Capture Open Frontier, A Shau, and the smallest p99 reproducer.
   - Record whether p99 attribution implicates renderer, Player, Combat,
     terrain, vegetation, sky/post, startup, or measurement trust.
2. R1 WebGPU capability hardening:
   - Extend `RendererFeatureProfile` with required limits, device-loss
     reporting, and feature proof hooks.
   - Add diagnostic output that scripts can consume without importing renderer
     internals.
3. R2 terrain / hydrology / debug water proof:
   - Inventory current terrain and water-stripped boundaries.
   - Implement or scaffold a debug water-level overlay plus basin/river proof
     data path.
   - Keep all outputs non-authoritative until accepted by a later water cycle.
4. R3 sky / cloud / post spike:
   - Prototype only behind dev/proof flags.
   - Route lighting through the existing `LightingRig` / `AtmosphereSystem`
     authority.
   - Gate with `check:tod-coherence` and scenario screenshot matrix before any
     default-on decision.
5. R4 species / forest / Nanite-lite adaptation:
   - Author Vietnam species definitions and source-asset acceptance specs.
   - Define impostor bake inputs and forest LOD/culling ownership.
   - Evaluate aggregate/cluster LOD without committing to meshlet Nanite.
6. R5 proof and release:
   - `npm run validate:fast`.
   - Relevant visual gates, including `npm run check:tod-coherence` if
     sky/lighting/post is touched.
   - Quiet-machine final perf rerun against R0.
   - Commit, push, merge to `master`, deploy with `npm run deploy:prod`, run
     `npm run ci:manual` if needed, and pass `npm run check:live-release`.

## Acceptance

- [x] Initial split/default-off alignment guard passes with
      `npm run check:world-systems-proof`.
- [x] Initial renderer profile matrix artifact passes with
      `npm run check:world-systems-profile`.
- [x] Vietnam species/source-asset specs are encoded and pass
      `npm run check:vietnam-species-source-specs`.
- [ ] Owner aligns on debug-only water proof being in scope.
- [ ] Quiet R0 perf attribution is accepted before world-system changes. A
      current Open Frontier attempt exists but failed measurement trust; A Shau
      remains missing.
- [x] Renderer feature profile covers limits, device-loss policy, and proof
      hooks for the new prototype lanes.
- [x] Heightfield/erosion scope remains a spike against TIJ terrain authority;
      static guard proves no terrain authority swap lands in this pass.
- [x] Hydrology/water scope produces only debug water-level, basin, or river
      proof surfaces; static guard proves no gameplay water lands in this
      pass.
- [x] Sky/cloud/post scope remains WebGPU-primary, default-off, and
      proof-gated; static guard protects the existing atmosphere, lighting,
      sun-body, post-shim, TOD, and atmosphere evidence authority.
- [x] Generated species are Vietnam definitions/specs only; no Fable assets or
      generated species are copied.
- [x] Forest/Nanite-lite scope is incremental TIJ LOD/culling/source-spec
      adaptation; static guard forbids full Fable `Forests` ports, unaccepted
      source assets, hidden route/base/NPC regressions, default-on HLOD swaps,
      and true meshlet Nanite.
- [x] Supporting forest static audits pass for vegetation horizon reach and
      grounding/atlas safety.
- [x] Current-branch browser terrain/vegetation baseline captures Open
      Frontier and A Shau elevated screenshots and metrics.
- [x] Current-branch TOD coherence gate captures all 8 TODs and passes hard
      terrain/foliage/NPC coherence checks.
- [x] Current-branch atmosphere matrix captures all 5 required scenario
      surfaces with zero browser errors.
- [x] Current-branch asset gallery passes for 108 accepted catalog entries.
- [x] Release-readiness checker records current lane decisions as
      default-off/deferred and stops release as NO-GO until owner, visual,
      quiet-machine, validation, deploy, and live gates pass.
- [ ] Final quiet-machine perf attribution is accepted and compared to R0.
- [x] `npm run validate:fast` passes (`2026-06-14T05:25Z`; 401 test files,
      5947 tests).
- [ ] Work is committed, pushed, merged to `master`, deployed, and verified
      with `npm run check:live-release`.
