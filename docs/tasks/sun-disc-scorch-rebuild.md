<!-- 80 LOC cap per framework recovery Pass 2 R1.2. -->
# sun-disc-scorch-rebuild

Wave L1 of the `lighting-truth-and-shadows` campaign (owner-approved, see
`docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md`). The visible sun disc
read as a flat lobe with a hard feather edge and — worse — shone straight through
terrain ridgelines because it sits at sky-dome radius where a depth test cannot
occlude it against distant silhouettes. This scorches `SunDiscMesh` internals and
rebuilds the body from first principles: physical limb darkening, an
elevation-keyed extinction/color consume from the existing backend sun, a tight
forward-scatter halo, and a cheap CPU terrain-horizon occlusion fade so the body
disappears believably behind hills. Players walking a dawn/noon/dusk sweep see a
radiative solar body that sets behind ridges instead of glowing through them.

## Files touched

- `src/systems/environment/atmosphere/SunDiscMesh.ts` (limb/halo/occlusion in TSL+GLSL+CPU)
- `src/systems/environment/atmosphere/SunDiscOptics.ts` (new — shared limb/halo constants + CPU mirrors)
- `src/systems/environment/atmosphere/SunDiscHorizonOcclusion.ts` (new — pure horizon-march math + terrain driver)
- `src/systems/environment/atmosphere/SunDiscConfig.ts` (new — `sunDiscV2` kill-switch, default-ON)
- `src/systems/environment/atmosphere/SunDiscUpdater.ts` (new — disc owner + occlusion drive; keeps AtmosphereSystem under budget)
- `src/systems/environment/AtmosphereSystem.ts` (`setTerrainRuntime`, drive occlusion)
- `src/core/GameplayRuntimeComposer.ts` (wire terrainSystem → atmosphere)
- `*.test.ts` for the above (new + amended)

## Scope

1. Limb darkening `I(r)=1-u(1-sqrt(1-r^2))` (u~0.6) replacing the plain smoothstep body, in all three paths.
2. Consume the backend's already elevation-reddened `getSun` color faithfully — no second extinction authority.
3. Tight additive forward-scatter halo just outside the body edge (dome keeps the wide glow).
4. CPU terrain-horizon march: sample `getHeightAt` along the camera→sun ray, fade opacity over a small angular band.
5. `sunDiscV2` config flag (default-ON, `window.__sunDisc.v2`); OFF restores the flat legacy body.

## Non-goals

- Sky dome / dome glow / horizon-scatter changes (dome owns those).
- LightingRig / AtmosphereSystem light-transport or elevation light-gating (sibling wave `sun-elevation-light-gating`).
- Post-stack / bloom changes. No terrain-code edits (read-only `getHeightAt`).

## Acceptance

- [x] Limb-darkened body, halo, elevation-keyed color, terrain-horizon fade; TSL+GLSL parity via shared optics constants.
- [x] `npm run typecheck && npm run lint && npm run lint:budget && npm run build` pass; focused `test:run` green.
- [x] No fence change; source budget green (AtmosphereSystem kept ≤700 via `SunDiscUpdater` extraction).
- [ ] PR opened against `master` with link to this brief.

## Findings

- Verified `HosekWilkieSkyBackend.getSun` IS elevation-reddened (warm amber at dawn via `computeTransmittance`, peak-normalized). The disc consumes it directly; no second extinction path invented.
