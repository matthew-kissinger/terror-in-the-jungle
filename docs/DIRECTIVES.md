# Directives

Last verified: 2026-05-12 (Phase F slice 1, close-model churn pre-release, and A Shau directed-warp evidence shipped under KONVEYER-10)

Active directive list. Each entry has binary `open` / `done` status, owning
subsystem, opening cycle, latest evidence link, and plain-English success
criteria. Closed items stay as evidence trail. Carry-over discipline:
[docs/CARRY_OVERS.md](CARRY_OVERS.md). Historical ledger prose:
[docs/archive/PROJEKT_OBJEKT_143/](archive/PROJEKT_OBJEKT_143/).

## KONVEYER-10 - Scene parity and frame-budget attribution
Status: open. Owning subsystem: renderer / environment / world / perf-harness. Opened: cycle-2026-05-11-konveyer-scene-parity.
Latest evidence: `origin/exp/konveyer-webgpu-migration` branch head; `artifacts/perf/2026-05-11T02-10-59-661Z/konveyer-completion-audit/completion-audit.json` marks KONVEYER-0 through KONVEYER-9 branch-review complete, while `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json` accepts strict-WebGPU terrain ground tone only. The 2026-05-11 KONVEYER-10 pass adds strict WebGPU renderer matrix proof at `artifacts/perf/2026-05-11T18-17-20-942Z/konveyer-renderer-matrix/matrix.json`. Scene probes passed for Open Frontier + Zone Control at `artifacts/perf/2026-05-11T18-30-56-546Z/konveyer-scene-parity/scene-parity.json` and Team Deathmatch + combat120 + A Shau at `artifacts/perf/2026-05-11T18-31-39-756Z/konveyer-scene-parity/scene-parity.json`; the 2026-05-12 Open Frontier checkpoint at `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json` adds strict close-GLB/materialization, bounded spawn-residency reserve, and startup feature-compile proof. Multi-mode reserve verification at `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json` resolves strict WebGPU across Open Frontier (cap 8, 12 candidates, 4 `total-cap`), Zone Control (cap 9, 12 candidates, 3 `total-cap`), Team Deathmatch (cap 12, 16 candidates, 4 `total-cap`), `ai_sandbox`/combat120 (cap 12, 32 candidates, 18 `total-cap` + 2 `pool-empty`), and A Shau (0 live combatants at probe time) with zero console/page errors per mode. Phase F slice 1 (2026-05-12) generalized the close-model reserve from `spawnResidency*` naming to `hardNearReserve*` semantics (real-time cluster density, not a spawn-time snapshot) and bumped `hardNearReserveExtraCap` 4→6, lifting per-faction pool from 12 to 14. Post-slice multi-mode strict-WebGPU proof at `artifacts/perf/2026-05-12T02-24-10-594Z/konveyer-asset-crop-probe/asset-crop-probe.json` resolves Open Frontier (cap 10, 10 candidates, 0 fallbacks), Zone Control (cap 11, 11 candidates, 0 review-pose fallbacks), Team Deathmatch (cap 14, 15 candidates, 1 `total-cap` review), `ai_sandbox`/combat120 (cap 14, 25 candidates, 5 `total-cap` + 6 `pool-empty` review), and A Shau (0 candidates) with zero console/page errors per mode. Combat120 retains `pool-empty` because the US pool exhausts at 14 while NVA keeps 4 slack — faction-asymmetric pool sizing is the next slice (budget arbiter v1), not a steady-cap question. Follow-up close-model churn pre-release shipped 2026-05-12 (`CombatantRenderer.updateCloseModels` pre-releases active close models that fall outside the top-`effectiveActiveCap` prospective set). Post-fix multi-mode strict WebGPU proof: `artifacts/perf/2026-05-12T03-06-33-332Z/konveyer-asset-crop-probe/asset-crop-probe.json`. Combat120 review fallback profile is now `total-cap:22 + pool-empty:0` (was `total-cap:5 + pool-empty:6`); the larger total-cap is candidate-set growth (36 vs 25 candidates this run), not regression. All five modes still resolve strict WebGPU with zero console/page errors. A Shau directed-warp evidence shipped 2026-05-12 (probe-only, `scripts/konveyer-asset-crop-probe.ts` warps player to Hill 937 contested zone before close-NPC review). Five-mode proof at `artifacts/perf/2026-05-12T03-33-59-816Z/konveyer-asset-crop-probe/asset-crop-probe.json`: A Shau materialized 0→4 live combatants 5865ms after warp (WarSimulator strategic-spawn cadence) and review pose then captured 60 candidates in close radius with 14 rendered (cap=14, `total-cap:46`). Zero pool-empty / zero pool-loading across all five modes; every fallback is at the cap boundary (designed materialization tier).
Design posture: WebGL is the previous implementation attempt for the game vision, not a pixel-perfect target. KONVEYER-10 should prefer WebGPU-native scene decisions that better serve jungle density, combatant readability, flight-scale sky/weather, finite-map presentation, and long-term materialization-tier performance.
Closure posture: completing the initial migration/parity target should trigger a principles-first rearchitecture review against the vision, using the WebGPU/TSL branch as the new baseline rather than preserving WebGL-era compromises.
Asset posture: vegetation/NPC/cloud defects may be source-asset or bake-contract problems, not only shader problems. Pixel Forge regeneration, impostor rebakes, texture edits, LOD/source cleanup, and color-space corrections are valid outcomes when WebGPU exposes bad WebGL-era asset assumptions.
Water posture: before the principles-first rearchitecture review, run a hydrology/water pass that connects visible hydrology, water shader/material behavior, water/terrain intersections, interaction, buoyancy/swimming, and eventual watercraft into the scene-architecture decision loop.
Research posture: `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md` is the current spike memo for WebGPU/TSL, terrain/CDLOD, clouds, Pixel Forge asset acceptance, hydrology/water, and ECS/materialization direction. It treats ECSY as an outside reference clone only, not a dependency target.
Success criteria:
- Strict WebGPU remains the proof path; WebGL is named diagnostic comparison only.
- Vegetation and NPC impostors have strict-WebGPU parity evidence that separates raw atlas/crop, material lighting, fog contribution, and final output.
- `World` timing is decomposed into actionable sub-timings for atmosphere sky texture, atmosphere light/fog, weather, water, and zone/ticket work.
- Skyward high-triangle reports are captured with scene/pass attribution before CDLOD, shadow, or vegetation tuning.
- Sky/cloud behavior has a measured anchoring decision so flight no longer makes the sky or cloud field feel attached to the player; current implementation direction is camera-followed dome for clipping safety plus a world/altitude-projected cloud deck for weather stability.
- Cloud representation has a follow-up decision for straight-line cutoffs, hard bands, visible alignment seams, and low-resolution/blocky sky texture artifacts; do not treat the current dome-texture pass as final if it keeps producing obviously improper cloud geometry.
- Zone Control and other finite maps have a selected edge-presentation strategy: terrain apron, low-res far ring, edge fade, flight clamp, or documented equivalent.
- Strict-WebGPU Open Frontier, Zone Control, Team Deathmatch, combat120, and A Shau short captures are linked before any renewed default-on or production-rollout claim.

