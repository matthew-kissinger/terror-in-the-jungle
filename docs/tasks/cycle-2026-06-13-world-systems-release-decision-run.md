<!-- Agent handoff scaffold. Source: Fable5/TIJ world-system cycles + release workflow, 2026-06-13. -->
# cycle-2026-06-13-world-systems-release-decision-run

Status: aligned handoff scaffold; ready for owner selection before execution.

Current branch note: `npm run check:world-systems-release-readiness` records
the current lane decisions as safely default-off/deferred, then returns a
NO-GO release outcome until owner selection, browser visual evidence,
quiet-machine perf attribution, validation, deploy, and live-release gates are
present.

Current no-go evidence: latest release-readiness artifact
`artifacts/perf/2026-06-14T05-26-14-491Z/world-systems-release-readiness/world-systems-release-readiness.json`
reports `outcome=no-go`, `6/6` static checks passed, `4/4` current
browser-visual artifacts found, and `1/2` current perf-attribution artifacts.
The current Open Frontier capture
`artifacts/perf/2026-06-14T05-16-25-210Z/summary.json` is quiet-attested but
failed validation and measurement trust; current A Shau quiet-machine proof is
still missing.

Predecessors:

- `docs/tasks/cycle-2026-06-13-fable5-webgpu-world-systems.md`
- `docs/tasks/cycle-2026-06-13-fable5-world-systems-debug-proofs.md`
- `docs/tasks/cycle-2026-06-13-jungle-vegetation-aggregate-lod.md`
- `docs/rearch/FABLE5_WEBGPU_WORLD_SYSTEMS_2026-06-13.md`

Goal objective: Take the owner-selected latest releasable code as the release
candidate and drive each gated Fable/world-systems lane to an explicit
ship/default-off/defer/no-go decision. For each lane, inspect the current TIJ
implementation and Fable reference findings, make only the smallest
release-safe modification needed to close the gate or improve proof quality,
then either approve it for deployment, keep it default-off with documented
evidence, defer it, or mark it no-go with required follow-up. Do not default-on
terrain ownership changes, runtime water, sky/cloud/post replacement,
forest/HLOD runtime swaps, or Nanite-lite behavior unless their acceptance
gates pass. Finish by validating all latest code, updating docs to match the
actual decision state, committing, pushing, merging to `master` only if
release-safe, running CI/deploy, and passing `npm run check:live-release`. If
any required release gate fails, stop before deploy and return a no-go report
with artifacts.

## Branch Hygiene

1. Start from the actual target branch/worktree the owner assigns.
2. Run `git status --short --branch` before edits.
3. If the worktree has unrelated modified files, do not revert them. Either
   continue with additive docs/proof changes that do not touch those files, or
   create a clean worktree from `master` for the release-decision run.
4. Refresh the release candidate with `git fetch origin` and confirm whether
   local `master`, `origin/master`, and the working branch have diverged.
5. Treat generated navmesh/assets/provenance churn as out of scope unless the
   lane under review explicitly requires regenerating it.

## Decision Lanes

| Lane | Allowed modification this run | Deploy approval requires | No-go condition |
|---|---|---|---|
| Terrain / erosion | Diagnostics, offline-authoring notes, authority spike cleanup. | A Shau and Open Frontier terrain proof, navmesh/startup safety, no terrain authority swap. | Any DEM/navmesh mutation without direct terrain proof, startup regression, or slope/placement breakage. |
| Water / hydrology | Debug-only water level, basin, or river proof surfaces. | Explicit default-off debug state plus docs saying gameplay water remains future VODA work. | Gameplay water, swimming, watercraft, buoyancy, or Fable water material becomes runtime-visible. |
| Sky / cloud / post | WebGPU-only proof flag, diagnostics, screenshot proof, lighting-authority cleanup. | `check:tod-coherence`, strict WebGPU scenario matrix, fallback behavior documented, no visual warning promoted to default. | Cloud/post path becomes default-on with unresolved matrix warnings or a second lighting authority. |
| Vegetation / grass / trees | Full vegetation-pass intake, accepted asset specs, placement tuning, LOD/impostor proof hooks. | Accepted source assets, gallery review where assets change, Open Frontier and A Shau visual/perf proof, route/base/NPC readability evidence. | Unaccepted Fable/generated assets, hidden routes/bases/NPCs, or vegetation-attributed perf regression. |
| Forest culling / HLOD / Nanite-lite | Aggregate LOD planner, proof hooks, diagnostic owner tags, optional default-off culling spike. | Trusted large-mode perf shows reduction without pop/flicker/regression and fallback behavior is clear. | Runtime culling/HLOD swap lands without trusted proof, or true meshlet Nanite is attempted. |
| Weapon pose / vehicles | Intake or narrow fixes only if owner asks to include them in this run. | Human playtest/probe evidence for gun-lower pose or arcade-hybrid vehicle handling. | Feel-sensitive changes are claimed done without playtest row or probe evidence. |

