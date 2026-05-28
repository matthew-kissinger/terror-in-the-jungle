# Current State

Last verified: 2026-05-28 (drift-correction refresh under `doc-consolidation-and-refs`; historical KONVEYER slice-by-slice evidence consolidated into [docs/directives/konveyer-10.md](../directives/konveyer-10.md) and [docs/archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md))

Top-level current-truth snapshot for the repo. Authoritative status lives in
the registries below; this file is the short narrative pointer, not a second
tracker. Keep it under ~250 LOC (see Drift watch).

- [docs/DIRECTIVES.md](../DIRECTIVES.md) — binary directive registry (open / closed)
- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry (single source of truth for unresolved items)
- [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) — playtest-deferred items awaiting an owner walk
- [docs/state/perf-trust.md](perf-trust.md) — measurement-chain status (combat120 baseline trust)
- [docs/state/recent-cycles.md](recent-cycles.md) — last cycle outcomes
- [docs/ROADMAP.md](../ROADMAP.md) — aspirational vision; canonical vision sentence
- [docs/BACKLOG.md](../BACKLOG.md) — strategic-reserve index

Historical full-fat snapshot (pre-Phase-1) lives at `docs/archive/STATE_OF_REPO.md`; link future audit summaries to artifact paths instead of paraphrasing JSON here.

## Vision

> Engine architected for 3,000 combatants via materialization tiers; live-fire
> combat verified at 120 NPCs while the ECS hot path is built out (Phase F).

That qualifier is mandatory in any public-facing claim about scale until
Phase F lands. See [docs/ROADMAP.md](../ROADMAP.md) for the canonical sentence
and phase summary.

## Current focus (2026-05-28)

`master` is the WebGPU + TSL renderer branch and has been since the KONVEYER
campaign merged via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(commit `1df141ca`) on 2026-05-13. The renderer instantiates Three.js r184
`WebGPURenderer` from `three/webgpu`; environments without WebGPU adapter
support fall back to the WebGL2 path automatically, and strict mode
(`?renderer=webgpu-strict`) is the acceptance bar for renderer-parity evidence.

The active cycle is
[`cycle-2026-05-28-vehicles-aircraft-operable`](../tasks/cycle-2026-05-28-vehicles-aircraft-operable.md):
making ground vehicles, tanks, and aircraft actually operable end-to-end
(third-person follow-cam on boarding, tank crew + cannon + spawn
discoverability, aircraft armament with friend-or-foe), with bundled
repo-alignment tasks — wire the dead `CoverSpatialGrid` O(1) cover path into
prod combat (DEFEKT-3), consolidate drifted docs (this task), and archive
unreferenced scripts. Posture is autonomous-loop: per-cycle playtests become
Playwright smoke + screenshots, deferred to
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

Several preceding campaigns are now closed and historical: the post-WebGPU
feature-pivot campaign (VODA water, VEKHIKL ground vehicles, DEFEKT fixes) was
cut at cycle #12 on 2026-05-18 — see
[docs/archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../archive/CAMPAIGN_2026-05-13-POST-WEBGPU.md),
[docs/archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md](../archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md),
and
[docs/archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](../archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md).

## Directive status (authoritative list in DIRECTIVES.md)

[docs/DIRECTIVES.md](../DIRECTIVES.md) is the binary registry. Headline state
as of this refresh:

- **DEFEKT-4** (NPC navmesh route quality) — closed 2026-05-18.
- **VODA-1/2/3, VEKHIKL-1/2/3/4** — code-complete; VODA/VEKHIKL playtests are
  deferred to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).
- **DEFEKT-3** (combat AI p99 — synchronous cover search in
  `AIStateEngage.initiateSquadSuppression`) — open. The `cover-grid-wiring`
  task in the active cycle injects the existing O(1) `CoverSpatialGrid`; see
  [docs/state/perf-trust.md](perf-trust.md) for the measurement chain.
- **KONVEYER-10/11** — closed; full slice-by-slice evidence in
  [docs/directives/konveyer-10.md](../directives/konveyer-10.md) and
  [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md).