Current KONVEYER-10 findings:
- Skyward triangle attribution is terrain-dominated. K11 measured the pre-edge-change terrain submission spike; K12 source-backed visual extent now records Open Frontier at 1,336,320 terrain triangles, Zone Control at 399,360, actual Team Deathmatch at 307,200, combat120 at 215,040, and A Shau at 1,536,000, all still across 2 main + 1 shadow terrain submissions.
- Finite-map strategy has moved from a rejected standalone ring/skirt toward source-backed visual terrain extent separated from playable/gameplay extents. Open Frontier, Zone Control, actual Team Deathmatch, and combat120 look materially better from finite-edge views, but A Shau still exposes a flat DEM boundary and cloud/horizon cut lines remain unresolved. The bright-lime `tall-grass.webp` source tile was corrected to a dark humid olive palette; this is an asset-level fix, not closure for broader terrain lighting/material direction.
- Vegetation/NPC material probes now have an actionable asset audit at `artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`. It warns that NPC impostor atlases are very dark and lifted heavily by material uniforms, NPC normal maps are absent in the active probe, and vegetation impostors combine sparse alpha with a bright green tint bias. Treat this as Pixel Forge/source-vs-runtime decision evidence, not as visual acceptance.
- First final-frame crop proof is `artifacts/perf/2026-05-11T22-41-07-556Z/konveyer-asset-crop-probe/asset-crop-probe.json`. It resolves strict WebGPU, captures Open Frontier and A Shau vegetation/NPC crop attempts, and stays WARN: vegetation crops remain green/saturated, Open Frontier's NPC crop is background-dominant rather than a clean soldier crop, A Shau has no cropable NPC instance, and no visible close-GLB comparison is present. Follow-up close-model telemetry in `artifacts/perf/2026-05-11T23-18-06-820Z/konveyer-asset-crop-probe/asset-crop-probe.json` proves the bounded startup prewarm now runs before reveal and activates 8 Open Frontier close GLBs under strict WebGPU, with startup marks `npc-close-model-prewarm.*`. The public-profile proof at `artifacts/perf/2026-05-11T23-56-05-104Z/konveyer-asset-crop-probe/asset-crop-probe.json` confirms the probe now sources nearest rows from `window.npcMaterializationProfile()`; after the hard-near anti-pop priority, `pool-loading` clears to zero and nearest review rows are close GLBs with weapons. It also includes the first fern source-atlas palette edit toward darker humid olive; the final vegetation crop is visibly less mint, but the simple green-dominance metric still warns, so treat the remaining vegetation finding as probe/segmentation plus Pixel Forge asset-review work rather than shader-threshold tuning. The 2026-05-12 strict Open Frontier close-GLB materialization proof at `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json` records a bounded spawn-residency reserve: 11 visible nearby close GLBs, effective close cap 11, no close fallback records, all nearest startup/review rows as `close-glb` with weapons, public materialization profile telemetry, geometry-derived body bounds, and an isolated crop that shows the soldier/weapon under strict WebGPU. The follow-up multi-mode reserve packet at `artifacts/perf/2026-05-12T01-50-30-290Z/konveyer-asset-crop-probe/asset-crop-probe.json` covers Open Frontier, Zone Control, Team Deathmatch, `ai_sandbox`/combat120, and A Shau under strict WebGPU with zero console/page errors per mode. It confirms the +4 reserve activates only when actors are inside the 64m spawn-residency bubble (Zone Control +1, TDM +4, combat120 +4; Open Frontier 0 at the steady review pose; A Shau 0 because the strategic simulation does not place live combatants near the review pose). combat120 surfaces 32 candidates against the 12-slot cap with 18 `total-cap` plus 2 `pool-empty` fallbacks and an asymmetric faction pool (`US` target 12 exhausts while `NVA` keeps 4 available). Next architecture decision is Phase F materialization-tier policy: scale `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` / `spawnResidencyExtraCap` by mode density and faction balance, accept impostor LOD past the cap as a designed materialization tier, or move some of the close-radius work onto the impostor path with stronger crop/lighting evidence. Not a steady-state-cap tuning question and not a startup total-cap regression.
- Startup UI "Compiling features" is now attributed below the label. `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json` records Open Frontier terrain feature compile marks: feature list compile about 5.2ms for 1,363 stamps, 67 surface patches, 8 exclusion zones, and 36 flow paths; stamped-provider creation about 2.1ms; 1024-grid heightmap rebake about 48.5ms; total terrain-feature compile about 55.9ms. The first optimization candidate is prebaking or chunking the stamped heightmap rebake, not WebGPU shader compilation.
- Cloud anchor model improved to camera-followed dome plus world/altitude-projected cloud-deck sampling in `HosekWilkieSkyBackend`, replacing texture-UV cloud noise. Current strict WebGPU proof at `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json` records `cloud model=camera-followed-dome-world-altitude-clouds` across Open Frontier, Zone Control, actual Team Deathmatch, combat120, and A Shau with zero console/page errors. This is an anchoring slice, not final cloud/weather acceptance.
- Water/hydrology pass started as a VODA bridge, not a closure claim. `npm run check:hydrology-bakes` passes, `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json` records current source wiring as WARN, and `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json` proves hydrology river meshes, channel queries, and the new interaction sample in Open Frontier and A Shau. Screenshots still require visual acceptance.
- Strict WebGPU scene probes passed across the requested modes. The earlier `perf-capture` target-closed blocker at `artifacts/perf/2026-05-11T18-37-33-773Z/summary.json` is now separated from the attribution-overhead issue by K11 evidence; use the K11 summary-attribution command shape before treating strict runtime captures as blocked.

