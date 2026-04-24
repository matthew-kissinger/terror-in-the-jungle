# Playtest Session - 2026-04-23 Architecture Recovery Cycle

Fill this in at the end of the cycle while playing the actual game. Short,
specific notes are more useful than polished prose. Anything marked as a
failure should include mode, aircraft/weapon/context, and what you pressed.

## Session Metadata

- **Branch / commit played:** ______________________________
- **Build source:** [ ] local dev `npm run dev`  [ ] local preview  [ ] production Pages
- **Browser:** [ ] Chrome  [ ] Edge  [ ] Firefox  [ ] Codex in-app  [ ] other: __________
- **Machine / display / refresh rate:** ________________________________________________
- **Start time:** ____:____
- **End time:** ____:____
- **Total duration:** ______ min
- **Modes covered:** [ ] Open Frontier  [ ] A Shau  [ ] combat120  [ ] Zone Control  [ ] TDM
- **Input devices used:** [ ] keyboard/mouse  [ ] touch/mobile  [ ] gamepad
- **Evidence folder / links:** _________________________________________________________

## Rating Scale

Use this scale for every rated section.

- **0 - broken:** cannot complete the intended flow.
- **1 - bad:** flow completes but feels obviously wrong or unreliable.
- **2 - acceptable:** usable, with clear issues to improve.
- **3 - good:** feels shippable for now.
- **4 - excellent:** noticeably strong, no immediate concern.

## Evidence Capture

- [ ] Capture at least one screenshot for each failed visual or UI item.
- [ ] Toggle F2 perf overlay before any performance screenshot.
- [ ] Toggle F3 log overlay if an on-screen symptom coincides with warnings.
- [ ] Note exact aircraft, mode, and location for every vehicle issue.
- [ ] For stuck input, note whether the key was still physically held when exit occurred.
- [ ] For pointer lock, note browser and whether lock failed, worked, or fallback was usable.

## 1. Cycle 1 Vehicle Session Recovery

### Fixed-Wing Enter / Exit

Run once per aircraft: A-1 Skyraider, F-4 Phantom, AC-47 Spooky.

| Aircraft | Enter prompt appears | Enter succeeds | HUD/camera correct | Ground exit beside aircraft | No stale HUD | No stuck movement | Rating 0-4 |
|---|---|---|---|---|---|---|---|
| A-1 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| F-4 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| AC-47 | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

### In-Flight Emergency Bailout

Run once per aircraft after takeoff and climb.

| Aircraft | Exit key works while airborne | Does not snap to terrain | Follow-up state understandable | No W/throttle leak into infantry | Rating 0-4 |
|---|---|---|---|---|---|
| A-1 | [ ] | [ ] | [ ] | [ ] | __ |
| F-4 | [ ] | [ ] | [ ] | [ ] | __ |
| AC-47 | [ ] | [ ] | [ ] | [ ] | __ |

If anything fails, describe exactly what happened after pressing E:

________________________________________________________________________________________
________________________________________________________________________________________

### Helicopter Enter / Exit

Run once per helicopter type you can reach.

| Helicopter | Enter succeeds | Exit succeeds | HUD/camera restored | No stale vehicle state | No stuck movement | Rating 0-4 |
|---|---|---|---|---|---|---|
| UH-1 transport | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| AH-1 attack | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| UH-1C gunship | [ ] | [ ] | [ ] | [ ] | [ ] | __ |

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

### Vehicle Switching / Cleanup

- [ ] Enter fixed-wing, exit, enter helicopter, exit.
- [ ] Enter helicopter, exit, enter fixed-wing, exit.
- [ ] Die or respawn after using a vehicle.
- [ ] Open map/command/settings overlay after vehicle exit.
- [ ] Touch/mobile vehicle action bar can enter and exit.

Observed problems:

________________________________________________________________________________________
________________________________________________________________________________________

## 2. Pointer Lock And Ground FPS Controls

### Normal Browser

- [ ] Click captures pointer lock.
- [ ] Mouse look is smooth on foot.
- [ ] Shooting starts/stops correctly.
- [ ] Esc/settings/menu does not leave mouse or movement stuck.
- [ ] Returning to game restores expected mouse look.

Rating 0-4: __

Notes:

________________________________________________________________________________________

### Codex In-App / Embedded Browser

- [ ] Pointer lock works, or
- [ ] Pointer lock fails but fallback look works well enough for playtest.
- [ ] Mouse look does not require repeated clicks after every movement.
- [ ] Shooting does not fire while interacting with menus.
- [ ] Loss of focus clears movement keys.

