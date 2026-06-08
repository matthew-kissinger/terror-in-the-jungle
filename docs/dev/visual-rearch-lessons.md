# Visual Rearch Lessons

This is the agent-facing playbook for atmosphere, sun, terrain-lighting, water,
fog, shadow, and renderer-parity work. It captures the signal from SOL-1 and
the water foundation reset so future cycles start from the right authority
boundaries instead of retuning isolated materials.

## Start From Authority

- Treat visual defects as cross-system ownership problems until proven
  otherwise. Inspect the chain from time-of-day and atmosphere snapshots through
  renderer lights, sky, terrain, vegetation, water, fog, shadows, and fallback
  materials before editing constants.
- Keep one effective lighting state. If a system consumes sun direction,
  low-sun bounds, night fill, ambient color, shadow direction, or exposure, it
  must be clear whether that value comes from `AtmosphereLightingSnapshot`,
  renderer state, or a bounded local override.
- Separate the visible sun body from atmospheric solar mass. `SunDiscMesh` owns
  the depth-tested hot body. The sky dome owns bounded glow, horizon scatter,
  and LUT-facing atmosphere. Do not make the sky glow carry the whole visual sun.

## Water Contract

- Gameplay water is authored level/depth water bodies. Those bodies own carved
  beds, spawn/query samples, render meshes, and accepted player-facing water.
- Hydrology is drainage, terrain-material, and diagnostic input. Do not revive
  hydrology as a narrow ribbon surface unless a new brief explicitly changes
  the water authority model.
- The legacy global plane is an opt-in fallback only. It must not silently
  become the default Open Frontier or A Shau gameplay water surface.
- A credible water fix needs both placement proof and visual proof: broad/deep
  enough bodies, non-surface-only readability, sane night material response, and
  `water_body` sampler precedence over hydrology.

## Probe Before Tuning

- Reproduce the exact symptom first. Whole-frame averages can miss local white,
  red, or cyan flashes; use local hotspot metrics around the reported area when
  the complaint is spatially narrow.
- Capture the owner-relevant scenario and the regression matrix before claiming
  a fix. A Shau-only evidence is not enough if the change touches shared sky,
  terrain, water, renderer, or material paths.
- Instrument visibility, occlusion, and fallback separately. A sun-size fix that
  only passes WebGPU can still fail the explicit WebGL2 path or production
  fallback.

## Evidence Matrix

For visual rearch or visual bugfixes, use the smallest matrix that covers the
changed authority chain:

- Scenarios: A Shau, Open Frontier, TDM, Zone Control, and combat120 when shared
  rendering or time-of-day state changed.
- Times: noon or midday, golden/dusk, twilight, and midnight/night when sunlight,
  night fill, water, exposure, or sky response changed.
- Renderers: default WebGPU and explicit WebGL2/fallback when shader, material,
  sky, terrain, water, or post-process behavior changed.
- Perspectives: ground, elevated/sky, and aircraft/vehicle views when terrain
  visibility, shadowing, or sky scale changed.
- Release: local preview proves the candidate. Production is only proven after
  `npm run deploy:prod` and `npm run check:live-release` verify the live Pages,
  R2, service-worker, WASM/build-asset, and browser-flow surfaces.

## Closeout Standard

- Record what automated evidence proves and what remains subjective. Sun scale,
  fire-body quality, terrain believability, water depth, and overall night mood
  still require owner visual acceptance even when metrics pass.
- Update `docs/state/CURRENT.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`,
  and `docs/CARRY_OVERS.md` only from verified repo truth. Archive old claims
  instead of letting stale hydrology or sky assumptions remain in current docs.
