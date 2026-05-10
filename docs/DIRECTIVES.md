# Directives

Last verified: 2026-05-10

Active directive list. Each entry has binary `open` / `done` status, owning
subsystem, opening cycle, latest evidence link, and plain-English success
criteria. Closed items stay as evidence trail. Carry-over discipline:
[docs/CARRY_OVERS.md](CARRY_OVERS.md). Historical ledger prose:
[docs/archive/PROJEKT_OBJEKT_143/](archive/PROJEKT_OBJEKT_143/).

## VODA-1 — Visible water surface and query API
Status: open. Owning subsystem: environment / water. Opened: cycle-2026-05-04.
Latest evidence: query API first slice covered by `src/systems/environment/WaterSystem.test.ts`; visual/exposure evidence remains `artifacts/perf/2026-05-08T01-15-33-373Z/projekt-143-voda-exposure-source-audit/summary.json`.
Success criteria:
- `WaterSystem` renders a visible water surface across Open Frontier and A Shau, lit by `AtmosphereSystem`, with no clipping artifacts at terrain intersections.
- Hydrology channels drive water-surface placement.
- Public query API present: `isUnderwater(pos)`, `getWaterDepth(pos)`, `getWaterSurfaceY(pos)`.
- `evidence:atmosphere` regenerates with water visible and zero browser errors.
- Open Frontier `terrain_water_exposure_review` overexposure flags resolved.

## VODA-2 — Flow, buoyancy, swimming
Status: open. Owning subsystem: environment / water. Opened: cycle-2026-05-04. Blocked on VODA-1.
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
Latest evidence: previous release proof `artifacts/perf/2026-05-10T06-55-51-733Z/projekt-143-live-release-proof/release-proof.json`; production SHA remains live `/asset-manifest.json` truth.

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

## DIZAYN-1 — Vision charter
Status: done. Owning subsystem: design. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T17-49-40.255Z/projekt-143-dizayn-vision-charter-audit/vision-charter-audit.json` (charter at `docs/archive/dizayn/vision-charter.md`).

## DIZAYN-2 — Art-direction review gate
Status: done. Owning subsystem: design. Opened: cycle-2026-05-04.
Latest evidence: `artifacts/perf/2026-05-07T17-55-41.245Z/projekt-143-dizayn-art-direction-gate-audit/art-direction-gate-audit.json` (gate at `docs/archive/dizayn/art-direction-gate.md`).

## DIZAYN-3 — Liberty of proposal
Status: open. Owning subsystem: design. Opened: cycle-2026-05-04.
Success criteria: visual / feel proposals from the design lane can land on any directive; engineering rejection requires a written rationale.
