# Movement / Nav Check-In

Last updated: 2026-03-17
Scope: player hill feel, NPC hill traversal, combat approach behavior on hilly terrain, terrain-level support changes

## Purpose

This file is the active working document for the movement and navigation rewrite.

It is not a polished report.
It is the running check-in and iteration contract for this task.

Use it to:

- track what we currently believe
- record what was actually validated in code or tests
- capture what changed after each iteration
- keep the current recommended direction honest
- prevent the work from drifting into vague "AI better" claims

## Operating Rule

Treat this file like a metaprompt for each work pass.

Before a substantial change:

- state the exact problem being attacked
- note the current hypothesis
- note what would count as success

After a substantial change or validation pass:

- record what changed
- record what was measured or verified
- record what improved
- record what regressed or remains uncertain
- update the current recommendation if the evidence changed

Do not let this become a stale summary.
Update it as the source of truth for this workstream.

## Latest Check-In

### 2026-03-17 Night Cutoff

Problem attacked:

- Zone Control OPFOR/HQ egress still felt structurally wrong.
- Route terrain support could still override authored HQ pads and create cliff lips near spawn.
- Trail corridors were starting from zone centers instead of from the edge of the playable shoulder.

Changes landed:

- terrain-flow corridor priority was lowered beneath authored feature pads so HQ/firebases win locally
- home-base shoulder stamps now resolve to `max` height instead of a broad average
- route flow paths and terrain stamps now start/end inset from zone centers, so corridors do not carve across the middle of bases/objectives
- route side falloff was softened so trails shape traversal without creating such prominent side cliffs
- small-map strategic route sampling was made denser and `jungle_trail` route bias was strengthened
- Zone Control keeps the authored OPFOR egress/saddle support and now layers it correctly with the HQ pad
- harness capture now writes a self-contained `movement-viewer.html` plus `movement-terrain-context.json`

Validated:

- focused terrain/route tests passed:
  - `StampedHeightProvider.test.ts`
  - `TerrainFeatureCompiler.test.ts`
  - `GameModeManager.test.ts`
  - `StrategicRoutePlanner.test.ts`
  - `WarSimulator.test.ts`
- `npm run build` passed
- latest accepted Zone Control artifact:
  - `artifacts/perf/2026-03-17T06-02-33-410Z`
  - avg frame `10.32ms`
  - peak p99 `21.00ms`
  - peak max `47.80ms`
  - shots / hits `121 / 75`

Read:

- the latest pass improves the structural layering bug and reduces backtrack count at the OPFOR approach, but it does not solve every terrain-generation issue
- some contour pressure is still concentrated near the OPFOR side and along steep procedural cuts
- remaining HQ/water/deformation concerns are now explicitly deferred, not treated as solved

Deferred for the next pass:

- generating trails/webs from terrain flow earlier instead of shaping an already-finished terrain too aggressively
- HQ spawn polish, water interactions, and broader procedural deformation cleanup
- more upstream terrain generation changes if route-on-top-of-terrain continues to fight the base terrain too much

## Mission

Deliver a movement/combat stack that preserves fun on hilly terrain.

Success means:

- player movement uphill is smooth, stable, and not sticky
- NPCs do not freeze on hills that the player can reasonably climb
- hilltop defenders keep a real advantage
- attackers still apply pressure through suppression, cover use, contouring, and flanking
- the solution fits the existing materialized / simulated / strategic architecture
- performance stays compatible with the current combat bubble and frontier goals

## Current System Model

### Strategic / Simulated Layer

- `StrategicDirector` still assigns squad objectives as world-space targets.
- `WarSimulator` now converts those objectives into squad-level route waypoints using zones plus route-friendly authored features.
- non-materialized agents move toward the squad's current waypoint, not blindly toward the final objective center.
- `MaterializationPipeline` upgrades nearby squads into full combatants.

Implication:

- far movement now has a cheap corridor model
- terrain-hostile straight-line chasing is no longer the default strategic behavior
- remaining terrain support work should sharpen the chosen corridors, not replace them

### Tactical AI Layer

Current major combat states:

- `PATROLLING`
- `ALERT`
- `ENGAGING`
- `SUPPRESSING`
- `ADVANCING`
- `SEEKING_COVER`
- `DEFENDING`

The tactical layer already knows how to:

- suppress
- flank
- seek cover
- defend zones
- push toward objectives

Implication:

- the game already has the right combat verbs
- the locomotion layer is the part failing to realize them on hilly terrain