Rating 0-4: __

Notes:

________________________________________________________________________________________

## 3. Fixed-Wing Feel And Airfield Usability

Run from airfield start where possible.

| Item | A-1 | F-4 | AC-47 | Notes |
|---|---|---|---|---|
| Parked height matches surface | [ ] | [ ] | [ ] | |
| Taxi path is usable, not hilly/blocked | [ ] | [ ] | [ ] | |
| Runway lineup starts on sane height | [ ] | [ ] | [ ] | |
| Full throttle acceleration feels smooth | [ ] | [ ] | [ ] | |
| Rotation speed feels reachable | [ ] | [ ] | [ ] | |
| Pitch response is proportional | [ ] | [ ] | [ ] | |
| Roll/bank response is proportional | [ ] | [ ] | [ ] | |
| Auto-level recovers without fighting you | [ ] | [ ] | [ ] | |
| Cruise does not porpoise/bounce | [ ] | [ ] | [ ] | |
| Camera/horizon stable at speed | [ ] | [ ] | [ ] | |
| Landing/touchdown not excessively bouncy | [ ] | [ ] | [ ] | |

Aircraft feel rating:

- A-1: __ / 4
- F-4: __ / 4
- AC-47: __ / 4

Airfield usability rating: __ / 4

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

## 4. Helicopter Feel And Rotor Presentation

| Item | UH-1 | AH-1 | UH-1C | Notes |
|---|---|---|---|---|
| Rotor stopped/slow while parked reads correctly | [ ] | [ ] | [ ] | |
| Rotor spools up believably on takeoff | [ ] | [ ] | [ ] | |
| Flight RPM reads fast enough | [ ] | [ ] | [ ] | |
| Rotor spools down or idles correctly after exit | [ ] | [ ] | [ ] | |
| Lift-off is smooth | [ ] | [ ] | [ ] | |
| Hover is stable | [ ] | [ ] | [ ] | |
| Cyclic response is linear | [ ] | [ ] | [ ] | |
| Yaw feels controllable | [ ] | [ ] | [ ] | |
| Landing does not bounce/tip | [ ] | [ ] | [ ] | |

Overall helicopter rating: __ / 4

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

## 5. Atmosphere, Fog, Clouds, And Readability

Check from ground and from aircraft.

The current implementation has cloud presets for every listed mode. Visible
clouds now come from the sky-dome pass; the old flat `CloudLayer` plane is kept
hidden because it produced the hard horizon divider / one-tile feel. Mark cloud
issues if the sky still reads as blank haze, if the horizon has a flat divider,
or if weather looks present in one mode but missing in another. Current evidence
artifact:
`artifacts/architecture-recovery/cycle9-atmosphere/2026-04-24T05-24-42-281Z/`.

For A Shau specifically, first confirm the terrain/DEM is real. The 2026-04-24
capture now has DEM-backed terrain, screenshots, `0` browser errors, and water
disabled without underwater state. The old TileCache fallback path has been
removed; route/NPC movement is not signed off until the explicit static-tiled
nav path passes gameplay movement checks. The artifact nav gate now confirms
representative-base snap/connectivity/path success; do not use that alone to
sign off actual route or NPC movement.

Before this playtest is used for a push/deploy decision, rerun all-mode evidence
after the final code change. A Shau must be fixed, but Open Frontier, TDM, Zone
Control, and combat120 must also still enter live mode without browser errors.

| Mode | Real terrain/DEM loaded? | Ground fog too dense? | Aircraft fog too dense? | Clouds visible? | Horizon divider / blank haze? | Terrain readable? | Aircraft readable? | Rating 0-4 |
|---|---|---|---|---|---|---|---|---|
| Open Frontier | n/a | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| A Shau | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| combat120 | n/a | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| Zone Control | n/a | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |
| TDM | n/a | [ ] | [ ] | [ ] | [ ] | [ ] | [ ] | __ |

Weather override if tested: Clear [ ] Light rain [ ] Heavy rain [ ] Storm [ ]

Terrain clipping and water rendering are separate observations:

- [ ] No terrain/camera clipping observed.
- [ ] Terrain/camera clipping observed; mode/location: ________________________
- [ ] Water looked bad only after clipping exposed the global water plane.
- [ ] Water looked bad during normal above-ground play; mode/location: ________
- [ ] A Shau water stayed disabled with no underwater fog/overlay.
- Evidence artifact checked `clipDiagnostics.waterExposedByTerrainClip`: [ ] yes [ ] no

