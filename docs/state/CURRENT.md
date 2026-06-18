# Current State

Last aligned: 2026-06-17 local / 2026-06-18 UTC: the last production-proven dropped-frame stabilization remains `d7fdd9ca1d04f5546cfc8506a13bed22f5e6f295` with exact-head CI, deploy, live manifest SHA parity, Pages/R2/SW headers, and live browser smoke in `artifacts/perf/2026-06-16T04-51-05-642Z/projekt-143-live-release-proof/release-proof.json`. The active branch `task/dropped-frame-paired-evidence` is now a stabilization/evidence-pipeline closeout, not a completion claim: current source-stable work tightens occluded combat routing, aligns AI LOS with fire-authority terrain segments, splits aimed/suppressive terrain-block telemetry, keeps health/ammo visible during active-driver captures, fixes hidden-canvas shader prewarm, and pre-materializes active-combat close NPCs with release hysteresis. Open Frontier artifact `artifacts/perf/2026-06-17T23-48-02-957Z` is dirty-machine diagnostic-only and still fails rAF/dropped-frame and terrain-block pressure gates; HUD smoke artifact `artifacts/perf/2026-06-18T00-06-19-692Z` proves health/ammo visibility but intentionally lacks combat pressure. Runtime completion is not claimed until quiet-machine Open Frontier + A Shau EARS captures and owner playtest pass. Fable gated-systems readout and CI release-signal housekeeping proof from 2026-06-14 remain current; NOTE - all basin/level-depth water claims below are SUPERSEDED: hydrology + all water were stripped to first principles on 2026-06-09 and watercraft are dormant pending a future water rework; owner visual/feel acceptance remains open across the PLAYTEST_PENDING registry)

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

## Current focus (2026-06-17)

The most recent shipped work, newest first:

- **2026-06-17 local / 2026-06-18 UTC — dropped-frame evidence-pipeline closeout candidate**
  (`task/dropped-frame-paired-evidence`): the achievable closeout goal is to
  ship a production-stable evidence pipeline and same-experience mitigations,
  then leave the remaining dropped-frame finish line explicit. Current branch
  work addresses harness false positives and playtest-observed blind spots:
  trusted combat-approach anchors instead of occluded direct pursuit, shared
  AI/fire terrain authority, aimed-vs-suppressive terrain-block telemetry,
  active-driver HUD health/ammo visibility, hidden-canvas shader prewarm, and
  active-combat close-model pre-materialization with release hysteresis.
  Source validation is required before merge/deploy. Runtime proof remains
  open: `artifacts/perf/2026-06-17T23-48-02-957Z` is diagnostic-only, and
  `artifacts/perf/2026-06-18T00-06-19-692Z` is only a short HUD wiring smoke.
  Future completion still requires quiet-machine Open Frontier + A Shau EARS
  captures, live production proof, and owner playtest.
- **2026-06-15 local / 2026-06-16 UTC — dropped-frame stabilization and owner hotfix release**
  (`5684df747f2092c9095ad1bd5e868abacfd5ab77` stabilization, followed by
  `d7fdd9ca1d04f5546cfc8506a13bed22f5e6f295`, branch
  `task/dropped-frame-perf-harness`): the active goal is to reduce
  player-visible dropped-frame time and stutter while preserving combat
  pressure, terrain/vegetation readability, wildlife/animals where enabled,
  war assets, weather/atmosphere, draw distance, startup/deploy flow, and normal
  player flow. The repo is aligned around the copyable finish-line statement in
  `docs/tasks/overnight-dropped-frame-goal-statement.txt` and the working
  handoff in
  `docs/tasks/cycle-2026-06-14-dropped-frame-time-perf-research.md`.
  Stabilization proof is green: focused tests, `validate:fast`, `build`,
  exact-head CI/deploy/live-release for the stabilization head passed, and the
  owner steering / Huey mesh hotfix was also pushed to `master`, deployed, and
  live-verified at exact head `d7fdd9c` (`27594724546`, `27594906745`,
  `artifacts/perf/2026-06-16T04-51-05-642Z/projekt-143-live-release-proof/release-proof.json`).
  Static cleanups and the later current-head A Shau diagnostic are still not
  completion proof: `artifacts/perf/2026-06-16T04-57-34-868Z` failed with
  heavy rAF dropped-frame time and showed terrain/CDLOD presentation churn in
  the gap epochs.
  When perf capture resumes, agents should inspect `summary.json`,
  `presentation-epochs.json`, tail attribution, browser stall entries, and
  driver trust fields before making further broad optimization changes. Runtime
  success still needs relevant quiet-machine perf/full evidence and owner
  playtest.
