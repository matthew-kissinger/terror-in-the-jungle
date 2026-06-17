# cycle-2026-06-14-dropped-frame-time-perf-research

Status: deployed stabilization baseline; open performance-research task.
Goal: reduce player-visible dropped-frame time and stutter in real Open
Frontier and A Shau gameplay while preserving the current game experience.
Completion requires quiet-machine captures with real combat and representative
world content passing the dropped-frame gate through the enriched harness. A
static optimization, green build, or narrower metric is not completion. The
copyable finish-line statement lives in
`docs/tasks/overnight-dropped-frame-goal-statement.txt`. The quantitative
pass/fail scaffold for future loops lives in
`docs/tasks/dropped-frame-ears-criteria.md`.

Release alignment: the 2026-06-15 local stabilization pass shipped at
`5684df747f2092c9095ad1bd5e868abacfd5ab77`. The owner hotfix for
land-vehicle steering direction and the detached Huey rotor/stabilizer mesh
shipped at `d7fdd9ca1d04f5546cfc8506a13bed22f5e6f295`, then the terrain
presentation-gap summarizer and rejected CDLOD morph-only spike note shipped at
`7cad7963e9e767e2d4ae14bcf9e0d27d93ef01e6`. Exact-head CI run
`27596557373`, deploy run `27596698857`, and `npm run check:live-release`
passed for `7cad7963`. Live proof is
`artifacts/perf/2026-06-16T05-41-22-808Z/projekt-143-live-release-proof/release-proof.json`.
Local proof and production proof are separate; future optimization slices still
need the same release shepherding before they are called shipped.

## Operating Guardrails

- Use `docs/tasks/dropped-frame-ears-criteria.md` as the current EARS-style
  quantitative loop contract. A candidate that passes static checks but lacks
  trusted completion-lane captures is source-stable, not complete.
- Preserve combat pressure, terrain/vegetation readability, wildlife/animals
  where enabled, war-asset visuals, weather/atmosphere, draw distance, mode
  startup/deploy flow, and normal player flow.
- Treat the owner-described terrain/camera issue as an imprecise visual symptom,
  not a settled spatial diagnosis. "Clipping," "underside," and "white gap" are
  rough descriptions until a reproduction artifact narrows the cause.
- Keep camera transform/projection cadence, recoil / aim adjustment, harness
  interpolation or snapping, CDLOD selection, terrain streaming / culling
  epochs, render timing, asset payloads, wildlife/animals, and simulation
  scheduler assumptions in the suspect set.
- Do not trust a single timing row, stale doc claim, or harness output that does
  not match visible play. If data looks strange, treat the harness or wiring as
  suspect instead of forcing an optimization story.
- Perf/browser captures may run when the owner indicates the machine is quiet
  enough for the current goal. If a capture lacks quiet-machine attestation or
  fails measurement trust, keep it diagnostic-only even when it explains a
  useful render-cost direction.
- When captures resume, inspect `summary.json`, `presentation-epochs.json`,
  tail attribution, browser stall entries, and driver trust fields before
  making more broad performance changes.
- Do not use a visual smoke as the primary proof for intermittent terrain
  see-through / sky-band issues. Browser images are supporting evidence only;
  terrain fixes must preserve a structural CDLOD / height-source / submission
  invariant that applies outside the specific camera, airfield, or screenshot
  where a symptom was observed.

## Latest Static Sidecar Findings

- 2026-06-17 A Shau EARS rerun:
  `artifacts/perf/2026-06-17T10-36-26-323Z` ran on clean local
  `90a314f5`, headed strict WebGPU with real A Shau contact. It is diagnostic,
  not completion proof: `check:dropped-frame-ears --strict` reports contact
  and materialization qualified, but capture status, validation,
  measurement trust, rAF gates, and view-slew equivalence still fail. The run
  had 85 sim shots / 85 hits, close-model pressure across 22 of 57 detailed
  samples, `rAF >25ms 2.30%`, `rAF >33ms 0.54%`, estimated dropped frames
  `2.79/s`, and dropped-frame time `40.53ms/s`. The tail remains render /
  presentation-led: the slowest loop callback was about `303.6ms`, with
  `RenderMain.renderer.render` about `293.2ms`. Tail render submissions showed
  terrain as the triangle owner (`300,544` triangles / 10 submissions),
  vegetation imposters next (`60,386` triangles / 6 submissions), and
  world-static features as the draw-submission owner (`45` submissions).
  Browser observers recorded 54 Long Animation Frames, including one around
  `314ms`, so treat this as a render/presentation stall problem before
  simulation micro-optimization.
- A Shau route/contact variance is now enforced in the artifact gate, not just
  noted in prose. `check:dropped-frame-ears` requires both peak
  `npc_materialization_pressure` and sustained
  `npc_materialization_sustained_contact` before materialization-sensitive
  evidence can be completion-qualified; burst-only or low-contact A Shau runs
  remain diagnostic even if shots/hits pass.
- Render-submission owner attribution now preserves source-owner summaries on
  generated static-model batch meshes. This does not change runtime content or
  draw policy; it fixes the blind spot where generated world-static batches
  collapsed into `world-feature-sector:*` and hid which feature placements were
  represented in a hot sector. The next capture should show source-feature
  owners for world-static batch tails instead of only sector labels.
- Source-aware CDLOD resolution correction:
  A Shau's renderer was still choosing near CDLOD depth from the default
  procedural 4 m target even though its authoritative DEM source is 9 m per
  pixel. That made the 21 km DEM produce sub-source render triangles and extra
  morphing/seam work that no height source could actually justify. The terrain
  startup path now carries finite height sample spacing from DEM and prebaked
  heightmaps into `TerrainSystem.configureModeSurface()`, and
  `computeSourceAwareMaxLODLevels()` caps CDLOD depth from that source spacing.
  Procedural/Open Frontier terrain keeps the existing 4 m target path. This is
  a source-authority fix, not an airfield/screenshot-specific visual smoke:
  focused tests assert the A Shau 9 m DEM no longer selects a finer-than-source
  LOD0 grid while procedural and fine prebaked sources preserve current depth.
  Diagnostic headed A Shau EARS capture
  `artifacts/perf/2026-06-16T21-06-02-113Z` still failed the dropped-frame
  gate and measurement trust, so the goal remains open, but it shows the fix
  moved the terrain geometry pressure in the intended direction: CDLOD depth
  `8 -> 6`, LOD0 spacing `2.63m -> 10.52m`, average selected terrain tiles
  about `139` instead of the prior `270` neighborhood, average main terrain
  triangles about `305k` instead of the prior `584k` neighborhood, and tail
  terrain triangles about `311k` instead of the prior `695k` neighborhood.
  Remaining failures are render-time / presentation-time failures, not proof
  that the visual terrain artifact is fixed.
- Adaptive CDLOD edge-skirt correction:
  The first sparse-skirt pass was too narrow: it populated edge-only skirt
  meshes only from `edgeMorphMask`, so it preserved coarser-neighbor
  T-junction coverage but weakened the older full-perimeter skirt safety net
  for same-LOD morph divergence, selected/frustum/height-bound edges,
  world-boundary edges, and adjacent finer-child coverage. The source fix
  separates the two contracts: `edgeMorphMask` remains shader-only force-morph
  authority for true LOD transitions, while `edgeSkirtMask` drives sparse
  visual crack-cover geometry. `TerrainRenderRuntime` now treats changed
  `edgeSkirtMask` values as terrain dynamics, so camera/selection sync cannot
  skip a skirt-coverage update. Verification so far is deterministic source
  proof, not visual acceptance: focused terrain tests assert the seam-cover
  invariant across representative and A Shau-scale camera positions, including
  the owner-captured coordinate family near `x=1950,z=2649`. The old
  adaptive edge-only path is production default now that the stronger
  `edgeSkirtMask` contract covers same-LOD morph divergence, selected/frustum
  and height-bound edges, world-boundary edges, and adjacent finer-child
  coverage. The legacy full-perimeter skirt path is an explicit diagnostic A/B
  via `?terrainFullTerrainSkirts=1` / `--terrain-full-skirts`, because drawing
  vertical walls on every internal tile edge can create the sky-ribbon/backface
  symptom. The no-skirt flag remains diagnostic-only.
- Camera/aim structural inspection:
  The infantry camera path did not show a second position-clipping fix to make
  in this pass. `PlayerMovement` grounds the player at effective terrain height
  plus eye height, `PlayerCamera.setInfantryViewAngles` and recoil refresh the
  camera from that player position, and `CameraShakeSystem` contributes angular
  offsets only. Keep harness view snaps and shot-time terrain/CDLOD sync in the
  suspect set, but do not treat a visual smoke screenshot as proof of camera
  clipping without a clearance artifact.
- Pre-correction sparse-skirt runtime artifact:
  `artifacts/perf/2026-06-16T18-37-52-915Z` ran headed A Shau 60 NPC active
  combat with `TIJ_QUIET_MACHINE=1` and WebGPU, but measurement trust failed
  (`probeAvg=151.6ms`, `probeP95=211ms`), so it is diagnostic-only. It
  confirmed the original sparse path and reduced average main terrain triangles from the
  prior full-skirt diagnostic neighborhood of about `681.9k/frame` to about
  `543.7k/frame`, while edge-transition skirt triangles averaged about
  `9.0k/frame` instead of full skirts averaging about `133.7k/frame`.
  Validation still failed badly on rAF/dropped-frame output and the tail
  remained render-bound (`RenderMain.renderer.render` about `38ms` in the
  selected slow callback). Final-frame inspection showed dense A Shau
  bamboo/rain/HUD/combat without the earlier sky-ribbon terrain artifact, but
  that visual sample was not comprehensive acceptance and did not prove the
  topology contract that the owner later saw fail.
- Harness trust remains a first-order risk. A 2026-06-15 static sidecar scan
  found driver/player mismatches in direct view-angle writes, world-space route
  movement, default frontline compression, target/LOS selection, sustainment
  helpers, camera target jumps, and missing pixel-stability coverage.
  `perf-capture` now warns on relocated actors, world-space movement, large
  pre-clamp view turns, and shot-time render-camera/terrain anomalies.
- Current-head A Shau evidence remains a failure, not a finish line:
  `artifacts/perf/2026-06-16T04-57-34-868Z` ran on `d7fdd9c` after the owner
  hotfix and produced 323 rAF presentation gaps, about 4992 ms of 60 Hz
  dropped-frame time, and a max rAF gap of about 170 ms. The terrain/CDLOD
  aggregate over those gaps is: `dynamics-changed=218`,
  `tile-set-changed=50`, `same-identity=50`, `none=5`, average selected
  terrain tiles about 282, average morphing tiles about 257, and every recorded
  gap below the 2.5 m low-clearance threshold. This makes terrain/CDLOD
  presentation scheduling, morph uploads, render pressure, and A Shau terrain
  scale the next measured suspect set; it does not justify deleting world
  content to pass a metric.
- `perf-capture` now summarizes run-level presentation-gap terrain context in
  `summary.json` under `presentationGapContexts.terrain`: terrain-sync
  submission classification counts, dropped-frame time by classification,
  tile/morph/edge-morph stats, LOD histograms, stage hash/tile-count churn,
  terrain readiness/clearance, and fire-vs-nonfire counts. Use this aggregate
  before writing another one-off parser or trusting the last 32 sample contexts
  as the whole run.
