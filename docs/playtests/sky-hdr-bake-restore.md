# Playtest: sky-hdr-bake-restore

Last verified: 2026-05-16

Cycle: `cycle-sky-visual-restore` (campaign position #1 of 12).
Task brief: [docs/tasks/cycle-sky-visual-restore.md](../tasks/cycle-sky-visual-restore.md) (R1 task `sky-hdr-bake-restore`).
Closes: `KB-SKY-BLAND` (one of three coordinated R1 tasks).
Posture: autonomous-loop. Owner walk-through pending; CI green + smoke
evidence is sufficient to merge under the active campaign manifest.

## What changed

`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`:

1. Sky LUT `DataTexture` type swapped from `UnsignedByteType` to
   `HalfFloatType` (RGBA stays). Storage is `Uint16Array` carrying
   the IEEE-754 fp16 bit pattern produced by
   `THREE.DataUtils.toHalfFloat`. Color space changed from
   `SRGBColorSpace` to `LinearSRGBColorSpace` because the half-float
   payload is now linear radiance, not sRGB-encoded bytes.
2. Per-pixel encode at the bake loop drops the prior
   `Math.round(Math.sqrt(clamp01(x)) * 255)` workaround. Linear radiance
   is written directly as fp16, preserving the sun-disc spike past the
   old `[0, 1]` clamp ceiling.
3. `evaluateAnalytic`'s post-exposure clamp lifted from
   `Math.min(8, …)` to `Math.min(64, …)`. fp16 max is ~65504, so 64
   leaves four exponent bits of headroom while still gating against
   numerical blow-out in the analytic path.
4. Alpha-channel constant precomputed (`ALPHA_HALF_ONE`) so the per-pixel
   write loop doesn't pay the `toHalfFloat` cost on a constant.

Non-goals (preserved): `compressSkyRadianceForRenderer` in
`AtmosphereSystem.ts` is untouched — fog + hemisphere readers continue
to receive radiance compressed to their renderer-safe range. The dome
itself, which is the target of this HDR change, is not a downstream
reader.

## Playwright smoke evidence

Smoke script: [scripts/capture-sky-hdr-bake-shots.ts](../../scripts/capture-sky-hdr-bake-shots.ts).
Bundle: perf-harness (`dist-perf/`, `VITE_PERF_HARNESS=1`).
Scenario: `ai_sandbox` (combat120). Camera posed at `(0, 200, 0)`,
yaw 45°, pitch +45° so the dome dominates the frame.

| Mode | URL flag | Result | Screenshot |
|------|----------|--------|------------|
| Default (webgpu) | none | OK — Chromium headless has no GPU adapter, Three.js auto-fell-back to WebGL2 (expected behavior; the renderer mode resolution still ran the WebGPU init path). | `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-hdr-bake-restore-webgpu.png` |
| Strict WebGPU | `?renderer=strict` | Engine init timed out — strict mode refuses the WebGL2 fallback that headless Chromium needs. Documented behavior of strict mode; cannot be exercised in CI Chromium without `--enable-unsafe-webgpu` and a host GPU. Real-device strict-mode validation is the merge-gate for `cycle-mobile-webgl2-fallback-fix` (queue #2), not this cycle. | not captured (skipped: WebGPU adapter unavailable in headless Chromium) |
| WebGL fallback | `?renderer=webgl` | OK — explicit `WebGLRenderer` path, no fallback negotiation. | `artifacts/cycle-sky-visual-restore/playtest-evidence/sky-hdr-bake-restore-webgl.png` |

### Console-warning diff

Captured warnings, with master-baseline noise filtered:

- **webgpu**: 9 warnings, all pre-existing (`No available adapters`,
  `THREE.WebGPURenderer: WebGPU is not available, running under WebGL2
  backend`, `powerPreference option is currently ignored on Windows`).
  None reference the sky LUT texture type. No new
  `GL_INVALID_OPERATION` / `RGBA16F`-related errors observed.
- **strict**: 1 error (the engine timeout); expected, not related to
  this change.
- **webgl**: 4 warnings — 1 pre-existing
  `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated`, 3
  `GL_CLOSE_PATH_NV` driver-perf notices that are headless-Chromium
  driver noise (also present in master). No texture-type-related
  warnings.

The half-float upload path is therefore accepted by both the WebGPU
auto-fallback WebGL2 backend and the explicit WebGL path without
introducing new warnings.

### Visual reading

At this stage of the cycle the dome material still has the prior
`toneMapped` default (i.e. ACES filmic tonemapping is still applied to
the dome at the renderer level) and the LUT is still 128x64. Both of
those are fixed by the parallel R1 task
`sky-dome-tonemap-and-lut-resolution`. As a result, the captured noon
dome in both screenshots is the same pale gradient observed in the
post-merge regression — the HDR values produced by the new half-float
bake are being crushed downstream by ACES.

Once `sky-dome-tonemap-and-lut-resolution` lands and disables
tonemapping on the dome material, the saturation recovery from this
task's HDR bake will become visible. Until then, this PR carries the
plumbing change (correct, non-regressing, no new warnings) and waits on
its sibling.

## Acceptance status

- `npm run lint`: PASS.
- `npm run test:run`: PASS (4251 tests, 281 files, ~30s).
- `npm run build`: PASS.
- Playwright smoke: 2/3 modes captured. The `strict` skip is documented
  above and is expected (headless Chromium lacks WebGPU). Owner
  walk-through pending; deferred under autonomous-loop posture.

## What an owner should look for

When the full R1 trio lands (this task + `sky-dome-tonemap-and-lut-resolution` +
`sky-sun-disc-restore`):

1. Open Frontier at noon should show recovered horizon saturation and a
   deep blue zenith matching
   `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/openfrontier-noon-pre-merge.png`.
2. A bright pearl sun pin-point should be visible at the sun direction
   on the dome (from `sky-sun-disc-restore`).
3. No console warnings about RGBA16F or HalfFloatType uploads should
   appear in dev tools across webgpu / strict / webgl modes on a real
   GPU.
