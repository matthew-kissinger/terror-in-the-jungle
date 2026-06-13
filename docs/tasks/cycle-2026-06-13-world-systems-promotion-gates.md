<!-- Next-cycle scaffold. Source: TIJ master + Fable5 reference audit, 2026-06-13. -->
# cycle-2026-06-13-world-systems-promotion-gates

Status: scaffolded for owner alignment; first code-backed gate ledger and
vehicle-clarity runtime slice are in progress on `master`.

Worktree:
`C:\Users\Mattm\X\games-3d\terror-in-the-jungle-fable-debug-proofs`.

## Goal Statement

Convert the remaining Fable5-derived world-system ideas from "interesting
reference/no-go" into evidence-backed GO/SPIKE/NO-GO decisions, then ship only
the safe TIJ-owned runtime improvements: accepted vegetation/runtime renderer
policy stays in production, vehicle prompts clearly distinguish friendly
boardable vehicles from enemy non-boardable vehicles, and every terrain, water,
sky/post, forest, Nanite, and asset-expansion lane stays gated until its proof
changes the decision. End the cycle by committing the accepted code/docs to
`master`, pushing `master`, running exact-HEAD CI, deploying with
`npm run deploy:prod`, and proving production with `npm run check:live-release`.

## Gate Ledger

Code owner: `src/systems/world/WorldSystemsPromotionGate.ts`.
Standing gate: `npm run check:world-systems-promotion`.

| Lane | Cycle decision | Needs spike? | Approval gate |
|---|---|---:|---|
| WebGPU assumptions | **GO.** Keep one WebGPU-primary project with compatibility fallback; do not split into mirrored WebGL2/WebGPU projects. | No, unless renderer posture/device-loss fails. | `check:platform-capabilities`; feature profile reports WebGPU-primary or compatibility fallback. |
| Accepted vegetation runtime | **GO.** Keep current accepted Pixel Forge jungle atlas/runtime vegetation and aggregate-LOD density. | No for existing accepted assets. | `check:vegetation-horizon`, `check:vegetation-grounding`, owner visual walk. |
| New tree / jungle species assets | **SPIKE.** Use Vietnam species specs; no Fable generated species or assets. | Yes. | Source assets must pass `ASSET_ACCEPTANCE_STANDARD`, importer/gallery review, vegetation visibility, culling baseline, and owner visual approval before runtime import. |
| Heightfield / erosion | **SPIKE.** Analyze TIJ `IHeightProvider`; do not swap terrain authority. | Yes. | A Shau DEM/navmesh/startup proof, terrain visual proof, and explicit owner approval before any authoritative terrain change. |
| Hydrology / water | **SPIKE for debug proof; NO-GO for runtime water.** | Yes, but not runtime this cycle. | Dedicated VODA cycle for basin/river visualization, query API, physics/swimming/watercraft, and owner playtest. |
| Sky / cloud / post | **SPIKE.** Strict WebGPU proof only; default-off. | Yes. | `check:sky-cloud-post-proof`, `check:tod-coherence`, `evidence:atmosphere`, fallback review, owner visual acceptance. |
| Forests / aggregate LOD | **SPIKE.** Adapt GPU culling/LOD strategy; no wholesale Forests port. | Yes. | `check:forest-lod-plan`, `check:culling-baseline`, large-mode perf, visible pop/flicker review. |
| True meshlet Nanite | **NO-GO.** Evaluate aggregate "Nanite-lite" only. | No runtime spike until engine approval. | Requires explicit engine-architecture approval; current browser target rejects true meshlet Nanite. |
| Fable assets / generated content | **NO-GO.** Reference only. | No. | Any asset must be TIJ-authored or importer-accepted; no wholesale copy. |
| Vehicle boardability clarity | **GO.** Friendly vehicles stay boardable; enemy vehicles show clear non-boardable prompt and do not feed the F-key board path. | No. | Focused vehicle prompt/factory tests plus owner Zone Control tank/truck walk. |

## Runtime Scope This Cycle

- Add the promotion gate ledger and script so future agents can tell exactly
  which Fable lanes are shippable, spike-only, or blocked.
- Wire faction-aware ground-vehicle prompts through the real player faction so
  friendly vehicles say they are boardable and enemy vehicles say they cannot
  be boarded.
- Keep existing accepted vegetation in production; do not create/import new
  tree assets unless the asset gate above passes.
- Keep sky/cloud/post replacement, runtime water, terrain authority swap,
  full Forests port, true Nanite, and Fable asset/species ports default-off.

## Controlled Burn

- Burn down stale release wording from the previous runtime release; it was
  deployed at `965f4fe5760896e57a40ffa46f571695403412e4`.
- Burn down ambiguous vehicle prompts where an enemy tank/truck looked like a
  broken boardable vehicle.
- Burn down "Fable is cool, maybe port it" ambiguity by forcing each lane to
  carry status, blockers, and proof hooks.

## Validation Plan

- `npm run check:world-systems-promotion`
- `npm run test:quick -- src/systems/vehicle/GroundVehicleProximityChecker.test.ts src/systems/vehicle/PlayerVehicleAdapterFactory.test.ts`
- `npm run validate:fast`
- Vehicle proof or focused Zone Control browser smoke if the changed prompt
  surface needs visual confirmation.
- If the tree changes remain code/doc-only, do not claim new trees. If new
  tree assets are added, run the full asset/import/gallery/vegetation/perf
  chain before deploy.
- Release finish: push `master`, run exact-HEAD CI, `npm run deploy:prod`, then
  `npm run check:live-release`.

## Owner Alignment Questions

- Is the next asset-producing vegetation pass allowed to generate/import new
  TIJ tree families, or should this cycle stop at specs/proof gates?
- Should enemy vehicles be permanently non-boardable, or should a later cycle
  add capture/hijack rules for abandoned/enemy vehicles?
- Is the sky/cloud/post spike allowed to alter default visuals if the strict
  matrix passes, or should it remain an opt-in proof until a separate owner
  visual walk?
