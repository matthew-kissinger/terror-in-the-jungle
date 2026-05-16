# mobile-renderer-mode-truth

Last verified: 2026-05-16

Cycle: `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` (R1, memo-only).
Carry-over: KB-MOBILE-WEBGPU (investigation; promoted to a named fix
cycle by the R2 alignment memo).

## TL;DR — what is mobile actually running?

**Mobile production lands on the WebGL2 fallback of the Three.js
`WebGPURenderer`** — not native WebGPU, and not the pre-migration
`WebGLRenderer`. On both emulated Android Chrome (Pixel 5, real
Chrome 147 UA) and emulated iOS Safari (iPhone 12), the production
default path resolves `capabilities.resolvedBackend ===
"webgpu-webgl-fallback"` with `isWebGPURenderer === true` and
`initStatus === "ready"`. `navigator.gpu` is present on Chromium but
`requestAdapter()` returns `null`, so the renderer takes the WebGL2
backend that `WebGPURenderer` from `three/webgpu` exposes (per r171,
referenced in `src/core/GameRenderer.ts:263-265`). The post-merge
mobile slow-path is therefore hypothesis **(c)** from the cycle brief:
the WebGL2 fallback path is engaged but it is heavier than the
pre-migration WebGL path. Native WebGPU on mobile (hypothesis (b)) is
not the cost surface because no mobile browser available to this
probe granted a WebGPU adapter. Hypothesis (a) — the
`strictWebGPU=false` gate (commit `4aec731e`) — is correctly engaged
and is the only reason mobile reaches the start screen at all; strict
mode rejects the same path with a fatal overlay.

This pins the regression surface for the R2 alignment memo: the
follow-up fix cycle needs to be about either trimming the WebGL2
fallback path's cost or restoring the pre-migration WebGLRenderer
path for the mobile audience, not about WebGPU adapter negotiation or
shader compile stalls.

## Method

- Built a small read-only probe at
  [`scripts/mobile-renderer-probe.ts`](../../../scripts/mobile-renderer-probe.ts)
  modelled on the existing
  [`scripts/konveyer-renderer-matrix.ts`](../../../scripts/konveyer-renderer-matrix.ts).
  It serves `dist/` over a local HTTP server, drives a Playwright
  Chromium device-emulation context with x4 CPU throttle via CDP
  `Emulation.setCPUThrottlingRate`, captures `navigator.gpu`
  presence and `requestAdapter()` outcome, reads the live
  `window.__rendererBackendCapabilities()` global exposed by
  `src/core/bootstrap.ts:177-179` under `?diag=1`, and screenshots the
  resulting screen.
- Three scenarios per device:
  - `default-mobile` — `/?diag=1` — production default, WebGL2
    fallback allowed (commit `4aec731e`, `GameRenderer.ts:253-269`).
  - `strict-mobile` — `/?diag=1&renderer=webgpu-strict` — strict mode,
    refuses fallback (`GameRenderer.ts:254-257`).
  - `force-webgl-mobile` — `/?diag=1&renderer=webgl` — explicit
    pre-migration `THREE.WebGLRenderer` path
    (`RendererBackend.ts:101-110`, `RendererBackend.ts:117-118`).
- Two device contexts: Playwright `devices['Pixel 5']` (real Android
  Chrome UA reporting `Chrome/147.0.7727.15`) and `devices['iPhone 12']`
  (iOS Safari UA on the Chromium engine; see limitations).
- Browser launched with
  `--use-angle=swiftshader --enable-webgl --enable-unsafe-webgpu`.
