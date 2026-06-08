<!-- 80 LOC cap. Source audit: 2026-06-07 owner feedback + repo trace. -->
# solar-atmosphere-lighting-rearch

Re-evaluate and re-architect the solar/atmosphere/lighting chain after owner
feedback rejected the prior sun scale and terrain lighting. The fix must keep
sun scale, night color, terrain/water highlights, shadow direction, and
hill/ridge light-bleed coherent in all shipping modes.

## Current State

The active master candidate is the SOL-1 authority. `AtmosphereSystem`
publishes `AtmosphereLightingSnapshot`; renderer lights, water, billboard
vegetation, and terrain night fill consume that effective lighting state. The
TSL dome and CPU LUT share a cool sub-horizon sky floor. Water is night-aware.
Shadows preserve A Shau camera altitude. Terrain has a bounded low-sun
heightmap/relief approximation for ridge-light cases.
Authored level/depth water bodies use a cool opaque night material for true
night instead of trying to express depth/alpha through the lit daytime bridge.

The visible sun path now follows the SDS WebGPU lesson: `SunDiscMesh` owns the
depth-tested hot body, while the TSL sky dome owns bounded atmosphere plus a
tight warm solar mass around that body. This removes the duplicate grey
dome-sun path, avoids the rejected damp sphere, and gives terrain a chance to
occlude the hard body.

## Evidence

- Full local matrix proof passes the latest post-owner retune: `33/33` captures
  succeeded in
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/summary.json`.
- The Open Frontier golden parity crops show a broader warm-white center with
  mottled internal heat, a warmer irregular rim, and tighter SDS-style sky
  solar mass instead of the rejected tiny pearl / smooth damp sphere.
  Representative values: daylight WebGPU `sunCore=0.105-0.113%`,
  `sunSpan=5.19-5.46%`; explicit WebGL2 Open Frontier
  `sunCore=0.085-0.086%`, `sunSpan=4.44%`; WebGPU/WebGL2 max channel delta
  `0.39%`.
- The Open Frontier golden missing-body frame was not terrain occlusion; it was
  stale camera-relative `SunDiscMesh` positioning after the capture camera
  moved. `syncDomePosition()` now refreshes the sun body, and the capture gate
  records `sunVisibility` / terrain ray occlusion so missing-unoccluded bodies
  fail explicitly.
- A Shau dusk ridge proof now uses a true terrain-occluded sun-body pose.
  Strict WebGPU and production fallback both record
  `sunVisibility=terrain-occluded`, `sunOcclusion=55m`, `sunCore=0`,
  `sunSpan=0`, ridge warmth PASS, sun-scale PASS, and `0.00%` parity delta.
- Full matrix night diagnostics pass red/white/cyan bounds across all five
  scenarios.
- A Shau midnight proves the level/depth water-body night material: rendered
  night-terrain `localMax(red=0.0% white=0.0% cyan=0.0% bright=0.0%)`.
- Live production proof is `npm run check:live-release`: CI, deploy, live
  manifest SHA parity, Pages/R2/SW headers, and live browser smoke all PASS for
  the current deployed `master` SHA.

## Non-goals

- No volumetric atmosphere/cloud rework unless owner review rejects the
  bounded TSL path.
- No fenced-interface change without `[interface-change]` approval.
- No hiding terrain-light bleed behind fog alone.
- No "closed" status from unit tests alone.

## Acceptance

- [x] Full visual matrix rerun proves the SDS-style sun body / occlusion
      contract and no red/white/cyan night terrain across all modes.
- [x] A Shau strict-WebGPU ridge proof rerun passes the new terrain-occluded
      sun-body / terrain-warmth contract and production fallback coverage.
- [x] Focused unit tests cover sun body/glare bounds and sub-horizon light
      behavior.
- [x] Master CI, deploy, and live-release proof are required for production
      releases.
- [ ] Owner visual review accepts sun scale, terrain/water lighting, and the
      ridge light-bleed approximation.
- [x] Perf impact is covered by the 2026-06-08 master CI perf job until
      STABILIZAT-1 baseline refresh.
- [x] `npm run lint && npm run test:run && npm run build` all pass after the
      final SDS-style retune.
- [x] Live release proof is the per-deploy production parity gate.
- [x] `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
      `docs/DIRECTIVES.md` agree on the candidate authority.
