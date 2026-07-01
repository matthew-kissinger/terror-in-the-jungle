<!-- Agent release-decision record. Source: current master + Fable5/TIJ world-system evidence, 2026-06-13. -->
# cycle-2026-06-13-world-systems-release-decision-run

Status: release-decision GO for the proof/scaffold subset; default-on world
system expansions remain owner-gated.

Release-candidate base: `master` at `6796a6a6`.

Goal objective: Take latest `master` as the release candidate and drive each
gated Fable/world-systems lane to an explicit ship/no-ship decision. For each
lane, inspect the current TIJ implementation and Fable reference findings, make
only the smallest release-safe modification needed to close the gate or improve
proof quality, then either approve it for deployment, keep it default-off with
documented evidence, or mark it no-go with required follow-up. Do not
default-on terrain ownership changes, runtime water, sky/cloud/post
replacement, forest/HLOD runtime swaps, or Nanite-lite behavior unless their
acceptance gates pass. Finish by validating all latest code, updating docs to
match the actual decision state, committing, pushing, merging to `master` only
if release-safe, running CI/deploy, and passing `npm run check:live-release`;
if any required release gate fails, stop before deploy and return a no-go
report with artifacts.

## Branch / Worktree Audit

- Primary checkout `C:\Users\Mattm\X\games-3d\terror-in-the-jungle` is dirty
  on `codex/vehicle-ac47-collision-polish`; it is not the release candidate.
- Clean release candidate worktree:
  `C:\Users\Mattm\X\games-3d\terror-in-the-jungle-fable-debug-proofs`.
- `git status --short --branch` in the release candidate starts clean on
  `master...origin/master`.
- Local `master` and `origin/master` both point at `6796a6a6` before this
  decision record.
- `examples/fable5-world-demo` is present in the release-candidate worktree and
  is reference-only.

## Lane Decisions

| Lane | Decision | Evidence | Required follow-up before default-on expansion |
|---|---|---|---|
| Terrain / erosion | **Ship diagnostic only.** `HeightfieldErosionAuthoritySpike` is debug-only, non-authoritative, and non-mutating over TIJ `IHeightProvider`. | `src/systems/terrain/HeightfieldErosionAuthoritySpike.ts`; cycle evidence in `docs/tasks/cycle-2026-06-13-fable5-world-systems-debug-proofs.md`. | Terrain-authority owner decision, A Shau DEM/navmesh proof, startup proof, and direct terrain visual review. |
| Water / hydrology | **Ship debug proof only.** `DebugWaterProof` is non-authoritative; `runtimeWater` remains disabled in `RendererFeatureProfile`. | `src/systems/environment/water/DebugWaterProof.ts`; `src/core/RendererFeatureProfile.ts`; composer audit confirms no Fable/debug-water runtime water binding. | Dedicated water cycle for render material, query API, physics/swimming/watercraft, and owner playtest. |
| Sky / cloud / post | **Keep default-off.** Strict WebGPU proof gate exists and remains diagnostic. | `src/systems/environment/SkyCloudPostProofGate.ts`; strict matrix artifact `artifacts/architecture-recovery/cycle9-atmosphere/2026-06-13T19-07-57-910Z/summary.json` has one combat120 sky warning. | Clean strict-WebGPU visual matrix, `check:tod-coherence`, fallback behavior review, and owner visual sign-off. |
| Vegetation / grass / trees | **Ship current accepted subset; defer full asset expansion.** Existing accepted palm/ground-cover tier and specs are allowed; broadleaf/rubber/banyan/mangrove/elephant-grass remain blocked. | `src/config/VietnamVegetationSpecies.ts`; `docs/tasks/cycle-2026-06-13-jungle-vegetation-aggregate-lod.md`; `docs/PLAYTEST_PENDING.md`. | Full vegetation owner walk, accepted source assets, gallery review, placement/readability proof, and OF/A Shau perf/visual proof. |
| Forest culling / HLOD / Nanite-lite | **Ship planner/proof hooks only.** Runtime forest/HLOD swap and true meshlet Nanite are no-go for this release. | `src/systems/terrain/ForestAggregateLodPlan.ts`; `npm run check:forest-lod-plan`; culling owner-path artifact `artifacts/perf/2026-06-13T18-59-10-145Z/projekt-143-culling-owner-baseline/summary.json`. | Trusted large-mode perf with visible reductions, no pop/flicker, fallback behavior, and owner approval. |
| Weapon pose / vehicle feel | **Defer.** Owner reports are preserved as playtest/follow-up intake, not bundled into this world-systems release. | `docs/PLAYTEST_PENDING.md` rows for repaint and vehicle feel. | Dedicated gun-viewmodel lowering pass and arcade-hybrid ground-vehicle handling pass with human playtest. |

## Release Decision

GO for deploying the latest release-safe code with the following explicit
scope:

- Shipped: renderer feature profile/device-loss/limits reporting, debug
  heightfield/erosion spike, debug water proof, sky/cloud/post proof gate,
  Vietnam species/source specs, forest aggregate LOD planner, culling proof
  attribution tags, and documentation.
- Default-off/deferred: terrain authority swap, runtime water, sky/cloud/post
  replacement, new vegetation source assets, runtime forest/HLOD swap, and
  true meshlet Nanite.
- No runtime assets are added, modified, or swapped by this release-decision
  pass.
- No Fable source assets, generated species, or full systems are copied into
  runtime.

## Validation Evidence

- `npm run check:forest-lod-plan`: PASS, 1 file / 5 tests.
- `npm run check:sky-cloud-post-proof`: PASS,
  `artifacts/proofs/sky-cloud-post/2026-06-13T21-25-29-536Z`;
  `gateState=webgpu-proof`.
- `npm run validate`: PASS; lint, 403 Vitest files / 5,960 tests,
  production build, and local production smoke all passed.

## Release Closeout Contract

This document does not pin its own final commit SHA because doing so would
change the SHA. The release run is closed only after the final pushed `master`
HEAD passes:

- `npm run deploy:prod`
- `npm run ci:manual` if the exact HEAD lacks CI success
- `npm run check:live-release`

The final response for the run must report the pushed SHA, deploy run, CI run
when used, and `check:live-release` artifact.

## Acceptance

- [x] Branch/worktree state is recorded before edits.
- [x] Existing unrelated dirty files are preserved by using the clean
      release-candidate worktree.
- [x] Each decision lane is marked ship, default-off, or deferred.
- [x] Runtime terrain ownership, runtime water, sky/cloud/post replacement,
      runtime forest/HLOD, and Nanite-lite remain default-off.
- [x] Docs record the actual decision state rather than intended state.
- [x] Final release validation passes for the decision-record tree.
- [x] Production deploy and live-release proof are required external closeout
      gates before the agent can mark the goal closed.
