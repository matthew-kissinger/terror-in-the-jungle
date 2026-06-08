# Current State

Last verified: 2026-06-08 (SOL-1 SDS-style candidate: `SunDiscMesh` owns the depth-tested hot body with mottled internal heat, the TSL dome adds bounded glow plus tighter warm sky solar mass, full local visual matrix and A Shau ridge proof pass; owner visual acceptance remains open; terrain-vehicle-water foundation reset live proof for `df97e707` remains prior production evidence)

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

2026-06-07 correction: the next long-horizon objective is
`terrain-vehicle-water-foundation-reset`. Treat VODA / VEKHIKL / DEFEKT-7
code-complete rows as engineering history until new owner-visible proof shows
vehicles spawn and drive on flat terrain, tanks exist for both teams and take
damage, authored level/depth water reads as integrated water instead of
ribbons/stamps, and Zone Control objectives sit on playable pads.
R1 local proof now covers the shared M2HB/M48/watercraft terrain-water spawn
resolver, US/NVA M48 registration/rest-height and tank explosion-damage routing
in Open Frontier and A Shau, shared non-tank vehicle explosion damage, and Zone
Control home-base no-drift/flat-core browser evidence. Latest local headed
proof is `PASS`:
`artifacts/playtests/terrain-vehicle-water-foundation-reset/terrain-foundation-proof.json`.
The earlier hydrology checks are diagnostic only: screenshots showed the old
water path could read as a narrow terrain-following surface. R2 replaces the
accepted gameplay-water surface with authored Open Frontier and A Shau
level/depth reaches: they carve bathymetry, render `level-depth-water-bodies`,
and return `water_body` samples while hydrology remains a drainage/material
sensor. The headed local foundation proof passes. The live Cloudflare Pages
proof also passes for `df97e707`:
`artifacts/perf/2026-06-07T21-16-21-306Z/projekt-143-live-release-proof/release-proof.json`.
Owner playtest remains open for subjective terrain/water/vehicle feel.

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
combat (DEFEKT-3). The old hydrology river-surface fix is superseded by the
authored level/depth water-body foundation reset in
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
- **KB-STARTUP-1, KONVEYER-12, SOL-1, DEFEKT-1/2/6, STABILIZAT-1, SVYAZ-*,
  UX-*, DIZAYN-3** — open; see DIRECTIVES rows and the per-id memos
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
  impostors, NPC impostors, and the TSL atmosphere dome, with automatic WebGL2
  fallback for non-WebGPU environments.
- Atmosphere CPU cost holds under ~1 ms total across all five modes after the
  KONVEYER and sun-atmosphere work moved the visual dome off the old large
  LUT-bake path; the small CPU LUT remains for fog/hemisphere readers. Evidence:
  [docs/directives/konveyer-10.md](../directives/konveyer-10.md).
- SOL-1 is now open for the current visual rejection: sun scale, red/white
  night terrain reads, lighting-angle coherence, terrain/water material
  response, and hill/ridge light bleed need a full proof and likely authority
  cleanup before final visual acceptance.
- Active SOL-1 mitigation on master shrinks the sun body, uses cool
  moonlight below the horizon, tints low-sun ambient fill, dims water
  specular/emissive/foam response at night, and adds an
  `AtmosphereLightingSnapshot` consumed by renderer lights, billboard
  vegetation, water, terrain night fill, and a bounded low-sun terrain
  heightmap/relief response. The renderer-facing low-sun directional light is
  now bounded separately from the analytic sky color so terrain does not receive
  an unbounded red sun value. The shadow-follow path preserves follow-target
  altitude so A Shau low-sun lights do not target world Y=0 from below elevated
  terrain. The TSL dome and CPU LUT also share a cool sub-horizon sky floor.
  Focused Open Frontier midnight and TDM twilight captures removed cyan water,
  lifted the near-black sky floor, reduced white fill, and stopped TDM twilight
  terrain from falling near-black. The 2026-06-08 proof refresh also fixed an A
  Shau sun-facing capture bug by using terrain-relative camera clearance, and
  tightened `sun-scale` so missing sun-body detection fails instead of passing.
  The final focused source candidate fixes stale camera-relative `SunDiscMesh`
  positioning in `syncDomePosition()`, retunes the depth-tested body with a
  broader warm-white center, mottled internal heat, and ember rim, and adds a
  tighter SDS-style warm sky solar mass so the surrounding area no longer reads
  as a damp grey sphere. The
  full local matrix now passes across all five scenarios and time-of-day
  captures. Representative Open Frontier golden proof records WebGPU
  `sunCore=0.045%`, `sunSpan=3.33%` and explicit WebGL2 `sunCore=0.042%`,
  `sunSpan=3.24%`, with WebGPU/WebGL2 parity max channel delta `4.31%`.
  Matrix-wide WebGPU sun core is `0.044-0.048%`, sun span is `3.33-3.43%`, and all
  sun-scale checks pass. Midnight rendered-terrain
  checks pass red/white/cyan bounds across all five scenarios; the older strict
  night-red sampler remains intentionally over-tight and logs strict failures,
  while the active red-not-dominant terrain diagnostic passes 5/5. A Shau dusk
  ridge proof now uses a true terrain-occluded sun-body pose: strict WebGPU and
  the production `webgpu-force-webgl` fallback both record
  `sunVisibility=terrain-occluded`, `sunOcclusion=55m`, `sunCore=0`,
  `sunSpan=0`, ridge warmth PASS, sun-scale PASS, and parity max channel delta
  `0.00%`.
  Production parity is proven by rerunning `npm run check:live-release` after
  each deployment. SOL-1 is still not visually accepted: the next goal is
  SOL-1R7 owner visual acceptance.
- A Shau Valley is a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants. DEM delivery is
  manifest-backed locally.
- Open Frontier and A Shau now use authored level/depth water bodies for
  playable water instead of hydrology river surfaces; the legacy global
  sea-level plane is opt-in only and disabled in both modes. Hydrology remains
  useful for drainage/material masks. Water game-feel and a future WebGPU/TSL
  water material remain polish work.
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
