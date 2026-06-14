# cycle-2026-06-14-fable-gated-systems-readout

Status: scaffolded for owner alignment.

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