- Rejected spike: a morph-only CDLOD buffer update path for
  `dynamics-changed` terrain submissions was tried locally and removed. In
  `artifacts/perf/2026-06-16T05-22-22-473Z` it engaged heavily
  (`terrainDynOnly=871`) but did not improve A Shau; validation failed with
  394 estimated dropped 60 Hz frames, about 4964 ms dropped-frame time over
  20 s, max rAF gap about 182 ms, and the tail was still dominated by
  `RenderMain.renderer.render`. Do not revive this as a default fix without
  new evidence. The next measured path should split CPU/GPU attribution and
  target terrain render, shadow, fragment, triangle, or presentation cost
  rather than assuming full terrain-buffer writes are the bottleneck.
- Non-terrain sidecar blind spots remain in scope after terrain: WebGPU texture
  upload timing around Pixel Forge atlas residency, explicit static vehicle /
  wildlife / NPC / vegetation perf-category labels, world-static template and
  shadow policy, vegetation sectoring or forced-critical-cell generation
  timing, and KTX2/Basis asset-pipeline experiments with human visual parity.
- CDLOD reference pass: local-only clones were placed under ignored
  `examples/reference/cdlod-fstrugar` and
  `examples/reference/terrain-cdlod-three`. Strugar's original implementation
  treats selected node bounds, quad scale/offset, LOD/morph constants, and
  source heightmap sampling as one coherent render submission
  (https://github.com/fstrugar/CDLOD). The minimal Three.js implementation
  shows the same transform-to-height-sampling dependency and explicitly calls
  out holes near screen edges when height is not accounted for in culling
  (https://github.com/tschie/terrain-cdlod). Three.js also requires modified
  instance matrix / attributes to be marked `needsUpdate`, and buffer usage
  must be set before first render. This makes our previous partial terrain
  instance upload an engine-specific footgun, not a CDLOD requirement.
- Symptom split: true missing-front-face, backface, sky-band, or see-through
  terrain is most likely CDLOD submission / selection / culling authority.
  The dark terrain bands in the screenshot can also be explained by recent
  A Shau low-sun terrain occlusion or far-canopy tint work. Keep both tracks
  open until same-camera captures isolate them.

## Current Static State

- `CDLODRenderer` now rewrites the active terrain instance prefix on every
  terrain submission and marks `instanceMatrix`, `tileParams0`, and
  `tileParams1` dirty together. It also sets all three instance buffers to
  dynamic usage before first render. The stale partial-update test assumption
  was intentionally burned and replaced with coherence tests because the vertex
  material combines matrix placement with `tileParams0` world-space heightmap
  sampling. Preserved: CDLOD tile selection policy, terrain draw distance,
  heightmap sampling, morph rules, skirts, terrain content, vegetation,
  wildlife, war assets, atmosphere, combat pressure, player flow, and mode
  startup/deploy behavior. Verification passed:
  `npm run test:run -- src/systems/terrain/CDLODRenderer.test.ts src/systems/terrain/TerrainRenderRuntime.test.ts`,
  `npm run typecheck`, and targeted ESLint.
- `TerrainRenderRuntime` now exposes dev/perf-harness
  `?terrainForceInstanceUpload=1`. When enabled, unchanged tile selections
  still resubmit terrain instance buffers and debug stats report
  `forceInstanceUploadEnabled` plus `forcedInstanceSubmissions`. This is an
  A/B proof tool for stale GPU buffer state, not a retail gameplay change and
  not a performance win by itself.
- Next A Shau proof sequence: run the same camera/path normal, then with
  `terrainForceInstanceUpload=1`; if see-through/backface artifacts disappear,
  keep chasing terrain buffer coherence / submission skip healing. If dark
  bands remain, capture the same pose with low-sun occlusion disabled and
  far-canopy tint disabled before changing more performance code.
- Current combat/world bookkeeping cleanup: `AIFlankingSystem` counts
  alive/engaging squad members with direct loops for flank eligibility,
  casualty updates, cleanup, and stalled-engagement checks; `FlankingRoleManager`
  walks suppressor/flanker lists directly for flank engage/abort/complete
  cleanup; `ZoneCaptureLogic` counts zone majority in one pass; and
  `TicketBleedCalculator` / `VictoryConditions` prefer
  `ZoneManager.forEachCapturableZone()` over capturable-zone arrays.
  Flanking thresholds, ticket bleed, total-control wins, combat pressure,
  world content, and player flow are preserved.
- `ShotCommandFactory` now pools frame-scoped command containers alongside
  rays and shotgun pellet arrays. Commands remain distinct within a frame and
  reuse only after `resetPool()`, preserving firing command fields,
  recoil/aim behavior, muzzle flash/tracer presentation, and normal world/
  player experience.
- Combat fire terrain-block attribution now separates NPC shots blocked by
  terrain from raycast-budget denial. `CombatFireRaycastBudget`,
  `CombatantCombat`, `CombatantProfiler`, `GameEngineLoop`, and
  `perf-capture` carry terrain-block counts/rates into combat breakdowns and
  sample logs, preserving fire gates, burst/cooldown timing, suppressive fire,
  combat pressure, and normal terrain/asset content.
- `TerrainRenderRuntime.syncSelectionForCamera()` now rechecks CDLOD selection
  on any render-camera translation before render, while still resubmitting GPU
  buffers only when tile selection or dynamics differ. This targets sub-meter
  camera/terrain presentation mismatch without changing draw distance, terrain
  content, morph rules, or visible world content.
- Harness same-experience validation now carries frontline, movement-mode,
  view-slew, and shot-time presentation context into `HarnessDriverFinal`;
  `validateRun()` warns on relocated actors, world movement, large pre-clamp
  camera jumps, or firing-window camera/terrain anomalies.
- Vehicle explosion damage now supports optional
  `forEachVehicleInRadius()`: `CombatantSystemDamage` prefers it over
  radius-array materialization while preserving blast recheck, falloff,
  allied filtering, tank/generic vehicle damage routing, and normal world/
  player experience.
- NPC emplacement seek now supports optional `forEachVehicleInRadius()`:
  `findMountableEmplacement()` prefers it over radius-array materialization,
  and live `NpcM2HBAdapter` delegates to `VehicleManager`. Preserved:
  candidate selection, cone gating, mount routing, M2HB/PBR/emplacement
  gameplay, and normal world/player experience.
- Ground-vehicle prompts now use `forEachVehicleInRadius()` when available,
  preserving radius inclusion, nearest prompt selection, prompt cadence,
  aircraft ownership, and normal world/player experience.
- Tactical-map vehicle category refresh now uses
  `forEachVehicleByCategory()` where available, preserving category order,
  destroyed filtering, moving marker updates, map visuals, and normal world/
  player experience.
- `VehicleManager` now exposes `forEachVehicle()` for allocation-free scans,
  and the startup compass vehicle query uses it when available instead of
  materializing `getAllVehicles()` arrays before every 100 ms compass marker
  refresh. The legacy structural fallback to `getAllVehicles()` remains for
  tests and older sources. Vehicle registration/retrieval, existing
  `getAllVehicles()` behavior, compass drivable-category filtering,
  destroyed-vehicle filtering, reused compass marker records, compass marker
  DOM behavior, vehicle gameplay, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets compass vehicle-marker
  query allocation churn without changing compass semantics or visible
  content.
- `VehicleMarkers` now owns the shared crewable-vehicle marker type and
  source-driven refresh helper for minimap/full-map UI. `MinimapSystem` and
  `FullMapSystem` reuse marker objects and marker `Vector3` positions across
  repeated source refreshes instead of rebuilding marker objects and cloning
  positions every tactical UI update. Vehicle category order,
  destroyed-vehicle filtering, moving vehicle marker updates, explicit marker
  setters, minimap/full-map marker visuals, deploy/respawn marker
  compatibility, vehicle gameplay, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets 20 Hz tactical UI
  marker-refresh allocation churn without changing map semantics or visible
  content.
- `MapProjection` now exposes a caller-owned
  `worldToPlayerCenteredMapInto()` helper, and `MinimapRenderer` uses a
  reusable scratch point for player-centered projection across terrain flow
  paths, zones, combatants, strategic agents, command markers, helipads, and
  vehicle markers. The existing object-returning
  `worldToPlayerCenteredMap()` API, projected coordinates, tactical range
  filtering, strategic-agent visibility policy, command/helipad/vehicle/
  combatant markers, combat pressure, terrain, vegetation, wildlife, war
  assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets 20 Hz tactical UI allocation churn
  without changing minimap semantics or visible content.
- `GameEngineLoop` now feeds the visible performance overlay from the bounded
  `getTopSystemTimingsByLast(12)` path instead of requesting every system
  timing snapshot, and F1 / overlay vegetation counts share
  `summarizeVegetationDebugInfo()` instead of scanning the billboard debug map
  with duplicate `Object.entries(...).filter(...).reduce(...)` chains.
  Visible overlay fields, F1 performance log values, vegetation
  active/reserved counts, full `getSystemTimings()` behavior for other panels,
  combat pressure, terrain, vegetation, wildlife, war assets, atmosphere,
  draw distance, player flow, and mode startup/deploy behavior are preserved.
  This targets diagnostics overhead in an opt-in but live frame-tail path
  without narrowing gameplay or removing any visual content.
- `FrameTimingTracker` now keeps active-frame system names and durations in
  reusable scratch storage instead of allocating a `{ start, duration }`
  object for every bracketed system during each frame. Frame bracket semantics,
  system duration attribution, out-of-frame render bucket EMA tracking,
  latest-120-frame history semantics, average frame time value, over-budget
  percentage reporting, slow-frame heavy-system logging, diagnostics/harness
  report shape, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets per-system frame timing bookkeeping without changing
  the telemetry fields consumed by the harness.
- `BoundedRingBuffer` now exposes chronological `forEachLatest()` iteration,
  and `FrameTimingTracker.getAvgFrameTime()` / `getOverBudgetPercent()` use it
  instead of allocating snapshot arrays for aggregate frame-history reports.
  `snapshotLatest()` artifact-writer behavior, latest-120-frame history
  semantics, chronological iteration order, average frame time value,
  over-budget percentage reporting, system timing telemetry, slow-frame
  logging, diagnostics/harness report shape, combat pressure, terrain,
  vegetation, wildlife, war assets, atmosphere, draw distance, player flow,
  and mode startup/deploy behavior are preserved. This targets frame-history
  report overhead without changing the dropped-frame/tail diagnostic fields
  consumed by the harness.
- `FrameTimingTracker.endFrame()` now copies per-system frame timings into the
  frame-history snapshot with direct keyed iteration instead of allocating
  through `Object.entries()` every frame, and slow-frame heavy-system listing
  uses the same direct keyed iteration. Frame bracket semantics, system
  duration attribution, latest-120-frame history, average frame time value,
  over-budget percentage reporting, slow-frame heavy-system logging,
  diagnostics/harness report shape, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets frame timing
  bookkeeping without changing the diagnostic fields consumed by the harness.
- `FrameTimingTracker.getAvgFrameTime()` now sums latest frame snapshots with
  a direct loop instead of using `reduce()` over the snapshot array.
  Latest-120-frame window semantics, average frame time value, over-budget
  percentage reporting, system timing telemetry, slow-frame logging,
  diagnostics/harness report shape, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets frame-budget report
  overhead without changing the dropped-frame/tail diagnostic fields consumed
  by the harness.
- `FrameTimingTracker.getOverBudgetPercent()` now counts over-budget frame
  snapshots with a direct loop instead of allocating a filtered frame array.
  Latest-120-frame window semantics, average frame time reporting,
  over-budget percentage math, system timing telemetry, slow-frame logging,
  diagnostics/harness report shape, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets frame-budget report
  overhead without changing the dropped-frame/tail diagnostic fields consumed
  by the harness.
- `PerformanceTelemetry.getMovementArtifacts()` now builds sorted player/NPC
  occupancy, hotspot arrays, and NPC track snapshots with direct loops instead
  of `Array.from(...).filter(...).map(...)` style intermediate materialization.
  Movement artifact cell size, full sorted player/NPC occupancy arrays,
  hotspot ordering, player track snapshot, chronological NPC track snapshots,
  movement/NPC-stutter diagnostic fields, telemetry gating, combat pressure,
  terrain, vegetation, wildlife, war assets, atmosphere, draw distance, player
  flow, and mode startup/deploy behavior are preserved. This targets movement
  artifact report overhead without weakening the diagnostic surface used to
  reason about NPC stutter, terrain blocking, and pinned movement.
- `buildAShauDiagnostics()` now shapes `topZoneOccupancy` through bounded
  insertion instead of materializing, sorting, and slicing the full strategic
  zone occupancy table. Ten-row cap, descending occupancy totals, stable tie
  order, zone name/owner/state fallback fields, strategic/tactical contact
  counts, session telemetry, combat pressure, terrain, vegetation, wildlife,
  war assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets A Shau diagnostics/harness overhead
  without weakening the occupancy artifact used to reason about strategic
  concentration near zones.
- `VegetationScatterer` and `JungleGroundRing` now order newly needed
  residency cells with stable distance insertion instead of sorting cell-key
  strings with a comparator that reparses `"x,z"` keys repeatedly.
  Nearest-first residency queue semantics, critical-cell loading,
  active/pending cell deduplication, route/base exclusion behavior, far
  vegetation residency, near ground-cover residency, terrain and vegetation
  readability, draw distance, combat pressure, wildlife, war assets,
  atmosphere, player flow, and mode startup/deploy behavior are preserved.
  This targets camera-motion vegetation-residency churn without hiding
  vegetation or changing LOD/ring policy.
- `SystemUpdater` now exposes a bounded
  `getTopSystemTimingsByLast(limit)` path, and `GameEngineLoop` uses it for
  slow-frame system timing snapshots instead of requesting the full system
  timing array and reselecting top `lastMs` timings. Full
  `getSystemTimings()` report/overlay behavior, system timing snapshot fields,
  top-by-last-frame ordering, finite/invalid timing filtering, over-budget
  flags, loop-frame breakdown artifact shape, diagnostics gating, combat
  pressure, terrain, vegetation, wildlife, war assets, atmosphere, draw
  distance, player flow, and mode startup/deploy behavior are preserved. This
  targets slow-frame attribution overhead in the core system timing path
  without weakening the artifact that explains dropped-frame tails when the
  harness records them.
- `FrameTimingTracker` now exposes a bounded
  `getTopSystemBreakdownByLast(limit)` path, and `GameEngineLoop` uses it for
  slow-frame telemetry timing snapshots instead of requesting the full
  EMA-sorted diagnostics breakdown and reselecting top `lastMs` timings. Full
  `getSystemBreakdown()` report behavior, telemetry timing snapshot fields,
  top-by-last-frame ordering, finite/invalid timing filtering, over-budget
  flags, loop-frame breakdown artifact shape, diagnostics gating, combat
  pressure, terrain, vegetation, wildlife, war assets, atmosphere, draw
  distance, player flow, and mode startup/deploy behavior are preserved. This
  targets slow-frame attribution overhead without weakening the artifact that
  explains dropped-frame tails when the harness records them.
- `PerformanceTelemetry.getMovementTelemetry()` now summarizes active NPC
  pinned trackers by iterating `npcAreaTrackers.values()` directly instead of
  materializing an `Array.from(...values())` and spreading it into the pinned
  summary helper. The stale telemetry tests were also realigned with the
  current harness contract: `?sandbox=true` enables harness access but not
  heavy diagnostics, while `?telemetry=1` explicitly enables telemetry. Player
  and NPC movement counters, pinned event math, active pinned tracker
  inclusion, movement artifact data, frame timing report shape, diagnostics
  gating, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets movement/NPC-stutter telemetry overhead without
  weakening the harness's ability to distrust itself when diagnostics are
  explicitly enabled.
- `scripts/perf-active-driver.cjs` now maintains
  `collisionContributorsAtPlayer` as a bounded top-five list during collection
  instead of sorting every overlapping collision contributor and slicing the
  result. Contributor fields, dynamic bounds refresh, player overlap
  filtering, descending `maxY` priority, equal-height insertion order,
  five-entry cap, runtime liveness snapshot shape, terrain/collision debug
  context, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets debug-snapshot overhead around the terrain/camera
  collision context without changing the emitted artifact shape.
- `scripts/perf-capture.ts` now normalizes recent object-array windows with
  bounded start-index loops instead of `slice(-max).map(...).filter(...)`, and
  latest-object lookup now reads the final slot directly instead of allocating
  through `objectArray(value, 1)`. Latest object selection,
  shot/route/firing-retarget epoch artifact values, terrain
  recovery/materialization event artifact values, sample-helper shape,
  perf-harness summary inputs, combat pressure, terrain, vegetation, wildlife,
  war assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets capture-summary allocation churn without
  changing artifact data.
- `RuntimeMetrics.computePercentiles()` now computes p95/p99 from an exact
  sorted top-tail selection instead of sorting the full active frame-sample
  window. P95 and p99 rank definitions, average/max/hitch counters,
  frame-event ring behavior, `window.__metrics` snapshot shape, perf-harness
  runtime sample fields, combat pressure, terrain, vegetation, wildlife, war
  assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets runtime diagnostics overhead without
  changing the frame metrics consumed by the harness.
- `scripts/perf-browser-observers.js` now maintains
  `recent.webglTextureUploadTop` with bounded descending insertion instead of
  sorting the full top-list after every texture upload. WebGL upload
  instrumentation, upload duration/order telemetry, 32-entry top-list cap,
  descending duration ranking, per-operation totals, texture binding context,
  in-page observer support flags, drain summaries, perf-harness artifact shape,
  combat pressure, terrain, vegetation, wildlife, war assets, atmosphere, draw
  distance, player flow, and mode startup/deploy behavior are preserved. This
  targets texture-upload observer overhead without changing the upload
  attribution data used to evaluate asset and texture costs.
- `scripts/perf-browser-observers.js` now answers
  `getPresentationEpochs({ sinceSeq, limit })` directly from the bounded ring
  instead of allocating a full latest snapshot, filtering it, then slicing the
  tail. Presentation-epoch chronology, `sinceSeq` filtering, `limit` cap
  behavior, rAF dropped-frame-time fields, presentation/harness context
  payloads, observer support flags, drain summaries, perf-harness artifact
  shape, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets in-page observer query allocation churn without
  changing presentation epoch data.
- `scripts/perf-capture.ts` now maps the last 64 runtime frame events and
  game-loop frame-breakdown entries with start-index loops instead of
  `slice(-64).map(...)`. Recent-event ordering, 64-entry caps, runtime-sample
  artifact shape, frame-event fields, game-loop breakdown fields,
  system/telemetry timing summaries, combat timing snapshots, perf-harness
  summary inputs, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets per-sample capture-loop allocation churn without
  changing the collected values.
- `scripts/perf-capture.ts` now compacts the startup live-progress sample
  window in place instead of using a prefix `splice()`. Startup
  frame-progression polling, live-window age trimming, minimum live FPS failure
  detection, startup frame-threshold success behavior, startup diagnostics,
  perf-harness artifact shape, combat pressure, terrain, vegetation, wildlife,
  war assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets startup-gate harness allocation churn
  without changing whether a run is considered started, stalled, or too slow.
- `scripts/perf-active-driver.cjs` now compacts over-capacity harness event
  buffers in place instead of using a prefix `splice()`. Event history cap
  behavior, newest-event retention, caller-owned array identity, shot epoch
  telemetry, route-snap epoch telemetry, firing-retarget epoch telemetry,
  harness telemetry shape, combat pressure, terrain, vegetation, wildlife, war
  assets, atmosphere, draw distance, player flow, and mode startup/deploy
  behavior are preserved. This targets perf-driver telemetry-buffer churn
  without changing the event history values consumed by later analysis.
- `scripts/perf-active-driver.cjs` now maintains the bounded nearest-visible
  target candidate list with manual insertion instead of `splice()`.
  Nearest-first candidate ranking, max visible-check cap behavior,
  visible-target preference over nearer occluded targets, nearest perceived
  fallback, target/objective gating, aim/retarget policy, route/firing driver
  behavior, harness telemetry shape, combat pressure, terrain, vegetation,
  wildlife, war assets, atmosphere, draw distance, player flow, and mode
  startup/deploy behavior are preserved. This targets perf-driver
  target-selection churn and measurement trust without changing which target
  the harness should prefer.
- `NPCVehicleController` now removes completed boarding and dismount orders
  with order-preserving in-place compaction instead of `splice()`. Boarding
  range behavior, requested seat-role selection, timeout/cancel behavior,
  dismount delay, exit-position application, vehicle occupant state, rider
  position locking, combat pressure, terrain, vegetation, wildlife, war assets,
  atmosphere, draw distance, player flow, and mode startup/deploy behavior are
  preserved. This targets NPC vehicle order queue churn without weakening
  vehicle boarding/dismounting behavior or current combat pressure.
- `GameEngineLoop.insertTopTiming()` now maintains slow-frame system and
  telemetry timing snapshots with manual bounded insertion instead of
  `splice()`. Sorted descending timing order, snapshot size caps,
  finite/invalid timing filtering, over-budget flags, perf-harness frame
  breakdown availability, user-timing behavior, gameplay simulation, combat
  pressure, terrain, vegetation, wildlife, war assets, atmosphere, draw
  distance, player flow, and mode startup/deploy behavior are preserved. This
  targets harness-adjacent frame-loop diagnostic churn without changing
  simulation or render behavior.
- `CombatantSpawnManager.compactProgressiveSpawnQueueIfNeeded()` now compacts
  consumed queued spawns in place instead of using a prefix `splice()`. Queued
  spawn order, spawn head reset behavior, max queued spawn cap, progressive
  deploy cadence, squad size/faction/position payloads, combat pressure,
  terrain, vegetation, wildlife, war assets, atmosphere, draw distance, player
  flow, and mode startup/deploy behavior are preserved. This targets
  progressive combat spawn queue churn without reducing or delaying combat
  population pressure.
- `WildlifeSystem.removeAgentAt()` now releases the removed animal and compacts
  the active agent list in place instead of using `splice()`. Active wildlife
  cap, despawn/flee semantics, scene removal, optimized resource disposal,
  shadow policy, spawn behavior, visible animal content, combat pressure,
  terrain, vegetation, war assets, atmosphere, draw distance, player flow, and
  mode startup/deploy behavior are preserved. This targets ambient wildlife
  removal churn in Open Frontier and A Shau without reducing animal content or
  changing flee/despawn behavior.
- `GPUBillboardSystem.clearInstancesInArea()` and `clearInstancesInZones()`
  now compact each chunk/type tracked index array in place after removals
  instead of copying survivors with `slice(...)`. Radius and zone clear
  semantics, per-chunk/per-type tracking, removed-instance zeroing, later chunk
  cleanup, route/base exclusions, vegetation density outside cleared areas,
  terrain/vegetation readability, draw distance, combat pressure, wildlife, war
  assets, atmosphere, and player flow are preserved. This targets billboard
  route/base exclusion cleanup churn without changing visible vegetation outside
  the cleared areas.
- `CombatantRenderer` now reuses renderer-owned storage for preferred
  close-model candidate selection and manually maintains the bounded sorted
  candidate list instead of copying with `slice().sort(...)` or inserting with
  `splice()`. Close-model priority scoring, hard-near reserve,
  on-screen/recently-visible priority, squad and active-combat weighting, total
  cap behavior, pool fallback reasons, materialization-tier events, NPC
  impostor fallback, combat pressure, terrain, vegetation, wildlife, war
  assets, atmosphere, draw distance, and player flow are preserved. This targets
  close-NPC representation selection churn without changing which candidates
  are preferred.
- `VegetationScatterer` and `JungleGroundRing` now drop processed add/removal
  queue prefixes and critical-add entries with in-place compaction instead of
  `splice()`. Removal order, add order, critical nearest-cell prioritization
  under zero add budget, active/target cell semantics, route/base exclusions,
  vegetation density/readability, draw distance, combat pressure, wildlife, war
  assets, atmosphere, and player flow are preserved. This targets vegetation
  residency queue allocation churn without changing vegetation content.
- `GPUBillboardSystem.clearInstancesInArea()` and `clearInstancesInZones()`
  now allocate removal/remaining index arrays only after the first instance is
  actually inside the clear radius/zone, and `clearInstancesInZones()` consumes
  precomputed zone `radiusSq` when provided by `GlobalBillboardSystem`.
  Route/base exclusion clearing, radius clearing, per-chunk index tracking,
  later chunk removal semantics, vegetation density outside excluded areas,
  terrain/vegetation readability, draw distance, combat pressure, wildlife, war
  assets, atmosphere, and player flow are preserved.
- `VegetationScatterer.filterExcludedInstances()` now preserves generated
  per-type vegetation arrays when configured exclusion zones do not actually
  remove any instances, and only allocates a replacement array for a type after
  the first excluded instance is found. `VegetationScatterer` and
  `JungleGroundRing` also cache exclusion-zone `radiusSq` when zones are set.
  Route/base exclusion semantics, generated vegetation positions, per-type
  counts outside excluded areas, near ground-cover behavior, far vegetation
  residency, terrain-height sampling, draw distance, combat pressure,
  wildlife, war assets, atmosphere, and player flow are preserved.
- `TerrainRenderRuntime.copySelectedTilesForDebug()` now reuses pooled debug
  tile records even when the active CDLOD tile count shrinks and later grows
  again. Submitted tile snapshot values, debug accessor shape,
  morph/edge-mask diagnostics, terrain selection, renderer submissions,
  terrain visuals, draw distance, combat pressure, vegetation, wildlife, war
  assets, atmosphere, and player flow are preserved. This targets terrain
  diagnostics allocation churn while keeping the instrumentation needed to
  investigate the observed terrain/camera presentation discontinuity.
- `TerrainRenderRuntime.updateFrustumPlanes()` now mutates six preallocated
  frustum-plane records instead of rebuilding plane objects for every CDLOD
  selection or render-camera sync. Camera matrix refresh, extracted plane
  coefficients, terrain-relative LOD height, tile selection, sync diagnostics,
  terrain visuals, draw distance, combat pressure, vegetation, wildlife, war
  assets, atmosphere, and player flow are preserved. This targets camera-motion
  terrain-selection allocation churn in the same suspect path as the observed
  terrain/camera presentation discontinuity.
- `CDLODRenderer.updateInstances()` now clears stale attribute update ranges at
  the start of each terrain submission and emits one contiguous dirty range
  each for terrain instance matrices, static tile params, and dynamic
  morph/edge-mask params. Selected tile count, tile transforms, tile
  center/size/LOD params, morph factors, edge morph masks, terrain visuals,
  CDLOD selection behavior, draw distance, combat pressure, vegetation,
  wildlife, war assets, atmosphere, and player flow are preserved. This targets
  per-tile update-range bookkeeping/subData fragmentation risk without hiding
  terrain or changing terrain LOD policy.
- `WorldFeatureSystem` now reuses module-level terrain sample offsets and
  iterates the two flat-search radii directly instead of allocating fixed
  sample/radius arrays for every terrain placement candidate. Sample order,
  flat-search radii, terrain-height/normal scoring, cliff-lip rejection, final
  placement positions, feature content, war assets, collision/LOS
  registration, draw distance, combat pressure, wildlife, atmosphere, and
  player flow are preserved.
- `WorldFeatureSystem` now records each static detail-cull object's world X/Z
  once when the feature is built and uses that cached position during detail
  visibility refreshes. Detail render distances, hysteresis, sector culling,
  feature content, terrain placement, collision/LOS registration, war assets,
  draw distance, combat pressure, wildlife, atmosphere, and player flow are
  preserved while frozen micro-detail props no longer require repeated
  `getWorldPosition(...)` / matrix-world queries during culling refreshes.
- `GPUBillboardVegetation` now tracks dirty instance-index spans for position,
  scale, and rotation attributes and submits scoped `addUpdateRange(...)`
  updates before setting `needsUpdate`. Adds update the touched
  position/scale/rotation span; removals update only the touched scale span
  that zeroes hidden instances. Billboard instance allocation, free-slot reuse,
  high-water compaction, mesh visibility, vegetation density, imposter atlas
  behavior, fog/TOD lighting uniforms, terrain/vegetation readability, and
  draw distance are preserved.
- `WildlifeSystem` now builds one optimized draw-call template per wildlife
  species/model path and clones spawned animals from that template. Same
  wildlife roster, spawn cap, spawn distances, flee behavior, shadow policy,
  transform freeze, model scale, visibility, and disposal semantics are
  preserved, while repeated same-species respawns no longer rerun the static
  draw-call optimizer/deinterleave path.
- `WorldFeatureSystem` now gates static feature-sector and detail-object
  visibility refreshes by camera pose: first build, meaningful movement,
  rotation/projection change, or a short forced interval. Dynamic ground
  vehicle visibility still updates when vehicle placements exist. Static
  world-feature content, frustum and distance thresholds, detail-prop
  hysteresis, dynamic ground-vehicle culling, vehicle registration, terrain
  placement, collisions, and LOS obstacle registration are preserved.
- `TerrainVegetationRuntime.updateBudgeted()` now runs the near
  `JungleGroundRing` first, then debits the shared add budget before the
  broader `VegetationScatterer` can add cells in the same update. Scatterer
  removals still run, and full scatterer add budget is preserved when the
  ground ring has no work. Near ground-cover priority, far vegetation content,
  removal draining, cell residency semantics, terrain-height sampling, and
  draw distance are preserved.
- `TerrainSystem` now skips duplicate normalized atmosphere lighting snapshots,
  `TerrainSurfaceRuntime` normalizes into owned scratch state before copying
  into its live terrain-lighting config, and
  `updateTerrainMaterialAtmosphereLighting()` updates existing uniforms and
  stashed `Color` / `Vector3` objects in place. Rig lighting authority, zero
  night-fill path, direct-light normalization, daylight factor, low-sun
  occlusion relief, terrain material uniforms, and terrain visuals are
  preserved.
- `CombatantRenderer` now marks only the written prefix of NPC impostor,
  aura-outline, and ground-marker instance matrices dirty, and
  `markPixelForgeNpcImpostorAttributesDirty()` can scope Pixel Forge impostor
  attribute update ranges to the active bucket count. Bucket counts, matrix
  writes, animation phase/view/opacity attributes, materialization tiers,
  ground markers, auras, NPC visibility, and combat behavior are preserved.
- `WeatherSystem.updateRain()` now marks only the active rain instance-matrix
  prefix dirty instead of flagging the full preallocated rain matrix buffer
  whenever rain is visible. Rain count policy, active-count intensity scaling,
  opacity compensation, storm wind, camera-relative wrapping, terrain wetness,
  and weather visuals are preserved.
- `VegetationScatterer` and `JungleGroundRing` now decode their existing string
  cell keys into system-owned scratch storage instead of allocating
  `split(',')` arrays during cell generation and distance sorting. External
  cell-key strings, billboard chunk IDs, deterministic placement, ground-cover
  ownership, vegetation content, draw distance, and terrain-height sampling
  behavior are preserved.
- `CDLODQuadtree.selectTiles()` now calls the four root quadrants directly, and
  `resolveEdgeMorphMasks()` probes tile edges through scalar helper calls
  instead of allocating tuple arrays during root and edge-probe passes. Tile
  recursion order, LOD ranges, AABB distance metric, numeric tile keys,
  tile-cap saturation reporting, edge-morph bit layout, and selected-tile reuse
  are preserved.
- `CombatantRenderer` now reuses renderer-owned scratch `Set` / `Map`
  containers for close-model selected IDs, suppressed impostor IDs,
  prospective IDs, pool demand, and materialization-transition seen IDs. This
  preserves close-model candidate scoring, cap/reserve behavior, fallback
  reasons, render-lane events, and Pixel Forge impostor/close-GLB output while
  reducing always-active combat render bookkeeping allocation.
- `AAEmplacementSystem.updateFiring()` now reuses a module-level shot `Ray` and
  uses `Vector3.addScaledVector()` for tracer endpoints instead of cloning
  direction/start vectors and allocating a new `THREE.Ray` for each AA burst
  shot. Targeting, lead prediction, spread, tracer lifetime, hit range,
  helicopter damage, and audio trigger behavior are preserved.
- Pooled smoke clouds now cache their sprite materials beside the sprite array.
  Active smoke update/spawn/deactivate/dispose paths reuse that material array
  instead of reading and casting through `sprite.material` for each sprite.
  This preserves the same cloud pool size, sprite count, independent opacity,
  randomized spread, lifecycle timing, overlay influence, and smoke LOS
  behavior while reducing active smoke-cloud object graph lookups.
- Pooled explosion effects now cache their smoke, fire, and debris particle
  position attributes plus backing arrays on the effect object. Spawn/update
  helpers reuse those buffers instead of resolving geometry attributes during
  grenade, mortar, and tank-cannon explosion updates. This preserves the same
  pooled explosion primitives, particle counts, timings, velocities, opacity,
  update-range behavior, and combat effect visuals while reducing hot-path
  object graph lookups.
- `ZoneRenderer` now updates contested capture-progress rings by mutating the
  fixed position/UV buffers in place instead of disposing and rebuilding
  `RingGeometry` whenever the displayed angle changes. This preserves the same
  ring radius, displayed angle, visibility rules, zone state colors, flag
  behavior, terrain-height sync, labels, and capture gameplay while removing
  geometry churn from contested zone updates.
- Zone visuals now share static flag geometry plus flag, flag-pole, and
  progress-ring materials at `ZoneRenderer` scope. Per-zone radius/progress
  geometry, labels, flag ownership visibility, flag waving, terrain-height
  sync, and zone gameplay behavior are preserved. This reduces duplicate
  static render resources in the zone-visual category without hiding zones or
  changing capture logic.
- Ambient wildlife now has a close-range shadow-caster cutoff. Animals remain
  spawned, visible, lit, wandering/fleeing, and able to receive terrain shadows
  across the existing spawn/despawn ranges, but far animals no longer submit
  into the shadow map until they cross the close wildlife shadow range. This is
  a same-content render-policy optimization aimed at the prior wildlife
  shadow-submission signal; it is not animal deletion, cap reduction, or the
  rejected broad instancing approach.
- `scripts/perf-capture.ts` now carries the active driver's current view step,
  view clamp flags, target kind, anchor-resync state, aim dot, fire intent,
  aim-gate result/reason, and fire-LOS gate result in runtime-sample
  `harnessDriver` data and final driver summaries. The rAF-gap observer and
  tail-attribution path already consumed this shape, so future artifacts can
  correlate dropped-frame gaps with synthetic camera mechanics, firing, and
  terrain-blocked shot gates without relying only on aggregate counters.
- Typed PlayerBot comments now describe `aimLerpRate=1` as requesting the
  target angle before per-tick slew caps, not as a true camera snap. This is
  documentation alignment; harness behavior was not changed by this slice.
- CDLOD LOD-distance selection is now terrain-relative in the production
  `TerrainSystem` path: `TerrainRenderRuntime` subtracts local terrain height
  before calling `CDLODQuadtree.selectTiles`, while frustum culling still uses
  the real camera matrices. This addresses the elevated A Shau failure mode
  where a camera a few metres above a ridge was treated as hundreds of metres
  above a sea-level tile plane for LOD-distance decisions.
- `AssetLoader.init()` now keeps non-startup Pixel Forge NPC albedo atlases out
  of the boot-critical texture load. Startup `idle` / `patrol_walk` atlases
  remain eager for initial impostor buckets; the remaining run/fire/death
  atlases load during mode preparation before combatants spawn. That
  mode-start load is now batched at four textures per batch with a
  `yieldToRenderer` hook between batches, so one large decode/upload burst is
  split while preserving pre-combat clip availability. Startup telemetry now
  marks NPC texture begin/end, batch yields, loaded/total counts, batch size,
  and batch-yield count before combatant spawn, so future artifacts can isolate
  this stage from terrain features, vegetation, spawning, and live-entry work.
  Static texture audit split: 514.64 MiB total NPC mipmapped RGBA estimate,
  147.04 MiB startup-eager, 367.6 MiB moved to mode preparation.
- `AssetLoader.init()` now keeps Pixel Forge foliage atlases out of the
  boot-critical texture load. `GPUBillboardSystem.initializeFromConfig()` awaits
  the active vegetation color/normal set during the already-deferred vegetation
  initialization, preserving vegetation before gameplay while moving 176.0 MiB
  estimated mipmapped RGBA residency off the engine boot path.
- Tail attribution now carries dropped-frame-time fields instead of only p99 /
  max-frame summaries. `perf:compare` surfaces saved tail-attribution text.
- Presentation epochs now include camera clearance, CDLOD tile-cap saturation,
  terrain render sync recheck/staleness/projection flags, and per-stage terrain
  snapshots so future captures can compare after-simulation and before-render
  terrain state in the same frame. The active tile debug path now preserves
  `edgeMorphMask`, and the recorder includes it in terrain hashes plus compact
  edge-mask summaries, so edge-mask churn is no longer invisible to the
  after-simulation vs before-render comparison.
- Shooting-path cleanup landed for tracer pool material/attribute caching,
  impact effect attribute/array caching, recoil shake/recoil angle ordering,
  flashbang screen math, hip-fire tracer basis math, weapon sway saturation,
  shot distance reuse, smoke LOS math, flashbang disorientation radius gates,
  AI flanking gates, and AI defend gates. These preserve current content and
  combat pressure, but none are runtime proof of reduced dropped-frame time.
- HUD/update cleanup landed across combat feedback and regular HUD sync paths
  in the current worktree. See `progress.md` for the detailed slice-by-slice
  log and verification commands.

## Asset/KTX2 Finding

- Added `npm run check:war-asset-payloads`, a static parser for the generated
  war asset catalog and shipped `public/models` GLBs. Current artifact:
  `artifacts/perf/2026-06-15T17-03-14-537Z/war-asset-payload-audit/war-asset-payload-audit.json`.
- War asset result: 108 catalog entries, 107 parsed, one missing `REJECT`
  (`animals/egret.glb`), 7.97 MiB current shipped GLB payload, 0 MiB embedded
  images, and no KTX2 / BasisU texture path. Current war repaint risk is
  material / primitive fragmentation plus existing reject/exception status, not
  embedded texture compression.
- Pixel Forge texture result:
  `artifacts/perf/2026-06-15T17-03-14-676Z/pixel-forge-texture-audit/texture-audit.json`
  reports 38 registered textures, 36 flagged, 690.5 MiB estimated mipmapped
  RGBA residency, 346.74 MiB candidate estimate, and 343.76 MiB candidate
  savings. NPC albedo atlases dominate at 514.5 MiB estimated residency.
- A 2026-06-15 static sidecar scan ranked immediate non-capture candidates as:
  critical Pixel Forge atlas warmup for already-loaded mode assets and wildlife
  optimized-template caching. The vegetation add-budget arbitration, terrain
  atmosphere object-reuse, and world-feature culling cadence items have static
  cleanup slices in the current worktree, but still need runtime proof. Treat
  the remaining candidates as follow-up hypotheses, not proven wins, and keep
  visual/gameplay parity requirements attached to each.
- KTX2/BasisU is a plausible follow-up for Pixel Forge atlases and future
  textured GLBs because the repo currently has no `.ktx2` files and runtime
  loading is plain `TextureLoader` / `GLTFLoader`. It is not a current fix for
  the war repaint GLBs as shipped. Any KTX2 branch must prove visual parity for
  alpha atlases and normal maps, transcode/upload cost, and dropped-frame-time
  impact before it can be treated as a performance win.
- Asset-weight update from the current static rerun: broad "too many new
  assets" is not the leading hypothesis by bytes; texture-atlas residency and
  upload cadence remain much stronger than war-GLB byte size. War GLBs still
  deserve material/primitive consolidation review where many instances are
  submitted, but KTX2 is not the remedy for those texture-free files.
- Asset-side weighting update from static sidecars:
  - 45%: CPU/load/build work from high-node/high-primitive GLB scene graphs
    being traversed, frozen, collision/LOS scanned, and batch-optimized during
    world-feature construction. Risk examples include
    `rubber-plantation-mansion.glb`, `french-villa.glb`,
    `buddhist-temple.glb`, `warehouse.glb`, and `bridge-stone.glb`.
  - 25%: accepted `EXCEPTION` world/building assets increasing material,
    primitive, and submission work where settlement/firebase/airfield prefabs
    place them.
  - 20%: Pixel Forge atlas GPU residency/upload cadence, especially NPC
    albedo atlases loaded in mode preparation and 2048x2048 vegetation
    color/normal atlases.
  - 10%: loader/format debt, including missing Meshopt/Draco/KTX2 hooks and
    rejected/missing catalog edge cases. This is real debt, but current bytes
    do not justify treating it as the first-order cause of the visible terrain
    presentation glitch.
- KTX2 would not address generated terrain `DataTexture` height/normal uploads,
  terrain heightmap baking, navmesh/DEM payloads, shader compile stalls,
  draw-call/material fragmentation in texture-light GLBs, CPU simulation
  stalls, or service-worker/cache policy by itself.
- A 2026-06-15 read-only KTX2 sidecar scan confirmed the minimal future hook:
  one shared `KTX2Loader` with `detectSupport(renderer)` after renderer init,
  `.ktx2` support in `AssetLoader`, and `GLTFLoader.setKTX2Loader(...)` for
  future `KHR_texture_basisu` GLBs. Prioritize NPC albedo atlases first; treat
  vegetation normals separately; do not spend first-pass effort on UI icons,
  terrain WebPs, or the tiny close-NPC embedded GLB PNGs.

## Verification Notes

- Current flanking AI and zone-ticket bookkeeping slices passed:
  `npx vitest run src\systems\combat\ai\AIFlankingSystem.test.ts src\systems\combat\ai\FlankingRoleManager.test.ts src\systems\combat\ai\AIStateEngage.test.ts`
  plus focused ZoneCaptureLogic/ZoneManager/TicketSystem iterator tests and
  targeted ESLint. No perf/browser/gameplay capture was run under the owner
  pause.
- Current ShotCommand frame-pool slice passed focused ShotCommand,
  WeaponShotCommandBuilder, WeaponFiring, and GunplayCore tests, targeted
  ESLint, `npm run typecheck`, `npm run lint:docs`, and `npm run build:perf`.
  No perf/browser/gameplay capture was run under the owner pause.
- Current vehicle explosion-damage radius iterator slice passed focused
  CombatantSystemDamage and VehicleManager tests, targeted ESLint,
  `npm run typecheck`, `npm run lint:docs`, and `npm run build:perf`. No
  perf/browser/gameplay capture was run under the owner pause.
- Current NPC emplacement-seek radius iterator slice passed focused
  EmplacementSeekHelper, M2HBEmplacement, and VehicleManager tests, targeted
  ESLint, `npm run typecheck`, `npm run lint:docs`, and `npm run build:perf`.
  No perf/browser/gameplay capture was run under the owner pause.
- Current ground-vehicle prompt radius iterator slice passed focused
  GroundVehicleProximityChecker and VehicleManager tests plus static gates.
  No perf/browser/gameplay capture was run under the owner pause.
- Current vehicle-category marker iterator slice passed focused map/minimap
  and VehicleManager tests plus static gates. No perf/browser/gameplay capture
  was run under the owner pause.
- Current compass vehicle-query iterator slice passed:
  `npx vitest run src\systems\vehicle\VehicleManager.test.ts src\core\StartupPlayerRuntimeComposer.test.ts src\ui\compass\CompassVehicleMarkers.test.ts src\ui\compass\CompassSystem.test.ts`
  targeted ESLint, `npm run typecheck`, `npm run lint:docs`, and
  `npm run build:perf`. No perf/browser/gameplay capture was run under the
  owner pause.
- Current shared vehicle-marker refresh slice passed:
  `npx vitest run src\ui\map\VehicleMarkers.test.ts src\ui\minimap\MinimapVehicleMarkers.test.ts src\ui\map\FullMapSystem.test.ts src\ui\minimap\MinimapRenderer.test.ts src\ui\map\OpenFrontierRespawnMapVehicleMarkers.test.ts`
  targeted ESLint, `npm run typecheck`, `npm run lint:docs`, and
  `npm run build:perf`. No perf/browser/gameplay capture was run under the
  owner pause.
- Current minimap projection scratch slice passed:
  `npx vitest run src\ui\map\MapProjection.test.ts src\ui\minimap\MinimapRenderer.test.ts src\ui\minimap\MinimapVehicleMarkers.test.ts`
  targeted ESLint, `npm run typecheck`, `npm run lint:docs`, and
  `npm run build:perf`. No perf/browser/gameplay capture was run under the
  owner pause.
- Current performance-overlay diagnostics slice passed:
  `npx vitest run src\core\RuntimeDebugStats.test.ts src\core\GameEngineLoop.test.ts`
  targeted ESLint, `npm run typecheck`, `npm run lint:docs`, and
  `npm run build:perf`. No perf/browser/gameplay capture was run under the
  owner pause.
- Current wildlife optimized-template cache slice passed:
  `npx vitest run src\systems\wildlife\WildlifeSystem.test.ts src\systems\assets\ModelDrawCallOptimizer.test.ts`,
  targeted ESLint, `npm run typecheck`, `npm run lint:docs`, and
  `npm run build:perf` with only the existing Vite large-chunk warning. No
  perf/browser/gameplay capture was run under the owner pause.
- Current world-feature visibility cadence slice passed:
  `npx vitest run src\systems\world\WorldFeatureSystem.test.ts src\systems\world\GroundVehicleRenderOptimization.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current vegetation add-budget arbitration slice passed:
  `npx vitest run src\systems\terrain\TerrainVegetationRuntime.test.ts src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\JungleGroundRing.test.ts src\systems\world\billboard\GPUBillboardSystem.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current terrain atmosphere lighting reuse slice passed:
  `npx vitest run src\systems\terrain\TerrainMaterial.test.ts src\systems\terrain\TerrainSystem.test.ts src\core\SystemUpdater.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current combat impostor upload-range slice passed:
  `npx vitest run src\systems\combat\CombatantRenderer.test.ts src\systems\combat\CombatantMeshFactory.test.ts src\systems\combat\CombatantSystemDamage.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current weather rain matrix update-range slice passed:
  `npx vitest run src\systems\environment\WeatherSystem.test.ts` and targeted
  ESLint. No perf/browser/gameplay capture was run under the owner pause.
- Current vegetation residency cell-key decode slice passed:
  `npx vitest run src\systems\terrain\VegetationScatterer.test.ts src\systems\terrain\JungleGroundRing.test.ts src\systems\world\billboard\GPUBillboardSystem.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current CDLOD scalar probe slice passed:
  `npx vitest run src\systems\terrain\CDLODQuadtree.test.ts src\systems\terrain\TerrainRenderRuntime.test.ts src\core\PresentationEpochRecorder.test.ts scripts\perf-tail-attribution.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current combat renderer scratch-container slice passed:
  `npx vitest run src\systems\combat\CombatantRenderer.test.ts src\systems\combat\CombatantMeshFactory.test.ts src\systems\combat\CombatantSystemDamage.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current AA emplacement shot-loop scratch slice passed:
  `npx vitest run src\systems\airsupport\AAEmplacement.test.ts src\systems\combat\projectiles\TankCannonProjectile.test.ts src\systems\effects\TracerPool.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current smoke cloud sprite-material cache slice passed:
  `npx vitest run src\systems\effects\SmokeCloudSystem.test.ts src\systems\weapons\GrenadeEffects.test.ts src\systems\combat\ai\AILineOfSight.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current explosion particle-buffer cache slice passed:
  `npx vitest run src\systems\effects\ExplosionEffectFactory.test.ts src\systems\effects\ExplosionEffectsPool.test.ts src\systems\weapons\GrenadeEffects.test.ts src\systems\weapons\GrenadeSystem.test.ts src\systems\combat\projectiles\TankCannonProjectile.test.ts`,
  targeted ESLint, `npm run typecheck`, and `npm run build:perf`. No
  perf/browser/gameplay capture was run under the owner pause.
- Current zone progress-ring in-place update passed:
  `npx vitest run src\systems\world\ZoneRenderer.test.ts src\systems\world\ZoneManager.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current zone-visual shared-resource slice passed:
  `npx vitest run src\systems\world\ZoneRenderer.test.ts src\systems\world\ZoneManager.test.ts`
  and targeted ESLint. No perf/browser/gameplay capture was run under the
  owner pause.
- Current wildlife shadow-pass cutoff slice passed:
  `npx vitest run src\systems\wildlife\WildlifeSystem.test.ts src\systems\assets\ModelDrawCallOptimizer.test.ts`,
  targeted ESLint, and `npm run typecheck`. No perf/browser/gameplay capture
  was run under the owner pause.
- Current harness view/fire context capture slice passed:
  `npx vitest run src\dev\harness\playerBot\PlayerBotController.test.ts src\dev\harness\PlayerBot.test.ts scripts\perf-tail-attribution.test.ts scripts\perf-browser-observers.test.ts`,
  `npx vitest run scripts\perf-harness\perf-active-driver.test.js`, targeted
  ESLint, and `npm run typecheck`. `node --test
  scripts\perf-harness\perf-active-driver.test.js` was the wrong runner and
  failed before loading the suite because `describe` is not a Node built-in
  global.
- Current terrain-relative CDLOD selection slice passed: focused
  `TerrainRenderRuntime`, `CDLODQuadtree`, `PresentationEpochRecorder`,
  `perf-tail-attribution`, and `TerrainSystem` tests plus targeted ESLint,
  `npm run typecheck`, `npm run build:perf`, `npm run lint:docs`, scoped `git
  diff --check`, and a scoped trailing-whitespace scan.
- Current asset slice passed: focused war-asset audit tests, targeted ESLint,
  `npm run check:war-asset-payloads`, and `npm run typecheck`. Latest static
  rerun remains 7.97 MiB shipped war GLBs, 0 MiB embedded images, and no KTX2
  / BasisU path.
- Current texture/startup instrumentation slices passed focused
  `AssetLoader`, `GPUBillboardSystem`, `CombatantMeshFactory`, and
  `ModeStartupPreparer` tests plus targeted ESLint and static gates.
- Current combat-fire terrain-block attribution, CDLOD late render-camera
  sync, harness mutation/view-jump surfacing, and shot-presentation context
  slice passed focused
  `CombatantCombat`, `TerrainRenderRuntime`, `GameEngineLoop`, and active
  driver tests plus targeted ESLint, `npm run typecheck`,
  `npm run build:perf`, and `npm run lint:docs`. No perf/browser/gameplay
  capture was run under the owner pause.
- `npm run typecheck:scripts` still fails on pre-existing broad script/archive
  type errors outside this slice.

Update 2026-06-15 23:40 UTC / 19:40 EDT:

- Controlled-burned the stale terrain-render test assumption that late
  render-camera sync may skip an unchanged CDLOD tile submission. That
  invariant was compatible with static CPU work avoidance but unsafe as the
  visual source of truth once A Shau camera/aim movement could leave GPU tile
  matrices and tile-parameter attributes stale. The regular simulation-side
  unchanged-submission fast path remains covered; the render-camera path now
  requires a coherent CDLOD resubmission even when tile identities match.
- Promoted the diagnostic full-prefix CDLOD upload behavior into the normal
  render-camera coherency path: active tile matrices plus both tile-parameter
  instance buffers are rewritten for the active prefix and marked dirty
  together. `?terrainForceInstanceUpload=1` remains as an explicit perf/dev
  isolation switch, but the visual fix no longer depends on that flag.
- Added perf-harness isolation switches for suspected non-primary variables:
  `--disable-terrain-far-canopy-tint`, `--disable-terrain-low-sun-occlusion`,
  and `--disable-wildlife`. These are dev/perf-harness-only switches and are
  emitted into `summary.json` under `perfRuntime` so captures cannot silently
  compare different content.
- A Shau headed evidence:
  - Baseline stale-upload capture:
    `artifacts/perf/2026-06-15T23-07-21-710Z`, default content,
    `terrainForceInstanceUpload=false`, final image showed black terrain
    ribbons in the sky, dropped-frame time was about `704.2ms/s`
    (`42.66` estimated 60Hz frames/s dropped).
  - Forced coherent-upload diagnostic:
    `artifacts/perf/2026-06-15T23-09-59-072Z`,
    `terrainForceInstanceUpload=true`, final image did not show the same sky
    terrain ribbons, dropped-frame time stayed about `700.1ms/s`.
  - Default path after promoting render-camera coherency:
    `artifacts/perf/2026-06-15T23-32-39-251Z`, default content,
    `terrainForceInstanceUpload=false`, final image did not show the black sky
    terrain ribbons, dropped-frame time stayed about `684.9ms/s`.
- Interpretation: the controlled burn fixed a real visual/presentation
  invariant in the terrain path, but it did not solve the frame-time goal.
  Current A Shau remains render-bound, with tail attribution dominated by
  `RenderMain.renderer.render`, roughly 15k-16k reported renderer draw calls,
  and roughly 1.5M-1.9M triangles in the sampled windows. Terrain is still the
  largest visible triangle contributor in the scene attribution; wildlife and
  low-sun/far-canopy material switches did not explain the drop-frame tail.
- Verification passed:
  `npm run test:run -- src/systems/terrain/TerrainRenderRuntime.test.ts src/systems/terrain/CDLODRenderer.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/wildlife/WildlifeSystem.test.ts src/core/PresentationEpochRecorder.test.ts scripts/perf-tail-attribution.test.ts`,
  targeted ESLint for the touched terrain/wildlife/harness files, and
  `npm run typecheck`.
- Next: treat the terrain sky/backface glitch as improved but not closed until
  the owner no longer sees it in normal play. Continue with render-submission
  attribution and GPU/CPU split before changing terrain LOD budgets; the
  harness remains a sensor, not the source of truth.

Update 2026-06-15 23:46 UTC / 19:46 EDT:

- Ran a headed A Shau render-submission attribution capture:
  `artifacts/perf/2026-06-15T23-39-55-418Z`.
  Measurement trust failed because the attribution wrapper itself made the path
  heavy, so do not use the absolute frame-time values as a clean regression
  number. The tail attribution is still directionally useful: the sampled tail
  frame spent about `58.8ms` in `RenderMain.renderer.render`; render
  submissions were only `49`, but terrain accounted for about `2.45M`
  triangles across `3` terrain submissions. This demotes "too many scene
  objects" as the primary tail explanation and promotes A Shau terrain
  geometry/shadow participation.
- Ran a headed A Shau terrain-shadow isolation capture:
  `artifacts/perf/2026-06-15T23-42-25-821Z`, with
  `terrainShadowsDisabled=true`. This did not solve the frame-time target, but
  it reduced the sampled tail render slice from roughly `58.8ms` to `44.6ms`
  and lowered dropped-frame time from the latest default's roughly `684.9ms/s`
  to roughly `619.8ms/s` in a shorter 60s run. The final frame did not show
  the black sky terrain ribbons.
- Decision: do not silently change the production terrain shadow contract from
  one perf capture. Shadow/lighting changes need the visual-rearch evidence
  matrix and owner acceptance. Treat this as a strong next lever: terrain
  should probably keep receiving shadows while using a cheaper shadow caster
  policy, shadow LOD/proxy, or bounded near-field caster instead of submitting
  full visible CDLOD terrain into shadow maps.

Owner observation 2026-06-15 19:49 EDT:

- Owner reports the terrain glitching appears fixed from normal visual review.
  Treat the CDLOD render-camera coherency change as owner-observed positive
  evidence for the black sky-ribbon/backface glitch. Keep this scoped: the
  dropped-frame-time goal is still open, and terrain shadow/LOD cost remains
  the next measured perf lever.

Update 2026-06-15 23:53 UTC / 19:53 EDT:

- Owner rejected the dense near vegetation circle and asked for ferns/plants to
  feel like the previous vegetation setup. Normal runtime now keeps
  `JungleGroundRing` dormant and routes accepted ground-cover vegetation back
  through `VegetationScatterer`. This is not a metric-motivated deletion; it is
  preserving the requested game experience while continuing the dropped-frame
  work.
- Controlled-burned stale vegetation tests that encoded the unwanted ownership
  split. Focused suite now proves the dense ring is not scheduled in normal
  runtime, ground cover reaches the scatterer, and the dormant ring is cleared
  on configure/regenerate.
- Verification passed:
  `npm run test:run -- src/systems/terrain/TerrainVegetationRuntime.test.ts src/systems/terrain/TerrainSystem.test.ts src/systems/terrain/VegetationScatterer.test.ts src/systems/terrain/JungleGroundRing.test.ts`,
  targeted ESLint for touched terrain vegetation tests/runtime, and
  `npm run typecheck`. `npm run build:perf` also passed with the existing Vite
  large-chunk warning.

Update 2026-06-16 00:10 UTC / 20:10 EDT:

- Spiked a low-resolution CDLOD terrain shadow proxy after the shadow isolation
  run suggested full terrain shadow participation was expensive. The local
  experiment used a cloned terrain node material so the proxy could preserve
  displaced terrain height in shadow passes.
- Result: rejected and removed from source. Three/WebGPU shadow traversal still
  requires the proxy object to be visible to be traversed; without additional
  light-layer ownership plumbing, the proxy also costs a main render
  submission. The A Shau proxy capture
  `artifacts/perf/2026-06-16T00-03-37-176Z` failed validation and measurement
  trust, with dropped-frame time about `688.5ms/s` and tail attribution still
  dominated by `RenderMain.renderer.render` at about `53.9ms`.
- Decision: do not keep a dormant `terrainShadowProxy` flag. The next viable
  shadow path needs explicit light/shadow-layer ownership, a bounded near-field
  terrain caster policy, or a broader terrain/shadow LOD design with visual
  evidence. A hidden low-res clone alone is not a production-quality solution.

Update 2026-06-16 00:28 UTC / 20:28 EDT:

- Stabilization follow-up: a layer-hidden variant of the shadow proxy also
  failed to move A Shau dropped-frame time and was removed before commit. The
  run `artifacts/perf/2026-06-16T00-17-48-322Z` failed validation/trust with
  about `688.0ms/s` dropped-frame time and a tail still dominated by
  `RenderMain.renderer.render` at about `58.1ms`.
- No `terrainShadowLayerProxy` / `terrainShadowProxy` source or harness flag
  remains. Keep pursuing terrain/shadow cost from a cleaner design rather than
  another hidden duplicate terrain mesh.

Update 2026-06-16 03:36 UTC / 23:36 EDT:

- Fixed a perf-capture sampling defect where `tsx`/esbuild serialized
  `page.evaluate` callbacks with a browser-missing `__name` helper. The
  harness now installs a page-context shim on the Playwright context and active
  page, restoring runtime sample collection after the earlier
  `ReferenceError: __name is not defined` / `TypeError: __name is not a
  function` failures.
- Added `--vegetation-density-scale <0..1>` as a perf-harness-only A/B control
  (`?perf=1&perfVegetationDensityScale=`). It scales biome vegetation density
  at runtime for diagnosis only; default and retail behavior remain `1.0`.
- Short A Shau controls after the shim collected samples again, but still
  failed measurement trust and dropped-frame gates. The vegetation-off A/B did
  not clear the dropped-frame tail and removed visible jungle content, so it is
  not a candidate fix. Vegetation remains a visual/noise and load suspect, not
  the sole driver.
- A later A Shau retry with the new terrain-sync classification failed before
  gameplay because the required remote DEM fetch hit `ERR_CONNECTION_RESET`.
  That artifact is startup/network evidence only, not perf evidence:
  `artifacts/perf/2026-06-16T03-27-40-867Z`.
- Trusted Open Frontier control
  `artifacts/perf/2026-06-16T03-30-05-022Z` passed measurement trust
  (probe avg `16.07ms`, p95 `27ms`) but still failed dropped-frame thresholds:
  `165.2ms` dropped-frame time over `15s` (`11.01ms/s`) and `13` estimated
  dropped 60Hz frames. Tail attribution remained render-dominated
  (`RenderMain.renderer.render` was the slowest segment).
- Terrain presentation diagnostics now preserve whether late sync submitted a
  terrain buffer and classify the submission (`same-identity`,
  `dynamics-changed`, `tile-set-changed`). The Open Frontier control showed
  cumulative terrain late sync was mostly CDLOD dynamics churn, not tile-set
  swaps (`late=969`, `same=17`, `dyn=912`, `tile=40` by frame 1045). This
  points the next optimization pass at camera/terrain timing and CDLOD morph
  update policy, not broad content deletion.
- Verification passed: focused tests for `PerfDiagnostics`,
  `PresentationEpochRecorder`, `TerrainBiomeRuntimeConfig`, and tail
  attribution; targeted ESLint on all touched harness/diagnostics files;
  `npm run build:perf`; and `npm run validate:fast`.

Update 2026-06-16 19:25 UTC / 15:25 EDT:

- Added executable EARS artifact scaffolding for the dropped-frame finish line:
  `npm run check:dropped-frame-ears`. It evaluates saved perf artifacts for
  required files, quiet-machine attestation, capture/validation/trust pass,
  strict WebGPU, rAF dropped-frame thresholds, real combat, same-experience
  harness warnings, content-reduction flags, and the required Open Frontier +
  A Shau artifact pair.
- Ran it against the latest dirty A Shau packet
  `artifacts/perf/2026-06-16T19-00-48-789Z`; the checker correctly classified
  it as diagnostic-only and reported missing Open Frontier pair coverage,
  failed capture/validation/measurement trust, failed rAF gates, and active
  harness equivalence failures.
- This is repo scaffolding, not runtime proof. The goal still needs paired
  quiet-machine captures, owner terrain/camera visual acceptance, and the
  release proof chain before completion.

Update 2026-06-16 19:33 UTC / 15:33 EDT:

- Source-stable harness-equivalence candidate: the active perf driver no
  longer uses `PlayerController.applyWorldMovementIntent` in its apply loop.
  It now slews the camera toward the route/aim target first, then converts the
  route target into camera-relative `forward` / `strafe` and issues the normal
  `applyMovementIntent` path. This preserves route-following intent while
  removing the perf-driver-only movement mode that made
  `harness_movement_mode_equivalence` structurally warn.
- Guardrails: the conversion uses the live `PlayerMovement` convention
  (`yaw=0` means world `-Z` forward), maps right-side route targets to strafe,
  does not backpedal when the route target is behind the current slewed view,
  and keeps explicit strafe-only intent when no world target exists.
- Verification passed: `npx vitest run
  scripts/perf-harness/perf-active-driver.test.js`, targeted ESLint for
  `scripts/perf-active-driver.cjs` plus the active-driver test, and full
  `npm run validate:fast` (existing grandfathered source-budget/doc warnings
  only). This is not runtime proof; the next quiet-machine A Shau/Open
  Frontier artifacts must show the movement-mode warning gone and must still
  pass real combat, dropped-frame, trust, and visual gates.

Update 2026-06-16 19:55 UTC / 15:55 EDT:

- Aligned active perf capture defaults with the EARS completion lane:
  frontline compression is now explicit opt-in instead of default-on.
  `--compress-frontline true` remains available as a diagnostic shortcut, but
  same-experience captures should leave it false so combat pressure is reached
  through route/objective behavior rather than relocating actors near the
  player.
- `summary.json` now records `perfRuntime.frontlineCompressionRequested`, and
  `npm run check:dropped-frame-ears` rejects requested frontline compression
  even if no actors happened to move. This closes the loophole where a
  compressed setup could pass artifact review on metrics alone.
- Added EARS-shaped capture commands:
  `npm run perf:capture:ashau:ears` and
  `npm run perf:capture:openfrontier:ears`. They force headed strict WebGPU,
  summary render-submission attribution, and `--compress-frontline false`.
  Goal status is still open until quiet-machine artifacts from both commands
  pass the EARS checker and owner visual/game-feel acceptance.

Update 2026-06-16 20:05 UTC / 16:05 EDT:

- Reduced the harness bot's default pre-slew aim blend from snap-request
  behavior to a humanized partial request in both the TypeScript
  `PlayerBot` config and the CJS `perf-active-driver` mirror. The actual
  per-tick view cap remains unchanged; the change targets the synthetic
  "requested 180 degree turn" path that can poison
  `harness_view_slew_request_equivalence` and owner-visible camera feel.
- Added TS and CJS tests that keep the default aim request below `1.0`.
  Runtime proof is still required: the next EARS captures must show large
  requested view turns gone while shots/hits and route progress remain real.

Update 2026-06-17 09:45 UTC / 05:45 EDT:

- A Shau capture variance is now explicit in the working evidence model:
  A Shau EARS artifacts must be contact-qualified and materialization-qualified
  before they can say anything useful about combat stutter. Low/no-combat
  route runs can still diagnose terrain, weather, vegetation, startup, or
  measurement trust, but they must not be used as proof that firefight
  dropped-frame time improved.
- The perf driver now exposes a compact counter snapshot, and `perf-capture`
  uses it for top-level `shotsThisSession`, `hitsThisSession`, and `hitRate`
  even on non-detail samples. This fixed the stale alternating zero-shot rows
  in A Shau capture logs while preserving the full debug snapshot cadence.
- Source-stable close-NPC CPU cleanup: `CombatantRenderer.solveArmToTarget`
  no longer forces three redundant root `updateMatrixWorld(true)` calls inside
  each arm solve; the caller already updates the root once before weapon-socket
  refresh and `setBoneDirectionWorld()` updates the changed branch.
- A Shau now uses an explicit `ashauJungle` default biome instead of reusing
  Open Frontier's `denseJungle` palette. It keeps the same vegetation families
  but lowers ground-cover/canopy multipliers so A Shau no longer inherits the
  fern-heavy dense-ring look. Open Frontier remains on `denseJungle`.
- Diagnostic A Shau captures after these changes remain failures, not proof:
  `artifacts/perf/2026-06-17T09-29-51-947Z` was contact/materialization
  qualified (`121` shots/hits, peak close candidates `27`) and improved to
  about `34.3ms/s` dropped-frame time, but measurement trust failed
  (`probeAvg=75.2ms`, `probeP95=170ms`). The stronger A Shau palette in
  `artifacts/perf/2026-06-17T09-38-36-176Z` reduced active vegetation into the
  roughly `20k-30k` range and tail vegetation triangles to about `59k`, but
  the route had a heavier late render/world-static tail and still failed at
  about `38.3ms/s`; harness view-slew and shot-presentation warnings also
  remained. These are useful diagnostics, not completion evidence.

Update 2026-06-17 10:15 UTC / 06:15 EDT:

- Fixed a shot-presentation terrain classifier blind spot: shot-level
  `unsyncedBufferVisible` now reads the recorder's current hyphenated
  `terrainByStage['after-simulation']` / `['before-render']` keys through a
  shared classifier, while still accepting legacy camelCase keys for old
  artifacts. Previously the shot classifier could undercount visible
  identity/edge-mask/tile-count churn even when the presentation-gap summary
  had the correct stage data.
- Render-submission attribution now preserves `topOwners` per category, and
  world feature groups/placements carry stable `perfOwnerKey` /
  `perfOwnerLabel` / `perfOwnerType` metadata. The next A Shau/Open Frontier
  EARS captures should be able to break a `world_static_features` tail down to
  at least sector/feature/placement ownership instead of treating the whole
  static world layer as one opaque bucket.
- Verification passed: focused tests for terrain-stage classification,
  presentation-gap summary, tail attribution, and world-feature metadata;
  source `npm run typecheck`; and targeted ESLint on all touched source and
  harness files. This is a harness/diagnostic improvement, not dropped-frame
  completion evidence.

Update 2026-06-17 12:25 UTC / 08:25 EDT:

- Tightened the A Shau evidence model around owner-observed run-to-run skew:
  an A Shau perf capture is not comparable firefight evidence merely because
  it has the right map, seed, duration, and quiet-machine conditions. Some
  runs may contain little or no combat, and others may only touch combat in a
  short burst. Those packets can still diagnose terrain, weather, loading,
  route behavior, and measurement trust, but they must not be used as proof
  that combat dropped-frame time improved.
- `npm run check:dropped-frame-ears` now adds
  `active_combat_sustained_contact` when `runtime-samples.json` is available.
  A completion-lane artifact must still pass aggregate shots/hits, and it must
  also show repeated shot-counter progression across runtime samples. This
  keeps low/no-combat and burst-only A Shau packets diagnostic even when raw
  timing numbers look cleaner.

Update 2026-06-17 12:30 UTC / 08:30 EDT:

- Started a preservation-friendly render-submission candidate from the latest
  A Shau attribution: ambient wildlife remains enabled, visible, and moving,
  but spawn-ring animals no longer cast into the shadow map unless they are
  encounter-close. `WILDLIFE_CONFIG.shadowCastDistanceM` now matches the
  90m flee/despawn envelope instead of extending shadow casting deeper into
  the 80-220m ambient ring.
- Rationale: the latest A Shau artifact showed recurring wildlife submissions
  in both main and shadow passes, while Open Frontier also failed in clear
  weather. This is not a rain-only fix or content reduction; it removes
  low-readability shadow work from ambient animals and keeps wildlife present.
- Focused verification: `npx vitest run
  src\systems\wildlife\WildlifeSystem.test.ts` passed. Completion remains
  open until paired default-content Open Frontier + A Shau EARS artifacts pass
  with sustained combat, measurement trust, rAF gates, and owner visual
  acceptance.
- Sidecar analysis split the next owners this way: close-NPC artifacts look
  like steady resident close-model submission cost, not promotion thrash
  (`peakPromotionsThisFrame=0`, no materialization events in sampled rows);
  rain upload remains a high-confidence A Shau-only target; full wildlife
  batching is the stronger longer-term wildlife fix if the shadow cutoff does
  not move paired EARS captures enough.
- Small close-model hygiene landed after that readout: steady opacity/depth
  state now skips redundant material writes when active close-model materials
  are already at the target fade state. This does not change close-model cap,
  distance, animation, or selection; the larger close-model target remains
  reducing resident body GLB mesh/material fanout.

Update 2026-06-17 12:38 UTC / 08:38 EDT:

- Fresh Open Frontier EARS capture
  `artifacts/perf/2026-06-17T12-28-43-347Z` stayed failed but strengthened the
  owner-observed LOD-transition hypothesis. It had real combat (`51` shots /
  `51` hits), sustained close-model pressure (`37/58` detailed samples with
  candidates, peak rendered close models `10`), and still missed rAF
  dropped-frame gates (`1.19` estimated dropped 60Hz frames/s,
  `16.17ms/s` dropped-frame time). The 289.9ms max rAF gap appeared in the same
  early window where close-model pools were first loading/activating for
  factions that were not prepared at insertion.
- The current `materializationTierEvents` stream did not report those
  close-model residency changes (`totalEvents=0`), so future attribution must
  treat `closeModelStats.poolLoads`, pool targets/availability, and
  `npc_close_glb` render submissions as first-class LOD-transition sensors.
- Candidate fix: desktop live-entry close-model prewarm now seeds the steady
  close-model pool target for every runtime faction before combat is enabled.
  This does not lower LOD quality, active cap, combat pressure, map scale, or
  selection priority; it moves normal-cap GLB/mixer/material setup out of the
  active firefight so impostor-to-mesh transitions do not first-touch-load a
  faction under the player's camera.

Update 2026-06-17 12:49 UTC / 08:49 EDT:

- First candidate Open Frontier EARS capture
  `artifacts/perf/2026-06-17T12-43-11-060Z` was still failed, but materially
  better than `2026-06-17T12-28-43-347Z`: estimated dropped 60Hz frames fell
  from `1.19/s` to `0.71/s`, dropped-frame time fell from `16.17ms/s` to
  `9.02ms/s`, and repeated faction first-loads collapsed to one early reserve
  expansion. It still failed the rAF dropped-frame gates and had weak combat
  coverage (`6` shots; min `30`), so this is directionally useful, not proof.
- The live samples showed the initial fix seeded only the steady active cap
  (`8`) while the hard-near reserve policy can legitimately lift the effective
  cap to `14`. That mismatch left a runtime pool expansion when close-model
  candidates reached `12`. The candidate now seeds the full per-faction close
  model pool capacity on desktop live entry so the current materialization
  policy's reserve envelope is prepared before combat, instead of demand-loaded
  during an impostor-to-mesh transition.

Update 2026-06-17 12:55 UTC / 08:55 EDT:

- Reserve-cap Open Frontier EARS capture
  `artifacts/perf/2026-06-17T12-49-21-146Z` confirms the runtime pool-load
  class is gone for that run: `0/117` runtime samples reported close-model pool
  loads, while close materialization still reached `21` candidates, `14`
  rendered close models, and active cap `14`. Startup close-model prewarm
  completed under the existing timeout (`~1.71s` from begin to summary marks),
  so this did not visibly defer the same work into live play in that artifact.
- The capture is still diagnostic, not proof: it had `0` shots / `0` hits,
  failed the dropped-frame gates (`1.23/s`, `16.71ms/s`), and the tail was
  still render/presentation-led (`RenderMain.renderer.render 34.4ms`,
  terrain + vegetation-imposters dominant triangles). That says the first-touch
  pool-load bug was a real contributor but not the whole remaining stutter.
- Harness upgrade: `npm run check:dropped-frame-ears` now requires
  `npc_close_model_runtime_pool_loads_clear` for materialization qualification.
  Artifacts that still load close-model pools during measured runtime stay
  diagnostic even if peak materialization pressure is present.

Update 2026-06-17 13:20 UTC / 09:20 EDT:

- Owner playtest still reports stutter and slow frames as enemy groups cross
  NPC LOD/materialization tiers. The close-model pool-load fix removes one
  first-touch loading class, but it does not prove the tier transition itself is
  smooth.
- Harness blind spot found and patched: `perf-capture` now samples
  close-model stats and drains `materializationTierEvents` on every runtime
  sample instead of only detail samples. `check:dropped-frame-ears` now fails
  `npc_materialization_transition_telemetry` when active close models are
  present but tier-transition telemetry is absent. The old Open Frontier
  artifact `artifacts/perf/2026-06-17T12-49-21-146Z` is therefore explicitly
  diagnostic for transition-stutter claims: it had peak active close models
  `14` but `0` transition events.
- Current weighting from local artifact + read-only subagent analysis:
  first-touch close-model pool loads were real and are fixed in source; steady
  close-model CPU update is modest (`~0.4-1.1ms` in sampled dense windows);
  close GLBs still add draw/material submission pressure (`~7` submissions per
  active close NPC); terrain/CDLOD render/presentation remains the strongest
  tail owner, especially same-identity morph churn and terrain-heavy render
  frames. The next trusted capture must correlate all three before changing
  gameplay density, cap, radius, or vegetation.

Update 2026-06-17 13:35 UTC / 09:35 EDT:

- Added `presentationGapContexts.materialization`, a nearest-runtime-sample
  correlation surface for dropped-frame epochs. It records close-model active /
  rendered / candidate counts, materialization event counts, close-model CPU
  timing, and adjacent render-submission categories beside the existing terrain
  gap summary.
- Recomputed locally against the old diagnostic Open Frontier artifact
  `artifacts/perf/2026-06-17T12-49-21-146Z` (without rewriting the artifact).
  Directional readout: `159/159` gaps correlated to runtime samples; `54` gaps
  had active close models; dropped-frame time near active close models was
  `~958ms`, inactive close-model samples were `~887ms`, and `~1193ms` had no
  close-model stats because the older capture only sampled them on detail
  ticks. Adjacent render submissions show terrain as the triangle owner
  (`34.1M` triangles across correlated frames), vegetation next (`4.35M`), and
  world-static plus close GLB as draw/material pressure (`2064` world-static
  draws, `1427` close-GLB draws, plus `199` weapon draws). This keeps both
  hypotheses alive: close-model transitions are a real visible-pressure lane,
  but terrain/CDLOD/render presentation still owns the largest tail surface.
- Next captures should use the new harness head, not this old artifact, so
  materialization event telemetry and close-model stats are present on every
  runtime sample.

Update 2026-06-17 13:50 UTC / 09:50 EDT:

- Fresh Open Frontier EARS artifact
  `artifacts/perf/2026-06-17T13-32-02-320Z` stayed diagnostic: contact was low
  (`9` shots), measurement trust warned, rAF dropped-frame gates still failed
  (`0.89` estimated dropped 60Hz frames/s, `12.33ms/s` dropped-frame time),
  and the owner still reports stutter as enemies cross NPC LOD/materialization
  tiers.
- The artifact's new gap correlation kept the hypothesis alive but split
  ownership: close models were active in `44/100` correlated presentation gaps
  and carried about `1191ms` of dropped-frame time, while terrain and
  vegetation remained the largest adjacent render-triangle owners. Treat this
  as a combined materialization + render-tail problem, not a pure Combat CPU
  loop.
- The event stream still recorded `0` tier events because promotions can happen
  between runtime samples or before the trusted window. Runtime source now
  records a drained `closeModelStats.transitionWindow` counter directly from
  the renderer's render-lane diff (`null/impostor/close-glb/culled`
  transitions plus reasons). `perf-capture` drains it every runtime sample,
  `presentationGapContexts.materialization` counts it beside event-ring data,
  and `check:dropped-frame-ears` accepts it as materialization-transition
  telemetry when the queued event ring is empty.
- Focused verification passed:
  `npx vitest run src/systems/combat/CombatantRenderer.test.ts scripts/check-dropped-frame-ears.test.ts scripts/perf-presentation-gap-summary.test.ts`
  plus `npm run typecheck`.
