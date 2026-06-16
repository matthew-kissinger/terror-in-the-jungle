<!-- Proposed next cycle. Source audit: TIJ current docs + examples/fable5-world-demo, 2026-06-13. -->
# cycle-2026-06-13-fable5-webgpu-world-systems

Status: shipped predecessor; this is no longer the active broad cycle. The R1
WebGPU feature-profile slice is implemented in
`src/core/RendererFeatureProfile.ts`. Broader visual/world systems are split
into `docs/tasks/cycle-2026-06-13-fable5-world-systems-debug-proofs.md` and
`docs/tasks/cycle-2026-06-13-world-systems-release-decision-run.md`.

Historical broad goal statement, superseded by split follow-ups: Analyze TIJ
and Fable5 end to end, choose the WebGPU-primary architecture posture, adapt
the useful Fable terrain, erosion, hydrology, cloud/post, generated-species,
forest LOD, and Nanite-style ideas into TIJ-owned scoped systems with explicit
controlled burns, prove the approved subset locally and visually, then finish
by committing, pushing, merging to `master`, deploying production, and passing
`npm run check:live-release`.

## Completed Result

- `src/core/RendererFeatureProfile.ts` defines the WebGPU-primary feature
  policy surface and classifies future renderer/world-system work as strict
  WebGPU, degraded fallback, shared-node-safe, diagnostic-only, or disabled.
- The codebase remains a single project: WebGPU is the primary development
  path, and WebGL2 remains a compatibility/degraded fallback rather than a
  mandatory mirror for every future WebGPU feature.
- The remaining broad-world-system topics were not released from this
  predecessor and are no longer tracked here as unfinished release gates.

## Follow-Up Split

| Topic | Follow-up surface |
|---|---|
| Terrain, erosion, hydrology, debug-only water proof, sky/cloud/post, generated-species, forest LOD, and Nanite-lite adaptation | `docs/tasks/cycle-2026-06-13-fable5-world-systems-debug-proofs.md` |
| Ship/default-off/defer/no-go decisions for owner-selected releasable code | `docs/tasks/cycle-2026-06-13-world-systems-release-decision-run.md` |
| Owner-facing summary of the split | `docs/tasks/cycle-2026-06-13-world-systems-goal-statements.md` |

## Alignment Decisions

- Branch and release target name: `master`.
- One codebase. Do not split WebGPU and WebGL2 into separate projects.
- WebGPU is the primary development path. WebGL2 remains a compatibility path,
  but it must not force every new WebGPU system to have a full mirrored
  implementation.
- Include all three work lanes: WebGPU posture, Fable world-system analysis,
  and visual/world proof planning.
- Runtime water is out of scope. Hydrology and water are analysis only this
  cycle.
- p99 cannot be hand-waved. Because the cause is still not fully known, the
  cycle starts with attribution and uses non-regression policy rather than a
  blanket p99 waiver.

## Reference Scope

Use Fable5 heavily as reference code for:

- `Heightfield` ownership shape and GPU terrain data flow.
- hydraulic/thermal erosion architecture.
- hydrology outputs: moisture, flow, river depth, water surface buffers.
- cloud compute, cloud shadows, half-res raymarch and post composition.
- RenderPipeline post stack shape and ablation/debug flags.
- generated species parameters, atlas bake, and octahedral impostor capture.
- forest LOD rings, terrain-occlusion culling, indirect/compute culling, shadow
  proxies, and aggregate canopy strategies.
- Nanite-like close hero tree / cluster / impostor thinking.

Do not copy wholesale:

- Fable heightfield as TIJ terrain authority.
- Fable hydrology or `WaterSurface` into runtime.
- Fable water material.
- Fable sky/cloud/post as default production stack.
- Fable generated species or assets.
- Fable full `Forests` implementation.
- true meshlet Nanite.
- WebGPU-only browser gate that blocks the existing TIJ fallback.

## Swap Out

1. Renderer progress policy: ad hoc "does WebGL2 support this too?" decisions
   -> explicit WebGPU feature profile with fallback classifications.
2. Ambiguous p99 acceptance -> R0/final attribution rule that separates touched
   systems from pre-existing STABILIZAT/render tails.
3. Stale water backlog wording -> water remains future VODA work; this cycle
   only authors hydrology/water analysis and debug-authority boundaries.

## Modify

1. Modify renderer backend planning around `src/core/RendererBackend.ts` and
   `src/core/GameRenderer.ts` so future WebGPU systems can request limits,
   record features, handle device loss, and degrade fallback intentionally.