## KONVEYER-11 - Strict proof chain and terrain budget
Status: done. Owning subsystem: renderer / terrain / perf-harness / combat. Opened: cycle-2026-05-11-konveyer-k11-proof-terrain-budget.
Latest evidence: `artifacts/perf/2026-05-11T18-56-10-018Z/measurement-trust.json` passes measurement trust with strict WebGPU, render-submission summary attribution, and every-fourth-sample attribution cadence. `artifacts/perf/2026-05-11T18-52-12-160Z/measurement-trust.json` shows full every-sample attribution is too heavy and fails measurement trust. CDLOD node/ring strict proofs are `artifacts/perf/2026-05-11T19-27-26-995Z/konveyer-scene-parity/scene-parity.json` for Open Frontier + A Shau and `artifacts/perf/2026-05-11T19-29-34-958Z/konveyer-scene-parity/scene-parity.json` for Zone Control + combat120; later K12 probe repair found that the earlier `team_deathmatch` probe label was not starting runtime enum `tdm`, so use `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json` for actual Team Deathmatch terrain attribution. Player terrain-fire fallback test evidence is `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`; strict WebGPU browser proof is `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`. Cycle brief: `docs/tasks/cycle-2026-05-11-konveyer-k11-proof-terrain-budget.md`.
Success criteria:
- Strict WebGPU `perf-capture` attribution has a trusted command shape that preserves scene/category/pass ownership without full-dump sample overhead.
- Terrain/CDLOD runtime cost is attributed by main pass and shadow pass before terrain LOD, shadow, or culling policy changes.
- Active CDLOD node/ring evidence exists for ground, elevated, and skyward cameras.
- Fire-through-terrain reports are audited as a combat/terrain/nav/materialization contract risk, not as an isolated weapon tuning issue.

