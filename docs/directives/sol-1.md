# SOL-1 - Solar, atmosphere, and terrain lighting rearch

Status: code-complete (deployed; owner acceptance pending)
Owning subsystem: renderer / atmosphere / terrain / water / shadows
Opened: 2026-06-07 owner visual rejection

## Latest Evidence

Owner feedback rejected the prior visual read: the sun looked too large,
terrain and water highlights were implausible, night terrain could read red or
white, lighting angles looked wrong, and light appeared to bleed through hills.
The source audit found a cross-system problem, not a single material bug:
sky, renderer lights, terrain, water, billboard vegetation, fog, and shadow
recentering all consumed different pieces of atmosphere state.

The active master candidate now adds an explicit `AtmosphereLightingSnapshot` for
effective direct light, sky fill, ground bounce, ambient fill, fog color, and
daylight factor. Renderer lights, water, billboard vegetation, and terrain
night-fill consume the same snapshot. The TSL dome and CPU LUT share a cool
sub-horizon sky floor. Water attenuates specular/emissive/foam/sparkle response
at night. A Shau shadow recentering preserves follow-target altitude, and
terrain has a bounded low-sun heightmap/relief response for the accepted
short-range ridge approximation.

Visible sun scale is being reworked against the Sheep Dog Simulator WebGPU
reference contract:

- `SunDiscMesh` is ON by default and owns the depth-tested hot body. It is
  additive, tone-map bypassed, and records `disc-body-only` ownership plus the
  `large-hot-core-fractured-amber-shell` tuning guard.
- `HosekWilkieTslNode` keeps bounded atmospheric glow / horizon scatter and
  now adds a tight SDS-style warm sky solar mass around the hot body. This
  replaces the rejected pale circular lobe without painting a second hard HDR
  disc into the dome.
- The sprite and sky mass were retuned from the rejected tiny white pearl /
  damp sphere into a visible hot object: broader warm-white center, mottled
  internal heat, irregular ember rim, and tighter warm surrounding solar mass.
  The true WebGPU path stays on the SDS-style additive TSL material; the
  explicit `?renderer=webgl` fallback uses bounded alpha blending so its hot
  center does not clip to flat white during parity captures.
  Representative focused crops are
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/crop-parity-openfrontier-golden-webgpu.png`
  and `crop-close-parity-openfrontier-golden-webgpu.png`.
- The post-feedback full local matrix passes `33/33` captures in
  `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/summary.json`.
  Daylight WebGPU records `sunCore=0.105-0.113%`, `sunSpan=5.19-5.46%`;
  explicit WebGL2 Open Frontier records `sunCore=0.085-0.086%`,
  `sunSpan=4.44%`. WebGPU/WebGL2 color parity stays under cap with max channel
  delta `0.39%`.
- Open Frontier golden previously looked like a terrain-occluded body, but the
  new terrain ray probe showed it was `missing-unoccluded`; the root cause was
  stale camera-relative `SunDiscMesh` positioning after capture camera moves.
  `syncDomePosition()` now refreshes the sun body.
- A Shau dusk ridge proof now exercises an actual terrain-occluded sun-body case
  in `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/ridge-summary.json`.
  Strict WebGPU and production fallback both record
  `sunVisibility=terrain-occluded`, `sunOcclusion=55m`, `sunCore=0`,
  `sunSpan=0`, ridge warmth PASS, sun-scale PASS, and WebGPU/WebGL2 parity max
  channel delta `0.00%`.
- The full matrix night diagnostics pass rendered night-terrain red/white/cyan
  bounds across all five scenarios. The capture script also emits advisory
  `localMax(...)` hotspot ratios for night terrain so narrow red, white, cyan,
  or bright material streaks are visible in the proof log instead of being
  averaged away by whole-region sampling; these are triage evidence because
  in-scene markers and props can legitimately create localized colored pixels.
- A Shau midnight now proves the level/depth water body on the cool opaque
  night material path: the rendered night-terrain region records
  `localMax(red=0.0% white=0.0% cyan=0.0% bright=0.0%)`, replacing the previous
  red water-body slab.
- Production proof is `npm run check:live-release`: the current deployed
  `master` SHA must match `/asset-manifest.json`, and CI, deploy, Pages/R2/SW
  headers, and live browser smoke must all PASS.

These are automated diagnostics, not owner visual acceptance. SOL-1 stays open
until a human visual review accepts the current candidate.

## Recommended Next Goal

**SOL-1R8 - owner visual acceptance.**

Use the current renderer state as the candidate authority. The next pass should
not redesign the sky again unless owner review rejects it. It should:

- run owner visual review on the SDS-style sun body, noon/golden glare,
  night terrain/water, WebGPU/WebGL2 parity crops, and the A Shau
  terrain-occluded ridge proof;
- use the full matrix, ridge proof, live proof, and
  [SOL-1 acceptance packet](sol-1-acceptance-packet.md) as the acceptance
  packet;
- compare any owner-rejected frame against the current automated matrix before
  redesigning atmosphere, terrain, water, or shadows again;
- update this directive to `closed` only after owner acceptance.

## Success Criteria

- Sun rendering separates the depth-tested hot body from bounded sky glow /
  warm solar mass. The combined result is readable as a hot object, not a huge
  near object, tiny pearl, or smooth damp sphere.
- True night terrain is not red-dominant, white-hot, or cyan-blown in all
  modes, including combat120.
- Sun direction, directional light, water specular, terrain shading, billboard
  lighting, fog, and hemisphere fill agree from the same explicit lighting
  snapshot.
- Hill/ridge light bleed is either accepted against the current
  terrain-occluded ridge proof, or replaced by a stronger terrain-light
  occlusion model if owner review rejects it.
- True WebGPU and production WebGPU-renderer WebGL2 fallback parity are proven
  from the same poses locally; production parity is reproven by the live
  release gate after deployment.
- Perf impact remains covered by the 2026-06-08 master CI perf job until
  STABILIZAT-1 refreshes baselines.

## Required Docs

- Keep `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
  `docs/DIRECTIVES.md` aligned with this candidate authority.
