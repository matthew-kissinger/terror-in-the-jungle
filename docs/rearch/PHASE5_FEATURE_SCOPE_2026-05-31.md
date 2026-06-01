# Phase 5 Feature Scope — Aviation + UX

Last verified: 2026-05-31
Branch: `task/phase5-features` (off master tip `ca449044`)
Authoring posture: optimal-decision — implement only bounded, gate-verifiable, low-feel-risk seams; defer design-heavy / high-feel-risk work with a concrete plan.

> WARNING for future readers: `docs/DIRECTIVES.md` marks several of the items below
> "open" when the code is in fact built. This memo is the verified-against-code
> source of truth as of the date above. Re-confirm against current code before
> acting on either document.

---

## 1. Confirmed ALREADY BUILT (verified against current code)

### Aviation (AVIATSIYA-4/5/6/7)

The aviation directives are far more complete than `docs/DIRECTIVES.md` implies. Verified in code this pass:

- **AVIATSIYA-7 — AH-1 Cobra (effectively done).** GLB at `public/models/vehicles/aircraft/ah1-cobra.glb`; registered in `modelPaths.ts` (AH1_COBRA) and the `HelicopterGeometry.ts` model registry; physics + weapons in `AircraftConfigs.ts` (M134 minigun + 14-round rocket pod, ~L91-112); placed on helipads in both `OpenFrontierConfig.ts` (helipad_east) and `AShauValleyConfig.ts` (helipad_eagle). Flies on `HelicopterPhysics`; weapons player-firable through the shared `HelicopterWeaponSystem` path.
- **AVIATSIYA-4 — Helicopter combat surfaces built + wired.**
  - Pilot weapons: `src/systems/helicopter/HelicopterWeaponSystem.ts` implements both hitscan and projectile fire paths, ammo, rearm-on-helipad, tracers, muzzle flash (Cobra M134 chin minigun + rocket pod). Player fires via `PlayerCombatController.beginFire -> helicopterModel.startFiring` (`PlayerCombatController.ts:18-21`) and cycles weapons via `PlayerController.onHelicopterWeaponSwitch -> switchHelicopterWeapon` (`PlayerController.ts:280-284`).
  - NPC door-gunner AI: `src/systems/helicopter/HelicopterDoorGunner.ts` auto-acquires nearest enemy within 200m, faction-filtered via `isAlly()`, fires the crew M60 with tracers/impacts. Instantiated + ticked for the piloted helicopter in `HelicopterModel.ts` (~L90,292,612) with `Faction.US`.
  - IFF: owning `Faction` threaded through all helicopter fire (`HelicopterWeaponSystem.fireHitscan -> combatantSystem.handlePlayerShot`, ~L285). A crew-served door-gun fire path exists, gated on `setCrewManned` + airborne (~L114-117,163-172).
- **AVIATSIYA-5 — Fixed-wing nose cannon for ALL THREE aircraft + live-LMB seam CLOSED.**
  - `src/systems/vehicle/FixedWingModel.ts` `FIXED_WING_FORWARD_GUN` + `updateForwardGun()` (~L833-895): hitscan along the -Z airframe axis, 600 rds, 18 rps, cone spread, tracers, ammo drawdown, gated to airborne so a parked plane cannot strafe the apron. Every aircraft gets the weapon at `createAircraftAtSpot` (~L572-578) with `Faction.US`.
  - The previously-flagged "not yet reachable from a live mouse click" seam (`docs/playtests/aircraft-armament.md`) is CLOSED: `PlayerCombatController.beginFire/endFire` branch on `playerState.isInFixedWing` and call `fixedWingModel.startFiring/stopFiring` (`PlayerCombatController.ts:23-26,56-59`); `fixedWingModel` injected via `combatController.configure` (`PlayerController.ts:923,975`). Behavior-tested in `PlayerCombatController.test.ts:38-70` and `FixedWingPlayerAdapter.ts` (startFiring/stopFiring + onExit trigger-release).
  - AC-47 station-keep (orbit-hold) exists for the player: `FixedWingPlayerAdapter.toggleOrbitHold` + `buildOrbitAnchorFromHeading`, `gunship_orbit` playerFlow in `FixedWingConfigs.ts`.
