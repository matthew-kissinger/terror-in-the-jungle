# E6 — Unified fixed-wing airframe prototype

Throwaway prototype for the E6 R&D spike. Not wired into the game.

## Files

- `airframe.ts` — `Airframe` class, types, Skyraider config.
- `scenario.ts` — headless scenarios + microbench.

## Run

```
npx tsx spike/E6-airframe/scenario.ts
```

Expected output: three scenarios and a microbench, ~12 ms total.

## What to look at

- `Airframe.step(intent, terrain, dt)` is the single sim entrypoint.
- `buildCommand(intent, state, cfg)` is the ONE translation from player
  intent to control-surface command. Replaces
  `FixedWingControlLaw.buildFixedWingPilotCommand` + its hidden modes.
- `AirframeTerrainProbe.sweep(from, to)` is the swept-collision primitive.
  Production port plugs into `ITerrainRuntime.raycastTerrain`.
- `SKYRAIDER_AIRFRAME` — one config object per aircraft, replaces the
  split across `FixedWingPhysicsConfig` + `PILOT_TUNING` + parts of
  `FixedWingOperationInfo`.

## Out of scope

- Helicopters, ground vehicles.
- Production integration (HUD, camera, animation, NPC pilot).
- Real terrain raycast — spike uses a small analytic height function.
- Pitch/roll rate D-term tracking — stubbed to 0 in the spike; P term
  alone converges to wings-level in the recovery scenario.

See `docs/rearch/E6-vehicle-physics-design.md` for the full architecture
proposal and `docs/rearch/E6-vehicle-physics-evaluation.md` for the
decision memo.