Notes on what looks wrong:

________________________________________________________________________________________
________________________________________________________________________________________

## 6. Airfield, Buildings, Props, And Performance

- [ ] Airfield buildings are visible at expected distances.
- [ ] Buildings do not pop in/out distractingly while approaching on foot.
- [ ] Buildings do not pop in/out distractingly while approaching in aircraft.
- [ ] Aircraft do not disappear too aggressively near the airfield.
- [ ] Aircraft do not remain rendered at clearly wasteful distances.
- [ ] Frame rate remains acceptable while looking across parked aircraft/buildings.
- [ ] No obvious collision snag on buildings/aircraft while taxiing or walking.
- [ ] No runway/taxiway cliff or trench blocks aircraft movement.
- [ ] Taxi route from stand to runway is flat enough to use.
- [ ] Runway start/line-up height matches the visible runway surface.
- [ ] Other parked aircraft/buildings do not create obvious collision or LOS cost spikes.

Rating 0-4: __

F2 overlay numbers during worst airfield view:

- FPS: ______
- p95/p99 if visible: __________________
- Draw calls / triangles if visible: __________________
- Visible pop-in/out object(s): __________________
- Worst view direction/location: __________________

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

## 7. Squad Combat And Terrain Contact

- [ ] Nearby friendlies stay grounded on hillsides.
- [ ] Nearby enemies stay grounded on hillsides.
- [ ] No visible phasing into mountains at close range.
- [ ] Combat starts within a believable time after sight.
- [ ] Suppression and hit feedback are readable.
- [ ] Frame pacing remains acceptable around 30+ combatants.
- [ ] Cover/flanking looks intentional rather than random or stuck.

Rating 0-4: __

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

## 8. UI / HUD / Mobile

- [ ] Weapon bar state is correct after vehicle exit.
- [ ] Vehicle action bar appears/disappears correctly.
- [ ] Minimap icons stay in sync with player/vehicle position.
- [ ] Objectives panel remains readable.
- [ ] HUD does not overlap aircraft instruments.
- [ ] Mobile touch joystick works on foot.
- [ ] Mobile/touch vehicle controls are reachable.
- [ ] Settings/map/command overlays do not leave stuck input.

Rating 0-4: __

Notes:

________________________________________________________________________________________
________________________________________________________________________________________

## 9. Assets Flagged For Replacement Or Rework

Only list assets you actually saw in play. Include whether the problem is model
quality, animation, LOD/pop, collision, texture/material, scale, or performance.

| Asset / object | Where seen | Problem type | Severity 1-5 | Replace, rework, or keep? | Notes |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

## 10. Bugs With Repro Steps

Use one block per issue.

### Bug 1

- **Mode/location:**
- **Vehicle/weapon/state:**
- **Steps to reproduce:**
- **Expected:**
- **Actual:**
- **Frequency:** [ ] once  [ ] sometimes  [ ] often  [ ] always
- **Severity:** [ ] cosmetic  [ ] annoying  [ ] blocks flow  [ ] crash/data loss
- **Evidence link/screenshot:**

### Bug 2

- **Mode/location:**
- **Vehicle/weapon/state:**
- **Steps to reproduce:**
- **Expected:**
- **Actual:**
- **Frequency:** [ ] once  [ ] sometimes  [ ] often  [ ] always
- **Severity:** [ ] cosmetic  [ ] annoying  [ ] blocks flow  [ ] crash/data loss
- **Evidence link/screenshot:**

### Bug 3

- **Mode/location:**
- **Vehicle/weapon/state:**
- **Steps to reproduce:**
- **Expected:**
- **Actual:**
- **Frequency:** [ ] once  [ ] sometimes  [ ] often  [ ] always
- **Severity:** [ ] cosmetic  [ ] annoying  [ ] blocks flow  [ ] crash/data loss
- **Evidence link/screenshot:**

## 11. End-Of-Session Triage

Top 5 fixes for the next cycle:

1. ___________________________________________________________________________________
2. ___________________________________________________________________________________
3. ___________________________________________________________________________________
4. ___________________________________________________________________________________
5. ___________________________________________________________________________________

Things that are now good enough and should not be churned:

1. ___________________________________________________________________________________
2. ___________________________________________________________________________________
3. ___________________________________________________________________________________

Overall cycle rating: __ / 4

Would you merge this branch after targeted fixes only? [ ] yes  [ ] no  [ ] unsure

Why:

________________________________________________________________________________________
________________________________________________________________________________________
