# Performance

This file split into `docs/perf/` on cycle-2026-05-09-doc-decomposition-and-wiring.

- [docs/perf/README.md](perf/README.md) — index, profiling commands, build targets
- [docs/perf/baselines.md](perf/baselines.md) — baselines + refresh procedure
- [docs/perf/scenarios.md](perf/scenarios.md) — scenario definitions
- [docs/perf/playbook.md](perf/playbook.md) — regression investigation playbook

Pre-Phase-1 content archived at `docs/archive/PERFORMANCE.md`.

## Post-WebGPU snapshot (2026-05-13)

- **5-mode strict-WebGPU CI proof shipped.** PR #192 (merge commit `1df141ca`)
  landed the WebGPURenderer + TSL pipeline with a strict-mode evidence packet
  covering Open Frontier, Zone Control, Team Deathmatch, ai_sandbox /
  combat120, and A Shau Valley. Strict mode (`?renderer=webgpu-strict`)
  remains the acceptance bar for KONVEYER-style evidence; production startup
  without the flag falls back gracefully on browsers without WebGPU support.
  See `docs/rearch/POST_WEBGPU_MIGRATION_2026-05-13.md` for the post-merge
  framing.
- **Atmosphere CPU is now < 1 ms/frame across all five modes** after KONVEYER
  slices 9-15 and the 2026-05-13 sky-refresh idempotency fix (commit
  `7e8433b4`). A Shau worst-case SkyTexture EMA dropped from ~5.96 ms to
  ~0.52 ms (≈11x). Pre-merge atmosphere cost ran 5-6 ms in the same modes.
- **Combat is now the relatively-largest CPU contributor** at ~1.5-6.5 ms
  across modes (was second-largest behind atmosphere pre-merge). Combat
  sub-attribution telemetry shipped via PR #183 (`performanceTelemetry`
  children `Combat.{Influence,AI,Billboards,Effects}`) and the
  `lodLevel`→`simLane` + `renderLane` rename shipped via PR #184. Phase F
  R2-R4 (cover-spatial-grid, render-silhouette lane, squad-aggregated
  strategic sim, budget arbiter v2, render-cluster lane) will address the
  remaining combat cost.
- **STABILIZAT-1 remains open.** As of this 2026-05-13 snapshot,
  `perf-baselines.json` was still pinned to the 2026-04-20 capture, with the
  WebGPU + Phase F R1 baseline refresh queued as its own cycle.
  **Update 2026-06-02:** `perf-baselines.json` has since been removed entirely,
  so there is currently no tracked baseline at all — `perf:compare` prints raw
  latest-capture metrics and does not gate. The STABILIZAT-1 "refresh the
  pinned baseline" framing is therefore superseded: re-establishing a baseline
  now means creating the file fresh via `npm run perf:update-baseline`. See
  [docs/perf/baselines.md](perf/baselines.md) and `docs/CARRY_OVERS.md`.
