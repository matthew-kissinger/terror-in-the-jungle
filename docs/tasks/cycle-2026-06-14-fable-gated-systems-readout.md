# cycle-2026-06-14-fable-gated-systems-readout

Status: readout recorded; docs/proof only. No runtime lane is promoted by this
cycle.

## Goal Statement

Run a focused readout cycle on the remaining Fable-informed but gated world
systems and decide whether each one fits Terror in the Jungle's vision,
performance target, and WebGPU-primary architecture. The cycle should produce
evidence-backed promote / defer / burn decisions for heightfield/erosion,
debug hydrology, sky/cloud/post, vegetation source assets, forest aggregate
LOD, Nanite-lite aggregate culling, and renderer capability policy. It must not
copy Fable assets, revive code-generated procedural vegetation, turn runtime
water back on, swap terrain authority, or default-on visual systems without
their proof gates and owner acceptance.

End state: one decision packet per lane, updated docs, focused validation, and
a clear release recommendation. Only lanes that pass their gates may be
committed as runtime changes; otherwise the cycle ships docs/proof artifacts
only and explicitly records why production was not deployed.

## Non-Negotiables

- Fable remains reference architecture, not source content.
- The procedural vegetation path burned on 2026-06-14 stays burned.
- New vegetation must start from accepted authored/imported source assets or a
  materially stronger art-generation pipeline, then pass the asset standard.
- Water remains stripped to first principles; debug water proof is allowed,
  runtime water is not.
- Terrain authority remains TIJ-owned unless a dedicated terrain decision pass
  proves A Shau, navmesh, startup, and visual parity.
- WebGPU is the primary renderer path, but the app must still degrade cleanly
  on WebGL2 fallback.
- True meshlet Nanite is not in scope. The only allowed investigation is
  aggregate/cluster culling and LOD selection.

## Readout Lanes

| Lane | Core question | Proof work | Decision output |
|---|---|---|---|
| Renderer capability policy | Does the current WebGPU-primary/fallback posture support future world systems without splitting projects? | Run capability/device-loss/limits checks, inspect feature-profile outputs, and verify fallback degrade rules. | Promote current policy, or file a renderer hardening cycle before more world-system work. |
| Heightfield / erosion | Can Fable-style terrain field ideas improve TIJ without owning or mutating A Shau terrain authority? | Spike against `IHeightProvider`, record erosion/flow diagnostics, measure startup/navmesh risk, and compare A Shau/Open Frontier visuals. | Defer, promote debug tooling, or open a dedicated terrain-authority cycle. |
| Hydrology / water | What first-principles debug water proof is useful after the water scorch? | Build or audit basin/river/water-level debug evidence only; no material, swimming, buoyancy, watercraft, or runtime surface. | Keep debug-only, open a future VODA cycle, or burn the lane until terrain generator work resumes. |
| Sky / cloud / post | Can a WebGPU-only sky/cloud/post spike materially improve bad clouds/lighting without destabilizing fallback or TOD coherence? | Run strict WebGPU proof, TOD coherence, all-mode atmosphere evidence, fallback review, and owner screenshot review. | Promote behind flag, keep default-off, or burn the candidate. |
| Vegetation source assets | Which jungle species should be pursued now, and through what asset path? | Audit accepted runtime vegetation, define asset-source requirements for trees/understory, run gallery/readability criteria, and reject code-generated procedural output. | Queue an asset-source cycle, promote accepted assets only, or defer species that cannot meet readability/perf. |
| Forest aggregate LOD | Can TIJ adapt Fable's culling/LOD strategy without a wholesale forest port? | Use `check:forest-lod-plan`, culling baseline/proof, visible pop/flicker review, and Open Frontier/A Shau perf captures. | Promote planner/runtime slice, keep proof-only, or burn the approach. |
| Nanite-lite aggregate culling | Do aggregate clusters solve enough near/mid vegetation cost to fit the 3,000-combatant vision? | Compare cluster budgets, draw calls, visible triangle attribution, overdraw, and fallback behavior. | Open a renderer/vegetation aggregate prototype, or no-go as too costly/complex. |

## Lane Deliverables

Each lane gets a short packet with:

1. Current TIJ owner and touched systems.
2. Fable concept being adapted.
3. What was tested or inspected.
4. Artifacts and commands.
5. Risks to 3,000-combatant scale, A Shau, startup, fallback, and owner visual
   acceptance.
6. Decision: `promote`, `defer`, or `burn`.
7. Next-cycle goal statement if promoted or deferred.

