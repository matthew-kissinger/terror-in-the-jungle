# Cycle: Phase F R2-R4 (KONVEYER materialization rearch continuation, on master)

Last verified: 2026-05-12

## Status

Queued. This brief is a one-page placeholder ready to be expanded into a
full cycle manifest when the cycle launches.

## Predecessor

R1 of the KONVEYER materialization rearchitecture **shipped on master** via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(the WebGPU branch merge). Three R1 commits landed:

- `5432a316` — `feat(konveyer): combat sub-attribution (konveyer-combat-sub-attribution)`
- `bad935c2` — `refactor(konveyer): rename lodLevel->simLane, add renderLane (konveyer-materialization-lane-rename)`
- `7e8433b4` — `fix(konveyer): gate sky-texture refresh on 2 s cadence regardless of cause (konveyer-sky-refresh-investigate)`

The closed predecessor cycle brief is archived at
[docs/tasks/archive/cycle-2026-05-13-konveyer-materialization-rearch/cycle-2026-05-13-konveyer-materialization-rearch.md](archive/cycle-2026-05-13-konveyer-materialization-rearch/cycle-2026-05-13-konveyer-materialization-rearch.md).

## Branch

- Base branch: `origin/master` (NOT `exp/konveyer-webgpu-migration` — that
  branch was retired by PR #192).
- New cycle work branches off master per the standard `task/<slug>` pattern.

## Required reading (to be expanded when cycle launches)

1. `docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md` — post-merge rearch
   memo landing in bundle 2 in parallel with this brief.
2. The archived predecessor brief (link above) for R2-R4 scope language.
3. `docs/CARRY_OVERS.md` for DEFEKT-3 status.

## Queued tasks (R2-R4)

These tasks did NOT merge with R1 and remain queued:

### R2

- `konveyer-cover-spatial-grid` — replace synchronous BVH cover search in
  `AIStateEngage.initiateSquadSuppression` with 8 m uniform spatial grid.
  Reuses existing `SpatialGrid` infrastructure. **DEFEKT-3 closes when this
  ships.** Expected `Combat` aggregate drop ≥1.0 ms on `ai_sandbox` and
  `a_shau_valley`.
- `konveyer-render-silhouette-lane` — single-sprite, single-tone,
  no-animation billboard tier between impostor and culled. Lets A Shau read
  as populated from flight-altitude views.

### R3

- `konveyer-squad-aggregated-strategic-sim` — per-squad CULLED-tier tick via
  `SquadManager` + `WarSimulator`. O(squads), not O(entities). The
  3,000-combatant scaling primitive.
- `konveyer-budget-arbiter-v2` — single function consuming camera frustum,
  active-zone list, frame budget, sorted candidates — assigns `simLane` +
  `renderLane` per combatant with explicit budget accounting. Composes
  silhouette/cluster with close-GLB.

### R4

- `konveyer-render-cluster-lane` — one billboard per squad with squad-count
  badge, beyond silhouette range. `Combatant` records persist as strategic
  state, just not draws.
- `konveyer-strict-webgpu-cross-mode-proof-v2` — multi-mode strict-WebGPU
  evidence packet covering R1-R4 together. A Shau p99 must hold ≤33 ms.
- `konveyer-docs-review-packet-v2` — update review packet, primitive spikes
  doc, and `docs/state/CURRENT.md` with post-cycle state.

## Hard stops (carried from predecessor brief)

- Fenced-interface change (`src/types/SystemInterfaces.ts`) → halt, surface,
  do not edit.
- `perf-baselines.json` refresh → human approval required.
- A Shau p99 regression past 33 ms after a slice → revert the slice,
  surface to owner.
- Carry-over count growth across the cycle → cycle is INCOMPLETE.

## What this brief explicitly does NOT do

- Does not include R1 work (already merged via PR #192).
- Does not assume the experimental branch is still the working surface.
- Does not own ground-vehicle work (VEKHIKL-1 has its own brief at
  [vekhikl-1-jeep-spike.md](vekhikl-1-jeep-spike.md)).
- Does not own KONVEYER-10 / KONVEYER-12 follow-ons (A Shau finite-edge,
  cloud representation, vegetation/NPC asset acceptance, water shader/art
  — all remain owner-decision blocked per the predecessor brief's "Out of
  Scope" section).

## Expansion when cycle launches

This brief should be expanded into a full cycle manifest (round schedule,
per-task acceptance criteria, dependency DAG, reviewer policy,
cycle-level success criteria, end-of-cycle ritual) before `/orchestrate`
dispatches against it. The archived predecessor brief is the structural
reference.