### Locomotion Layer

Current movement behavior still has these structural problems:

- nearby agents may use Recast crowd movement, but not reliably enough to count as solved
- low / culled agents still fall back to beeline-style progress
- slope penalty can still erase intended movement for non-navmesh NPCs
- stuck recovery reacts too late and too randomly

Implication:

- the current movement layer is not a robust solver
- it is a velocity post-process with fallback hacks

## Active Working Beliefs

These are current beliefs, not permanent truths.
They must change if the evidence changes.

1. Shared continuous slope speed tax is the wrong answer for the player.
2. Shared player/NPC slope logic is the wrong abstraction.
3. "Recast near player" is not enough to solve NPC hill combat.
4. The right NPC answer is combat-aware terrain progress, not just stronger unstuck logic.
5. The right far-agent answer is route or corridor guidance, not full crowd simulation.
6. Terrain should probably change at the gameplay-surface and corridor level before it changes globally at the visual-generator level.

## Non-Negotiable Design Constraints

- A squad should not default to rushing directly at the player's current position on a hill.
- A climbable hill should not hard-stall an NPC.
- A not-climbable hill should cause contouring, rerouting, or fallback to a better approach.
- Stuck recovery must be a guardrail, not the main planner.
- Expensive LOS / cover / combat logic must stay concentrated in the materialized bubble.
- Far-agent movement must remain cheap and scalable.

## Recommended Direction Right Now

### Player

- remove continuous slope speed tax
- move on a smoothed support plane
- keep a real walkable / unwalkable threshold
- use slope mostly for support, adhesion, and slide decisions

### NPCs

- remove runtime slope tax as a movement-killer
- keep the current combat states
- add a movement-intent layer under those states:
  - `route_follow`
  - `direct_push`
  - `contour`
  - `flank_arc`
  - `cover_hop`
  - `backtrack`
- let tactical AI target approach anchors, not just raw enemy position or raw destination
- use Recast only where it helps, not as the core answer

### Terrain

- add gameplay-surface smoothing for locomotion reads
- add local corridor / shoulder / ramp shaping where routes matter
- avoid global flattening as the first move

## What The NPC System Should Feel Like

If the player is defending from a hill or ridgeline:

- some attackers suppress from below
- some attackers seek intermediate cover
- some attackers contour to a better shoulder
- some attackers execute a flank arc
- squads keep pressure without all choosing the same bad uphill line
- defenders still benefit from height, LOS, and exposure advantage

If this does not happen, the system is not done even if units technically "move more."

## What Must Be Prevented

- raw velocity being zeroed by a slope multiplier
- repeated direct uphill rushes into obviously bad lines
- random unstuck nudges as the common case
- each agent independently solving a heavy path problem every frame
- far agents paying near-agent tactical costs
- left/right oscillation on bad slopes
- squads fragmenting because each member picks a different hill response

## Terrain-Level Change Policy

Current stance:

- yes to gameplay-terrain changes
- yes to local route and objective shaping
- no to broad global flattening first

Priority order:

1. gameplay-surface reads for movement
2. local corridor / route shaping
3. objective shoulder and approach shaping
4. only later, generator-level retuning if still needed

## Telemetry Philosophy

Movement and navigation are not done when they feel better once.
They need measured tuning loops.

Use telemetry to answer:

- are we preserving forward progress uphill
- are NPCs contouring instead of stalling
- are flankers reaching useful attack anchors
- are attackers maintaining pressure without brute-force rushing
- are we paying too much CPU for better motion

Primary home:

- perf harness artifacts

Secondary home, only if cheap:

- reduced end-of-match movement summary

Initial movement telemetry targets:

### Player telemetry

- uphill movement time
- uphill slowdown ratio versus flat movement
- support-normal variance during grounded movement
- walkable-to-unwalkable transition count
- slide event count and duration
- terrain-induced velocity clamps or movement rejections

### NPC telemetry

- progress toward anchor per second
- time spent in each movement intent
- contour activations
- backtrack activations
- cover-hop completion rate
- flank anchor completion rate
- stuck events
- time with intended movement but near-zero displacement
- movement quality by LOD tier

### Combat-approach telemetry

- fraction of attacks choosing direct push versus contour / flank / cover
- suppressor uptime while flankers maneuver
- time from detection to useful firing position
- hill-assault success and failure patterns in harness scenarios

## Telemetry Visualization Direction