## KONVEYER-12 - Finite map edge strategy
Status: open. Owning subsystem: terrain / renderer / atmosphere / mode boundaries. Opened: cycle-2026-05-11-konveyer-edge-strategy.
Latest evidence: K10/K11 strict scene probes show the old render-only apron was measurable but not visually accepted. A cheap render-only horizon-ring prototype passed strict WebGPU numeric checks at `artifacts/perf/2026-05-11T19-44-30-183Z/konveyer-scene-parity/scene-parity.json`, but visual review rejected it as slab/wall presentation with hard cloud/terrain cut lines, so it is not active branch strategy. The active first slice is source-backed visual terrain extent, proved in strict WebGPU at `artifacts/perf/2026-05-11T20-21-57-694Z/konveyer-scene-parity/scene-parity.json`; that run also fixes the Team Deathmatch probe alias and confirms actual `tdm` config (`playable=400`, `visualMargin=1200`). After visual review flagged the bright-lime `tall-grass.webp` source tile, candidate palette artifacts were written to `artifacts/perf/2026-05-11T20-30-tall-grass-palette/`, the live tile was corrected, and force-built strict WebGPU proof passed at `artifacts/perf/2026-05-11T20-58-48-929Z/konveyer-scene-parity/scene-parity.json`. The current full-mode strict WebGPU proof after the cloud-deck anchoring and A Shau collar rejection is `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`. Open Frontier, Zone Control, actual Team Deathmatch, and combat120 no longer read as a cheap wall/slab from finite-edge screenshots. A Shau remains blocked because its DEM has no real outer source data and still reads as a flat edge. A later A Shau-only 1600m collar experiment with DEM edge-slope extrapolation and visual-edge tint proved strict WebGPU at `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`, but visual review rejected the tan/gold synthetic band; keep that as evidence against further probe tuning, not as active acceptance.
Success criteria:
- Pick one finite-edge model for small maps and A Shau: source-backed visual terrain extent, low-detail far ring, horizon skirt, terrain fade, flight/weapon boundary, or an explicit hybrid.
- Prove the model in strict WebGPU from ground, elevated, skyward, and finite-edge poses without hiding the edge behind fog alone.
- Preserve gameplay boundaries separately from visual terrain coverage.
- Record triangle/pass impact before changing terrain LOD ranges or shadow policy.

## VODA-1 — Visible water surface and query API
Status: open. Owning subsystem: environment / water. Opened: cycle-2026-05-04.
Latest evidence: query API and interaction-sample first slice covered by `src/systems/environment/WaterSystem.test.ts`; source audit `artifacts/perf/2026-05-11T21-33-05-844Z/projekt-143-water-system-audit/water-system-audit.json`; runtime proof `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`; older visual/exposure evidence remains `artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`.
Success criteria:
- `WaterSystem` renders a visible water surface across Open Frontier and A Shau, lit by `AtmosphereSystem`, with no clipping artifacts at terrain intersections.
- Hydrology channels drive water-surface placement.
- Public query API present: `isUnderwater(pos)`, `getWaterDepth(pos)`, `getWaterSurfaceY(pos)`, and `sampleWaterInteraction(pos)` for future physics/gameplay consumers.
- `evidence:atmosphere` regenerates with water visible and zero browser errors.
- Open Frontier `terrain_water_exposure_review` overexposure flags resolved.