## Baseline And Gates

Start with a quiet baseline where practical. If the owner has been testing in
browser or the machine is not quiet, label captures as diagnostic rather than
certifying.

Required common gates:

```bash
npm run typecheck
npm run lint:docs
npm run check:doc-drift
npm run validate:fast
```

Lane-specific gates:

```bash
npm run check:platform-capabilities
npm run check:terrain-baseline
npm run check:sky-cloud-post-proof
npm run check:tod-coherence
npm run evidence:atmosphere
npm run check:forest-lod-plan
npm run check:culling-baseline
npm run check:culling-proof
npm run check:vegetation-grounding
npm run check:vegetation-horizon
npm run perf:capture:openfrontier:short
npm run perf:capture:ashau:short
```

Use the lane gates selectively. Do not run expensive visual/perf captures for a
lane that is burned by repo inspection before implementation.

## Promotion Rules

- **Promote to runtime** only when the lane has code, focused tests, visual or
  perf evidence matching its risk, and owner acceptance if it affects visible
  gameplay.
- **Defer** when the concept fits the vision but lacks assets, proof, owner
  acceptance, or quiet-machine performance evidence.
- **Burn** when the concept fights the art direction, performance target,
  ownership boundary, or browser renderer constraints.

## Release Rule

If the cycle produces docs/proof decisions only, commit and push the readout but
do not deploy production. If any lane ships runtime code or accepted assets,
finish with exact-HEAD CI, production deploy, and `npm run check:live-release`.

## Expected Decisions To Reconfirm

- Procedural vegetation remains burned unless a materially better source-asset
  process replaces it.
- Runtime water remains no-go.
- Terrain authority swap remains no-go without a dedicated terrain cycle.
- True meshlet Nanite remains no-go.
- Forest/Nanite-lite work should bias toward aggregate culling, LOD policy,
  and source-asset economics rather than renderer fantasy.
- Sky/cloud/post is the most likely visual spike to pursue, but only with
  strict WebGPU evidence and fallback discipline.

## Readout Results (2026-06-14)

No runtime code or assets changed in this readout. The decisions below are
based on current repo proof surfaces and fresh local gates on `master`
`8c253e87`.

| Lane | Decision | Why |
|---|---|---|
| Renderer capability policy | **promote policy / no split** | The WebGPU-primary single-project posture fits the vision. Browser capability proof passed with a WebGPU adapter, WebGL2 fallback, SharedArrayBuffer isolation, and live header contract present. Continue improving fallback degradation in one repo rather than mirroring WebGPU/WebGL2 projects. |
| Heightfield / erosion | **defer runtime; keep debug-only diagnostics** | The Fable terrain-field idea fits only as analysis/offline authoring input right now. `HeightfieldErosionAuthoritySpike` unit proof passes and terrain baseline passes, but no evidence authorizes A Shau DEM mutation, terrain authority swap, navmesh rebake changes, or startup-risk changes. |
| Debug hydrology / water | **defer; keep debug proof only** | Debug basin/river sampling remains useful for a future VODA design pass, but runtime water stays no-go. Unit proof passes and renderer feature policy keeps hydrology/debug-water diagnostic-only. No material, query/physics, buoyancy, swimming, watercraft, or production surface is promoted. |
| Sky / cloud / post | **defer; strongest visual spike candidate** | Strict WebGPU proof passes and TOD coherence passes. The all-mode atmosphere packet completed, but it ran on WebGL fallback and logged startup/perf warnings, and there is no owner visual acceptance. Keep the lane default-off until a strict-WebGPU visual matrix and owner review agree it improves clouds/lighting. |
| Vegetation source assets | **defer to asset-source cycle** | Existing accepted vegetation remains OK: grounding and horizon audits pass with zero flagged horizon modes. New banyan/rubber/mangrove/elephant-grass/understory species are still blocked on accepted authored/imported source assets. Code-generated procedural vegetation remains burned. |
| Forest aggregate LOD | **defer runtime; keep planner/proof hooks** | `check:forest-lod-plan` and headed culling proof pass. Culling baseline selects a usable owner path, but status is WARN because combat diagnostic certification remains excluded. This supports a scoped prototype, not a runtime forest/HLOD swap. |
| Nanite-lite aggregate culling | **defer aggregate prototype; burn true meshlet Nanite** | Aggregate/cluster culling fits the 3,000-combatant materialization vision, but evidence does not yet prove visible savings without pop/flicker or fallback cost. True meshlet Nanite remains no-go for the browser target. |