- **2026-06-14 — Fable gated-systems readout**
  (`cycle-2026-06-14-fable-gated-systems-readout`): docs/proof-only readout
  is recorded. Renderer policy is promoted as one WebGPU-primary project with
  fallback, not split WebGPU/WebGL2 projects. Heightfield/erosion remains
  debug-only/deferred; debug hydrology remains future-VODA-only; sky/cloud/post
  is the strongest visual spike candidate but still default-off pending strict
  WebGPU visual matrix and owner acceptance; vegetation source assets are
  deferred to an authored/imported asset pass; forest aggregate LOD and
  Nanite-lite aggregate culling are deferred to scoped prototypes. Runtime
  water, terrain authority swap, code-generated procedural vegetation, Fable
  assets/species, full Forests port, and true meshlet Nanite remain no-go.
- **2026-06-14 — procedural vegetation controlled burn**
  (`cycle-2026-06-14-procedural-vegetation-controlled-burn`): the generated
  procedural vegetation candidate path is rejected. The code-generated
  banyan/rubber/teak/areca/mangrove/elephant-grass/deadfall/vine scaffold was
  not visually acceptable and has been removed from prod-facing source. There
  is no procedural vegetation pipeline, preview factory, gallery bootstrap
  route, package script, runtime hook, or generated candidate asset shipping
  from that pass. Fable remains useful only as an architecture reference:
  accepted source assets first, then near geometry, mid aggregate/culling, and
  far impostor or canopy shell only after source acceptance.
- **2026-06-13 — CI release-signal housekeeping**
  (`cycle-2026-06-13-ci-release-signal-housekeeping`): root cause for the
  cancelled push checks was the manual `workflow_dispatch` CI sharing
  `ci-${{ github.ref }}` with push CI. The wrapper behind `npm run ci:manual`
  now checks for exact-HEAD `ci.yml` runs and watches/reuses an active or
  successful run before dispatching a duplicate. If the latest exact-HEAD CI
  run already completed non-success, the wrapper fails instead of masking it
  with a new run. `ci.yml` concurrency is now
  `ci-${{ github.event_name }}-${{ github.ref }}`, so push and manual CI can no
  longer cancel each other while stale same-event attempts still collapse. The
  separate Dependabot `esbuild` dynamic update failure on this head is handled
  by a root `esbuild@0.28.1` override; remaining `npm audit` output is moderate
  transitive `wrangler`/`miniflare`/`ws`/`brace-expansion` maintenance. This is
  release housekeeping only: no gameplay code, vegetation assets, weapon pose,
  vehicle tuning, water, terrain, sky, or renderer behavior changed.
  Current production proof for head `68798b85d137c4fa50ae7f0de3f30f4113648af3`
  is green: push CI run `27483500090`, deploy run `27483575632`, and
  `npm run check:live-release` PASS at
  `artifacts/perf/2026-06-14T00-41-05-810Z/projekt-143-live-release-proof/release-proof.json`.
- **2026-06-13 — world-systems runtime release**
  (`cycle-2026-06-13-world-systems-runtime-release`, deployed
  `965f4fe5760896e57a40ffa46f571695403412e4`): latest `master` has
  player-facing runtime changes, not only proof records. The
  accepted vegetation aggregate LOD pass remains the vegetation scope for this
  release: `JungleGroundRing`, far-canopy coverage, and the accepted
  `fanPalm`/`coconut` canopy tier ship; broadleaf/rubber/banyan/mangrove/
  elephant-grass source assets remain blocked until an accepted asset pass.
  First-person weapon hip presentation is lowered for all guns while ADS stays
  level. Wheeled and tracked vehicle physics now add lateral grip,
  slope-drive floor, reduced grounded slope gravity, and retuned M151,
  M35/ZIL, and M113 profiles for less ice-rink drift and better hill authority;
  the shared ground follow camera is also pulled back/up so promoted trucks and
  APCs do not trap the view inside the hull.
  Existing sky-dome clouds receive a safe visibility-weight retune; the deeper
  WebGPU-only sky/cloud/post replacement remains matrix-gated and default-off.
  No terrain ownership swap, runtime water, wholesale Fable assets, full forest
  port, or true meshlet Nanite ships in this release. Local runtime proof is
  green across focused tests, `validate:fast`, `validate`, vegetation horizon /
  grounding, TOD coherence, land-vehicle runtime proof, browser smoke, and Open
  Frontier startup. Strict `perf:quick` all-green is a no-go for this slice
  because the standard run still fails heap recovery and warns on p99; the CDP
  forced-GC diagnostic shows heap can recover but is not clean frame-tail proof,
  and `check:memory` is stale against the current deploy flow. Exact-HEAD CI
  run `27482202770`, deploy run `27482272756`, and `npm run check:live-release`
  all passed; live proof is
  `artifacts/perf/2026-06-13T23-29-50-702Z/projekt-143-live-release-proof/release-proof.json`.