## VODA-2 — Flow, buoyancy, swimming
Status: open. Owning subsystem: environment / water. Opened: cycle-2026-05-04. Blocked on VODA-1.
Latest evidence: `WaterSystem.sampleWaterInteraction` exists as the shared query/immersion/buoyancy-scalar contract and is proved in `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`; no physics or player-state consumer has adopted it yet.
Success criteria:
- Rivers from hydrology channels carry visible flow.
- Buoyancy physics for floating bodies; player swimming with animation, stamina, breath, and surfacing.
- Wading and foot-splash visuals at the bank.

## VODA-3 — Watercraft and integration
Status: open. Owning subsystem: environment / water. Opened: cycle-2026-05-04. Blocked on VODA-2.
Success criteria:
- Sampan and PBR (river patrol boat) rigged with player enter/exit.
- River crossings, bridge interactions, and beach/bank docking work.

## VEKHIKL-1 — M151 jeep ground vehicle
Status: open. Owning subsystem: vehicle (ground). Opened: cycle-2026-05-04.
Latest evidence: GLB at `public/models/vehicles/ground/m151-jeep.glb`; M151 world-feature placements register as `ground` vehicles with seats in the 2026-05-10 release-stewardship pass (`GroundVehicle.test.ts`, `WorldFeatureSystem.test.ts`).
Success criteria:
- M151 spawnable in Open Frontier; player enters/exits via `VehicleSessionController`.
- Basic driving (forward, back, turn) over terrain.
- Collides with terrain and static obstacles.

## VEKHIKL-2 — Stationary M2 .50 cal emplacements
Status: open. Owning subsystem: vehicle / weapons. Opened: cycle-2026-05-04.
Success criteria: M2 .50 cal placeable in zone-control objectives; NPC manning and player mounting both work through the vehicle session pattern.

## AVIATSIYA-1 — Helicopter rotor visual parity
Status: done. Owning subsystem: helicopter. Opened: cycle-2026-04-23.
Latest evidence: `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`
Success criteria:
- Huey, UH-1C Gunship, and AH-1 Cobra rotor directionality and naming pass live in-production review.
- Future rotor regressions reopen DEFEKT-5.

## AVIATSIYA-2 — AC-47 low-pitch takeoff single-bounce
Status: open. Owning subsystem: vehicle (fixed-wing) / airframe. Opened: cycle-2026-04-21.
Success criteria:
- AC-47 takeoff at low pitch no longer single-bounces on the airfield.
- `Airframe` ground-rolling model has tests covering the regression.

## AVIATSIYA-3 — Helicopter parity audit
Status: done. Owning subsystem: helicopter. Opened: cycle-2026-04-22.
Latest evidence: `docs/rearch/helicopter-parity-audit.md`
Success criteria:
- Audit memo names the state-authority gaps between `HelicopterVehicleAdapter` and `HelicopterPlayerAdapter`, and proposes consolidation.

## AVIATSIYA-4 — Helicopter combat surfaces
Status: open. Owning subsystem: helicopter / weapons. Opened: cycle-2026-05-04.
Success criteria:
- Door-gunner controls and reload behavior on Huey.
- Chin minigun on UH-1C Gunship and AH-1 Cobra.
- Rocket-pod fire from stub-wing pylons (Gunship, Cobra).
- Recoil, tracer behavior, and ammo loadout match the period.

## AVIATSIYA-5 — Fixed-wing combat surfaces
Status: open. Owning subsystem: vehicle (fixed-wing) / weapons. Opened: cycle-2026-05-04.
Success criteria:
- A-1 Skyraider carries bombs, rockets, napalm canisters, 20mm cannon.
- F-4 Phantom carries Sidewinder missiles and bombs.
- AC-47 Spooky side-firing minigun pattern present and authentic.
- Target lead, weapon sway, and station-keeping during attack runs.