- **AVIATSIYA-6 — NPC fixed-wing maneuver state machine built (positioning).** `src/systems/vehicle/npcPilot/states.ts`: ATTACK_SETUP / ATTACK_RUN / BREAKAWAY / REATTACK_DECISION / ORBIT / RTB / APPROACH / LANDING, PD controllers in `pdControllers.ts`. Air-support sorties drive these via `NPCFlightController` (orbit / attack_run / flyover missions). NOTE: positioning only — no weapon trigger during runs (see deferred item D).

### UX (UX-1/2/3/4)

- **UX-1 (respawn screen redesign PC + mobile)** — DONE (browser proof 2026-05-07, `docs/DIRECTIVES.md` line 54). `DeployScreen` replaced the old RespawnUI.
- **UX-2 (map spawn/respawn flow + mobile touch targets)** — fully built. `src/ui/map/OpenFrontierRespawnMap.ts` handles click-to-select (click-vs-pan via DRAG_THRESHOLD), touch tap-to-select, drag-pan, pinch-zoom (all listeners `{ passive: false }`); selection round-trips through `RespawnMapController -> PlayerRespawnManager.selectSpawnPointOnMap`. Tappable spawn list in `DeploySpawnList.ts` with `pointerdown` + aria. Touch targets sized in `DeployScreen.module.css` (.spawnOption 48-52px, .actionButton/.secondaryButton 44px on coarse short-viewport) with safe-area insets and 5+ responsive breakpoints.
- **UX-3 (loadout selection)** — largely built. `src/ui/loadout/LoadoutTypes.ts` defines weapon categories + equipment with per-faction (US/ARVN/NVA/VC) pools and 3 preset templates; `src/systems/player/LoadoutService.ts` handles cycling, faction-aware pools, 3 savable presets, localStorage persistence (`titj.player-loadout.v2` + v1 migration), and `applyToRuntime()`. PC/mobile parity via PREV/NEXT cycle buttons; faction availability enforced + clamped. Tested in `LoadoutService.test.ts`.
- **UX-4 (deploy flow polish)** — foundation built. `src/systems/world/runtime/DeployFlowSession.ts` produces per-mode/per-kind copy + `allowSpawnSelection`/`allowLoadoutEditing` flags; `DeployScreen` renders a deployment checklist, decision-time metric (`recordDecisionTime`, exposed via `data-decision-elapsed-ms`), respawn-kind opaque background, perf-harness auto-confirm fast path. Mission briefing precedes A Shau initial deploy.
- **UX-4 "CREW A VEHICLE" deploy UI + deploy-map vehicle markers** — built UI-only in cycle tank-deploy-loadout-ux (commit `3245ee15`): `DeployScreen.updateVehicleDeployOptions`/`setVehicleDeployOptionCallback`, per-mode catalogue `getVehicleDeployOptionsForMode` (`LoadoutTypes.ts:393`), `OpenFrontierRespawnMap.setVehicleMarkers` + renderer `drawVehicleMarker`, tank controls hint in `VehicleActionBar`. All unit-tested in isolation — but NOT wired into the live deploy flow (that wiring is the one bounded gap implemented this phase; see below).

---

## 2. Bounded gaps IMPLEMENTED this phase

### UX — Wire the already-built "CREW A VEHICLE" deploy section + deploy-map markers into the live deploy flow