- **2026-06-13 — world-systems promotion gates**
  (`cycle-2026-06-13-world-systems-promotion-gates`): current next-cycle
  scaffold turns the remaining Fable-derived topics into explicit GO/SPIKE/
  NO-GO decisions. Safe runtime promotions are limited to existing accepted
  vegetation/runtime renderer policy and vehicle interaction clarity; terrain
  authority, debug water, sky/cloud/post, and forest aggregate LOD remain spike
  lanes; runtime water, true meshlet Nanite, and wholesale Fable asset/species
  ports are no-go until separately approved. The code-backed ledger is
  `src/systems/world/WorldSystemsPromotionGate.ts` with gate script
  `npm run check:world-systems-promotion`.
- **2026-06-13 — Fable/world-systems release-decision run**
  (`cycle-2026-06-13-world-systems-release-decision-run`): latest `master`
  is treated as the release candidate. The proof/scaffold subset is GO:
  renderer feature profile/device-loss/limits reporting, debug
  heightfield/erosion spike, debug water proof, sky/cloud/post proof gate,
  Vietnam vegetation species/source specs, forest aggregate LOD planner,
  culling attribution tags, and documentation. The risky expansions stay
  default-off/deferred: terrain authority swap, runtime water,
  sky/cloud/post replacement, new vegetation source assets, runtime
  forest/HLOD, and true meshlet Nanite. Release truth for the final
  decision-record commit is `npm run validate`, `npm run deploy:prod`,
  optional exact-HEAD `npm run ci:manual`, and `npm run check:live-release`.
- **2026-06-13 — Fable5 world-system debug proofs**
  (`cycle-2026-06-13-fable5-world-systems-debug-proofs`, deployed
  `6796a6a6`): Fable5 is reference-only. The cycle shipped TIJ-owned
  diagnostics and proof hooks for heightfield/erosion, debug-only water,
  strict-WebGPU sky/cloud/post proof, Vietnam species specs, forest aggregate
  LOD planning, and culling attribution. It did not copy Fable assets, swap
  terrain authority, reactivate gameplay water, default-on cloud/post, or ship
  runtime HLOD/Nanite.
