# cycle-2026-04-21-stabilization-reset

Opened: 2026-04-21

## Purpose

Stop feature expansion long enough to make the repo's control plane trustworthy again. The current app builds, tests, smokes, passes mobile UI, and compares cleanly against refreshed perf baselines, but several diagnostic scripts, docs, and backlog sections still describe older routes and older architecture.

This cycle is intentionally focused on truth, gates, and hygiene. New gameplay, vehicle, atmosphere, and map features should wait until the checks below are reliable again.

## Cycle 0: Truth and gates

- [x] Decide and document the Node target. `.nvmrc`, CI, docs, and current perf evidence now target Node 24.
- [x] Remove stale `/terror-in-the-jungle/?perf=1` local probe URLs and route local probes through the current Vite root path.
- [x] Restore `scripts/fixed-wing-runtime-probe.ts` as a trustworthy aircraft validation gate and wire it into the maintained script/knip surface.
- [x] Refresh `STATE_OF_REPO`, `PERFORMANCE`, `BACKLOG`, `ATMOSPHERE`, `ARCHITECTURE`, and `ASSET_MANIFEST` so docs match current master.
- [x] Triage and clean `npm run deadcode`. See `docs/rearch/deadcode-triage-2026-04-21.md`.
- [x] Harden Cloudflare/browser freshness: split content-hashed Vite output to `/build-assets/`, revalidate stable public assets and GLBs, and bump the service worker cache to drop stale `titj-v1` entries.
- [x] Clean locked nested worktrees and stale task branches after confirming there is no unmerged work. Removed 24 clean agent worktrees and deleted 24 local `task/*` branches mapped to merged PRs.

## Cycle 1: Vehicle and flight alignment

- [x] Pick one fixed-wing configuration source of truth: keep `FixedWingConfigs.ts` plus the airframe adapter; delete the unused duplicate `src/systems/vehicle/airframe/configs.ts` path.
- [x] Validate runway takeoff, climb, and short-final approach setup for A-1, F-4, and AC-47 in browser-level probes.
- [x] Validate AC-47 player orbit hold in the browser-level probe, including sustained orbit after the configured engagement altitude is reached.
- [x] Validate player/NPC fixed-wing handoff in the browser-level probe; NPC mission ownership stays paused while the player owns the aircraft and resumes after player exit.
- [x] Address cross-vehicle input/camera state bleed before adding more vehicle types; helicopter and fixed-wing entry now reset flight mouse control to direct-control mode.
- [x] Defer fixed-wing feel/interpolation polish to Cycle 2. Cycle 1 restored correctness gates; it does not claim aircraft feel is signed off.
- [x] Keep deploy freshness in the flight/content loop: any GLB, aircraft model, public asset, or service-worker change must pass the Cloudflare header spot-check in `docs/DEPLOY_WORKFLOW.md` after deploy.

## Cycle 2: Flight feel, perf, and bundle

- [x] Investigate fixed-wing feel issues reported during manual flight: stiff response, altitude bounce/porpoising after climb, unstable visual shake at speed, and whether fixed-wing needs render/camera interpolation comparable to the helicopter path. Initial evidence pointed at the render/camera boundary: fixed-wing used raw airframe pose, while helicopter exposes interpolated physics state.
- [x] Implement the first fixed-wing feel fix set: Airframe now exposes an interpolated pose from its fixed-step accumulator, FixedWingModel renders/queries that visual pose, and PlayerCamera uses elapsed-time smoothing for fixed-wing follow, look target, and FOV widening. `npm run probe:fixed-wing` passes after the patch; human feel sign-off is still open.
- [ ] Re-run the human playtest checklist for flight feel after the automated fixed-wing gates pass; automated checks are not sufficient for aircraft feel.
- [ ] Reduce initial JS chunk weight. Current production build still emits large `index`, `three`, and `ui` chunks.
- [x] Fix `frontier30m` soak semantics. The script now runs Open Frontier with perf-only match lifecycle overrides (`perfMatchDuration=3600`, `perfDisableVictory=1`) so the capture stays in non-terminal active combat instead of timing out around 15 minutes. Refresh the baseline only from a quiet-machine run.
- [x] Remove build-time `.gz`/`.br` sidecar generation. Cloudflare handles visitor-facing compression for JS/CSS/WASM; deploy output now contains only canonical assets and hashed build files.
- [x] Remove or archive high-confidence one-off scripts and unused exports surfaced by `knip`.
- [ ] Keep dead-code hygiene clean while bundle and flight-feel work moves files.
- [ ] Re-run `validate:full` after any perf-sensitive cleanup, on a quiet machine. Do not refresh perf baselines from a session where other games or GPU-heavy apps are running.
- [ ] After deploy, run the Cloudflare header spot-check from `docs/DEPLOY_WORKFLOW.md` so users get current GLBs, public assets, and service-worker behavior.

## Cycle 3: Combat and navigation quality

- [ ] Finish the terrain/pathing stall solver work that still affects bots on steep or pit-like terrain.
- [ ] Consolidate squad suppression mutation paths so doctrine changes have one authoritative write path.
- [ ] Decide whether the remaining `IDLE` combatant state is a supported lifecycle state or fixture-only legacy.
- [ ] Revisit broader AI scale only after the control-plane checks above are green.

## Current stop signs

- Cycle 0 is closed. Do not reopen it for new feature work; file new stabilization issues under the relevant later cycle.
- Do not start ECS/WebGPU/large-rendering rewrites from this cycle. The instrumentation layer is not reliable enough yet.
- Do not add more vehicle types until the Cycle 2 fixed-wing feel/interpolation fix has human playtest sign-off.
- Do not add more atmosphere features until `ATMOSPHERE.md` describes the current cloud/sky/fog stack accurately.
