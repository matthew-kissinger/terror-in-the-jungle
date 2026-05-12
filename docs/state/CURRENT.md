# Current State

Last verified: 2026-05-11

Top-level current-truth snapshot for the repo. Companion docs:

- [docs/CARRY_OVERS.md](../CARRY_OVERS.md) — active carry-over registry (single source of truth for unresolved items)
- [docs/state/perf-trust.md](perf-trust.md) — measurement-chain status (combat120 baseline trust)
- [docs/state/recent-cycles.md](recent-cycles.md) — last 3 cycle outcomes
- [docs/ROADMAP.md](../ROADMAP.md) — aspirational vision; canonical vision sentence
- [docs/BACKLOG.md](../BACKLOG.md) — strategic-reserve index
- [docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md](../rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md) —
  WebGPU/TSL research spike and follow-up architecture direction

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

## Current focus (2026-05-11)

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
`exp/konveyer-webgpu-migration`. KONVEYER-0 through KONVEYER-9 have a branch
review packet with strict WebGPU startup proof, production render blockers at
zero, and terrain ground-tone acceptance. This does not make the branch
production-ready. The next cycle is KONVEYER-10: rest-of-scene visual parity
and frame-budget attribution. It owns vegetation/NPC washout, atmosphere/sky
anchoring, world-budget decomposition, skyward triangle attribution, and
finite-map terrain-edge presentation.

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
Frontier close GLBs, with weapons present on active rows. It also confirms the
remaining materialization-policy issue: 14 NPCs were inside the initial close
radius, so 6 still rendered as impostors because the current cap/pool policy
cannot materialize the whole crowded spawn cluster. The correct design
direction is a deterministic spawn-proximity close-model residency policy,
plus the dev/perf `window.npcMaterializationProfile()` debug surface that
lists nearest NPC render modes and fallback reasons.
Follow-up public-profile proof at
`artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json`
confirms the strict WebGPU probe now sources both initial and review nearest
rows from `window.npcMaterializationProfile()`. The close-model priority now
has a hard-near anti-pop bubble, so the nearest review rows are close GLBs with
weapons and `pool-loading` clears to zero. It remains WARN: crowded starts can
still exceed the fixed total cap, leaving total-cap impostors. The same proof
includes the first fern source-atlas palette edit: vegetation luma drops into
a darker humid-olive range, but the simple green-dominance crop metric still
warns and should be treated as a probe/segmentation weakness plus a Pixel Forge
asset-review carry-over, not as a reason to keep darkening blindly.
The current isolated close-GLB material proof is
`artifacts/perf/2026-05-12T01-03-47-834Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
It binds the crop to a preferred active review-pose combatant when possible,
records 8 visible close GLBs with weapons, no request failures, public
`window.npcMaterializationProfile()` telemetry, and geometry-derived body
bounds. The crop now shows the strict-WebGPU close soldier and weapon after
hiding vegetation and terrain for material isolation. It still warns because
crowded starts leave total-cap fallback impostors and the isolated crop is
bright against a neutral hidden-terrain frame. Do not solve this by overfitting
crop thresholds; the needed work is deterministic spawn-proximity residency
policy plus integrated object/body-bound visual probes.

Startup UI "Compiling features" is not currently shader compilation. The same
strict WebGPU proof records Open Frontier terrain feature compile marks:
feature list compile about 5.5ms for 1,363 stamps, 67 surface patches, 8
exclusion zones, and 36 flow paths; stamped-provider creation about 2.6ms;
1024-grid heightmap rebake about 52.1ms; total terrain-feature compile about
60.7ms. The first optimization candidate is prebaking or chunking the stamped
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

Do not merge the KONVEYER branch to `master`, deploy experimental renderer
code, update perf baselines, or accept WebGL fallback as migration proof.
Explicit WebGL diagnostics are allowed only as named comparison evidence.

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