- **Classification:** bounded-implementable. **Feel-risk:** low.
- **Problem:** The tank-deploy-loadout-ux cycle (commit `3245ee15`) shipped the panel + markers + per-mode catalogue UI-only. `PlayerRespawnManager` never called `updateVehicleDeployOptions`, never set the vehicle-deploy callback, and never fed vehicle markers to the map controller. So in the running game the panel stayed `display:none` and no vehicle markers ever appeared — a complete, tested feature invisible to players.
- **What changed (files: `src/systems/player/PlayerRespawnManager.ts`, `src/systems/player/RespawnMapController.ts`):**
  1. New private `PlayerRespawnManager.updateVehicleDeployOptions()` reads `getVehicleDeployOptionsForMode(currentMode ?? ZONE_CONTROL)`, pushes the list to `respawnUI.updateVehicleDeployOptions()`, and pushes matching markers to the deploy map. Called in `showDeployUI()` right after the spawn-options block, so both initial deploy and respawn surface the M48 panel for Open Frontier / A Shau and hide it (empty list) elsewhere.
  2. New private `buildVehicleMarkers()` maps each `VehicleDeployOption -> VehicleMarker { worldPos: new THREE.Vector3(x,0,z), category: 'ground', faction, vehicleType: option.id }`.
  3. New `RespawnMapController.setVehicleMarkers()` delegates to the already-present `OpenFrontierRespawnMap.setVehicleMarkers()`.
  4. Registered `respawnUI.setVehicleDeployOptionCallback(...) -> new private selectVehicleDeployOption()`, which is **INFORMATIONAL ONLY**: it logs the vehicle name / rounded position / controls-hint and does NOT set `selectedSpawnPoint` or reposition the player. Stored `availableVehicleOptions` as a private field for the callback lookup.
- **Why informational-only (not deploy-into-vehicle):** "deploy directly into the vehicle" teleport/crew semantics are undefined and design-heavy. The bounded slice treats the vehicle option as a focusable/informational map marker so the M48's location + controls hint are discoverable, without inventing crew-on-spawn behavior. The marker source is the static per-mode catalogue (informational), which does not require a live-vehicle source to be safe.
- **No fenced-interface change.** `setVehicleMarkers`, `setVehicleDeployOptionCallback`, `updateVehicleDeployOptions` are plain class methods, not `src/types/SystemInterfaces.ts` exports.
- **Tests added (behavior, not implementation-mirror):**
  - `src/systems/player/PlayerRespawnManager.test.ts` — new `crewable-vehicle deploy options` describe (3 tests): Open Frontier surfaces exactly one `m48_tank_of_us_fob` option (classLabel `ARMOR`, faction US) plus a matching `'ground'` deploy-map marker whose `worldPos` is a `THREE.Vector3`; Team Deathmatch publishes `[]` (panel hidden, markers cleared); a vehicle-option selection routes through the informational handler WITHOUT setting `selectedSpawnPoint` or calling `playerController.setPosition`. Mock `DeployScreen`/`RespawnMapController` extended with the new methods.
  - `src/ui/screens/DeployScreenVehicleCatalogue.test.ts` (new, jsdom L1/L2) — drives a REAL `DeployScreen` fed by the REAL per-mode catalogue: `#respawn-vehicle-options-panel` visible with `[data-vehicle-id='m48_tank_of_us_fob']` for OPEN_FRONTIER, and `display:none` with zero choices for TEAM_DEATHMATCH. Complements the existing `DeployScreenVehicleOptions.test.ts` (which used hand-built options) by exercising the catalogue-fed seam.

**Gate result (this branch):** typecheck clean, lint clean, 370 files / 5254 tests pass (no type errors), build OK. Zero new failures vs master tip `ca449044`.

---

## 3. DEFERRED design-heavy / high-feel-risk gaps (each with a concrete plan)

### A. Player-manned Huey/UH-1C door gun (only NPC door-gunner AI fires it today)