## Required Read Pass

- `AGENTS.md`
- `docs/state/CURRENT.md`
- `docs/DIRECTIVES.md`
- `docs/ROADMAP.md`
- `docs/PLAYTEST_PENDING.md`
- `docs/dev/visual-rearch-lessons.md` if touching sky, clouds, post,
  lighting, terrain lighting, water, shadows, fog, or renderer fallback.
- `docs/ASSET_ACCEPTANCE_STANDARD.md` if adding, swapping, or regenerating
  assets.
- `docs/DEPLOY_WORKFLOW.md` before deploy.

## Proof Plan

Use the smallest proof set that covers touched lanes, then escalate if any
lane is close to default-on or perf-sensitive.

Baseline before modifications:

- `npm run doctor`
- `npm run validate:fast`
- `npm run check:terrain-baseline` for terrain, vegetation, forests, far
  horizon, or placement work.
- `npm run check:terrain-hydrology-debug-proof` before touching heightfield,
  erosion, hydrology-analysis, or debug water-level proof lanes.
- `npm run check:visual-forest-world-systems-proof` before touching
  sky/cloud/post, forest culling/LOD, impostor bake, or Nanite-lite lanes.
- `npm run check:world-systems-release-readiness` after static scope guards to
  record lane decisions and confirm whether the release outcome is GO or
  NO-GO.
- `npm run perf:capture:openfrontier:short`
- `npm run perf:capture:ashau:short`
- The smallest p99 reproducer if current evidence implicates combat120,
  renderer, Player, or startup tails.

Lane-specific gates:

- Sky/cloud/post: `npm run check:tod-coherence` and
  `npm run evidence:atmosphere`.
- Vegetation/forest: `npm run check:vegetation-horizon`,
  `npm run check:vegetation-grounding`, `npm run check:terrain-baseline`, and
  gallery proof if assets change.
- Vehicles/weapon feel if included: targeted runtime probes plus an explicit
  `docs/PLAYTEST_PENDING.md` row when human playtest is still deferred.
- Assets: `npm run assets:import-war-catalog` for accepted GLB catalog changes;
  never hand-copy generated catalog entries.

Release gates:

- `npm run validate`
- Push the release-safe branch.
- Merge to `master` only if all release-blocking lanes are GO or default-off
  with documented evidence.
- `npm run deploy:prod`
- `npm run ci:manual` if `check:live-release` has no CI success for the exact
  HEAD.
- `npm run check:live-release`

## GO / NO-GO Output

The run ends in exactly one of these states.

### GO

- Each lane has `ship`, `default-off`, or `deferred` status recorded.
- Docs match the shipped state in `docs/BACKLOG.md`, this task doc, and any
  touched directive/playtest files.
- Validation and release proof pass.
- `master` is pushed, production deploy succeeds, and live manifest SHA matches
  the pushed HEAD.

### NO-GO

- No production deploy is claimed.
- `npm run check:world-systems-release-readiness` writes the current
  lane-decision artifact if the run stops before release.
- The agent reports each blocked lane with:
  - finding,
  - failed gate,
  - artifact path,
  - smallest next modification,
  - whether the current code can remain default-off safely.

## Acceptance

- [ ] Branch/worktree state is recorded before edits.
- [ ] Existing unrelated dirty files are preserved.
- [ ] `npm run check:world-systems-release-readiness` records the current
      lane-decision outcome.
- [ ] Each decision lane is audited and marked `ship`, `default-off`, or
      `deferred`.
- [ ] Any lane modification is smaller than a new feature port and has a
      matching proof command.
- [ ] Terrain ownership, runtime water, sky/cloud/post replacement, runtime
      forest/HLOD, and Nanite-lite remain default-off unless their approval
      gates pass.
- [ ] Docs are updated to reflect actual decision state, not intended state.
- [ ] `npm run validate` passes before release.
- [ ] Release either stops as NO-GO with artifacts or finishes with
      `deploy:prod`, optional `ci:manual`, and `check:live-release` passing.