## Evidence Packet

Common validation:

- `npm run typecheck` — PASS.
- `npm run lint:docs` — PASS.
- `npm run check:doc-drift` — WARN only, `failing=0`.
- `npm run check:world-systems-promotion` — PASS, 1 file / 3 tests.
- Focused lane unit gate:
  `npx vitest run src\core\RendererFeatureProfile.test.ts src\systems\terrain\HeightfieldErosionAuthoritySpike.test.ts src\systems\environment\water\DebugWaterProof.test.ts src\systems\environment\SkyCloudPostProofGate.test.ts src\systems\terrain\ForestAggregateLodPlan.test.ts src\config\VietnamVegetationSpecies.test.ts`
  — PASS, 6 files / 32 tests.
- `npm run validate:fast` — PASS, 406 files / 5,981 tests; source budget and
  doc drift remain warning-only.

Lane artifacts:

- Renderer policy:
  `artifacts/perf/2026-06-14T01-51-20-365Z/projekt-143-platform-capability-probe/summary.json`
  — PASS; browser probe ran, WebGPU adapter available, WebGL2 renderer present,
  SharedArrayBuffer isolation and live cross-origin isolation headers passed.
- Sky/cloud/post strict gate:
  `artifacts/proofs/sky-cloud-post/2026-06-14T01-50-57-681Z/summary.json`
  — PASS; `renderer=webgpu`, `strictWebGPU=true`, gate state
  `webgpu-proof`, device loss clear, compute/storage limits satisfied.
- TOD coherence:
  `artifacts/lighting-rig/tod-sweep/gate/verdict.json` — PASS; all 8 TODs
  measurable; foliage and NPC hard checks pass; GLB range ratio remains
  advisory.
- Atmosphere evidence:
  `artifacts/architecture-recovery/cycle9-atmosphere/2026-06-14T02-02-50-064Z/summary.json`
  — screenshot packet complete for A Shau, Open Frontier, TDM, Zone Control,
  and combat120. Treat as diagnostic fallback evidence because the run logged
  WebGPU-unavailable fallback warnings and startup/perf warnings.
- Terrain baseline:
  `artifacts/perf/2026-06-14T02-00-28-283Z/projekt-143-terrain-horizon-baseline/summary.json`
  — PASS; 4/4 elevated screenshots captured, renderer/terrain/vegetation
  metrics present, trusted Open Frontier and A Shau perf baselines available,
  culling telemetry trusted, browser errors clear.
- Vegetation grounding:
  `artifacts/perf/2026-06-14T01-51-20-131Z/vegetation-grounding-audit/summary.json`
  — PASS.
- Vegetation horizon:
  `artifacts/perf/2026-06-14T01-51-20-030Z/vegetation-horizon-audit/horizon-audit.json`
  — PASS context; 5 modes, 0 flagged modes, largest bare terrain band `0m`.
- Culling proof:
  `artifacts/perf/2026-06-14T02-00-15-642Z/projekt-143-culling-proof/summary.json`
  — PASS; measurement trust PASS; renderer recorded 203 draw calls and 6,463
  visible triangles in the proof scene.
- Culling owner baseline:
  `artifacts/perf/2026-06-14T02-00-21-465Z/projekt-143-culling-owner-baseline/summary.json`
  — WARN; selected `large-mode-world-static-and-visible-helicopters`, Open
  Frontier and A Shau trusted, unattributed visible triangles below threshold,
  but combat diagnostic remains excluded from certification.

## Release Recommendation

Do not deploy production for this readout. It records proof-backed decisions
only and does not change runtime code, assets, vegetation, water, terrain,
sky/post defaults, culling behavior, or renderer policy defaults.

Next actionable cycle should be one of:

1. **Sky/cloud/post strict visual spike**: run strict WebGPU all-mode visual
   evidence, owner screenshot review, fallback review, and only then decide
   whether a flag-gated candidate is worth building.
2. **Vegetation source-asset pass**: pursue authored/imported Vietnam jungle
   source assets through `ASSET_ACCEPTANCE_STANDARD`, gallery/readability,
   grounding, horizon, culling, and perf gates. No code-generated procedural
   trees.
3. **Forest aggregate prototype**: build a narrow aggregate-culling prototype
   against current accepted vegetation and culling owner path; prove visible
   savings, no pop/flicker, and fallback behavior before runtime promotion.
