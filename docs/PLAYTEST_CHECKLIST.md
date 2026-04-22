# Playtest Checklist

Last updated: 2026-04-22

Agents can run tests and probes. They cannot feel the game. Any PR that touches flight, driving, combat rhythm, or UI responsiveness must be validated against this checklist by a human pressing keys and watching the screen. Tests green + build green != feel green.

Check each item. Unchecked items are failures. Add notes for anything that borders on "fine but off."

## Fixed-wing (per aircraft: A-1 Skyraider, AC-47 Spooky, F-4 Phantom)

- [ ] Spawns parked on runway, oriented correctly, no ground clipping
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
- [ ] AC-47 orbit hold (if playable): turns steadily around anchor, no radius drift

## Helicopter (per aircraft: UH-1, AH-1, UH-1C)

- [ ] Lift off smoothly with collective up, no jitter
- [ ] Hovers stably with collective centered (minor drift OK, no snap)
- [ ] Cyclic forward/back/left/right response feels linear
- [ ] Yaw pedals turn nose without coupling into unwanted roll
- [ ] Door gunner (where applicable) tracks targets cleanly
- [ ] Squad deploy prompt shows/hides at expected hover heights, no flicker
- [ ] Landing settles onto pad without bounce or tip

## Squad combat

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

- [ ] Frame pacing feels smooth (no ~300 ms spikes every few seconds)
- [ ] No audio pops, clipped effects, or missing cues
- [ ] No visible flicker on HUD, vehicle indicators, or reticle

## Notes from this playtest

<!-- Paste anything that felt off but wasn't technically a failure. Even a sentence helps the next pass. -->