If movement telemetry is good enough, we should be able to inspect it visually.

But the right visualization for this game is not a city-style traffic replay.

This is a jungle battlefield with:

- soft corridors
- ridges and shoulders
- pits and ditches
- local cover and exposure
- repeated pressure between HQs, zones, and strongpoints

So the visualization target should be terrain-relative and battle-readable:

- a pressure heatmap over terrain showing where players and NPCs actually spent traversal and combat time
- pinned / stuck event splats showing where units stop making real progress
- sampled path playback for the player, squad anchors, and selected NPC cohorts when we need sequence, not just density
- intent overlays showing where squads were `route_follow` versus `contour` versus `flank_arc` versus `hold`
- topo and elevation context so ridges, saddles, bowls, ditch lines, and cliff lips are obvious during review

Recommended data shape:

- keep the shipping runtime metrics aggregated and cheap
- record a low-frequency harness-only occupancy grid in world space, binned to terrain-relative cells
- record event markers for `backtrack`, `pinned`, `terrain_blocked`, `cover_hop`, `flank_arc`, and arrival
- for path playback, record only sampled tracks:
  - player full track
  - squad-anchor tracks
  - sampled NPC subsets or per-squad centroid tracks
- simplify stored polylines offline before review so artifacts stay small

Do not ship raw full-frame traces for every NPC.
That is the wrong cost shape for this game.

Preferred review views:

1. terrain heatmap with zone/HQ labels plus contour/elevation backdrop
2. pinned/backtrack hotspot view over slope bands
3. animated route playback for player + squad anchors + sampled attackers
4. intent-density view by faction
5. terrain-shape debug view with contour lines, slope bands, and stamped trail corridors

This should start as harness artifact review only.
If it later proves cheap and useful, we can promote a tiny summary into the end-of-match screen.

## Selected Execution Order

This is the order of work.

### 1. Instrumentation and acceptance loop

Work:

- define movement telemetry schema in the harness path
- add player movement counters
- add NPC movement counters grouped by state, intent, and LOD tier
- extend perf artifacts so movement quality is recorded alongside frame and combat metrics

Reason first:

- this system needs measured tuning
- otherwise feel and correctness arguments will drift

### 2. Player locomotion rewrite

Work:

- remove continuous slope speed tax from player movement
- add support-plane movement based on smoothed support normals
- use walkability thresholding, adhesion, and transition hysteresis
- preserve slide only for truly unwalkable terrain

Reason second:

- player feel is the most visible issue
- it is more isolated than the NPC rewrite
- the support-plane and gameplay-surface work informs NPC terrain reads

### 3. NPC locomotion solver

Work:

- remove NPC runtime slope speed tax
- add movement-intent solver under the existing combat states
- convert raw movement targets into approach anchors
- implement deterministic contouring and backtracking
- preserve squad cohesion through shared anchors and shared approach logic

Reason third:

- this is the core gameplay fix for hill combat
- it depends on the chosen movement philosophy and telemetry
- it should be implemented before the larger terrain support pass so terrain does not mask bad locomotion

### 4. Simulated and far-motion routing

Work:

- add route / corridor guidance to strategic and simulated movement
- stop relying on pure direct destination chasing for far movement
- align route choices with zones, roads, trails, strongpoints, and intended battle lanes

Reason fourth:

- once the materialized locomotion model is clear, far motion can be made structurally compatible with it
- this is where large-scale battlefield shape gets fixed

### 5. Terrain support pass

Work:

- add gameplay-surface smoothing reads for locomotion
- add local approach shaping near key objectives and hill assaults
- add corridor shaping where strategic movement repeatedly collides with bad terrain lines

Reason fifth:

- some terrain support can land earlier in small pieces, but the main terrain pass should follow the locomotion model
- terrain should support the chosen behavior, not substitute for it

### 6. Validation and tune

Work:

- run repeated harness scenarios for player hill feel and NPC hill combat
- compare movement telemetry, combat telemetry, and frame/tail metrics together
- tune only with evidence
- optionally promote a tiny movement summary into end-of-match stats if runtime cost is negligible

## Granular Task Plan

### Track A: Telemetry

1. inventory current harness sample fields and runtime telemetry hooks
2. define movement metric schema
3. add harness-only player movement metrics
4. add harness-only NPC movement metrics
5. expose movement metrics in perf artifacts

### Track B: Player movement

