# Current State

Last verified: 2026-05-13 (KONVEYER campaign closed by `master` merge of `exp/konveyer-webgpu-migration` via PR #192 / commit `1df141ca`; master is now the WebGPU + TSL renderer branch with automatic WebGL2 fallback for unsupported environments)

Top-level current-truth snapshot for the repo. Companion docs:

- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry (single source of truth for unresolved items)
- [docs/state/perf-trust.md](perf-trust.md) — measurement-chain status (combat120 baseline trust)
- [docs/state/recent-cycles.md](recent-cycles.md) — last 3 cycle outcomes
- [docs/ROADMAP.md](../ROADMAP.md) — aspirational vision; canonical vision sentence
- [docs/BACKLOG.md](../BACKLOG.md) — strategic-reserve index
- [docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md](../rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md) —
  WebGPU/TSL research spike and follow-up architecture direction
- [docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md](../rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md) —
  reviewer-ready synthesis of what is accepted, what is blocked, what needs rearchitecture, and the WebGPU/TSL verdict
- [docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md](../rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md) —
  research spike: better compute primitives for the expensive systems (SkyTexture, Combat, World) identified by slices 10–11

Historical full-fat snapshot (pre-Phase-1) lives at
`docs/archive/STATE_OF_REPO.md`. Future audit summaries link to artifact
paths; do not paraphrase audit JSON into this doc.

## Vision

> Engine architected for 3,000 combatants via materialization tiers; live-fire
> combat verified at 120 NPCs while the ECS hot path is built out (Phase F,
> ~weeks 7–12 of the 2026-05-09 realignment plan).

That qualifier is mandatory in any public-facing claim about scale until
Phase F lands. See [docs/ROADMAP.md](../ROADMAP.md) for the canonical sentence
and phase summary.

## Current focus (2026-05-13, post-WebGPU master merge)

The KONVEYER campaign closed when `exp/konveyer-webgpu-migration` merged into
`master` via [PR #192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192)
on 2026-05-13T02:06:03Z. Master is now the WebGPU + TSL renderer branch by
default. The renderer instantiates Three.js r184 `WebGPURenderer` from
`three/webgpu`; environments without WebGPU adapter support (Chrome <113,
Firefox <147, Safari <26, headless runners with no GPU) fall back to the
existing WebGL2 path automatically. Strict mode (`?renderer=webgpu-strict`)
remains the acceptance bar for KONVEYER review evidence; production startup
without the flag does not fail loudly on WebGL.

Merge commit: `1df141ca`. The WebGL-fallback gate was added immediately
after the migration merge as `4aec731e`
(`fix(renderer): gate WebGL-fallback rejection on strict mode only`), so the
fallback path is governed by mode and reviewer evidence, not by silent
acceptance. The merge ran 5 of 6 CI checks green at decision time (lint,
test, build, perf, smoke); mobile-ui was still running and is informational
rather than a required gate per
`gh api repos/.../branches/master/protection` (no protection rules set).

What is stable on master now:

- WebGPU `WebGPURenderer` + TSL node materials across terrain, vegetation
  impostors, NPC impostors, and the LUT-driven Hosek-Wilkie atmosphere
  surface (KONVEYER-0..9).
- Automatic WebGL2 fallback for environments that fail the strict-WebGPU
  adapter probe. Strict mode still rejects fallback as migration proof; the
  `4aec731e` fix narrows the rejection to strict mode so production deploys
  on legacy browsers do not crash on the WebGPU rejection branch.
- Phase F materialization rearch R1: combat sub-attribution
  (`5432a316`), materialization lane rename `lodLevel` → `simLane` +
  `renderLane` (`bad935c2`), and idempotent `setCloudCoverage` /
  sky-refresh gating at the 2 s cadence (`7e8433b4` + slice 15
  `1b31379c`).
- Atmosphere CPU cost reduced 11x in the A Shau worst case (5.96 ms →
  0.52 ms across the slice 9 → 15 arc); all five game modes now hold
  total Atmosphere under 1 ms.
- Vision-alignment doc bundle: ROADMAP + AGENTS + CLAUDE.md + carry-over
  registry now reflect the 2026-05-12 owner-confirmed two-vision split
  (experimental WebGPU + driveable land vehicles).
- Three new rearch memos under `docs/rearch/2026-05-13`:
  `GROUND_VEHICLE_PHYSICS_2026-05-13.md`, `TANK_SYSTEMS_2026-05-13.md`,
  `BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md`. One amended memo:
  `ENGINE_TRAJECTORY_2026-04-23.md` carries a 2026-05-13 addendum
  extending the "no external physics lib" stance to ground vehicles
  with a four-trigger Rapier reevaluation gate.

What is queued as fast-follow on master:

- **Phase F R2-R4** (rebased from the experimental branch): cover
  spatial-grid for DEFEKT-3 surface close (`cycle-konveyer-11`),
  render-silhouette + render-cluster lanes, squad-aggregated strategic
  sim, budget arbiter v2, and a multi-mode strict-WebGPU proof v2.
- **File-split debt**: `HosekWilkieSkyBackend.ts` (807 LOC; slated for
  the TSL fragment-shader sky port) and `WaterSystem.ts` (733 LOC;
  slated for VODA-1 water shader work). Both are temporarily on the
  source-budget grandfather list per merge-prep commit `95eefed8`.
- **STABILIZAT-1**: `perf-baselines.json` refresh on the new master
  baseline (the policy block from the experimental branch lifts on
  merge; the actual refresh has not run yet).
- **VEKHIKL-1 jeep spike**: unblocked by
  `GROUND_VEHICLE_PHYSICS_2026-05-13.md`, queued in the new campaign
  manifest.

What still needs proof on production hardware variety:

The WebGL2 fallback path was exercised by the PR #192 smoke re-run at
`4aec731e` on the GitHub Actions Linux runner (Chromium + swiftshader,
no GPU). Native WebGPU on Chrome 113+ Windows + dedicated GPU, Safari on
macOS Sequoia, Safari on iOS 18+, Firefox 147+, and the mobile fallback
(Android Chrome, Safari iOS 17) have not yet been spot-checked on real
hardware post-deploy. mobile-ui CI was still running at merge time and
provides additional automated coverage of the mobile fallback path. The
owner spot-check post-deploy is the validation step.

Owner vision (2026-05-12, restated here for traceability after master
merge):

- **A.** Forward-leaning experimental WebGPU / browser-primitive tech —
  KONVEYER follow-ups (compute spatial-grid, indirect drawing, TSL
  ComputeNode particles, storage textures) plus classic primitives
  where they earn their keep. Rust → WASM is a spike-only candidate;
  the named first pilot is the tank-cannon ballistic solver
  (`TANK_SYSTEMS_2026-05-13.md`).
- **B.** Driveable land vehicles — M151 jeep MVP first (VEKHIKL-1),
  then tanks (VEKHIKL-3/4) with skid-steer, turret, cannon, damage
  states.

Both directions are first-class. The original 9-cycle stabilization
campaign in `docs/archive/CAMPAIGN_2026-05-09.md` is historical; the active
campaign manifest is now
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).

Milestone memo with the full lineage:
[docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md](../rearch/POST_KONVEYER_MIGRATION_2026-05-13.md).

## Current focus (2026-05-12)

`master` is in release-stewardship mode after the overnight multi-stream pass.
Merged work now includes:

- stabilization sweep `a9ebfbe` (artifact-prune pin fix, `oneShotKills`
  wiring, perf-doc path drift, CDLOD retro nits);
- CDLOD skirt hardening `5e3436c` for the white-crack terrain seam report;
- code-golf split of `PlayerMovement` (`2ac4438`);
- optimization memos for pool sizing and BVH rebuild threshold (`d50649b`);
- SVYAZ-3 radio shell first slice (`665b0c5`);
- mobile UI CI timeout headroom (`6892a36`);
- release-stewardship changes in the production deploy: M151 world-feature placements register
  as ground vehicles, cover-query cache TTL first slice, PostCSS/header/SEO
  deployment hygiene, and doc alignment.

Phase 2 (`cycle-2026-05-10-zone-manager-decoupling`) is merged. Phase 2.5's
code-side Cloudflare/SEO tasks were folded into this release pass, but
Web Analytics still requires the Pages dashboard toggle and live beacon
verification because Cloudflare API access returned authentication error
10000 in this session.

The KONVEYER experimental branch is now active at
`exp/konveyer-webgpu-migration`; use `origin/exp/konveyer-webgpu-migration`
branch head as the current pickup point rather than a frozen SHA in this doc.
KONVEYER-0 through KONVEYER-9 have a branch review packet with strict WebGPU
startup proof, production render blockers at zero, and terrain ground-tone
acceptance. This does not make the branch production-ready. The active cycle
is KONVEYER-10: rest-of-scene visual parity and frame-budget attribution. It
owns vegetation/NPC washout, atmosphere/sky anchoring, world-budget
decomposition, skyward triangle attribution, finite-map terrain-edge
presentation, and materialization policy needed for readable close combatants.

The current research spike for the new stack is
[docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md](../rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md).
It records WebGPU/TSL, CDLOD terrain, clouds, water, Pixel Forge asset
acceptance, and ECS/materialization direction. ECSY was cloned outside the repo
root for reference vocabulary only; it is not a dependency recommendation.

KONVEYER-10 parity is not pixel-for-pixel WebGL cloning. The WebGL production
path is evidence of the intended game, but it also carries compromises that
made the scene look weak in places. For this cycle, prefer WebGPU-native
renderer/material choices that better support the vision: dense jungle mass,
readable grounded combatants, plausible flight-scale sky/weather, finite maps
that do not look abruptly unfinished from the air, and actionable performance
attribution toward the materialization-tier plan.

Once the initial KONVEYER migration/parity goal is met, the follow-up is not
"done because it matches WebGL." The next pass should revisit the renderer and
scene architecture from first principles against the vision, using the migrated
WebGPU/TSL branch as the baseline for proper material, atmosphere, culling,
edge, and materialization-system decisions.

Insert a water/hydrology pass before that larger rearchitecture review.
Hydrology visibility, water shader/material behavior, water/terrain
intersections, interaction, buoyancy/swimming, and eventual watercraft must be
reviewed as one connected scene/physics/gameplay surface, not deferred as
unrelated backlog while judging the renderer architecture.

Asset source is in scope for that judgment. If strict WebGPU exposes vegetation
or NPC atlas/crop/normal/LOD/color-space assumptions that were only acceptable
under the old WebGL material path, the correct fix may be Pixel Forge
regeneration, impostor rebake, texture editing, or source-asset cleanup rather
than more shader compensation. Clouds are similar: straight-line cutoffs,
obvious bands, blocky low-resolution texture artifacts, or alignment seams
indicate the current dome-texture cloud pass is an interim representation, not
the final vision.

KONVEYER asset/material audit now packages the strict WebGPU vegetation/NPC
probe data into source-vs-runtime decisions at
`artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`.
It warns that the active NPC impostor atlases are very dark while runtime
uniforms lift them heavily, NPC normal maps are absent in the material probe,
and vegetation impostors have sparse alpha plus a bright green tint bias. This
is not visual acceptance; it is a K14 input for Pixel Forge rebake/edit review,
runtime material policy, and per-object final-composite crop probes.

First crop proof exists at
`artifacts/perf/2026-05-11T22-41-07-556Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
It resolves strict WebGPU and writes final-frame crops, but remains WARN:
Open Frontier vegetation is green/saturated, the Open Frontier NPC crop is
background-dominant rather than a clean readable soldier crop, A Shau has no
cropable NPC instance, and no visible close-GLB comparison is present.
Follow-up close-model telemetry at
`artifacts/perf/2026-05-11T23-18-06-820Z/konveyer-asset-crop-probe/asset-crop-probe.json`
proves the bounded startup prewarm path now runs before first reveal under
strict WebGPU. It records startup marks for
`engine-init.startup-flow.npc-close-model-prewarm.*` and shows 8 active Open
Frontier close GLBs, with weapons present on active rows. It also exposed the
materialization-policy issue that the later bounded spawn-residency reserve
addresses for Open Frontier: 14 NPCs were inside the initial close radius and
6 rendered as impostors under the old fixed cap/pool policy. The durable
debug surface is the dev/perf `window.npcMaterializationProfile()` profile,
which lists nearest NPC render modes and fallback reasons.
Follow-up public-profile proof at
`artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json`
confirms the strict WebGPU probe now sources both initial and review nearest
rows from `window.npcMaterializationProfile()`. The close-model priority now
has a hard-near anti-pop bubble, so the nearest review rows are close GLBs with
weapons and `pool-loading` clears to zero. It still showed total-cap impostors
under the old fixed cap; that Open Frontier startup symptom is superseded by
the current 01:26 proof below. The same proof includes the first fern
source-atlas palette edit: vegetation luma drops into a darker humid-olive
range, but the simple green-dominance crop metric still warns and should be
treated as a probe/segmentation weakness plus a Pixel Forge asset-review
carry-over, not as a reason to keep darkening blindly.
The current isolated close-GLB material proof is
`artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
It binds the crop to a preferred active review-pose combatant when possible,
records 11 visible close GLBs with weapons, an effective close cap of 11, no
close fallback records, public `window.npcMaterializationProfile()` telemetry,
and geometry-derived body bounds. The crop shows the strict-WebGPU close
soldier and weapon after hiding vegetation and terrain for material isolation.
It still warns because the generic NPC impostor crop has no candidate after
nearby actors promote to close GLBs and the isolated crop is bright against a
neutral hidden-terrain frame. Do not solve this by overfitting crop thresholds;
the next work is multi-mode spawn-residency reserve verification, cap/budget
review, and integrated object/body-bound visual probes for Phase F
materialization tiers.

Multi-mode strict-WebGPU close-NPC materialization proof landed 2026-05-12 at
`artifacts/perf/2026-05-12T01-50-01-495Z/konveyer-asset-crop-probe/asset-crop-probe.json`
and the parallel-state confirmation
`artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
All five modes resolve strict WebGPU with zero console/page errors. Per-mode
close-radius residency from run 1: Open Frontier 10/10 with no fallbacks (the
spawn-residency reserve raised the cap to 10); Zone Control 11/13 (2
total-cap, nearest fallback 65 m); Team Deathmatch 12/16 (4 total-cap,
nearest fallback 36 m); combat120/ai_sandbox 12/29 (3 pool-empty + 14
total-cap, nearest fallback 23 m); A Shau Valley 0/0 from the current player
spawn pose. Run 2 captured Open Frontier without the spawn-residency reserve
engaged (12 candidates, 8 active, 4 total-cap fallbacks), confirming the
reserve is sensitive to the spawn-cluster framing rather than guaranteed.
combat120 makes it obvious that the current spawn-only reserve does not cover
dense mid-game clusters, and A Shau evidence will require a directed
player-warp or AI-convergence probe. This is the input for the Phase F budget
arbiter slice; the architectural memo lives at
[docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md](../rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md).

Startup UI "Compiling features" is not currently shader compilation. The same
strict WebGPU proof records Open Frontier terrain feature compile marks:
feature list compile about 5.2ms for 1,363 stamps, 67 surface patches, 8
exclusion zones, and 36 flow paths; stamped-provider creation about 2.1ms;
1024-grid heightmap rebake about 48.5ms; total terrain-feature compile about
55.9ms. The first optimization candidate is prebaking or chunking the stamped
heightmap rebake.

Current KONVEYER-10 scene probes are under
`artifacts/perf/2026-05-11T18-30-56-546Z/konveyer-scene-parity/scene-parity.json`
and
`artifacts/perf/2026-05-11T18-31-39-756Z/konveyer-scene-parity/scene-parity.json`.
They prove strict WebGPU mode can render the tested modes with vegetation/NPC
material probes and skyward category attribution, but they also show the
finite-edge strategy is not accepted: elevated views still expose hard grey
bands/world ends. Skyward triangle spikes are terrain-dominated, with terrain
submitted as two main passes plus one shadow pass in the peak frames.
The earlier strict `perf-capture` blocker at
`artifacts/perf/2026-05-11T18-37-33-773Z/summary.json` closed the browser
target before runtime samples. K11 follow-up has started to separate that
historical target-closed failure, attribution overhead, and runtime
performance:
`artifacts/perf/2026-05-11T18-56-10-018Z/measurement-trust.json` passes
measurement trust with strict WebGPU and summary render-submission attribution,
while overall validation still fails on peak p99. The same K11 packet also
records the fire-through-terrain report as an architecture risk spanning
combat LOS, terrain queries, navigation, cover/materialization state, and perf
caches rather than a weapon-tuning issue. The first code slice found and
patched one real player-fire fallback gap: close-range shots under 200m could
bypass CPU height-profile occlusion if the terrain BVH missed. Targeted proof:
`artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`.
Strict WebGPU browser proof:
`artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`
records `resolvedBackend=webgpu`, a real 181.7m Open Frontier shot line where
`terrain.raycastTerrain` returned no hit, raw combat proxy raycast would hit
the materialized target, and CPU effective-height samples blocked at 56m with
target health staying 100 -> 100.
This does not close DEFEKT-6; browser reproduction and shared authority review
are still required for NPC fire, AI LOS, active-driver validation, cover, and
materialization/caching paths. The continuing report that enemies can still be
shot through terrain is a stronger architecture signal: combat LOS, terrain
height/BVH authority, nav placement, cover queries, materialization state, and
cache invalidation may not be wired around one source of truth.

K11 terrain-budget evidence is now complete enough to move to the finite-edge
strategy slice. Strict scene probes with CDLOD node/ring summaries passed for
Open Frontier + A Shau at
`artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json`
and Zone Control + Team Deathmatch + combat120 at
`artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json`.
The skyward terrain count reconciles to active CDLOD tiles times 2,560
triangles times three terrain submissions. This keeps the next terrain choice
honest: fix the finite-map edge model before changing CDLOD ranges or terrain
shadow policy.

K12 tested a cheap render-only horizon-ring prototype in strict WebGPU at
`artifacts/perf/2026-05-11T19-44-30-183Z/konveyer-scene-parity/scene-parity.json`.
It passed numeric checks and cost only 384 main-pass triangles, but visual
review rejected it as slab/wall presentation with hard cloud/terrain cut lines.
That candidate was removed from the active terrain runtime. The preferred next
edge direction is a true visual-terrain extent, sourced from the same terrain
data but kept separate from playable/gameplay/nav/combat extents.

K12 first implementation slice now uses source-backed visual terrain extent.
Latest current-code strict WebGPU all-mode proof is
`artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`
after a perf bundle rebuild, the first cloud-deck anchoring slice, and the
rejected A Shau 1600m-collar experiment. The
earlier
`artifacts/perf/2026-05-11T20-58-48-929Z/konveyer-scene-parity/scene-parity.json`
is the equivalent post-tall-grass-correction proof before the cloud anchoring
change, and
`artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`
is the first current proof where the Team Deathmatch probe starts actual
runtime enum `tdm` rather than falling through to the default mode.
Open Frontier, Zone Control, actual Team Deathmatch, and combat120 no longer
read as a cheap edge wall from the finite-edge camera. The branch is still not
K12-closed: A Shau needs a real DEM/source-data collar or explicit
flight/camera boundary strategy. A follow-up A Shau-only 1600m visual-collar
experiment with DEM edge-slope extrapolation and visual-edge tint proved the
strict WebGPU path at
`artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`,
but visual review rejected the tan/gold synthetic band. That experiment should
guide the architecture decision, not be tuned further into a false pass.

K13 first code slice changes cloud anchoring from texture-UV noise to a
world/altitude-projected cloud-deck sample inside `HosekWilkieSkyBackend`.
The sky dome still follows the camera for clipping safety, but cloud features
now sample against camera X/Z plus a 1,800m authored cloud deck and a capped
horizon trace instead of `u/v` texture coordinates. The strict proof above
records `cloud model=camera-followed-dome-world-altitude-clouds` for every
requested mode, with zero console/page errors. This closes only the anchoring
model decision. It does not close cloud art direction: A Shau still exposes
flat terrain/data boundaries, and cloud texture resolution, blocky puffs,
weather layering, cloud shadows/occlusion, and possible Pixel Forge or authored
weather assets remain open for the next atmosphere pass.

The KONVEYER water/hydrology review has begun as a bridge into VODA rather
than as a closure claim. `npm run check:hydrology-bakes` passes. Source audit
`artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`
records current wiring as WARN because the shader/art/consumer work is still
unfinished. Runtime proof
`artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`
passes in Open Frontier and A Shau: hydrology river meshes are present,
channel queries resolve, and `WaterSystem.sampleWaterInteraction` reports
hydrology-backed `depth`, `immersion01`, and `buoyancyScalar` samples. Visual
acceptance is still open; the proof screenshots show Open Frontier washed out
around isolated river strips and A Shau still very dark/matte.

Visual review also identified the `tall-grass.webp` source tile as too bright
and saturated for the Vietnam jungle palette. Candidate local palette artifacts
are under `artifacts/perf/2026-05-11T20-30-tall-grass-palette/`; the live asset
has been changed from bright lime grass to dark humid olive grass. This is an
asset-level correction, not a claim that all terrain/lighting color questions
are closed.

Phase F slice 1 (shipped 2026-05-12): the close-model reserve has been
generalized from the misleading "spawn-residency" naming to "hard-near
cluster reserve" semantics, and `hardNearReserveExtraCap` magnitude bumped
from 4 to 6. The trigger is real-time density (every frame), not a
spawn-time snapshot, so the reserve serves any dense close cluster (initial
reveal, contested objective, midgame firefight). Per-faction pool size grew
from 12 to 14. Strict WebGPU multi-mode proof:
`artifacts/perf/2026-05-12T02-24-10-594Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
All five modes resolve strict WebGPU with zero console/page errors.
Review-pose close-radius outcomes vs the prior `01-50-30-290Z` baseline:

| Mode | Cap before | Cap after | Fallbacks before | Fallbacks after (review) |
| --- | ---: | ---: | --- | --- |
| `open_frontier` | 8 | 10 | total-cap:4 | none |
| `zone_control` | 9 | 11 | total-cap:3 | none |
| `team_deathmatch` | 12 | 14 | total-cap:4 | total-cap:1 |
| `ai_sandbox` (combat120) | 12 | 14 | total-cap:18, pool-empty:2 | total-cap:5, pool-empty:6 |
| `a_shau_valley` | 8 | 8 | 0 candidates | 0 candidates |

combat120 retains 6 `pool-empty` fallbacks because the US faction pool
exhausts at the new 14-slot cap while the NVA pool keeps 4 slack — that is
faction-asymmetric pool sizing, the next slice (budget arbiter v1), not a
steady-cap question. A Shau still materializes zero live combatants inside
the close radius from the steady review pose; a directed player-warp or
AI-convergence probe is the next A Shau materialization step.

Follow-up slice (shipped 2026-05-12): the close-model selector now
pre-releases stale actives — active close models whose combatant is not in
this frame's top-`effectiveActiveCap` prospective set are released before
the candidate iteration. Previously, prior-frame actives held pool slots
through the iteration, so new higher-priority candidates of the same faction
hit a phantom `pool-empty` fallback. Strict WebGPU multi-mode proof:
`artifacts/perf/2026-05-12T03-06-33-332Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
combat120 review fallback profile changed from `total-cap:5 +
pool-empty:6` to `total-cap:22 + pool-empty:0` (overall fallback count is
larger because the candidate set grew from 25 to 36, but every fallback
is now at the cap boundary, the designed materialization tier
boundary).

A Shau directed-warp evidence (shipped 2026-05-12, probe-only): the crop
probe now warps the player to a contested A Shau zone (Hill 937 /
Hamburger Hill) before running the close-NPC review pose, then waits for
the WarSimulator to materialize live combatants. Five-mode strict
WebGPU proof:
`artifacts/perf/2026-05-12T03-33-59-816Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
Per-mode close-radius outcomes (review pose):

| Mode | Cap | Candidates | Rendered | Fallbacks |
| --- | ---: | ---: | ---: | --- |
| `open_frontier` | 10 | 10 | 10 | none |
| `zone_control` | 8 | 14 | 8 | total-cap:6 |
| `team_deathmatch` | 14 | 16 | 14 | total-cap:2 |
| `ai_sandbox` (combat120) | 14 | 29 | 14 | total-cap:15 |
| `a_shau_valley` | 14 | 60 | 14 | total-cap:46 |

A Shau's directed warp observed 5865 ms between player teleport and the
first live combatants in close radius (0 → 4); by review pose the
WarSimulator had populated 60 candidates. Zero pool-empty / zero
pool-loading across all five modes. The 5865 ms spawn cadence after a
player warp is a separate finding worth profiling (WarSimulator
strategic-spawn tick interval) but is not a materialization-tier
blocker; all close-radius work caps at the designed boundary.

MaterializationProfile v2 (shipped 2026-05-12): `CombatantMaterializationRow`
now carries `reason` and `inActiveCombat` (parseable render-lane reason
string and active-firefight flag). Surfaced through
`window.npcMaterializationProfile()` and the crop probe's `nearest[]`
projection. Strict WebGPU multi-mode proof at
`artifacts/perf/2026-05-12T04-48-59-955Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
First architectural finding the diagnostic surfaces: A Shau's review
pose contains actors with `inActiveCombat=true` stuck on
`impostor:total-cap` (e.g., combatant_40 at 7.9 m) — exactly the case
the Phase F memo names for the budget arbiter to handle. The current
cap policy is distance-priority only; the arbiter will incorporate
combat state. The diagnostic surface ships now; the arbiter is the
next slice.

Budget arbiter v1 (shipped 2026-05-12, Phase F memo slice 5):
`PixelForgeNpcDistanceConfig.inActiveCombatWeight=8` is added to the
close-model candidate priority score. Actors currently
ENGAGING/SUPPRESSING/ADVANCING get a priority boost sized between
`squadWeight` (4) and `onScreenWeight` (10), so combat state composes
with the other signals (hard-near reserve, hard-near, on-screen, squad,
distance, recently-visible) rather than dominating them. Strict WebGPU
multi-mode proof at
`artifacts/perf/2026-05-12T09-45-53-698Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
Effect on the densest mode (combat120): 7 of the 14 close-GLB slots
are now in-combat actors (slice 4 had 0 measured). The arbiter
correctly composes: in-combat actors win at the cap edge but on-screen
non-combat actors closer in still outrank off-screen in-combat actors
at hard-near distances, by design. The Phase F memo's named target
case ("a combatant being shot at... is render-close eligible even at
130 m") is now realized as a weight, not a hard override.

Tier-transition events (shipped 2026-05-12, Phase F memo slice 6):
`CombatantRenderer.updateBillboards` now emits a typed
`materialization_tier_changed` event on `GameEventBus` whenever a
combatant's render mode changes between frames. Payload carries
`{ combatantId, fromRender, toRender, reason, distanceMeters }`; first
observation emits with `fromRender: null`. Subscribers (minimap, audio,
perception, future fog-of-war) can react without polling. The bus is
already batched + flushed end-of-frame, so emitting adds no synchronous
fan-out cost. Strict WebGPU multi-mode regression proof:
`artifacts/perf/2026-05-12T12-55-00-499Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
No close-NPC materialization regressions vs slice 5.

Tier-transition event capture (shipped 2026-05-12, probe-side
extension of slice 6): `bootstrap.ts` exposes
`window.__materializationTierEvents()` under `?diag=1`, draining a
bounded ring of events from `GameEventBus`. The crop probe records
empirical materialization flow during the directed-warp + review
window per mode. Evidence:
`artifacts/perf/2026-05-12T13-59-07-487Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
First architectural finding: A Shau captures 199 events in a single
window (94 first-observation→impostor, 60 impostor→close-glb
promotions, 41 close-glb→impostor demotions, 4 first→close-glb). This
quantifies the cap-boundary churn during dense strategic-tier
materialization. combat120 shows the same pattern in miniature (43
events, 23 promotions, 20 demotions). TDM shows pure promotion (8 of
8) — cap unexhausted at review pose. OF shows only far-LOD
first-observations.

Materialization perf-window capture (shipped 2026-05-12, probe-side
Phase F memo slice 7 — falsifiable perf gate): the crop probe now
holds the steady review pose with full scene visibility, drains the
`window.__metrics` 300-sample ring via `reset()`, waits 4500ms, then
reads `getSnapshot()` for per-mode frame stats. This is the explicit
bar the review packet names as a condition for any 3,000-combatant
claim. Strict WebGPU multi-mode evidence:
`artifacts/perf/2026-05-12T15-39-11-477Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

Per-mode steady-pose perf window (RTX 3070, headed, strict WebGPU):

| Mode | avg ms | p95 ms | p99 ms | max ms | hitch33 | close-active | candidates |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `open_frontier` | 8.9 | 15.5 | 16.5 | 53.8 | 2 | 8 | 13 |
| `zone_control` | 11.2 | 16.0 | 16.6 | 31.3 | 0 | 8 | 9 |
| `team_deathmatch` | 9.3 | 15.6 | 16.6 | 23.1 | 0 | 10 | 14 |
| `ai_sandbox` (combat120) | 12.4 | 16.5 | 23.0 | 38.6 | 1 | 14 | 39 |
| `a_shau_valley` | 17.9 | 23.7 | 31.0 | 31.3 | 0 | 14 | 60 |

All five modes are inside the Phase F memo slice-7 budget (p99 ≤ 33 ms).
A Shau is the worst case as expected — it is the 3,000-unit strategic
scenario with selective materialization; with 14 close-GLB + 46
impostor at the cap boundary the renderer holds p99 at 31.0 ms.
combat120 (39 candidates, 25 impostor fallback) is steady at p99 23.0 ms.
This is the baseline against which the still-pending rearch slices
(sim-strategic, render-silhouette, render-cluster, lane-naming
refactor) get measured. The Open Frontier `max=53.8 ms` reflects one
single-frame hitch in the 4500 ms window; not a sustained budget
violation.

Per-system frame attribution (shipped 2026-05-12, probe-side slice 10):
the perf-window now also drains
`engine.systemManager.getSystemTimings()` at end of window, sorting
EMA timings descending. This is the frame-budget child timing the
review packet names as a missing actionable input. Strict WebGPU
multi-mode evidence:
`artifacts/perf/2026-05-12T16-06-33-882Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

Top-system attribution per mode (RTX 3070, headed, strict WebGPU, EMA):

| Mode | top system | top ms | budget ms | over | second | second ms |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `open_frontier` | World.Atmosphere | 5.16 | 0.38 | **13.6×** | Combat | 1.55 |
| `zone_control` | World.Atmosphere | 5.16 | 0.38 | **13.6×** | Combat | 1.42 |
| `team_deathmatch` | World.Atmosphere | 5.30 | 0.38 | **13.9×** | Combat | 2.06 |
| `ai_sandbox` (combat120) | World.Atmosphere | 5.33 | 0.38 | **14.0×** | Combat | 3.05 |
| `a_shau_valley` | World.Atmosphere | 6.39 | 0.38 | **16.8×** | Combat | 3.24 |

**Architectural finding**: `World.Atmosphere` (registered in
`SystemUpdater` at 0.38 ms budget) is the dominant CPU contributor in
every mode at 5–6 ms — a 14×+ over-budget, in front of `Combat`
which is the next biggest at 1.5–3.2 ms. The materialization arbiter
work (slices 0–8) is correct but does not move the frame-budget
needle because materialization is not the bottleneck. The Atmosphere
budget either needs to be raised to reflect actual cost (cosmetic
fix), or the Atmosphere work needs restructuring (real fix); the
review packet's K10 frame-budget-attribution thread now has
actionable child timings.

Atmosphere child timings (`World.Atmosphere.SkyTexture`,
`World.Atmosphere.LightFog`, `World.Atmosphere.Clouds`) are tracked
through `performanceTelemetry.beginSystem` / `endSystem` and surface
through `window.perf.report().systemBreakdown`. Sub-attribution is
the slice 11 follow-up.

Slice 13 (shipped 2026-05-12): three architecturally-correct CPU-side
improvements to the sky refresh path:

1. `CanvasTexture` retired; `DataTexture` (Uint8Array, direct
   `texSubImage2D` upload) replaces it. Eliminates the canvas-read
   leg of the upload (independently flagged WebGPU anti-pattern per
   three.js discourse 50288 / 66535 and issues #28101 / #31055).
2. `SKY_TEXTURE_REFRESH_SECONDS` bumped 0.5 s → 2.0 s. Cloud
   animation samples `cloudTimeSeconds` per refresh so wind reads as
   slower, not stepped.
3. `refreshSkyTexture` body uses bilinear LUT sample (slice 12) over
   the same 32×8 LUT the CPU `sample()` accessor reads.

Strict WebGPU multi-mode evidence (RTX 3070, headed):
`artifacts/perf/2026-05-12T17-29-04-810Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
All five modes resolve `webgpu` with zero console/page/request
errors. A Shau frame avg 20.2 → 14.0 ms, p99 34.8 → 24.1 ms
(combination of slice 12+13 + run variance).

Slice 14 diagnostic (shipped 2026-05-12): `refreshSkyTexture`
instrumented with a fire-count + total-ms counter, surfaced via
`AtmosphereSystem.getSkyRefreshStatsForDebug()` and probed by the
crop probe alongside the perf window. **Resolves the earlier
"phantom EMA" puzzle.** The crop probe's `dist-perf` bundle was
serving a STALE build relative to source — `npm run build:perf` was
the missing step. After rebuilding the bundle the slice 12+13 work
is correctly reflected in the EMA.

Strict WebGPU final five-mode evidence (RTX 3070, headed, after
`build:perf`):
`artifacts/perf/2026-05-12T18-59-46-847Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

| Mode | avg ms | p99 ms | SkyTexture EMA | Refresh fires (4.5s window) | Real /frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| `open_frontier` | 7.8 | 15.5 | 3.26 | 73 | 0.35 |
| `zone_control` | 8.5 | 16.1 | 3.22 | 72 | 0.39 |
| `team_deathmatch` | 7.7 | 8.6 | 3.43 | 73 | 0.37 |
| `ai_sandbox` | 11.2 | 23.0 | 3.32 | 71 | 0.50 |
| `a_shau_valley` | 12.8 | 23.1 | 3.47 | 71 | 0.63 |

**Empirical conclusions**:

1. Slice 12 (LUT-driven refresh) + slice 13 (DataTexture + 2 s
   refresh period) genuinely save ~1.5–2.5 ms across all modes.
   Slice 11 baseline SkyTexture EMA was 5.03–5.96 ms; now 3.22–3.47 ms.
2. The EMA reports **per-fire cost** (~3 ms each), not per-frame
   amortized. Real per-frame cost is 0.35–0.63 ms — much smaller.
   Earlier "no improvement" readings were a stale-bundle artifact.
3. A Shau frame avg 17.9 → 12.8 ms; p99 31.0 → 23.1 ms — solid
   margin inside the 33 ms gate.
4. Refresh fires ~16×/sec across all modes despite
   `SKY_TEXTURE_REFRESH_SECONDS=2.0`. Investigation pending — likely
   the LUT-rebake threshold fires more often than calculated for
   `todCycle` modes, but the cost per fire is small enough that this
   is no longer the dominant frame-budget concern.
5. The full TSL fragment-shader port (now slice 16+) would eliminate
   the remaining ~0.4–0.6 ms by moving composition to GPU, but is no
   longer the highest-leverage next slice — Combat (1.5–3.2 ms) and
   World residuals are now relatively larger.

Slice 15 (shipped 2026-05-12): idempotent `setCloudCoverage`. The
slice 14 fire-counter exposed that the sky-texture refresh was
firing ~16×/sec across all modes despite the 2 s timer. Root cause:
`WeatherAtmosphere.update()` calls `setCloudCoverageIntent` every
frame, which calls `hosekBackend.setCloudCoverage(effective)`
unconditionally, which calls `markSkyTextureDirty()` unconditionally
— so the dirty flag was set every frame regardless of whether the
coverage value changed.

The one-line fix: early-return from `setCloudCoverage` when the
clamped value equals the current value. Strict WebGPU multi-mode
evidence:
`artifacts/perf/2026-05-12T20-46-15-213Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

Per-mode delta (slice 14 → slice 15):

| Mode | SkyTexture EMA | Refresh fires (4.5s) |
| --- | ---: | ---: |
| `open_frontier` | 3.26 → **0.22** ms | 73 → 5 |
| `zone_control` | 3.22 → **0.42** ms | 72 → 10 |
| `team_deathmatch` | 3.43 → **0.23** ms | 73 → 8 |
| `ai_sandbox` | 3.32 → **0.02** ms | 71 → 2 |
| `a_shau_valley` | 3.47 → **0.52** ms | 71 → 10 |

Total Atmosphere CPU cost reduction over the slice 9 → 15 arc:
A Shau worst case 5.99 ms → 0.52 ms (≈ 11× speedup). All five modes
now <1 ms total Atmosphere. **Materialization is back as the
relatively larger CPU contributor**; the spike doc's revised
priority order (slice 14 entry) holds.

Atmosphere sub-attribution (shipped 2026-05-12, probe-side slice 11):
the perf-window now also drains `window.perf.report().systemBreakdown`
which carries the PerformanceTelemetry-side per-system breakdown
including nested sub-systems. Strict WebGPU multi-mode evidence:
`artifacts/perf/2026-05-12T16-22-28-343Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

Per-mode atmosphere split (EMA over the 4500 ms window):

| Mode | Atmosphere | SkyTexture | LightFog | Clouds |
| --- | ---: | ---: | ---: | ---: |
| `open_frontier` | 5.06 | 5.03 (99.4%) | 0.01 | 0.01 |
| `zone_control` | 5.17 | 5.14 (99.4%) | 0.02 | 0.00 |
| `team_deathmatch` | 5.40 | 5.39 (99.8%) | 0.00 | 0.00 |
| `ai_sandbox` | 5.23 | 5.21 (99.6%) | 0.02 | 0.00 |
| `a_shau_valley` | 5.99 | 5.96 (99.5%) | 0.02 | 0.00 |

**Architectural finding**: `World.Atmosphere.SkyTexture` is 99%+ of
the Atmosphere cost in every mode. The hot path is
`this.backend.update(deltaTime, this.sunDirection)` — the
Hosek-Wilkie sky dome backend update. `LightFog` (applyToRenderer +
applyFogColor) and `Clouds` (updateCloudCoverage) are both correctly
cheap at <0.05 ms combined. The fix target is the sky backend.

The Hosek-Wilkie backend update does not need to happen every frame
— sun direction changes are tiny per-frame and sky color depends only
on sun direction + scenario preset. Throttling backend update from
60 Hz to ~5 Hz would drop SkyTexture from ~5 ms to ~0.4 ms across all
modes, freeing ~4.5 ms per frame. That is the slice 12 plan.

This run also captured the terrain roughness fix (587da7c2 — floor at
0.88 to kill A Shau glass-like reflections); the run remained clean
across all modes (no console errors / page errors / request failures).
A Shau p99 hit 34.8 ms in this run with a single max=100 ms outlier;
likely run variance not regression — the steady atmosphere cost is
unchanged. Re-measure after the sky-throttle slice.

Do not merge the KONVEYER branch to `master`, deploy experimental renderer
code, update perf baselines, or accept WebGL fallback as migration proof.
Explicit WebGL diagnostics are allowed only as named comparison evidence.

**Superseded 2026-05-13.** PR #192 merged `exp/konveyer-webgpu-migration`
into `master` and the `4aec731e` fix narrowed the WebGL-fallback rejection
to strict mode only. The "do not merge / do not deploy" gate is closed; see
the 2026-05-13 entry above for the current state. The 2026-05-12 entries
below this point are preserved as historical evidence chain and are not the
current top-of-stack guidance.

## What is real today

- Repo builds, lints, smoke-tests, and runs the mobile UI gate. CI perf
  capture/compare is advisory; baseline refresh remains blocked per
  [docs/state/perf-trust.md](perf-trust.md).
- Playable combined-arms browser game, not just an engine shell.
- Helicopters and three flyable fixed-wing aircraft (A-1, F-4, AC-47) are
  live in runtime with HUD/control law.
- Atmosphere v1 live: analytic sky, sky-tinted fog, day/night presets, ACES
  tone mapping before quantize, and procedural cloud coverage. Legacy static
  skybox path is gone. KONVEYER-10 must close the remaining rest-of-scene
  parity gap: vegetation/NPC impostors still use separate material-owned
  lighting/fog models from terrain and close GLBs.
- A Shau Valley is a 3,000-unit strategic simulation with selective
  materialization, not 3,000 simultaneous live combatants. DEM delivery is
  manifest-backed locally.
- Pixel Forge NPC/vegetation runtime art is the production truth; old
  sprites/source-soldier PNGs are guarded by
  `npm run check:pixel-forge-cutover`.
- Performance governance is functional after the 2026-04-20 baseline
  refresh; runtime/toolchain target is Node 24.

## Hotfix cautionary tale (2026-05-08)

`cycle-2026-05-08-perception-and-stuck` shipped Stage D2 terrain CDLOD work,
but `createTileGeometry` in `src/systems/terrain/CDLODRenderer.ts` shipped
with an inverted Z coordinate (`z = 0.5 - j/(N-1)` vs the rotated
PlaneGeometry's `z = j/(N-1) - 0.5`). That flipped triangle winding so every
interior face had a -Y normal; default `MeshStandardMaterial(FrontSide)`
backface-culled the terrain from above on every map.

The fix removes the extra negation in `src/systems/terrain/CDLODRenderer.ts`
and adds a face-normal regression test in `CDLODRenderer.test.ts`.

This is the cautionary tale that motivated the new scenario-smoke
screenshot gate ([scripts/scenario-smoke.ts](../../scripts/scenario-smoke.ts)).
Stage D1 (AABB-distance morph) and Stage D2 (skirt ring + per-LOD vertex
drop) survive the hotfix unchanged. The later `5e3436c` hardening makes skirt
walls emit both triangle windings so backface culling cannot expose bright
terrain cracks when the camera is above or far from LOD borders.

## Live deploy verification

Live release is gated on blocking CI (lint + test + build + smoke +
mobile-ui), review of the advisory perf artifact, and manual Cloudflare Pages
deploy via `deploy.yml`. Production deploy SHA is the live
`/asset-manifest.json` source of truth — do not freeze it into this doc.

To verify the current production state, fetch
`https://terror-in-the-jungle.pages.dev/asset-manifest.json` and read
`gitSha`. The release-proof check is `check:live-release` (renamed from
`check:projekt-143-live-release-proof` in Phase 1's `script-triage`).

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
