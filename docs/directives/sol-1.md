# SOL-1 - Solar, atmosphere, and terrain lighting rearch

Status: open (owner acceptance pending)
Owning subsystem: renderer / atmosphere / terrain / water / shadows
Opened: 2026-06-07 owner visual rejection

## Latest Evidence

Owner feedback rejected the prior visual read: the sun looked too large,
terrain and water highlights were implausible, night terrain could read red or
white, lighting angles looked wrong, and light appeared to bleed through hills.
The source audit found a cross-system problem, not a single material bug:
sky, renderer lights, terrain, water, billboard vegetation, fog, and shadow
recentering all consumed different pieces of atmosphere state.

The active worktree now adds an explicit `AtmosphereLightingSnapshot` for
effective direct light, sky fill, ground bounce, ambient fill, fog color, and
daylight factor. Renderer lights, water, billboard vegetation, and terrain
night-fill consume the same snapshot. The TSL dome and CPU LUT share a cool
sub-horizon sky floor. Water attenuates specular/emissive/foam/sparkle response
at night. A Shau shadow recentering preserves follow-target altitude, and
terrain has a bounded low-sun heightmap/relief response for the accepted
short-range ridge approximation.

Visible sun scale is being reworked against the Sheep Dog Simulator WebGPU
reference contract:

- `SunDiscMesh` is ON by default and owns the only visible hot body. It is
  additive, tone-map bypassed, depth-tested, and records `disc-body-only`
  ownership.
- `HosekWilkieTslNode` is now sky-only for the hard body. It keeps bounded
  atmospheric glow / horizon scatter and no longer paints a second HDR disc or
  aureole body in the dome.
- The sprite body was retuned from the rejected tiny white pearl into a
  visible hot-body object: broader white-hot center, warmer irregular rim, and
  no broad grey sphere. Representative focused crops are
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/crop-parity-openfrontier-golden-webgpu.png`
  and `crop-parity-openfrontier-golden-webgl.png`.
- Full local matrix proof now passes the sun-scale detector across all five
  scenarios and time-of-day captures. Representative Open Frontier golden
  proof records WebGPU `sunCore=0.053%`, `sunSpan=3.52%`; explicit WebGL2
  records `sunCore=0.035%`, `sunSpan=2.78%`. WebGPU/WebGL2 color parity stays
  under cap with max channel delta `0.78%`.
- Open Frontier golden previously looked like a terrain-occluded body, but the
  new terrain ray probe showed it was `missing-unoccluded`; the root cause was
  stale camera-relative `SunDiscMesh` positioning after capture camera moves.
  `syncDomePosition()` now refreshes the sun body.
- A Shau dusk ridge proof passes strict WebGPU and explicit WebGL2 terrain
  warmth, sun-scale, and parity diagnostics. Representative proof records
  WebGPU-strict `sunCore=0.053%`, `sunSpan=3.52%`; WebGL2 `sunCore=0.036%`,
  `sunSpan=2.87%`; parity max channel delta `0.39%`.
- Night terrain diagnostics pass red/white/cyan bounds across all five
  scenarios. The older strict night-red sampler remains intentionally
  over-tight and logs strict failures, while the active red-not-dominant
  terrain diagnostic passes 5/5.
- Live production proof is a per-deploy gate: after this source candidate is
  pushed and deployed, rerun `npm run check:live-release` and use the live
  `/asset-manifest.json` `gitSha` as production truth.

These are automated diagnostics, not owner visual acceptance. SOL-1 stays open
until a human visual review accepts the current candidate.

## Recommended Next Goal

**SOL-1R7 - owner visual acceptance.**

Use the current renderer state as the candidate authority. The next pass should
not redesign the sky again unless owner review rejects it. It should:

- run owner visual review on the SDS-style sun body, noon/golden glare,
  night terrain/water, WebGPU/WebGL2 parity crops, and the A Shau ridge
  light-bleed approximation;
- compare any owner-rejected frame against the current automated matrix before
  redesigning atmosphere, terrain, water, or shadows again;
- update this directive to `closed` only after owner acceptance.

## Success Criteria

- Sun rendering separates physical body from sky glow. The body is readable as
  a hot object, not a huge near object, tiny pearl, or smooth damp sphere.
- True night terrain is not red-dominant, white-hot, or cyan-blown in all
  modes, including combat120.
- Sun direction, directional light, water specular, terrain shading, billboard
  lighting, fog, and hemisphere fill agree from the same explicit lighting
  snapshot.
- Hill/ridge light bleed is either accepted as the current short-range
  heightmap approximation with documented limits, or replaced by a stronger
  occlusion model.
- True WebGPU and explicit WebGL2 parity are proven from the same poses locally;
  production parity is reproven by the live release gate after deployment.
- Perf impact remains covered by the 2026-06-08 master CI perf job until
  STABILIZAT-1 refreshes baselines.

## Required Docs

- Keep `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
  `docs/DIRECTIVES.md` aligned with this candidate authority.