1. isolate current player slope-tax path
2. implement support-plane read model
3. remove continuous uphill speed tax
4. add adhesion and threshold hysteresis
5. validate on procedural hill traversal

### Track C: NPC locomotion

1. isolate current slope-kill and stuck behavior
2. define movement-intent interface
3. add approach-anchor selection path
4. implement contouring
5. implement deterministic backtrack
6. wire cover / flank / suppress behaviors into the new mover

### Track D: Strategic / far routing

1. identify first route graph inputs from existing zones, roads, and strongpoints
2. convert direct far-agent chase into route-guided travel
3. align materialized and simulated approach patterns

### Track E: Terrain support

1. add gameplay-surface smoothing reads
2. identify repeated bad approach lines
3. stamp local shoulders, ramps, and corridors
4. validate that terrain support improves behavior without flattening map identity

## Evidence Snapshot

Validated from current code and prior analysis:

- strategic movement is now route-guided at the squad level
- tactical combat states are already expressive enough to support good hill combat
- current locomotion no longer depends on shared slope tax or random stuck recovery
- procedural maps are rough enough that local terrain interpretation matters
- the terrain system already supports stamping and route-adjacent shaping
- the harness already has a clean artifact and active-driver model for adding movement telemetry

## Progress Log

### 2026-03-16

Status:

- repo state validated against latest remote
- movement, terrain, strategy, and combat layers re-read
- playtest doc rewritten once, then superseded for ongoing work by this file
- current recommendation moved away from "Recast near player" as the main answer
- telemetry is now treated as a first-class part of the movement plan
- execution order is now locked
- harness movement telemetry is now wired into `PerformanceTelemetry` and `scripts/perf-capture.ts`
- player movement now uses support-plane locomotion on a smoothed gameplay surface
- infantry movement no longer uses runtime slope-speed penalty or crowd authority as the primary mover
- stuck recovery is now deterministic backtrack signaling instead of random destination nudges
- strategic and simulated movement now use squad route plans built from mode zones plus route-friendly authored features
- `GameModeManager` now passes route topology into `WarSimulator.configure()`
- focused validation passed for player movement, NPC movement, stuck detection, telemetry, strategic routing, and slope utilities
- broader rebase audit found and fixed three real integration issues:
  - sandbox autostart was calling `startGameWithMode()` before `StartupFlowController` reached `menu_ready`
  - `scripts/perf-browser-observers.js` had been deleted while `perf-capture.ts` still injected it
  - `scripts/perf-active-driver.js` had been deleted while `perf-capture.ts` still injected it for active-player runs
- startup-flow tests now pass for the autostart path
- a production build now passes after the audit
- short `ai_sandbox` harness smoke now reaches live gameplay again; current failure mode is real perf / movement-quality validation, not broken startup

Current conclusion:

- the central problem is not just slope math
- it is the mismatch between tactical intent and locomotion execution on hilly terrain
- the second shippable slice is now in code for strategic route-guided travel
- the harness path is reliable again, so remaining work is terrain corridor shaping plus live feel/perf tuning against harness captures

Next work:

- run real harness captures on hill-heavy scenarios and read the new movement metrics against the route-guided strategic layer
- tune contour/backtrack thresholds and uphill damping from evidence
- identify the first corridor/shoulder stamps that most improve the new squad routes
- decide whether any objective-specific approach anchors need authored support after route telemetry is in hand

### 2026-03-17

Status:

- player and NPC movement telemetry now tracks pinned-area dwell, not just low-progress counts
- player steep-terrain flow no longer stalls on cliff-side lip checks as early; terrain now biases lateral flow first
- traversal states now move faster than combat-hold states, so NPC route travel and advances use a real run pace
- NPC terrain-aware locomotion now projects desired movement onto the sampled support surface before contour selection
- NPC forward blocking now tolerates meaningful terrain lips instead of treating tiny rises as cliff walls
- NPC recovery scoring now samples uphill/contour escape candidates, which gives ditches and pits a deterministic escape bias
- player firing no longer mixes camera-center hit logic with a fake centered tracer start
- the player shot path now resolves reticle aim first, then fires and traces from a per-weapon barrel-aligned world origin derived from the overlay muzzle marker
- full map now renders cached topo/elevation shading plus generated terrain-flow paths from the same compiled data the terrain runtime uses
- minimap now consumes terrain-flow paths as lightweight local trail hints
- match-end stats now include a compact player traversal summary instead of burying movement in perf-only diagnostics
- perf harness now exposes a second movement artifact layer:
  - sparse player/NPC occupancy cells
  - hotspot cells for terrain-blocked, pinned, contour, and backtrack events
  - sampled player and selected NPC tracks
