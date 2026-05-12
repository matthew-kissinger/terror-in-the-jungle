# Cycle: KONVEYER-13 Sky And Cloud Anchoring

Last verified: 2026-05-11

## Objective

Pick the first defensible sky/cloud anchoring model for the WebGPU/TSL branch.
The goal is not to make the current dome texture final. The goal is to stop
clouds from reading as a player-attached or texture-seamed artifact while
keeping strict WebGPU proof and avoiding the retired finite `CloudLayer` plane.

## Decision

Keep the sky dome camera-followed for clipping safety, especially in aircraft
and elevated views. Sample cloud features through a world/altitude-projected
cloud deck instead of sky texture `u/v` coordinates:

- sky color and sun/fog authority remain analytic sky responsibilities;
- the visual dome still follows the active camera;
- cloud features are sampled from camera X/Z plus an authored cloud-deck
  altitude, capped horizon trace, wind offset, and scenario coverage;
- no finite flat cloud mesh is reintroduced.

This aligns better with the vision than WebGL-style or plane-based parity:
weather should feel like a battlefield-scale atmosphere layer, not a nearby
sprite sheet or skybox decal.

## Implementation Slice

- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` now uses
  `camera-followed-dome-world-altitude-clouds`.
- Cloud mask sampling projects the sky direction to a 1,800m deck and caps
  far-horizon traces at 14km.
- The cloud mask no longer depends on texture `u/v`, reducing the old
  equirectangular seam/cutoff failure mode.
- `getCloudAnchorDebug()` exposes deck altitude, trace cap, horizon fade, and
  feature scale for probes.
- `sampleCloudMaskForDebug()` supports behavior tests without changing fenced
  interfaces.
- `scripts/capture-atmosphere-recovery-shots.ts` now records the active cloud
  anchor model instead of treating the retired `CloudLayer` as required.

## Evidence

- Targeted atmosphere tests:
  `npx vitest run src/systems/environment/atmosphere/HosekWilkieSkyBackend.test.ts src/systems/environment/AtmosphereSystem.test.ts`
  passed with 67 tests.
- TypeScript proof: `npm run typecheck` passed.
- Strict WebGPU all-mode proof:
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.

That strict proof covers Open Frontier, Zone Control, actual Team Deathmatch,
combat120, and A Shau with:

- `resolvedBackend=webgpu`, `initStatus=ready`;
- zero console errors and zero page errors in every mode;
- material probes still present for vegetation and NPC impostors;
- skyward render category/pass attribution still present;
- `cloud model=camera-followed-dome-world-altitude-clouds` in every mode.

## Non-Claims

- This is not final cloud/weather art direction.
- This does not solve A Shau's finite DEM/data boundary.
- This does not add volumetric clouds, cloud shadows, occlusion, rain shafts,
  weather fronts, or fly-through cloud bodies.
- This does not prove the current sky texture resolution is good enough; the
  remaining screenshots still need visual review for blocky puffs and hard
  cloud/horizon bands.
- This does not update perf baselines or accept WebGL fallback proof.

## Remaining Work

1. Review latest skyward and finite-edge screenshots by eye, especially A Shau
   and Zone Control, before tuning any numbers.
2. Decide whether the dome texture resolution and bake cadence can support the
   desired cloud scale without damaging the `World.Atmosphere.SkyTexture`
   budget.
3. Choose whether next cloud work should be procedural slices/volume,
   regenerated/authored Pixel Forge cloud assets, or a hybrid weather texture
   stack.
4. Add cloud shadow/occlusion and weather layering only after the visual model
   is accepted.