2. Modify visual-system planning around `AtmosphereSystem`, `LightingRig`,
   `PostProcessingManager`, terrain material, and debug proof scripts so any
   cloud/post prototype has one lighting authority.
3. Modify terrain/world planning around existing TIJ terrain, DEM, navmesh, and
   vegetation authority. Fable heightfield and hydrology are references, not
   ownership replacements.

## Extend

1. Extend docs/proofs with a WebGPU-primary compatibility policy: strict
   WebGPU proof path, shared TSL path, degraded fallback path, and diagnostic
   WebGPU-only path.
2. Extend performance evidence with p99 tail attribution before and after the
   cycle. Keep STABILIZAT-1 open if measurement trust remains WARN.
3. Extend the Fable vegetation pass into a future forest/species/Nanite-lite
   plan: Vietnam species definitions, accepted source assets, octahedral
   impostor bake, aggregate culling, and cluster LOD.
4. Extend sky/cloud/post planning with a guarded WebGPU-only prototype lane,
   not a default-on replacement.

## Controlled Burn

- No runtime water or watercraft reactivation.
- No Fable assets.
- No generated Fable species.
- No direct terrain authority swap.
- No second atmosphere/lighting owner.
- No full Fable `Forests` port.
- No true meshlet Nanite implementation.
- No separate WebGPU/WebGL2 project split.
- No merge/deploy claim until `master`, production deploy, and live-release
  proof all pass.

## Cycle Plan

1. R0 repo and Fable audit:
   - Re-read `docs/state/CURRENT.md`, `docs/DIRECTIVES.md`,
     `docs/ROADMAP.md`, and `docs/dev/visual-rearch-lessons.md`.
   - Inventory TIJ renderer, terrain, atmosphere, post, vegetation, and perf
     attribution surfaces.
   - Inventory Fable `Heightfield`, `Erosion`, `FlowRivers`, `WaterSurface`,
     `Clouds`, `SunSky`, `PostStack`, `Species`, `VegLibrary`, `Forests`,
     `Impostors`, and canopy/LOD systems.
2. R0 perf attribution:
   - Run same-machine captures before changes: Open Frontier, A Shau, and the
     smallest combat/p99 scenario that reproduces the current tail.
   - Record whether tail attribution implicates renderer, Player, Combat,
     vegetation, terrain, clouds/post, or measurement trust.
3. R1 WebGPU feature-profile architecture:
   - Implement a small renderer feature profile policy.
   - Record adapter features/limits and decide which future features are
     strict-WebGPU, shared-node-safe, degraded fallback, or diagnostic-only.
   - Add device-loss and required-limits plan or code if scope permits.
4. R2 visual/world prototype planning:
   - Cloud/post stack: prototype only behind dev/proof flags unless the
     evidence matrix passes.
   - Heightfield/erosion/hydrology: analysis and design only; no runtime water.
   - Species/forest/Nanite-lite: plan the accepted-asset path and culling/LOD
     strategy; implement only bounded probes if they do not affect live assets.
5. R3 proof and closeout:
   - `npm run validate:fast`.
   - Visual gates relevant to touched systems, at minimum
     `npm run check:tod-coherence`; add scenario captures for WebGPU and the
     degraded fallback path.
   - Perf reruns against R0; p99 non-regression decision written into the
     cycle doc.
   - Merge to `master`, deploy production with `npm run deploy:prod`, run
     `npm run ci:manual` if live proof needs CI for the exact HEAD, then pass
     `npm run check:live-release`.

## P99 Acceptance Rule

Perf hygiene note: the owner was also testing the game in a browser during the
2026-06-13 local validation window. Treat any p99/perf captures from that
overlap as tainted for attribution. The cycle still needs fresh quiet-machine
R0 and final captures before making any p99 claim.

The cycle can proceed with a red p99 only if all are true:

- p99 was red in R0 before the touched change.
- final p99 is not worse beyond same-machine noise.
- tail attribution does not point at the touched system.
- startup, heap, browser errors, and renderer counters do not regress.
- the cycle doc records the decision and keeps STABILIZAT-1 open.

If any touched system appears in the tail attribution or worsens the capture,
cut scope and fix that regression before merge.

## Acceptance Disposition

This predecessor is accepted only for the R1 WebGPU feature-profile result.
The broad checklist that originally lived here is superseded by the split
follow-up docs above and must not be used as an active release gate for this
shipped predecessor.