- **Classification:** design-heavy-defer. **Feel-risk:** medium.
- **Location:** `src/systems/helicopter/HelicopterModel.ts` (no `setCrewManned` call in prod); `HelicopterWeaponSystem.ts:114-117,163-172` (crew-served path gated on `setCrewManned(heliId,true)`).
- **Why deferred:** `HelicopterModel` never calls `setCrewManned`, so the player-operated door gun is inert; the separate `HelicopterDoorGunner` AI serves the door gun for the piloted helicopter. Whether the player should swap into the gunner seat (vs. AI-served) is a seat-occupancy/UX decision. Blind-wiring `setCrewManned(true)` on enter would double-fire alongside the existing AI, and the feel is unvalidated.
- **Plan:** dedicated design + playtest cycle. Decide (a) when the gun is AI-served vs player-served (mutually exclusive — disable `HelicopterDoorGunner` for a manned seat), (b) the seat-swap input + camera for the gunner, (c) IFF/spread reuse from the existing crew path. `HelicopterVehicleAdapter` already models gunner seats (`weaponMountIndex`); route a manned-seat signal into `setCrewManned` only after the AI is suppressed for that seat. Gate on the human game-feel playtest checklist.

### B. Fixed-wing per-aircraft "period weapons" (rockets/bombs; no per-config weapon table)

- **Classification:** design-heavy-defer. **Feel-risk:** high.
- **Location:** `src/systems/vehicle/FixedWingModel.ts:59-68` (`FIXED_WING_FORWARD_GUN`); `src/systems/vehicle/FixedWingConfigs.ts` (no `weapons` field analogous to `AircraftConfig.weapons`).
- **Why deferred:** every fixed-wing mounts the identical hardcoded nose cannon (22 dmg, 18 rps hitscan). AVIATSIYA-5 asks A-1 / F-4 / AC-47 to each carry period weapons (AC-47 broadside gatling battery, A-1 rocket/bomb stations, F-4 distinct cannon). Adding loadouts + projectile/rocket integration + damage balance needs design and human playtest (rate, spread, lead, station geometry). Not bounded/gate-verifiable.
- **Plan:** dedicated cycle. Add a per-config `weapons: FixedWingWeaponMount[]` to `FixedWingConfig` mirroring `AircraftWeaponMount`; reuse the helicopter projectile path for rockets/bombs; define per-aircraft stat tables. Balance + feel gated on playtest.

### C. Player nose-cannon lead pipper + gun sway (AVIATSIYA-5 "lead/sway")

- **Classification:** design-heavy-defer. **Feel-risk:** high.
- **Location:** `FixedWingModel.ts:updateForwardGun` (fires straight down -Z with random cone spread); `src/ui/hud/FixedWingHUD.ts` / `CrosshairSystem.ts` (reticle exists, no lead pipper).
- **Why deferred:** station-keep (orbit-hold) exists, but there is no computed lead pipper (predicted-impact reticle from target velocity / time-of-flight) and no gun-sway model. These are gunnery-feel features that need iteration against live play (how much lead, how much sway, mobile vs PC). Not a bounded seam.
- **Plan:** if pursued, scope as a HUD lead-reticle + optional aim-sway in a design cycle, tuned against playtest. Keep the firing math (already on the -Z axis) and add a predicted-impact marker driven by target relative velocity + projectile/hitscan time-of-flight.

### D. Named maneuver routes (pylon-turn / dive / strafe / rocket run) + NPC-fires-during-attack-run (AVIATSIYA-6)

- **Classification:** design-heavy-defer. **Feel-risk:** high.
- **Location:** `src/systems/vehicle/npcPilot/states.ts` (ATTACK_RUN positions only); `src/systems/airsupport/NPCFlightController.ts:96-117` (positions airframe, never fires); `src/systems/airsupport/SpookyMission.ts`.
- **Why deferred:** the NPC pilot has generic ATTACK_SETUP/RUN/BREAKAWAY/ORBIT states but NO discrete named maneuver routines, NO weapon trigger during ATTACK_RUN, and NO player-assist maneuver invocation. The Cobra rocket run / AC-47 pylon-turn-with-fire are aspirational. This is novel gameplay needing design + heavy playtest.
- **Ownership note:** the NPC-fires-during-attack-run piece overlaps SVYAZ-3 / air-support ownership (`SpookyMission`). Coordinate scope before implementing — do not duplicate gunship-fire wiring across the maneuver library and the air-support subsystem.
- **Plan:** dedicated cycle. Define a named-maneuver library (pylon-turn / dive / strafe / rocket-run / flyover), add weapon firing during runs (single owner with the air-support subsystem), and a player-assist invocation surface. Heavy playtest gate.

