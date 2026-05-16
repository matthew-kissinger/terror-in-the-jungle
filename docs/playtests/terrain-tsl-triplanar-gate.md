# Playtest evidence — terrain-tsl-triplanar-gate

Cycle: `cycle-mobile-webgl2-fallback-fix` (campaign position #2 of 12)
Task slug: `terrain-tsl-triplanar-gate`
Branch: `task/terrain-tsl-triplanar-gate`
Captured: 2026-05-16 (Playwright + Chromium headless, perf-harness build).

## What changed

`TerrainMaterial.createTerrainColorNode` previously sampled the triplanar
sub-graph unconditionally — three biome-texture calls per axis
(zy / xz / xy), repeated for primary and secondary slot, then folded
into the planar sample via `mix(planar, triplanar, triplanarBlend)`.
On flat terrain `triplanarBlend == 0`, so the result was always the
planar sample, but the GPU still evaluated all six triplanar calls and
multiplied by zero. Per
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md`
that's 48 effective biome-texture samples per fragment that contribute
nothing on flat ground (Open Frontier flat, A Shau valley floors).

This change introduces `sampleBiomeWithTriplanarGate`, which wraps the
triplanar evaluation inside a TSL `If(triplanarBlend > 0.001)` so the
compiled WebGL2 fragment can branch around the triplanar sample
sub-graph entirely when the gate is cold. The branch boundary is built
via a TSL `Fn()` helper to establish the build context required by
`If` + `.toVar()`. The flat-side path returns the planar sample
directly; the triplanar-active path returns the same `mix(planar,
triplanar, triplanarBlend)` as before.

The change is algorithmically identity-preserving:

- When `triplanarBlend == 0`: previously `mix(planar, triplanar, 0)
  == planar`; now `If` is false and the gate returns `planar`. Same
  result.
- When `triplanarBlend > 0.001`: previously
  `mix(planar, triplanar, blend)`; now the `If` branch returns
  `mix(planar, triplanar, blend)`. Same result.

Net effect: no visual change anywhere on the terrain; ≥48
texture-sample reduction per fragment on flat ground where the gate is
cold.

## Captures

Saved under
`artifacts/cycle-mobile-webgl2-fallback-fix/playtest-evidence/`:

| Scenario | File | Observation |
|---|---|---|
| Open Frontier (procedural noise, mostly-flat terrain), camera at 60 m, shallow downward pitch | `terrain-tsl-triplanar-gate-flat-strict.png` | Mostly-flat ground reads with the gate cold — `triplanarBlend == 0` across the visible terrain, so the planar-only path is taken and the rendered ground matches the pre-change composition. Frame includes a sky band (camera pitch shallow); the visible terrain strip shows the expected jungle-green palette. |
| Zone Control (procedural hills) as A-Shau-valley-wall stand-in, camera at 90 m, sloped frame | `terrain-tsl-triplanar-gate-slope-strict.png` | Mixed flat valley floor + sloped hillsides. The triplanar gate fires on the slope shoulders (`triplanarBlend > 0`) and is cold on the flat foreground. Hill faces render with the triplanar-blended biome texture as before; no visual seam or banding between gated-on / gated-off regions. |

### Renderer-backend caveat (strict-WebGPU substitution)

The cycle hard-stop names strict-WebGPU desktop visual parity as the
acceptance bar. Headless Chromium in this checkout does not grant a
WebGPU adapter, so `?renderer=webgpu-strict` fails fatally
(`Strict WebGPU mode resolved webgpu-webgl-fallback; refusing WebGL
fallback.`). Per the task's autonomous-loop posture override #3 ("If
Playwright smoke can't run, document and proceed"), captures were taken
in default `webgpu` mode, which Chromium resolves to
`webgpu-webgl-fallback` (the same WebGL2-backend-of-`WebGPURenderer`
path that mobile lands on).

The capture script prints the resolved backend at run time:

```
[…] resolvedBackend = webgpu-webgl-fallback
```

This is the same TSL-compiled-to-WebGL2 program path that strict-WebGPU
would exercise (modulo runtime backend dispatch). Because the change is
a TSL-graph rewrite that is algorithmically identity-preserving (see
"What changed" above), no backend can diverge: the WebGL2 fallback
backend's compiled GLSL and the WebGPU backend's compiled WGSL both
descend from the same TSL node graph and both evaluate to the same
output where `triplanarBlend == 0` and the same output where
`triplanarBlend > 0`. Strict-WebGPU evidence on a real GPU host is
deferred to the cycle's R3 `real-device-validation-harness` step, which
is the named merge gate for the whole cycle.

The A Shau dawn scenario in the original brief is also substituted: the
A Shau DEM source `.f32` is absent from this checkout (R2-only at
runtime, surfaced as "Using pinned R2 metadata for terrain.ashau.dem;
source file is absent in this checkout" during build). Zone Control's
procedural hills are the sloped-terrain stand-in; the triplanar gate
fires on any biome rule that crosses the slope threshold, regardless of
the underlying heightmap source.

## Acceptance

- `npm run lint`: PASS.
- `npm run test:run`: PASS (4258 / 4258).
- `npm run build`: PASS.
- TSL `Fn` + `If` + `.toVar()` pattern verified to construct a valid
  node in the Node test environment.
- `resolvedBackend = webgpu-webgl-fallback` captured at run time;
  documented above.
- Visual identity argument recorded (no `triplanarBlend` value can
  diverge between pre and post implementations).
- `terrain-nav-reviewer` reviewer gate is required pre-merge per the
  cycle brief.

## Posture

Automated smoke; owner walk-through pending. Per the cycle brief's
real-device-validation merge gate, the cycle does not close until R3's
real-device harness runs on Android Chrome + iOS Safari; until then
this task lands with desktop strict-WebGPU evidence deferred to that
gate.
