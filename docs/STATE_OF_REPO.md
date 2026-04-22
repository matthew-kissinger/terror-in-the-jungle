# State Of Repo

Last updated: 2026-04-22

This file is the current-state snapshot for the repo. [ROADMAP.md](ROADMAP.md)
remains aspirational. [BACKLOG.md](BACKLOG.md) tracks queued work. This
document answers the narrower question: what is true on `master` right now?

## Verified locally on 2026-04-21

- `npm run validate:fast` — PASS
- `npm run validate` — PASS
- `npm run build` — PASS
  - current build emits content-hashed Vite output under `/build-assets/`
  - build output no longer emits `.gz` or `.br` sidecar files; Cloudflare
    handles visitor-facing compression for Pages assets
- `npm run smoke:prod` — PASS
- `npm run check:mobile-ui` — PASS
- `npm run check:states` — PASS
- `npm run check:hud` — PASS
- `npm run check:assets` — WARN
  - route is now correct; remaining warnings are duplicate Vite/Recast
    dev-mode requests, not missing `/terror-in-the-jungle/` assets
  - rerun after the cache split still reports no missing GLBs or public assets
- `npm run probe:fixed-wing` — PASS
  - A-1, F-4, and AC-47 all enter, accelerate, rotate, climb to target AGL,
    and can be positioned onto short-final approach
  - AC-47 also reaches its orbit-hold engagement altitude and sustains
    `orbit_hold` in the browser probe
  - player/NPC fixed-wing handoff is covered for all three aircraft: an attached
    NPC mission stays cold while the player owns the aircraft, then resumes
    after player exit
- Helicopter and fixed-wing entry reset shared flight mouse state to
  direct-control mode, preventing stale free-look state from carrying between
  vehicle adapters.
- Fixed-wing feel has its first Cycle 2 fix in place, but it is not human-signed
  off yet. Manual feedback reported stiff aircraft response, altitude
  bounce/porpoise after climb, and visible screen shake at speed. Code
  inspection found fixed-wing was rendering/querying raw airframe steps while
  helicopter physics exposed interpolated state. Airframe now exposes an
  interpolated pose, FixedWingModel renders/queries that visual pose, and
  PlayerCamera smooths fixed-wing follow, look target, and FOV by elapsed time.
  `npm run probe:fixed-wing` passes after the patch; the playtest checklist is
  still required before calling aircraft feel done.
- `npm run perf:compare` — PASS, 8/8 checks against refreshed baselines
- Targeted Cycle 2 soak/lifecycle tests — PASS
  - `npx vitest run src/systems/world/GameModeManager.test.ts src/systems/world/TicketSystem.test.ts scripts/perf-harness/perf-active-driver.test.js`
- `npm run doctor` — PASS
  - current shell: Node 24.14.1
  - repo target: `.nvmrc` says Node 24
- `npm run deadcode` — PASS
  - file-level removals, export hygiene, and retained historical script ignores
    are documented in `docs/rearch/deadcode-triage-2026-04-21.md`
- `npm audit --audit-level=moderate` — PASS
  - `npm audit fix` updated the ESLint tooling path for the `brace-expansion`
    advisory

## What Is Real Today

- The repo is healthy enough to build, smoke-test, run the mobile UI gate, and
  compare perf against refreshed baselines.
- The project is a playable combined-arms browser game, not just an engine
  shell.
- Helicopters and fixed-wing aircraft are both live in runtime.
- Atmosphere v1 is live: analytic sky, sky-tinted fog, day/night presets, ACES
  tone mapping before quantize, vegetation lighting parity, and procedural
  cloud coverage.
- The legacy static skybox path is gone: no `Skybox.ts`, no `NullSkyBackend`,
  and no `public/assets/skybox.png`.
- A Shau Valley is truthfully a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants.
- Performance governance is useful again after the 2026-04-20 baseline refresh,
  and the runtime/toolchain target is now aligned on Node 24.

## Current Drift

- Toolchain truth is aligned on Node 24. CI reads `.nvmrc`, and the refreshed
  2026-04-20 perf baseline memo was captured on Node 24.14.1.
- Local diagnostic scripts now route through the current Vite root path instead
  of the stale `/terror-in-the-jungle/?perf=1` local route.
- The fixed-wing browser probe is restored as `npm run probe:fixed-wing`; keep
  it maintained when `FixedWingModel` or airfield staging APIs change. It now
  validates takeoff, climb, AC-47 orbit hold, player/NPC handoff, and
  short-final approach setup.
- `npm run deadcode` is clean after removing unused files, accidental value
  exports, and unused type-only public surfaces.
- Deploy freshness is now part of the stabilization control plane:
  content-hashed Vite output builds into `/build-assets/`, stable public assets
  and GLBs revalidate through Cloudflare, and the service worker cache is bumped
  to `titj-v2-2026-04-21` so old `titj-v1` Cache Storage entries are dropped.
- Vite no longer runs `vite-plugin-compression`; `dist/` contains canonical
  assets only, while Cloudflare handles gzip/Brotli/Zstandard delivery according
  to visitor `Accept-Encoding` and zone rules.
- A Shau production runtime data now has the first R2 manifest path:
  `titj-game-assets-prod` contains content-addressed DEM/rivers objects,
  public `r2.dev` access is enabled for temporary validation, and
  `scripts/cloudflare-assets.ts` uploads, writes `dist/asset-manifest.json`,
  uploads manifest copies to R2, and validates size/content-type/cache/CORS.
  The custom R2 domain is still open, and production still needs a live Pages
  deploy after merge before the live A Shau gap can be called fixed.
- `npm run perf:capture:frontier30m` now uses perf-only Open Frontier lifecycle
  overrides (`perfMatchDuration=3600`, `perfDisableVictory=1`) so the script is
  a non-terminal 30-minute soak again. The tracked 2026-04-20 baseline still
  predates this fix and must be refreshed on a quiet machine.
- Historical docs and archived briefs still describe the pre-cutover skybox and
  stale perf baseline state. Current docs should point at the stabilization
  cycle before new feature work.
- Locked nested agent worktrees have been removed. The 24 local `task/*`
  branches that mapped to merged GitHub PRs were deleted locally.

## Immediate Priorities

1. Human-playtest the Cycle 2 fixed-wing interpolation/camera smoothing patch.
   If stiffness, bounce/porpoise, or visual shake persists, move next to
   airframe damping/control-response tuning with probe evidence.
2. Continue Cycle 2 with startup bundle weight reduction while fixed-wing feel
   waits for the scheduled human playtest.
3. Re-run `npm run validate:full` and refresh the `frontier30m` baseline from a
   quiet-machine session; do not use captures from a background-game session as
   baseline-quality evidence.
4. Run the updated manual deploy workflow and rerun the prod header spot-check
   in `docs/DEPLOY_WORKFLOW.md` for both Pages and the R2 asset URL. Then
   replace the temporary `r2.dev` endpoint with a custom R2 asset domain.
