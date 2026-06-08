# SOL-1 Acceptance Packet

Status: owner visual review packet
Directive: [SOL-1](sol-1.md)

Use this packet to accept or reject the deployed SOL-1 candidate. The current
candidate is the deployed `master` build proven by `npm run check:live-release`.
The visual evidence below was captured from the same source state before the
docs-only closeout commits; live proof verifies that production is serving the
current `master` SHA.

## Review Order

1. Sun body and surrounding solar mass:
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/visual-openfrontier-golden.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/crop-parity-openfrontier-golden-webgpu.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/crop-close-parity-openfrontier-golden-webgpu.png`
2. WebGPU/WebGL2 parity:
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/parity-openfrontier-golden-webgpu.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/parity-openfrontier-golden-webgl.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/summary.json`
3. Hill and ridge light bleed:
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/ridge-ashau-dusk-webgpu-strict.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/ridge-ashau-dusk-webgpu-force-webgl.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/ridge-summary.json`
4. Night terrain and water:
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/visual-ashau-midnight.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/nightred-ashau-midnight.png`
   - `artifacts/cycle-sun-and-atmosphere-overhaul/playtest-evidence/nightred-combat120-midnight.png`
5. Production proof:
   - run `npm run check:live-release`
   - inspect the latest `artifacts/perf/*/projekt-143-live-release-proof/release-proof.json`

## Acceptance Criteria

Accept SOL-1 only if the deployed candidate satisfies all of these:

- The visible sun reads as a hot object with a broad warm center, irregular
  amber shell, and tight surrounding solar mass.
- The sun does not read as a huge near object, tiny white pearl, smooth damp
  sphere, or bland circular UI sprite.
- Terrain, fog, water highlights, billboard lighting, and sky warmth feel like
  they come from one lighting direction and color model.
- A Shau low-sun ridge proof does not show the sun body bleeding through terrain.
- A Shau midnight water reads as cool level/depth water, not a red surface slab
  or a white/cyan blown material.
- WebGPU and explicit WebGL2 fallback are close enough that fallback users see
  the same visual intent.

Reject with the exact frame path, time of day, renderer mode, and the failure
mode. If the rejection is local to one condition, keep the SOL-1 architecture
and retune that condition instead of redesigning the whole atmosphere stack.

## Current Automated Evidence

- Full matrix: `33/33` captures passed.
- Daylight WebGPU sun body: `sunCore=0.105-0.113%`,
  `sunSpan=5.19-5.46%`.
- Explicit WebGL2 Open Frontier sun body: `sunCore=0.085-0.086%`,
  `sunSpan=4.44%`.
- WebGPU/WebGL2 matrix parity: max channel delta `0.39%`.
- A Shau ridge parity: max channel delta `0.00%`,
  `sunVisibility=terrain-occluded`, `sunOcclusion=55m`.
- A Shau midnight water-body localMax red/white/cyan/bright: `0.0%`.

Automated evidence proves the candidate is deployed and within the measured
guards. It does not replace owner visual acceptance.