- **KB-STARTUP-1, KONVEYER-12, DEFEKT-1/2/6, STABILIZAT-1, AVIATSIYA-*,
  SVYAZ-*, UX-*, DIZAYN-3** — open; see DIRECTIVES rows and the per-id memos
  under [docs/directives/](../directives/).

## What is real today

- Repo builds, lints, smoke-tests, and runs the mobile UI gate. CI perf
  capture/compare is advisory; baseline refresh remains blocked per
  [docs/state/perf-trust.md](perf-trust.md).
- Playable combined-arms browser game, not just an engine shell.
- Helicopters and three flyable fixed-wing aircraft (A-1, F-4, AC-47) are
  live in runtime with HUD/control law. Operability gaps (boarding camera,
  aircraft armament, tank crew/cannon) are the active cycle's scope.
- WebGPU `WebGPURenderer` + TSL node materials across terrain, vegetation
  impostors, NPC impostors, and the LUT-driven Hosek-Wilkie atmosphere
  surface, with automatic WebGL2 fallback for non-WebGPU environments.
- Atmosphere CPU cost holds under ~1 ms total across all five modes after the
  KONVEYER sky-refresh work (LUT-driven refresh + `DataTexture` upload +
  idempotent `setCloudCoverage`); the worst-case A Shau SkyTexture EMA dropped
  ~5.96 ms → 0.52 ms across that arc. Evidence:
  [docs/directives/konveyer-10.md](../directives/konveyer-10.md).
- A Shau Valley is a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants. DEM delivery is
  manifest-backed locally.
- River-bearing modes use hydrology river surfaces; the legacy global
  sea-level plane is opt-in only and disabled in Open Frontier and A Shau.
  `npm run check:hydrology-bakes` passes. Water game-feel and a future
  WebGPU/TSL water material remain polish work.
- Pixel Forge NPC/vegetation runtime art is the production truth; old
  sprites/source-soldier PNGs are guarded by
  `npm run check:pixel-forge-cutover`.
- Performance governance is functional; runtime/toolchain target is Node 24.

## Hotfix cautionary tale (2026-05-08)

`cycle-2026-05-08-perception-and-stuck` shipped Stage D2 terrain CDLOD work,
but `createTileGeometry` in `src/systems/terrain/CDLODRenderer.ts` shipped
with an inverted Z coordinate that flipped triangle winding so every interior
face had a -Y normal; default `MeshStandardMaterial(FrontSide)` backface-culled
the terrain from above on every map.

The fix removes the extra negation in `src/systems/terrain/CDLODRenderer.ts`
and adds a face-normal regression test in `CDLODRenderer.test.ts`. This is the
cautionary tale that motivated the scenario-smoke screenshot gate
([scripts/scenario-smoke.ts](../../scripts/scenario-smoke.ts)). The later
`5e3436c` hardening makes skirt walls emit both triangle windings so backface
culling cannot expose bright terrain cracks.

## Live deploy verification

Live release is gated on blocking CI (lint + test + build + smoke +
mobile-ui), review of the advisory perf artifact, and manual Cloudflare Pages
deploy via `deploy.yml`. Production deploy SHA is the live
`/asset-manifest.json` source of truth — do not freeze it into this doc.

To verify the current production state, fetch
`https://terror-in-the-jungle.pages.dev/asset-manifest.json` and read
`gitSha`. The release-proof check is `check:live-release`.

## Drift watch

Per the realignment plan, the doc-discipline lint
(`scripts/lint-docs.ts`) is the gate that keeps this file honest:

- Date header (`Last verified: YYYY-MM-DD`) required in first 10 lines
- Soft cap: 800 LOC; hard cap: 1500 LOC
- Top-level docs claiming an NPC count must include the canonical
  qualifier or link to ROADMAP

If this doc starts growing past ~250 LOC, that is the signal to file
another split task — do not let it return to the audit-JSON-as-prose
shape that motivated the original split.
