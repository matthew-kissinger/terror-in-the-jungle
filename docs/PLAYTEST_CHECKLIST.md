# Playtest Checklist

Last updated: 2026-04-24

Agents can run tests and probes. They cannot feel the game. Any PR that touches flight, driving, combat rhythm, or UI responsiveness must be validated against this checklist by a human pressing keys and watching the screen. Tests green + build green != feel green.

Check each item. Unchecked items are failures. Add notes for anything that borders on "fine but off."

## Fixed-wing (per aircraft: A-1 Skyraider, AC-47 Spooky, F-4 Phantom)

- [ ] Spawns parked on runway, oriented correctly, no ground clipping
- [ ] Parking stand, taxiway, and runway start share a usable height; no hilly taxi path blocks runway lineup
- [ ] Full throttle (W) accelerates smoothly, no hitching
- [ ] Rotation: pull up (Arrow Up) near Vr and aircraft lifts off within ~10 s of full throttle (prop) / ~9 s (jet)
- [ ] Takeoff roll and liftoff do not clip through rising terrain or runway shoulders
- [ ] Pitch response feels proportional to stick, not mushy, not snappy
- [ ] Pitch response does not feel stiff or step-like at high speed
- [ ] Banks cleanly left/right (Arrow Left/Right) without over-rolling
- [ ] Releasing bank with auto-level on returns aircraft to roughly level within 3 s
- [ ] Holds altitude hands-off at cruise with ~70% throttle and auto-level on, without repeated bounce/porpoise after reaching the target band
- [ ] Camera and horizon remain visually stable at speed; no persistent screen shake from simulation/render stepping
- [ ] Recovers from gentle dive (nose down + release) without stalling
- [ ] Stall warning and recovery feel reasonable, not abrupt
- [ ] Landing: approach, flare, touchdown without excessive bounce
- [ ] Grounded exit places player beside aircraft without clipping into the model
- [ ] In-flight emergency bailout does not teleport directly to terrain; follow-up state is understandable
- [ ] Releasing W/throttle before or during exit does not leave infantry locked in forward walk
- [ ] AC-47 orbit hold (if playable): turns steadily around anchor, no radius drift

## Helicopter (per aircraft: UH-1, AH-1, UH-1C)

- [ ] Enter/exit does not leave stale vehicle state, stale HUD, or stuck infantry movement
- [ ] Rotor visuals spool up/down believably; parked or exited helicopter does not keep flight-RPM blades forever
- [ ] Rotor blur/high-RPM presentation reads fast enough during flight
- [ ] Lift off smoothly with collective up, no jitter
- [ ] Hovers stably with collective centered (minor drift OK, no snap)
- [ ] Cyclic forward/back/left/right response feels linear
- [ ] Yaw pedals turn nose without coupling into unwanted roll
- [ ] Door gunner (where applicable) tracks targets cleanly
- [ ] Squad deploy prompt shows/hides at expected hover heights, no flicker
- [ ] Landing settles onto pad without bounce or tip

## Squad combat

- [ ] Nearby NPCs read close to player scale in ground FPS view; they no longer look like oversized billboards
- [ ] NPC feet appear grounded on flat terrain; visual body does not hover after the billboard scale change
- [ ] NPC movement reads like infantry pace: no repeated 9-10m/s bursts, no skating across slopes, and no visible hover during close/medium-range terrain corrections
- [ ] NPC head/torso/tracer height lines up with the visible sprite; no persistent above-head firing
- [ ] AI engages within 2 s of first sight
- [ ] Fire rate, burst cadence, and weapon sounds match the weapon
- [ ] Hit indicators fire on every hit; no silent hits
- [ ] No visible frame stutter during firefights (30+ combatants)
- [ ] Cover usage looks intentional, not spinning or stuck
- [ ] Nearby friendly and enemy soldiers stay visually grounded on steep hillsides; no phasing into terrain or floating while moving uphill/downhill

## Modes and flow

- [ ] Open Frontier -> Zone Control -> TDM mode switches without reload hang
- [ ] Respawn -> vehicle pickup -> vehicle exit -> respawn loop works in each mode
- [ ] Mobile: touch joystick, flight mode toggle, and vehicle action bar all responsive
- [ ] Minimap updates in sync with world (no lagging icons)

## General perceptual checks

- [ ] Build source is recorded: local dev, local preview, or live production
- [ ] If this playtest informs a release, live production has been checked after deploy; local preview evidence alone is not treated as live-site truth
- [ ] Desktop ground-FPS mouse look works in a normal browser through pointer lock
- [ ] Embedded/in-app browser playtest either obtains pointer lock or exposes a usable drag-look/fallback path
- [ ] Frame pacing feels smooth (no ~300 ms spikes every few seconds)
- [ ] No audio pops, clipped effects, or missing cues
- [ ] No visible flicker on HUD, vehicle indicators, or reticle
- [ ] Fog/cloud density does not hide nearby terrain, airfield surface problems, or aircraft readability
- [ ] Clouds read as a broad sky layer in every mode, with no hard horizon divider; Open Frontier/combat120 haze is acceptable only if it still reads as cloud/weather
- [ ] Terrain/camera collision prevents below-ground clipping; if clipping happens, record location/mode separately from water quality
- [ ] Water looks acceptable when viewed normally; seeing a bad full-water view after clipping is recorded as clipping exposure plus a separate water-rendering note
- [ ] A Shau clearly loads real terrain/DEM data before judging airfield, fog, or cloud readability; do not sign off A Shau from fallback/flat terrain
- [ ] A Shau route/NPC movement is judged separately from representative nav connectivity; walk/observe actual movement before signing it off
- [ ] Airfield buildings, aircraft, and props do not pop in/out distractingly
- [ ] Looking across an airfield does not produce an obvious frame-time cliff

## Notes from this playtest

<!-- Paste anything that felt off but wasn't technically a failure. Even a sentence helps the next pass. -->
