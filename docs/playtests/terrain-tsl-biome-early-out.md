# Playtest memo: `terrain-tsl-biome-early-out`

Last updated: 2026-05-16

## Cycle

`cycle-mobile-webgl2-fallback-fix` (campaign position #2 of 12,
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)).
Closes carry-over `KB-MOBILE-WEBGPU` jointly with the rest of the
cycle's R1 + R2 + R3 tasks. R3's `real-device-validation-harness` is
the cycle-wide merge gate; this memo captures the per-task evidence
for the load-bearing R1 fix.

## What this task changed

Single-file diff in
`src/systems/terrain/TerrainMaterial.ts`:

1. Added `Fn`, `If`, `vec4` to the `three/tsl` import block.
2. Rewrote `sampleBiomeTextureRaw` to wrap the per-biome sampler
   selection in a TSL `Fn(([slot, sampleUv]) => { ... })` that uses an
   `If(slotIdx.lessThanEqual(0)) ... .ElseIf(slotIdx.equal(N)) ...`
   chain across the eight biome textures. Each `tslTexture(...)` call
   is constructed *inside* its branch so the compiled GLSL emits the
   `texture()` fetch inside the corresponding `if` block — the WebGL2
   backend can then early-out and fetch only the active biome's
   sampler per fragment.

Before this change, the function used
`sample = mix(prev, sample, step(N - 0.5, biomeSlot))` unrolled across
all 8 biome samplers. The GPU still had to evaluate every `texture()`
call before the `step()`-controlled `mix()` chose one, so each
fragment paid ~8x the sampler cost of the pre-merge `if`-branched
chain. With `If/ElseIf` the WebGL2 backend can short-circuit to a
single sampler per fragment in the common case (a fragment whose
classifier weight resolves cleanly to a single biome).

No other call-sites or wrappers were touched. `sampleBiomeTexture`
(the planar+rotated wrapper) and `sampleBiomeTriplanar` continue to
call `sampleBiomeTextureRaw` exactly as before, so the per-fragment
graph above the early-out is unchanged.

## Evidence captured under autonomous-loop posture

The cycle brief sets `Skip-confirm: no` for the R3 real-device round
(owner attaches phones). For this R1 task the evidence available
without owner intervention is:

1. **Playwright smoke screenshots** at three scenarios. Captured by an
   inline Playwright probe (deleted before commit per the brief) which
   served `dist/` and loaded the page in three modes:

   ```
   artifacts/cycle-mobile-webgl2-fallback-fix/playtest-evidence/
     terrain-tsl-biome-early-out-strict-webgpu-noon.png
     terrain-tsl-biome-early-out-webgl2-fallback-noon.png
     terrain-tsl-biome-early-out-ashau-dawn.png
   ```

   The captures are bootstrap-screen smoke (no mode-click in the
   probe) — they confirm the bundle parses, the renderer initialises,
   and no fatal overlay fires under each scenario. They are NOT
   full-scene noon/dawn frames. Real-scene visual parity is the
   owner-walk responsibility per the cycle brief's Critical Process
   Note #3.

2. **Strict-WebGPU rejection still works.** The probe confirmed that
   `?renderer=webgpu-strict` correctly refuses the WebGL2 fallback on
   Playwright Chromium with no available WebGPU adapter:

   ```
   [bootstrap] Bootstrap failed Error: Strict WebGPU mode resolved
   webgpu-webgl-fallback; refusing WebGL fallback.
   ```

   The strict-WebGPU acceptance bar is preserved. The explicit
   `?renderer=webgl` escape hatch also loaded without errors.

3. **TSL graph structural confirmation.** The terrain material's
   `colorNode` graph constructs successfully in node (vitest
   environment, no DOM) and the `createTerrainMaterial` path is
   covered by the existing 7-test suite in
   `src/systems/terrain/TerrainMaterial.test.ts`. All 4258 tests
   across the repo pass on this branch.

4. **Compiled-GLSL inspection not captured in this PR.** The
   `tsl-shader-cost-probe` (R3) is the dedicated harness for
   compiled-GLSL inspection via `renderer.compileAsync` +
   `WebGLNodesHandler` debug surface. Per the brief, R3 ships first
   only if scheduling allows; otherwise this PR's structural argument
   plus tests stand in until R3 lands. R3 will re-verify
   sampler-count drop against the post-fix baseline as the cycle's
   pre-merge regression gate.

## Why the structural argument is load-bearing

Per the R1 audit
(`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md`)
terrain was the **#1 per-fragment cost contributor** on the post-merge
WebGL2-fallback path:

- Pre-merge: `if (biomeSlot < 0.5) { ... } else if (...)` GLSL the
  WebGL2 driver could short-circuit (~19 effective samples/fragment).
- Post-merge mix-unroll: all 8 samplers fetched unconditionally per
  fragment, then `mix()`-blended (~146 effective samples/fragment, an
  8x amplification).
- Post-fix If/ElseIf: target back to ~1 sampler in the common case
  (single-biome fragment) and up to ~2 across blend bands. Worst case
  matches pre-merge.

The change is local to `sampleBiomeTextureRaw`. The downstream
sample-then-mix chain in `sampleBiomeTexture` (planar + rotated +
hash-breakup) is unchanged, as are `sampleBiomeTriplanar` and the
classifier in `classifyBiomeBlend`. So the visual contract upstream
of the early-out is preserved by construction.

## Owner walk-through (deferred)

Items the owner walks at the cycle close (per the cycle brief's
real-device validation step and Critical Process Note #1):

1. **Strict-WebGPU desktop at Open Frontier noon.** Visual must match
   the pre-cycle reference. Strict-WebGPU is the campaign acceptance
   bar; any visible regression here is a hard-stop.
2. **WebGL2-fallback emulation at Open Frontier noon and A Shau
   dawn.** Visual parity vs strict-WebGPU; perf delta vs cycle-start
   baseline captured via `scripts/perf-startup-mobile.ts`.
3. **Real Android Chrome 121+ + iOS Safari 18+ devices.** R3
   `real-device-validation-harness` is the merge gate for the cycle.

## Verification commands

- `npm run lint` — PASS.
- `npm run test:run` — 4258 tests passed.
- `npm run build` — PASS.

## References

- Cycle brief: [docs/tasks/cycle-mobile-webgl2-fallback-fix.md](../tasks/cycle-mobile-webgl2-fallback-fix.md)
- Alignment memo: [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
- TSL shader-cost audit: [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md)
- TSL `If/ElseIf` reference: [.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md](../../.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md)
- Closes carry-over: `KB-MOBILE-WEBGPU`