- **2026-06-12 — war-asset repaint integration** (`cycle-2026-06-11-war-asset-repaint`,
  12 PRs #383-#394, deployed `9c64c0bf`): the 108-asset Pixel Forge repaint
  flows through a generalized importer (`npm run assets:import-war-catalog` —
  per-class axis wrap, rig-joint grafts, index/vertex canonicalization, budget
  triage) into the generated `src/config/generated/warAssetCatalog.ts`, with
  all five consumer classes cut over (weapons rig, helicopters, fixed-wing,
  ground vehicles, world placements), an in-engine `/gallery` review route,
  ambient wildlife (OF + A Shau), and the B-52 Arc Light air-support call-in.
  8 over-budget structures keep their prior GLBs pending re-rolls
  (`docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md`). KATALOG-1 is
  code-complete; the owner walk gates close. Post-close owner-reported fixes:
  viewmodel magazine seating (#394) and sustained-fire recoil plateau (#395).
- **2026-06-10 — unified lighting rig default** (campaign #363-#381): legacy
  lighting deleted; `check:tod-coherence` is a standing pre-deploy gate;
  one-release kill-switch `window.__lightingRig.enabled=false` (removal due).
  Same day: A Shau cold-load freeze root-caused and fixed (`StampSpatialIndex`).
- **2026-06-09 — water scorched to first principles**: hydrology and ALL water
  (rendering, query/physics, swimming, authored basins) removed; boats dormant;
  the water narrative in the section below is retained as engineering history
  only. Rework lands in a future terrain/world-gen cycle.

## Prior focus (2026-06-01, partially superseded above)

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
water path could read as a narrow terrain-following surface. The accepted
gameplay-water surface is now authored Open Frontier and A Shau level/depth
basins: they carve bounded beds, render filled `level-depth-water-bodies`
footprints, and return `water_body` samples while hydrology remains a
drainage/material sensor. The fresh local runtime proof passes and records the
current mesh cost at 962 total vertices / 481 vertices per basin body:
`artifacts/perf/2026-06-08T18-04-38-049Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
The latest land-vehicle owner-acceptance proof covers live M151 and M48 targets
in Open Frontier and A Shau using the current board/drive/exit path:
`artifacts/playtests/land-vehicle-runtime-proof/land-vehicle-runtime-proof.json`
with matching after-board/after-drive screenshots. This run proves W-drive
displacement, elevated third-person camera framing, clean exit, and
infantry-weapon suppression through the vehicle-session/equipment state. The
proof now fails if any first-person weapon overlay root or mesh remains
renderable while seated; this replaces the older current-rig-only diagnostic
that could miss stale rifle overlays in screenshots.
Production proof is deploy-scoped, not inherited from older release artifacts:
after every pushed `master` deploy, run `npm run check:live-release` and trust
that gate's live manifest SHA, CI/deploy run, Pages/R2/SW headers, and browser
smoke for the current deployed HEAD.
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
  [docs/directives/webgpu-migration-10.md](../directives/webgpu-migration-10.md) and
  [docs/rearch/POST_WEBGPU_MIGRATION_2026-05-13.md](../rearch/POST_WEBGPU_MIGRATION_2026-05-13.md).
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
- M151 and M48 owner-acceptance automation now covers Open Frontier and A Shau:
  scenario-spawned M151s are real `IVehicle`s instead of static dressing, Open
  Frontier/A Shau M48s remain boardable and drivable, ground/tank follow cameras
  use elevated third-person framing, and `FirstPersonWeapon` is suppressed at
  the equipment layer while any vehicle/craft session is active. Screenshots in
  `artifacts/playtests/land-vehicle-runtime-proof/` are the current visual proof
  for "no rifle visible while seated"; older screenshots that show a
  lower-right rifle are stale/rejected evidence. Ground-vehicle controls are
  now documented and surfaced as `F board / exit / seat`, `W/S drive`,
  `A/D turn`, and `LMB fire` for armed vehicles.
- WebGPU `WebGPURenderer` + TSL node materials across terrain, vegetation
  impostors, NPC impostors, and the TSL atmosphere dome, with automatic WebGL2
  fallback for non-WebGPU environments.
- Atmosphere CPU cost holds under ~1 ms total across all five modes after the
  KONVEYER and sun-atmosphere work moved the visual dome off the old large
  LUT-bake path; the small CPU LUT remains for fog/hemisphere readers. Evidence:
  [docs/directives/webgpu-migration-10.md](../directives/webgpu-migration-10.md).
- SOL-1 is engineering-complete and deployed for the current visual rejection:
  sun scale, red/white night terrain reads, lighting-angle coherence,
  terrain/water material response, and hill/ridge light bleed have full local
  matrix, focused ridge, and live-production proof. Owner visual acceptance is
  still the remaining closeout gate.
- Active SOL-1 mitigation on master retunes the sun body against the Sheep Dog
  Simulator WebGPU reference, uses cool moonlight below the horizon, tints
  low-sun ambient fill, dims water specular/emissive/foam response at night,
  and adds an
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
  as a damp grey sphere. The true WebGPU path keeps the SDS-style additive TSL
  body, while the explicit WebGL renderer fallback caps its hot center to warm
  white instead of clipped pure white. Post-feedback full matrix proof passes
  `33/33` captures in
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/summary.json`:
  daylight WebGPU `sunCore=0.105-0.113%`, `sunSpan=5.19-5.46%`, explicit WebGL2
  Open Frontier `sunCore=0.085-0.086%`, `sunSpan=4.44%`, WebGPU/WebGL2 parity
  max channel delta `0.39%`, all sun-scale checks PASS, and all active
  night-terrain diagnostics PASS. A Shau dusk ridge proof uses a true
  terrain-occluded sun-body pose in
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/ridge-summary.json`:
  strict WebGPU and production fallback both record
  `sunVisibility=terrain-occluded`, `sunOcclusion=55m`, `sunCore=0`,
  `sunSpan=0`, ridge warmth PASS, sun-scale PASS, and parity max channel delta
  `0.00%`. A Shau midnight proves the authored level/depth water body on a cool
  opaque night material with
  `localMax(red=0.0% white=0.0% cyan=0.0% bright=0.0%)`, replacing the previous
  red water-body slab. Production proof is the live-release verifier:
  `npm run check:live-release` must pass against the current deployed `master`
  SHA, including CI/deploy success, live manifest SHA parity, Pages/R2/SW
  headers, and live browser smoke. The next SOL-1 goal is owner visual
  acceptance.
- A Shau Valley is a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants. DEM delivery is
  manifest-backed locally.
- Open Frontier and A Shau now use authored level/depth basin water bodies for
  playable water instead of hydrology river surfaces; the legacy global
  sea-level plane is opt-in only and disabled in both modes. Hydrology remains
  useful for drainage/material masks. The current renderer draws filled basin
  footprints with deterministic shoreline variation, depth-color/alpha rings,
  a daytime standard-material bridge, and a cool opaque night material; owner
  water game-feel acceptance, shoreline art polish, and a future natural
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