- `perf-capture.ts` now writes `movement-artifacts.json` so review tooling can read terrain-relative flow without scraping `runtime-samples.json`
- `WorldFeatureSystem` now biases terrain-snapped props/vehicles/structures toward flatter nearby ground when the authored point lands on a cliff lip or rough ledge
- terrain flow now shapes the gameplay surface with continuous `flatten_capsule` corridor stamps instead of repeated point-circle stamps
- long route segments are split into shorter capsule spans using mode route spacing, so trails follow terrain grade more naturally instead of averaging whole hillsides into one flatten pass
- dynamic zone/HQ shoulders are now broader and more gradual, especially around home bases, which should reduce cliff-lip objective rims before any authored terrain cleanup
- focused validation passed again after this pass:
  - `WeaponFiring.test.ts`
  - `CombatantMovement.test.ts`
  - `StuckDetector.test.ts`
  - `PlayerMovement.test.ts`
- production build passed after the same changes
- fresh `zone_control` harness evidence was captured from `artifacts/perf/2026-03-17T04-08-15-602Z`

Evidence:

- compared with the prior zone-control capture (`2026-03-17T03-50-00-038Z`), the new pass improved:
  - player average actual speed: `6.85 -> 7.62`
  - NPC pinned samples: `6227 -> 3793`
  - NPC average progress per sample: `0.0222 -> 0.0368`
  - NPC flank-arc intent count: `1248 -> 9382`
  - NPC backtrack activations: `30 -> 21`
- player terrain-blocked samples remained at `0`
- NPC pinned-area events still exist (`50`) and backtracks still happen in live runs, but the pressure pattern is healthier and traversal quality is materially better

Current conclusion:

- the locomotion rewrite is moving in the right direction
- terrain-relative review is now the main bottleneck; the terrain support runtime/compiler slice is materially stronger than it was
- zone / HQ support is no longer only point-centric; the remaining gap is policy tuning, not missing corridor geometry
- the stamped-terrain system now supports continuous corridor shaping, not just circular pads
- the strategic route planner can now feed a real stamped jungle trail web between HQs and zones
- static placement is no longer pure center-height snap, but terrain compile support still needs broader shoulder/corridor shaping so feature clusters do not start from hostile terrain in the first place

Terrain support read:

- `TerrainFeatureCompiler` now emits continuous `flatten_capsule` route stamps for terrain-flow corridors while still using circular stamps for point features
- `StampedHeightProvider` and the terrain worker now both support `flatten_capsule`, so corridor shaping works on the gameplay height surface as well as the render/runtime bake path
- Zone Control features still use relatively small authored flat/blend radii in a few contested areas, so the next tuning pass should adjust mode policy and targeted feature values, not invent a third terrain path
- route guidance and terrain shaping are now aligned structurally; the remaining work is evidence-driven tuning and review

Next work:

- use the new corridor stamps plus `movement-artifacts.json` in `zonecontrol` to find which rims, ditches, and approaches still need mode-specific tuning
- tune mode policies rather than adding a second terrain architecture:
  - `routeWidth`
  - `routeBlend`
  - `routeSpacing`
  - `zoneShoulderPadding`
  - `zoneShoulderBlend`
- use `movement-artifacts.json` to find the first repeated ditch, cliff-lip, and hostile-route clusters in `zonecontrol`
- turn route-friendly strategic links into a stamped jungle trail web rather than leaving traversal to direct terrain chance
- only after that, decide whether player cliff escape still needs a dedicated ledge/jump solution or whether better terrain support removes most of the remaining sticky cases

Research notes:

