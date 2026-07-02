# task/webgpu-gpu-timing

Campaign: greenlight-followthrough (2026-07-02), Wave 2. Owner fork P3: "Build
WebGPU timestamp-query frame timing (opt-in, capture-surfaced)."

## Problem

GPU frame time was NEVER measured under WebGPU — the production backend.
`GPUTimingTelemetry` only implemented the WebGL2 `EXT_disjoint_timer_query`
path and explicitly returned null/no context for `isWebGPURenderer`. Every
production-shape capture (default renderer resolves to WebGPU) recorded zero GPU
ms. Permanent blind spot on the one metric that attributes the render pass.

## What shipped

1. **WebGPU timestamp-query path** in `GPUTimingTelemetry` behind the same
   `?gpuTiming=1` opt-in. Three.js r185 `WebGPURenderer` supports GPU timestamps
   via `trackTimestamp` (constructor) + `resolveTimestampsAsync('render')`, which
   settles the render-pass GPU duration (already in milliseconds) onto
   `renderer.info.render.timestamp`. The telemetry resolves the previous frame's
   timestamps each frame (non-blocking) and reads the settled value.

2. **Clean feature-detect + honest fallback.** If the device does not expose the
   `timestamp-query` feature (or `trackTimestamp` was never armed), the telemetry
   reports `available: false` with an explicit `unsupportedReason` string — it
   never fakes a number. Fallback ladder: WebGPU timestamp-query → WebGL2
   `EXT_disjoint_timer_query_webgl2` → null.

3. **Flag wired only under opt-in.** `RendererBackend.gpuTimingFlagEnabled()` is
   the single source of truth for `?gpuTiming=1`. `createWebGPURenderer` accepts
   `{ trackTimestamp }` and `GameRenderer` passes `gpuTimingFlagEnabled()` — so
   default sessions construct the renderer byte-for-byte unchanged.

4. **Capture surfacing.** The runtime keeps the identical `GPUTelemetry` shape
   (`available` + `gpuTimeMs`), so `scripts/perf-capture.ts` picks WebGPU timing
   up through the existing `report.gpu` read. One additive capture-side change:
   the `&gpuTiming=1` URL param now flows for default/webgpu-family renderer modes
   (previously WebGL-only). New optional `backend` / `unsupportedReason`
   diagnostic fields are additive.

## Files touched

- `src/systems/debug/GPUTimingTelemetry.ts` — WebGPU path, fallback ladder, header docs.
- `src/systems/debug/GPUTimingTelemetry.test.ts` — new; flag gating + WebGPU armed/unsupported + WebGL2 fallback.
- `src/core/RendererBackend.ts` — `gpuTimingFlagEnabled()`, `createWebGPURenderer({ trackTimestamp })`.
- `src/core/GameRenderer.ts` — pass `trackTimestamp: gpuTimingFlagEnabled()` at WebGPU construction.
- `scripts/perf-capture.ts` — allow `&gpuTiming=1` for webgpu-family modes; corrected the skip log.

## Non-goals (unchanged)

Per-frame GC counters (CDP territory), default capture flags, any renderer
behavior change without the flag.

## Manual verification (real GPU)

```
npm run dev
# open http://localhost:5173/?gpuTiming=1  (default renderer = WebGPU)
# in the browser console:
window.perf.report().gpu
#   -> { available: true, gpuTimeMs: <positive>, backend: 'webgpu', ... } on a
#      timestamp-query-capable adapter, OR
#   -> { available: false, backend: 'webgpu', unsupportedReason: '...' } if the
#      device lacks the feature (honest, not faked).
```

Capture path (MAIN worktree only, Windows MAX_PATH):
`npm run perf:capture -- --gpu-timing` (default renderer) surfaces
`gpuTiming.avgGpuTimeMs` / `peakGpuTimeMs` in the artifact JSON when the adapter
supports timestamps.