## AVIATSIYA-6 — Combat maneuvers
Status: open. Owning subsystem: vehicle / helicopter / AI. Opened: cycle-2026-05-04.
Success criteria:
- AC-47 left-circle pylon-turn gunship orbit complete.
- A-1 dive-bomb attack profile.
- F-4 strafing run; Cobra rocket run; Huey gunship rocket strafe.
- Maneuvers callable by NPC pilots and assist-flying players.

## AVIATSIYA-7 — AH-1 Cobra import and integration
Status: open. Owning subsystem: helicopter. Opened: cycle-2026-05-04.
Latest evidence: GLB at `pixel-forge/war-assets/vehicles/aircraft/ah1-cobra.glb`.
Success criteria:
- Cobra spawnable, flyable, and weapon-armed alongside Huey and UH-1C.

## SVYAZ-1 — Squad command stand-down
Status: done. Owning subsystem: combat / UI. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T18-59-28-353Z/projekt-143-svyaz-standdown-browser-proof/standdown-browser-proof.json`

## SVYAZ-2 — Squad pings: go, patrol, attack, fall back
Status: done. Owning subsystem: combat / UI. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T21-41-01-140Z/projekt-143-svyaz-ping-command-browser-proof/ping-command-browser-proof.json`

## SVYAZ-3 — Air-support call-in radio
Status: open. Owning subsystem: combat / UI / aviation. Opened: cycle-2026-05-04.
Latest evidence: radio UI shell, asset list, target-mode selector, and cooldown HUD first slice merged in `665b0c5`.
Success criteria:
- Radio menu reachable from squad UI or hotkey.
- Target marking by smoke, willie pete, or position-only.
- Asset selection across the aviation roster (A-1 napalm, A-1 rockets, F-4 bombs, AC-47 orbit, Cobra rocket run, Huey gunship strafe).
- Per-asset cooldown system.
- NPC-piloted aircraft fulfill the call-in.

## SVYAZ-4 — RTS-flavored command discipline
Status: open. Owning subsystem: combat / UI. Opened: cycle-2026-05-04.
Success criteria: squad and air-support commands compose so the simulation reads as a hybrid FPS/RTS while the player is embedded as an infantryman or pilot.

## UX-1 — Respawn screen redesign (PC + mobile)
Status: done. Owning subsystem: UI / player. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T20-35-21-453Z/projekt-143-ux-respawn-browser-proof/ux-respawn-browser-proof.json`

## UX-2 — Map spawn / respawn flow
Status: open. Owning subsystem: UI / player. Opened: cycle-2026-05-04.
Success criteria:
- Map view shows spawn options unambiguously.
- Tap-to-spawn and click-to-spawn both work.
- Zone, helipad, and tactical-insertion priority is visible.
- Mobile touch interactions are large enough to hit accurately.

## UX-3 — Loadout selection
Status: open. Owning subsystem: UI / player. Opened: cycle-2026-05-04.
Success criteria:
- Loadout categories clear (rifleman, RTO, machine gunner, etc.).
- Weapon and ammunition loads visible.
- Per-faction loadout availability respected.
- PC and mobile information parity.

## UX-4 — Deploy flow polish
Status: open. Owning subsystem: UI / player. Opened: cycle-2026-05-04.
Success criteria:
- Deploy from menu through first frame of gameplay is fast and clear.
- Orientation and immediate danger are readable in the first frame.

## STABILIZAT-1 — Refresh combat120 perf baseline
Status: open. Owning subsystem: perf-harness. Opened: cycle-2026-04-21.
Latest evidence: `artifacts/perf/2026-05-10T10-45-07-263Z` (`perf:compare`: 5 pass, 0 warn, 3 fail; avg 20.15ms FAIL, p99 47.10ms FAIL, max 100ms FAIL).
Success criteria:
- `npm run perf:capture:combat120` from a quiet machine produces avg ≤17ms, p99 ≤35ms, heap_recovery ≥0.5, heap_end_growth ≤+10MB.
- Refreshed baseline committed to `perf-baselines.json`.

## STABILIZAT-2 — Land vehicle-visuals + airfield + helicopter rotor fix
Status: done. Owning subsystem: cross-cutting. Opened: cycle-2026-05-04.
Latest evidence: master at `babae19a76e5ff622976a632e10f7055315d2698`.

## STABILIZAT-3 — Live release verification
Status: done. Owning subsystem: deploy. Opened: cycle-2026-05-04.
Latest evidence: `npm run check:live-release` PASS after the 2026-05-10 release-stewardship deploy; production SHA remains live `/asset-manifest.json` truth.

## DEFEKT-1 — Stale baseline audit
Status: open. Owning subsystem: perf-harness. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T22-04-54-994Z/projekt-143-stale-baseline-audit/stale-baseline-audit.json`
Success criteria:
- `perf-baselines.json` carries current entries for all tracked scenarios (combat120, openfrontier:short, ashau:short, frontier30m).
- Stale-baseline gate passes without WARN.

