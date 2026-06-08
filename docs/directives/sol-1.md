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

Visible sun scale was fixed in two parts:

- The physical HDR disc stays small; the additive `SunDiscMesh` remains off by
  default so it does not create a double sun.
- Broad base-sky glare is capped before the explicit disc/aureole contribution.
  The cap spans the measured white plate, blends to a blue-biased cap at high
  sun, and uses a much lower aureole gain so glare no longer becomes a second
  sun body.

Fresh proof from 2026-06-08 on shipped commit `2db02400`:

- `summary.json`: 33/33 captures succeeded. The default matrix resolved 29
  records as true `webgpu` and 4 parity records as explicit `webgl`.
- All sun-scale diagnostics pass: noon `sunSpan=2.41%`; golden and dusk
  `sunSpan=1.48%`.
- Twilight and midnight terrain red/white/cyan diagnostics pass in all modes,
  including combat120 midnight.
- WebGPU/WebGL2 all-mode parity max channel delta is 0%.
- `ridge-summary.json`: A Shau dusk strict-WebGPU ridge proof resolves true
  `webgpu`, finds a 274.6 m ridge-rise pose, and passes ridge warmth plus
  sun-scale (`sunSpan=1.48%`). Explicit WebGL2 parity is 0.39%, under the 5%
  target.
- The legacy strict night-red assertion still fails 0/5 because it requires
  `r < 0.5 * max(g,b)`, which contradicts the documented cool moon target
  `(0.18, 0.20, 0.30)`. The red-not-dominant check passes 5/5.
- CI `27119813037`, deploy `27120013716`, and live-release proof
  `artifacts/perf/2026-06-08T06-29-37-017Z/projekt-143-live-release-proof/release-proof.json`
  pass for the same commit. The live manifest serves
  `2db02400ccb72350d89fc149f370f22ed3ea2922`.

These are automated diagnostics, not owner visual acceptance. SOL-1 stays open
until a human visual review accepts the shipped candidate.

## Recommended Next Goal

**SOL-1R7 - owner visual acceptance.**

Use the current renderer state as the candidate authority. The next pass should
not redesign the sky again unless owner review rejects it. It should:

- run owner visual review on sun scale, noon/golden glare, night terrain/water,
  and the A Shau ridge light-bleed approximation;
- compare any owner-rejected frame against the current automated matrix before
  redesigning atmosphere, terrain, water, or shadows again;
- update this directive to `closed` only after owner acceptance.

## Success Criteria

- Sun rendering separates physical body from glare/aureole. The body no longer
  reads as a huge near object in noon, golden, or dusk captures.
- True night terrain is not red-dominant, white-hot, or cyan-blown in all
  modes, including combat120.
- Sun direction, directional light, water specular, terrain shading, billboard
  lighting, fog, and hemisphere fill agree from the same explicit lighting
  snapshot.
- Hill/ridge light bleed is either accepted as the current short-range
  heightmap approximation with documented limits, or replaced by a stronger
  occlusion model.
- True WebGPU and explicit WebGL2 parity are proven from the same poses.
- Perf impact remains covered by the 2026-06-08 master CI perf job until
  STABILIZAT-1 refreshes baselines.

## Required Docs

- Keep `docs/ATMOSPHERE.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, and
  `docs/DIRECTIVES.md` aligned with this candidate authority.