- Three.js still points to `WebGLRenderer` as the recommended choice for pure WebGL 2 applications; `WebGPURenderer` remains attractive but still requires porting `onBeforeCompile` / `ShaderMaterial` / `EffectComposer` style code to TSL and can still underperform on some scenes.
- Three.js documents `OffscreenCanvas` as a viable way to move rendering work into a worker when browser support is there, but it also makes clear that worker code loses direct DOM/input access. That makes it a fit for a tooling viewer or offline artifact explorer before it is a fit for the main game runtime.
- Recast / Detour remains the industry-standard navmesh stack and is still the best fit when we want offline or pre-generated tiled navmeshes plus classic crowd/path primitives.
- `recast-navigation-js` documents fixed-step crowd updates with interpolation; if we keep any crowd usage, it should be fixed-step rather than variable-step.
- `navcat` is now a serious JavaScript-native alternative worth watching because it exposes move-along-surface, custom query filters, frame-distributed pathfinding, dynamic off-mesh connections, and direct userland extensibility without WASM glue.
- For route generation across rough terrain, the most directly relevant paper remains Galin et al. 2010 on weighted anisotropic shortest paths for roads; the key idea maps cleanly to jungle trails and corridor stamping.
- For route shape on coarse terrain grids, Theta* remains the most relevant "cheap but better than axis-locked A*" reference for more natural approach paths.
- For large local avoidance at extreme scale, ORCA / RVO remains the reference family, but it is not the first move for this repo because our current problem is terrain-support + tactical locomotion coherence, not dense all-agent reciprocal avoidance.
- For telemetry review, deck.gl's `HeatmapLayer` and `TripsLayer` are the strongest public browser examples for GPU heatmap aggregation and animated sampled-path playback. They fit best as an offline artifact viewer, not as a gameplay dependency.
- For artifact-size control, Turf's `simplify` API is a practical browser-native reference for Ramer-Douglas-Peucker polyline simplification on sampled tracks.

Current research conclusion:

- the best near-term path is to deepen the existing engine, not replace it
- keep WebGL, keep the current terrain/runtime architecture, and improve terrain-support primitives plus route/corridor generation
- keep Recast as optional helper infrastructure and pre-generated data source where it fits
- evaluate `navcat` as the strongest public JavaScript-native R&D candidate if we need more customizable browser-first navmesh behavior later
- add a harness-only movement artifact viewer after the next terrain pass, using aggregated heatmap grids plus sampled playback rather than raw all-agent traces
- include contour lines, elevation shading, or slope bands in that viewer so movement failures can be read against the actual jungle terrain shape

## Check-In Template

Use this block for each major pass.

### Check-In

Date:

Goal:

Hypothesis:

Change or validation performed:

Files touched:

Evidence:

What improved:

What did not improve:

Regressions or risks:

Decision delta:

Next pass:

### 2026-03-17 Design Review and Direction Change

Owner direction from playtest review:

- NPC movement must be active, intelligent, reactive, never stuck, performant through elegance
- NPCs are too slow since slope penalty and navigation changes - should burst near player speed
- terrain generation needs more config control per mode, not wholesale redesign
- ZC/TDM: deterministic seeds for consistency; OF: procedural
- water: deferred (separate design doc when ready)
- A Shau: same unified engine, mode-specific config
- objective flat areas too narrow - structures overflow onto slopes and cliff walls
- no global flattening

Direction change:

- the terrain-aware velocity solver (wall-follower with 1.35m lookahead) has a ceiling
- tuning magic numbers (speed constants, stuck thresholds, slope angles) treats symptoms
- the navmesh already exists, is built from terrain at world-size-scaled cell resolution (cs=1.0 for <=800m, 1.5 for <=1600m, 2.0 for >1600m), and supports path queries
- crowd steering was disabled because crowd forces fought slopes - but path queries are independent of crowd
- the structural fix: expose navmesh path queries, have NPCs follow waypoint paths, keep terrain-aware solver only for last-meter tactical movement
- execution plan: `docs/EXECUTION_PLAN_2026_03_17.md`

This supersedes the previous "tune locomotion solver" trajectory for long-distance NPC movement. The locomotion solver work (support-plane, contour, backtrack improvements) remains valid for local tactical movement within ~10m of the final waypoint.

## Current Next Pass

Use the new telemetry plus the terrain compiler read to drive the terrain-support pass:

- `zonecontrol`
- then `openfrontier:short`

Read:

- whether HQ / zone edges still produce cliff lips after terrain support changes
- whether route-guided assaults follow natural corridors instead of hostile direct lines
- whether vehicle / prop placements are landing on slope-safe pads after the new placement search
- whether player/NPC pinned-area metrics continue falling after terrain shaping

After that:

- build the first harness-only visual movement artifact viewer on top of the new artifact file:
  - world-grid pressure heatmap
  - pinned/backtrack hotspot layers
  - sampled track playback for player and selected NPC cohorts
  - contour/elevation overlays derived from the gameplay height surface
- use those artifact views to tune jungle trail stamping and ditch/cliff recovery instead of tuning from feel alone