## DEFEKT-2 — Doc / code / artifact drift
Status: open. Owning subsystem: doc-harness. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-08T01-26-06.909Z/projekt-143-doc-drift/doc-drift.json`
Success criteria:
- `check:doc-drift` passes with zero future-date, missing-artifact, or missing-script findings.
- 14 consecutive days with no doc / code / live drift after a release.

## DEFEKT-3 — Combat AI p99 anchor
Status: open. Owning subsystem: combat. Opened: cycle-2026-04-17.
Latest evidence: TTL cache first slice and failed combat120 compare documented at `docs/rearch/cover-query-precompute.md`.
Success criteria:
- Synchronous cover search in `AIStateEngage.initiateSquadSuppression` no longer dominates p99.
- `combat120` p99 ≤35ms with measurement trust PASS.

## DEFEKT-4 — NPC navmesh route quality
Status: open. Owning subsystem: navigation. Opened: cycle-2026-04-17.
Latest evidence: `artifacts/perf/2026-05-07T22-42-23-479Z/projekt-143-defekt-route-quality-audit/route-quality-audit.json`
Success criteria:
- A Shau and Open Frontier active-driver route-quality captures pass measurement trust.
- Route/stuck telemetry within explicit closure bounds for max stuck seconds, route no-progress resets, waypoint replan failures, and terrain-stall warning rate.

## DEFEKT-5 — Visual fallback and directionality audit
Status: done. Owning subsystem: combat / helicopter / FX. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-08T01-23-26-506Z/projekt-143-visual-integrity-audit/visual-integrity-audit.json`

## DEFEKT-6 — Terrain occlusion and fire authority
Status: open. Owning subsystem: combat / terrain / navigation / materialization. Opened: cycle-2026-05-11.
Latest evidence: player report during KONVEYER follow-up that enemies can still be shot through terrain; K11 brief records this as an architecture risk in `docs/tasks/cycle-2026-05-11-konveyer-k11-proof-terrain-budget.md`. The 2026-05-11 follow-up note says this may indicate larger wiring, dependency, authority, and optimization issues rather than one bad weapon branch. First code slice found and patched a player-fire gap where close-range shots under 200m bypassed the CPU height-profile fallback when the terrain BVH missed. Targeted unit proof lives at `artifacts/perf/2026-05-11T19-05-00-000Z/konveyer-terrain-fire-authority/vitest-combatant-combat.json`; strict WebGPU browser proof lives at `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json` and records a real 181.7m Open Frontier line where BVH returned no hit but effective-height profile blocked before damage. Do not close this directive from that first slice.
Success criteria:
- Reproduce or disprove fire-through-terrain with browser evidence that records shooter, target, terrain height/effective height, weapon ray, LOS result, and hit outcome.
- Identify the authoritative terrain occlusion query for player fire, NPC fire, AI LOS, cover, and active-driver shot validation.
- Verify combat raycasts are not bypassing render terrain, effective collision terrain, hydrology/cover blockers, navmesh placement, or materialization state through stale caches or partial shortcuts.
- Record perf impact and cache ownership before changing LOS cadence, ray count, or terrain-query implementation.

## DIZAYN-1 — Vision charter
Status: done. Owning subsystem: design. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T17-49-40.255Z/projekt-143-dizayn-vision-charter-audit/vision-charter-audit.json` (charter at `docs/archive/dizayn/vision-charter.md`).

## DIZAYN-2 — Art-direction review gate
Status: done. Owning subsystem: design. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T17-55-41.245Z/projekt-143-dizayn-art-direction-gate-audit/art-direction-gate-audit.json` (gate at `docs/archive/dizayn/art-direction-gate.md`).

## DIZAYN-3 — Liberty of proposal
Status: open. Owning subsystem: design. Opened: cycle-2026-05-04.
Success criteria: visual / feel proposals from the design lane can land on any directive; engineering rejection requires a written rationale.
