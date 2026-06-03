# Current State

Last verified: 2026-06-02 (perf-baselines.json removal: corrected the baseline-refresh framing to "no baseline tracked; perf:compare is non-gating"; prior refresh 2026-06-01 post optimal-development arc)

Top-level current-truth snapshot for the repo. Authoritative status lives in
the registries below; this file is the short narrative pointer, not a second
tracker. ~250 LOC is the editorial target (the enforced caps are soft 800 /
hard 1500 — see Drift watch).

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
> combat verified at 120 NPCs while an ECS hot path is evaluated (Phase F).

That qualifier is mandatory in any public-facing claim about scale until
Phase F lands. See [docs/ROADMAP.md](../ROADMAP.md) for the canonical sentence
and phase summary.

## Current focus (2026-06-01)

`master` is the WebGPU + TSL renderer branch and has been since the KONVEYER
campaign merged via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
(commit `1df141ca`) on 2026-05-13. The renderer instantiates Three.js r184
`WebGPURenderer` from `three/webgpu`; environments without WebGPU adapter
support fall back to the WebGL2 path automatically, and strict mode
(`?renderer=webgpu-strict`) is the acceptance bar for renderer-parity evidence.

The most recent work is the **2026-06-01 optimal-development arc** — eight
workflow-orchestrated phases shipped to `master` and deployed live (tip
`17adc18a`): (0) doc grounding to code reality; (1) instrument-trust (perf
baseline staleness guard, `scripts/` brought under lint+typecheck, knip config
fixed 462→87); (2) per-frame alloc hardening + a +142-test behavior backfill +
the `check:doc-drift` gate broadened to the full doc tree and wired into CI;
(3) an adversarial bug hunt (6 confirmed fixes, all red→green; ~17 refuted by
probe); (4) god-file budget burndown (4 hard FAILs → 0 via facade splits) and a
bitECS scoping spike that benchmarked 1.0–1.09× vs OOP → **DEFER**
(corroborates the E1 memo; [docs/rearch/ECS_SPIKE_2026-05-31.md](../rearch/ECS_SPIKE_2026-05-31.md));
(5) aviation/UX scoped against current code (most already built) with DIRECTIVES
realigned ([docs/rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md](../rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md)).
Suite 5249 green; `lint:budget` clean; `check:doc-drift` clean. Posture
autonomous-loop; feel-walks deferred to
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

The preceding cycle,
[`cycle-2026-05-28-vehicles-aircraft-operable`](../tasks/archive/cycle-2026-05-28-vehicles-aircraft-operable/cycle-2026-05-28-vehicles-aircraft-operable.md),
made ground vehicles, tanks, and aircraft operable end-to-end (boarding
follow-cam, tank crew + cannon + spawn discoverability, aircraft armament with
friend-or-foe) and wired the O(1) `CoverSpatialGrid` cover path into prod
combat (DEFEKT-3). The hydrology river-surface fix remains owner-gated in
[docs/BACKLOG.md](../BACKLOG.md).

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
  task wired the existing O(1) `CoverSpatialGrid` into prod combat; the
  combat120 p99 PASS is unverified. No perf baseline is currently tracked —
  `perf-baselines.json` was removed, so `perf:compare` prints raw
  latest-capture metrics without pass/fail gating; STABILIZAT-1 (open) would
  re-establish a baseline via `perf:update-baseline`. See
  [docs/state/perf-trust.md](perf-trust.md) for the measurement chain.
- **KONVEYER-10/11** — closed; full slice-by-slice evidence in
  [docs/directives/konveyer-10.md](../directives/konveyer-10.md) and
  [docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md).
- **AVIATSIYA-4, AVIATSIYA-7** — code-complete (playtest deferred) per the
  2026-06-01 scope pass; **AVIATSIYA-5, AVIATSIYA-6** — open (partial): nose
  cannon + live-fire + station-keep + NPC maneuver state machine done;
  per-aircraft period weapons, lead/sway aids, and named maneuver routes
  deferred.
- **ECS hot path (Phase F)** — evaluation recorded **DEFER** (bitECS spike
  1.0–1.09× vs OOP, off the prod path); combatants stay in `Map<string,Combatant>`.
- **KB-STARTUP-1, KONVEYER-12, DEFEKT-1/2/6, STABILIZAT-1, SVYAZ-*, UX-*,
  DIZAYN-3** — open; see DIRECTIVES rows and the per-id memos
  under [docs/directives/](../directives/).

## What is real today

- Repo builds, lints, and tests green in CI (the blocking gates). The
  Playwright-browser jobs (smoke, mobile-ui, perf) are currently advisory
  (`continue-on-error`) due to a persistent GitHub-runner `playwright install`
  hang (Chromium downloads 100% then stalls post-download) — `prod-smoke` stays
  enforced locally via `npm run validate` and post-deploy via
  `check:live-release`; restore those jobs to blocking once the install hang is
  fixed (Playwright bump / browser cache). No perf baseline is currently
  tracked (`perf-baselines.json` was removed); `perf:compare` prints raw
  latest-capture metrics with no pass/fail gating, and the CI perf job is
  advisory (`continue-on-error`). See [docs/state/perf-trust.md](perf-trust.md)
  for the measurement chain.
- Playable combined-arms browser game, not just an engine shell.
- Helicopters and three flyable fixed-wing aircraft (A-1, F-4, AC-47) are
  live with HUD/control law, weapons (helicopter door-gun + chin minigun +
  rocket pods; fixed-wing nose cannon with friend-or-foe), and operable
  boarding/crew/cannon. Remaining aviation work is design-heavy (per-aircraft
  period weapons, lead/sway aiming, named maneuver routes), deferred per
  [docs/rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md](../rearch/PHASE5_FEATURE_SCOPE_2026-05-31.md).
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

Live release is gated on the blocking CI jobs (lint + test + build); the
Playwright-browser jobs (smoke, mobile-ui, perf) are currently advisory (see
"What is real today"), with manual Cloudflare Pages deploy via `deploy.yml`.
Production deploy SHA is the live
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

The lint only enforces the soft 800 / hard 1500 caps above; ~250 LOC is a
softer editorial target, not a lint threshold. If this doc starts growing
past ~250 LOC, that is the signal to file another split task — do not let it
return to the audit-JSON-as-prose shape that motivated the original split.
