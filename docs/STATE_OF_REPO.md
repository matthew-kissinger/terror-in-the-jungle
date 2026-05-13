# State Of Repo

Last verified: 2026-05-13

This file split into `docs/state/` on cycle-2026-05-09-doc-decomposition-and-wiring.

- [docs/state/CURRENT.md](state/CURRENT.md) — current truth (2026-05-13 entry caps the KONVEYER campaign)
- [docs/state/perf-trust.md](state/perf-trust.md) — measurement-chain status
- [docs/state/recent-cycles.md](state/recent-cycles.md) — last 3 cycle outcomes
- [docs/CARRY_OVERS.md](CARRY_OVERS.md) — active carry-over registry (9 active, including the mode-startup terrain hardening opened on `task/mode-startup-terrain-spike`)

## Snapshot (2026-05-13, post-master-merge)

`master` is now the WebGPU + TSL renderer branch by default, with automatic
WebGL2 fallback for environments without WebGPU support (Chrome 113+ /
Firefox 147+ / Safari 26+ get native WebGPU; older browsers fall back). The
KONVEYER WebGPU/TSL migration campaign closed when
`exp/konveyer-webgpu-migration` merged into `master` via
[PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
on 2026-05-13 (merge commit `1df141ca`); the fallback gate was added in
commit `4aec731e`. Milestone memo:
[docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](rearch/POST_KONVEYER_MIGRATION_2026-05-13.md).

- **Active campaign:** [docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
  (auto-advance PAUSED; cycle selection waits for owner direction).
- **Active branch:** `task/mode-startup-terrain-spike` (local spike branch,
  pushed for review after this doc-alignment pass). It fixes the user-visible
  mode-selection stall by moving mode-start terrain surface baking into module
  workers with transferable height/normal grids. The cache/Recast/WASM path was
  verified healthy; the measured blocker was synchronous terrain CPU work.
  Evidence and merge criteria:
  [docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).
- **Active carry-overs:** 9 (KONVEYER-10 closed at master merge; `KB-STARTUP-1`
  opened for production hardening of the mode-start terrain bake).
- **Active queued cycles:** `vekhikl-1-jeep-spike` and
  `cycle-phase-f-r2-r4-on-master` (both queued, not scheduled; see the
  campaign manifest for ordering).

Pre-Phase-1 content archived at `docs/archive/STATE_OF_REPO.md`.
