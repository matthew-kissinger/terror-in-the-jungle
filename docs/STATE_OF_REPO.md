# State Of Repo

Last updated: 2026-04-19

This file is the current-state snapshot for the repo. [ROADMAP.md](ROADMAP.md)
remains aspirational. [BACKLOG.md](BACKLOG.md) tracks queued work. This
document answers the narrower question: what is true on `master` right now?

## Verified locally on 2026-04-19

- `npm run validate:fast` — PASS
- `npm run validate` — PASS
- `npm run check:mobile-ui` — PASS
- `npm run perf:compare` against
  `artifacts/perf/2026-04-19T22-44-23-057Z` — WARN
  - avg `14.66ms`
  - p95 `32.60ms`
  - p99 `33.80ms`
  - heap growth `20.35MB`
- `npm run deadcode` — FAIL
  - current output is hygiene debt, not a shipping gate
- `npx tsx scripts/fixed-wing-runtime-probe.ts` — FAIL
  - current master throws `model.getPhysics is not a function`
  - the probe drifted out of sync with the post-Airframe `FixedWingModel`

## What Is Real Today

- The repo is healthy enough to build, smoke-test, and run its mobile gate on
  current `master`.
- The project is a playable combined-arms browser game, not just an engine
  shell.
- Helicopters and fixed-wing aircraft are both live in runtime.
- A Shau Valley is truthfully a **3,000-unit strategic simulation with
  selective materialization**, not 3,000 simultaneous live combatants.
- Performance governance is real and useful, but baseline freshness and frame
  tails are still active problems.

## Current Drift

- Some docs were lagging behind code that already landed, especially around:
  - `CombatantRenderInterpolator`
  - `CombatantMeshFactory` bucket capacity / overflow surfacing
  - `RETREATING` no longer being an orphan AI state
- The fixed-wing runtime probe is currently broken after the Airframe cutover,
  so parts of the flight-validation story are overstated if you only read older
  docs.
- `perf-baselines.json` is still stale relative to current `combat120`
  behavior.
- Local installs can lag declared dependency versions after lockfile bumps.
  When `npm ls` reports invalid versions, treat `npm ci` as the reset path.

## Immediate Priorities

1. Repair `scripts/fixed-wing-runtime-probe.ts` and restore an end-to-end
   aircraft validation gate.
2. Refresh perf baselines across `combat120`, `openfrontier:short`,
   `ashau:short`, and `frontier30m`.
3. Reduce bundle size and keep `combat120` tail latency moving downward.
4. Close doc/tooling drift faster so validation docs describe what actually
   passes on `master`.