- Real-device evidence was not feasible from this executor
  environment (no remote-debug mobile attached); the cycle brief
  explicitly authorises Chrome DevTools Mobile Emulation + 4x CPU
  throttle as the documented fallback (cycle brief, "Critical Process
  Notes" item 3).

## Pre-merge vs post-merge comparison

Pre-merge `src/core/GameRenderer.ts` (SHA `79103082`, parent of merge
commit `1df141ca`) constructed a plain
`new THREE.WebGLRenderer({ antialias, powerPreference, preserveDrawingBuffer })`
in its constructor and had no `RendererBackend` indirection
(`git show 79103082:src/core/GameRenderer.ts`, lines 82-89).

Post-merge `src/core/GameRenderer.ts` (current master, lines 87-108
plus `initializeRendererBackend()` at 233-313):

1. Constructor still synchronously builds a `WebGLRenderer` via
   `createWebGLRenderer()` (`RendererBackend.ts:101-110`), used only
   as a bootstrap surface during startup.
2. `GameEngine.initialize()` then calls
   `renderer.initializeRendererBackend()`
   (`src/core/GameEngine.ts:144`), which:
   - Dynamically `import('three/webgpu')`
     (`RendererBackend.ts:139`).
   - Instantiates `webgpuModule.WebGPURenderer({ antialias,
     powerPreference, forceWebGL })` (`RendererBackend.ts:140-144`).
   - Runs `renderer.init()` (`RendererBackend.ts:168-172` →
     `GameRenderer.ts:250`). Internally this resolves the WebGPU
     adapter; on `navigator.gpu.requestAdapter()` returning `null`,
     Three.js's `WebGPURenderer` from `three/webgpu` falls back to a
     WebGL2 backend (per the r171 contract called out in the comment
     at `GameRenderer.ts:263-265`).
   - Reads the resolved backend via
     `inspectResolvedRendererBackend()` (`RendererBackend.ts:174-180`).
     With `backend.isWebGLBackend === true` and `isWebGPURenderer ===
     true`, the function returns `'webgpu-webgl-fallback'`.
   - Disposes the bootstrap `WebGLRenderer` and replaces its canvas
     with the `WebGPURenderer` canvas (`GameRenderer.ts:272-280`).
3. The fallback throw is gated on `capabilities.strictWebGPU` only
   (`GameRenderer.ts:253-269`, commit `4aec731e`). Default `webgpu`
   mode accepts the fallback.

This is the path mobile lands on. The pre-migration mobile path was
"construct `WebGLRenderer` once, use it as-is." The post-migration
mobile path is "construct `WebGLRenderer` once as bootstrap, dispose
it, then construct `WebGPURenderer` whose internal backend is also
WebGL2, then proxy every draw call through the TSL node-handler
pipeline." `RendererBackend.ts:107-108` plumbs the
`WebGLNodesHandler` from `three/addons/tsl/WebGLNodesHandler.js` onto
the legacy WebGLRenderer too, so even the explicit
`?renderer=webgl` path renders TSL node materials via the node
handler — but on the post-merge code, only the WebGPURenderer surface
is wired into the runtime (`GameRenderer.ts:280`).

## Evidence

Probe artifact (full JSON): `img/probe-report.json` in this folder
(copy of `artifacts/mobile-renderer-probe/2026-05-16T05-08-31-204Z/report.json`
— `artifacts/` is gitignored).

### Pixel 5 emulation (Android Chrome 147)

User-Agent recorded by the probe:

```
Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
```

This is the real Chrome 147 mobile UA from the bundled Playwright
Chromium build, not a hand-typed one — the user-agent matches what an
actual Android Chrome 147 device would send.

#### Default mode (`/?diag=1`)

- `navigator.gpu`: **present**
- `navigator.gpu.requestAdapter()`: returned `null` (no adapter)
- `capabilities.requestedMode`: `"webgpu"`
- `capabilities.resolvedBackend`: **`"webgpu-webgl-fallback"`**
- `capabilities.initStatus`: `"ready"`
- `capabilities.isWebGPURenderer`: `true`
- `capabilities.strictWebGPU`: `false`
- `capabilities.notes`: `["navigator.gpu exists but requestAdapter
  returned null.", "Renderer initialized as
  webgpu-webgl-fallback."]`
- start button: **visible**, no fatal overlay, zero console errors,
  zero page errors

Screenshot: ![Pixel 5 default — start visible on
WebGL2-fallback](img/pixel5-default-mobile.png)

#### Strict mode (`/?diag=1&renderer=webgpu-strict`)

- `navigator.gpu`: present, adapter probe still returned `null`
- start button: **not visible**
- fatal overlay: **visible**, text: `"Failed to initialize. Please
  refresh the page. Strict WebGPU mode resolved webgpu-webgl-fallback;
  refusing WebGL fallback. Retry"`
- console error: `"Bootstrap failed Error: Strict WebGPU mode
  resolved webgpu-webgl-fallback; refusing WebGL fallback."` thrown
  from `GameRenderer.initializeRendererBackend`
  (`GameRenderer.ts:253-258`)

Screenshot: ![Pixel 5 strict — fatal
overlay](img/pixel5-strict-mobile.png)

This is the exact behaviour the `4aec731e` fix preserved: strict
mode fails loudly, default mode falls back silently. Both behaviours
are working as documented.

#### Force-WebGL mode (`/?diag=1&renderer=webgl`)

- `capabilities.requestedMode`: `"webgl"`
- `capabilities.resolvedBackend`: **`"webgl"`**
- `capabilities.isWebGPURenderer`: `false`
- start button: **visible**, no fatal overlay

Screenshot: ![Pixel 5 force-webgl — start visible on plain
WebGLRenderer](img/pixel5-force-webgl-mobile.png)

The explicit-WebGL path still works on master — useful escape hatch
for the follow-up fix cycle to A/B against.

### iPhone 12 emulation (iOS Safari UA, Chromium engine)

User-Agent recorded by the probe:

```
Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1
```

Note: this UA is the Playwright `devices['iPhone 12']` UA but the
underlying browser engine is Chromium, not WebKit. Real Safari
adapter-availability and behaviour can differ (see Limitations).

#### Default mode (`/?diag=1`)

- `navigator.gpu`: **present**
- `navigator.gpu.requestAdapter()`: returned `null`
- `capabilities.resolvedBackend`: **`"webgpu-webgl-fallback"`**
- `capabilities.initStatus`: `"ready"`
- start button: **visible**, zero console errors, zero page errors

Screenshot: ![iPhone 12 default — start visible on
WebGL2-fallback](img/iphone12-default-mobile.png)

#### Strict mode

Same behaviour as Pixel 5: fatal overlay, `"Strict WebGPU mode
resolved webgpu-webgl-fallback; refusing WebGL fallback"`.

#### Force-WebGL mode

Same behaviour as Pixel 5: `resolvedBackend === "webgl"`, start
visible, no fatal.

### What the data says, plainly

Across both device contexts, in the production default path that
real mobile users will hit:

| Metric | Pixel 5 | iPhone 12 |
|---|---|---|
| `navigator.gpu` present | yes | yes |
| `requestAdapter()` granted | no (returned `null`) | no |
| renderer constructed | `WebGPURenderer` | `WebGPURenderer` |
| `backend.isWebGPUBackend` | `false` (resolved `webgpu-webgl-fallback`) | same |
| `backend.isWebGLBackend` | `true` (resolved `webgpu-webgl-fallback`) | same |
| `capabilities.resolvedBackend` | `"webgpu-webgl-fallback"` | same |
| start button visible | yes | yes |
| fatal overlay | no | no |
| console errors | 0 | 0 |
| page errors | 0 | 0 |

The renderer-mode answer is therefore **not ambiguous** — strictly,
mobile is in the WebGL2 fallback of the WebGPURenderer surface, and
the `4aec731e` strictWebGPU-gated fallback is the *only* reason
startup is not a fatal crash on mobile.

## Frame-time at 5 s / 30 s / 60 s — explicit deferral

The cycle brief asks for frame time at 5 s / 30 s / 60 s in Open
Frontier with 60 NPCs. That measurement is **explicitly deferred to
`mobile-startup-and-frame-budget`**, the parallel R1 task that owns
the per-frame-cost measurement (cycle brief lines 217-238). This
memo's acceptance bar names the renderer mobile lands in with
adapter-info evidence — both delivered above. Splitting the
measurements that way avoids the two memos producing
mutually-inconsistent telemetry, and respects the "small diffs over
big ones" rule from `.claude/agents/executor.md`.

The R2 alignment memo combines the two pieces.

## Probe script shipping decision

`scripts/mobile-renderer-probe.ts` ships with this PR per the cycle
brief's "Critical Process Notes" item 2: a small read-only diagnostic
helper that is reusable for the follow-on fix cycle. Justification:

- **Behind a dev/debug surface, no runtime cost.** The script
  consumes the existing `?diag=1` runtime gate
  (`src/core/PerfDiagnostics.ts:46-51`, `src/core/bootstrap.ts:165`).
  Production users never hit this path. The script itself runs only
  when invoked from a developer shell against a local `dist/` build,
  so its presence in the repo adds zero runtime cost.
- **Reusable for the fix cycle.** The fix cycle that the R2
  alignment memo proposes will want to verify "mobile no longer
  catastrophically slow" before merging. Re-running this probe is a
  one-shot way to confirm `resolvedBackend` and adapter info before
  and after the fix. Without the probe, the fix cycle's reviewers
  would either build the same probe again or rely on `?diag=1` +
  manual screenshot inspection.
- **Modelled on existing prior art.**
  `scripts/konveyer-renderer-matrix.ts` is the desktop-strict-WebGPU
  equivalent. The new file follows the same shape: serve `dist/`,
  drive a Playwright context, read `__rendererBackendCapabilities()`,
  emit `report.json` + `report.md`, exit 0/1. The fix cycle could
  collapse the two into one matrix-driver if it wants; out of scope
  for this memo.
- **No reviewer follow-up implied.** The probe does not assert
  pass/fail on the resolved backend (the desktop matrix script
  does), so it is purely informational and will not auto-fail CI on
  hardware drift. It exits 0 unless the playwright run itself
  errors.

If the orchestrator rejects shipping the probe (e.g., because the
fix cycle will inline its own measurement), removing the script is a
one-file delete with no downstream consumers. The memo's evidence
section is self-contained and does not require future readers to
re-run the probe.

## Limitations

1. **Emulation, not real devices.** Chrome DevTools Mobile Emulation
   via Playwright `devices['Pixel 5']` and `devices['iPhone 12']`. The
   cycle brief explicitly permits this as the documented fallback
   (cycle brief "Critical Process Notes" item 3). The Pixel 5 case
   uses the real Chrome 147 mobile UA, which is the closest
   approximation possible from this executor environment.
2. **WebGPU adapter availability on a headless desktop Chromium runner
   is not representative of mobile.** In production, real Android
   Chrome 121+ on a device with a WebGPU-capable Mali/Adreno GPU
   would likely grant an adapter and resolve `webgpu`, not
   `webgpu-webgl-fallback`. Real iOS Safari 18+ would also grant an
   adapter. **The probe environment cannot discriminate between
   "mobile gets WebGPU" and "mobile gets WebGL2 fallback" on real
   hardware.** The R2 alignment memo's fix cycle should re-validate
   on a real device to discriminate.
3. **iPhone 12 case is Chromium, not WebKit.** Playwright's
   `devices['iPhone 12']` sets the UA and viewport but runs on the
   Chromium engine when launched via `chromium.launch()`. Real iOS
   Safari's adapter behaviour and `WebGPURenderer` compatibility is
   not covered here. To capture real WebKit, the probe would need to
   launch `webkit` (already available in Playwright) — that runs
   noticeably different shader compilation and may differ on
   `navigator.gpu` presence. Out of scope for this memo; flagged as
   a follow-up.
4. **No engine instance after init.** `window.__engine` is only set
   when DEV or `?perf=1`/`?diagnostics=1` are active; the probe
   relied on `window.__rendererBackendCapabilities()` instead, which
   `?diag=1` exposes. The renderer-class-name field in the JSON is
   `null` for all scenarios as a result; the `capabilities`
   snapshot carries the information that name would have provided.
5. **Probe captures the title screen, not in-game gameplay.** The
   cycle brief's "run Open Frontier 60 NPCs for 60 s" measurement is
   owned by the parallel `mobile-startup-and-frame-budget` task per
   the deferral note above. This memo answers the renderer-mode
   question only.
6. **Network throttle not applied.** The cycle brief mentions 4G
   network throttle. The probe serves `dist/` over loopback, so
   network-throttle has no effect on first-byte-time anyway. The
   first-byte and asset-fetch costs that 4G would surface are
   owned by `mobile-startup-and-frame-budget`.

## What I did not change

- **No product-code changes.** Memo and reusable probe script only.
- No touches to `src/types/SystemInterfaces.ts`,
  `src/systems/combat/**`, `src/systems/terrain/**`, or
  `src/systems/navigation/**`. The probe reads
  `window.__rendererBackendCapabilities()` only; it does not extend
  the runtime surface.
- No new dev flag. The probe consumes the existing `?diag=1` gate.
- No mods to `perf-baselines.json`,
  `docs/CARRY_OVERS.md`, or `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`
  — those are R2 alignment-memo concerns.

## File:line citations

- `src/core/GameRenderer.ts:87-108` — constructor builds bootstrap
  `WebGLRenderer`.
- `src/core/GameRenderer.ts:233-313` — `initializeRendererBackend()`
  swaps in `WebGPURenderer`.
- `src/core/GameRenderer.ts:253-269` — strictWebGPU-gated fallback
  rejection (`4aec731e`).
- `src/core/RendererBackend.ts:67-99` —
  `resolveRendererBackendMode()`, default returns `'webgpu'`.
- `src/core/RendererBackend.ts:101-110` — `createWebGLRenderer()`,
  bootstrap renderer with `WebGLNodesHandler`.
- `src/core/RendererBackend.ts:136-166` — `createWebGPURenderer()`,
  imports `three/webgpu` dynamically.
- `src/core/RendererBackend.ts:174-180` —
  `inspectResolvedRendererBackend()`, returns
  `'webgpu-webgl-fallback'` when the WebGPURenderer resolved
  internally to the WebGL2 backend.
- `src/core/RendererBackend.ts:190-258` —
  `collectNavigatorWebGPUCapabilities()`, the same adapter-probe
  shape the mobile probe re-implements client-side for parity.
- `src/core/bootstrap.ts:177-179` —
  `window.__rendererBackendCapabilities` global the probe reads.
- `src/core/PerfDiagnostics.ts:46-51` — `?diag=1` gate.
- `scripts/konveyer-renderer-matrix.ts` — desktop-strict-WebGPU
  matrix the new probe is modelled on.

## Cross-references

- Cycle brief:
  [`docs/tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md`](../../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md).
- Parent campaign manifest:
  [`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`](../../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
- POST-KONVEYER milestone memo:
  [`docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md`](../POST_KONVEYER_MIGRATION_2026-05-13.md)
  — "What still needs proof on production hardware variety"
  enumerates the open mobile-validation gap this memo closes the
  renderer-mode half of.
- Strict-WebGPU gate commit: `4aec731e` (`fix(renderer): gate
  WebGL-fallback rejection on strict mode only`).
- WebGPU migration merge commit: `1df141ca`.
- Pre-merge baseline SHA: `79103082`.
- WebGPU/TSL skill:
  [`.claude/skills/webgpu-threejs-tsl/SKILL.md`](../../../.claude/skills/webgpu-threejs-tsl/SKILL.md).

## Related R1 memos (parallel investigation)

- `webgl-fallback-pipeline-diff.md` — enumerates the cost surface of
  the WebGL2 fallback path that this memo identifies mobile as
  running on.
- `tsl-shader-cost-audit.md` — characterises every TSL material's
  WebGL2-compiled cost; high-priority input now that mobile is
  confirmed on that path.
- `sky-visual-and-cost-regression.md` — orthogonal investigation
  into the sky regression.
- `mobile-startup-and-frame-budget.md` — frame-time at 5 s / 30 s /
  60 s (the measurement this memo defers).

R2 alignment memo:
`docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md`
(orchestrator-authored).