### E. Loadout "ammo loads" selection axis (UX-3 lists "ammo loads")

- **Classification:** design-heavy-defer. **Feel-risk:** high.
- **Location:** `src/ui/loadout/LoadoutTypes.ts` (`PlayerLoadout` = primaryWeapon/secondaryWeapon/equipment only); `src/systems/player/InventoryManager.ts` (hardcoded grenades=3/sandbags=5/mortarRounds=3); `src/systems/weapons/AmmoManager.ts` (owns per-weapon ammo independently of the loadout).
- **Why deferred:** the loadout model is purely categorical with no per-weapon magazine/reserve or ammo-type choice and no UI for it. An ammo-load axis is a new gameplay/balance dimension (weight/movement tradeoff? reserve totals? per-faction availability? PC/mobile cycle UI) that needs design intent + playtest. Not a final-seam wiring task.
- **Plan:** short design memo + playtest gate first, deciding (a) what an "ammo load" chooses (reserve mag count vs ammo type ball/AP/tracer vs weight/mobility tradeoff), (b) per-faction availability, (c) how it surfaces as a 4th cycle row identical on PC + mobile, (d) reconciliation with `AmmoManager` per-weapon ownership + `InventoryManager` hardcoded counts. Lowest-risk first slice (if wanted) is a read-only "standard combat load" summary line — but even that must be confirmed against intended scope since the directive says "ammo loads" (plural, selectable).

### F. Compact deploy-screen legend/checklist on phones (minor UX-4 clarity gap)

- **Classification:** design-heavy-defer. **Feel-risk:** medium.
- **Location:** `src/ui/screens/DeployScreen.module.css` (`.sequencePanel { display:none }` and `.legend { display:none }` under `@media (pointer: coarse) and (max-width:960px)`, ~L506-513).
- **Why deferred:** the Deployment Checklist + Map Legend are intentionally hidden on coarse-pointer phones to save space, but that removes the step guidance + zone-color key (HQ blue / controlled green / contested amber / enemy red) exactly where a first-time mobile player needs the "immediate danger readable" clarity UX-4 calls for. Whether to surface a condensed legend/checklist on phones (vs. intentionally hiding it) is a layout/feel call made in tank-deploy/UX-1 work; changing it shifts the mobile deploy feel.
- **Plan:** confirm intent + playtest. If pursued, scope to `DeployScreen.module.css` only (a compact one-line color key or collapsible checklist on coarse pointers) + a jsdom assertion that the compact legend element exists; do NOT alter the map renderer.

---

## 4. Recommended doc follow-ups (not done here; flagged)

- Update `docs/DIRECTIVES.md` to reflect that AVIATSIYA-4/5/7 are code-complete pending the deferred owner playtest, and that the UX-4 "CREW A VEHICLE" surface is now wired live (this phase). Scope AVIATSIYA-5 "period weapons" + AVIATSIYA-6 maneuvers + UX-3 "ammo loads" as their own design cycles rather than autonomous implementation.

---

## 5. Playtest items (feel-adjacent, need a human walk)

- **Deploy screen "CREW A VEHICLE" panel now appears live** in Open Frontier + A Shau deploy/respawn, with an M48 marker on the deploy map. Walk: confirm the panel reads cleanly on PC + mobile, the marker sits at the real motor-pool / valley-road anchor, and selecting the option is purely informational (focuses/logs the vehicle; does NOT teleport or crew the player). Confirm Team Deathmatch / Zone Control show no panel and no vehicle marker. (Low feel-risk, but it is a new visible deploy-screen surface, so it warrants a quick look.)
