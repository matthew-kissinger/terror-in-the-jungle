# Gunplay Core

Deterministic gunplay math and shot command helpers.

## Provenance

Generalized from TIJ `GunplayCore`, `ShotCommand`, and shot command builder
patterns. The package removes Three.js, camera classes, HUD, inventory, audio,
combat damage application, and weapon model presentation.

## API

- `createGunplayCore(spec, { clock, rng })`
- `computeDamage(spec, distance, isHeadshot)`
- `createShotCommand(core, input)`

## Non-Goals

- No scene raycasting.
- No weapon inventory.
- No UI or feel claims for TIJ weapons.

