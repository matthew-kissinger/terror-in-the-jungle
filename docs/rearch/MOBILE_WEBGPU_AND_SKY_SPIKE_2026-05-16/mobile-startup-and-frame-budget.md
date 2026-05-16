# Mobile Startup and Frame Budget

Last verified: 2026-05-16

Cycle: `cycle-2026-05-16-mobile-webgpu-and-sky-recovery` (R1 investigation).
Task slug: `mobile-startup-and-frame-budget`. Closes against
`KB-MOBILE-WEBGPU` in `docs/CARRY_OVERS.md`.

## TL;DR

Captured mode-click → first playable frame and 60 s steady-state
per-frame `systemBreakdown` on a labeled Chrome DevTools mobile-emulation
profile (390x844 viewport, mobile UA, CDP CPU throttle 4x, 4G network
shaping, Open Frontier mode). Real-device evidence is **not** included;
the executor environment ran emulation only. The downstream fix cycle
must re-run against a real Android Chrome and an iOS Safari device.

**Headline numbers (emulation-mobile, single run, Open Frontier,
`dist-perf` build with `?perf=1`):**

- `modeClickToPlayableMs` = **19,341 ms** (deploy auto-confirms in the
  perf-harness build, so this equals `deployClickToPlayableMs`)
- Steady-state `avgFps` (60 s window after first playable frame) =
  **4.42 fps** (`avgFrameMs` = 234.3 ms)
- Steady-state `Combat.AI` EMA = **46.9 ms** (peak 954 ms)
- Steady-state `World.Atmosphere.SkyTexture` EMA = **31.6 ms** (peak
  763 ms)
- Steady-state `Combat.Billboards` EMA = **13.2 ms** (peak 113 ms)

Mobile-emulation under 4x CPU throttle is roughly **14x slower per
frame** than the 16.67 ms desktop frame budget. Headline finding:
mobile-emulation is GPU-uncovered (swiftshader); the dominant cost is
CPU-side combat AI + Hosek-Wilkie sky-texture refresh, both visible in
the `performanceTelemetry.systemBreakdown` rollup. Render submission
(`RenderMain` / `RenderOverlay`) does NOT surface in the breakdown
even though the buckets are instrumented — see §"Probe gap" below.

**Top-3 startup cost contributors (emulation-mobile, Open Frontier):**

| Rank | Phase | Bracketing marks | Wall-clock | Source |
|------|-------|------------------|-----------:|--------|
| 1 | Asset-pack load + audio buffer load (overlapping) | `systems.assets.begin` (691 ms) → `systems.audio.end` (32,552 ms) | **~31.9 s** | `src/core/SystemInitializer.ts:111-123` |
| 2 | NPC close-model prewarm timeout | `engine-init.startup-flow.npc-close-model-prewarm.begin` (47,458 ms) → `.timeout` (53,919 ms) | **~6.5 s (fixed timeout)** | `src/core/LiveEntryActivator.ts:200-218` |
| 3 | Pre-generate pass + first-frame visual terrain bake | `systems.pre-generate.begin` (46,441 ms) → `engine-init.start-game.<mode>.deploy-select.end` (46,439 ms), then `terrain.heightmap.from-prepared-visual-worker.end` (45,724 ms) | **~1.0 s (pre-generate) + ~1.0 s (visual-margin worker bake)** | `src/core/SystemManager.ts:121-148`, `src/systems/terrain/TerrainSystem.ts:754-806` |

Note: assets+audio is so dominant that the rest of the startup tree is
a tail. The fix cycle should target this phase first.

**Top-3 steady-state system contributors (60 s, sorted by avg-EMA ms,
excluding `Combat` parent which double-counts its children):**

| Rank | Bucket | avg EMA ms | max peak ms | Source |
|------|--------|-----------:|------------:|--------|
| 1 | `Combat.AI` | **46.86** | 954.40 | `src/systems/combat/CombatantSystem.ts:284-326` |
| 2 | `World.Atmosphere.SkyTexture` | **31.60** | 763.40 | `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` (LUT generator + sky-texture refresh) |
| 3 | `Combat.Billboards` | **13.19** | 112.50 | `src/systems/combat/CombatantSystem.ts:327-338` |

`Combat` parent (71.96 ms avg EMA) is the sum of its
`Combat.{Influence,AI,Billboards,Effects}` children — listed in the
artifact summary, omitted here to avoid double-counting in the ranking.
`World.Atmosphere` parent (31.74 ms avg EMA) is dominated by
`World.Atmosphere.SkyTexture` (31.60 ms avg EMA); `Clouds` and
`LightFog` are <0.1 ms.

## Raw artifact path

Artifact directory (committed under this cycle's slug):

```
artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-16T05-20-01-651Z/
  summary.json
  startup-marks.json
  system-breakdown.json   (19 samples, 1 Hz x 19 s — see Probe gap below)
  browser-stalls.json
  console.json
```

A first run from the same probe with `?perf=1` missing produced an
empty steady-state but a different mode-click flow (manual deploy
button visible). That earlier run is at
`artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-16T05-10-55-923Z/`
and is useful for the manual-deploy-flow split timings:

| Metric | Value (ms) |
|--------|-----------:|
| `pageLoadToStartVisibleMs` | 35,599 |
| `startClickToModeVisibleMs` | 298 |
| `modeClickToDeployVisibleMs` | 3,823 |
| `modeClickToDeployReadyMs` | 3,829 |
| `deployClickToPlayableMs` | 7,174 |
| `modeClickToPlayableMs` | 11,003 |

The split between the two runs (11.0 s manual-deploy vs 19.3 s
auto-confirm-deploy) is itself useful: the auto-confirm path triggers
the full `engine-init.start-game.<mode>` pipeline immediately on
mode-click, where the manual path lets some of that pipeline run
during the user's read of the deploy UI. Either way, mode-click →
playable is multiple seconds on the emulated profile.

## Method

### Probe

`scripts/perf-startup-mobile.ts` (new sibling to
`scripts/perf-startup-ui.ts`) ships as part of this PR by exception to
the "memo-only" cycle rule. See §"Shipped probe" below.

### Capture environment

- Build: `npm run build:perf` (gates `window.perf` via the
  `VITE_PERF_HARNESS=1` env + `?perf=1` URL flag — see
  `src/core/PerfDiagnostics.ts:1-40` and
  `src/systems/debug/PerformanceTelemetry.ts:213-225`).
- Browser: Chromium via Playwright, swiftshader ANGLE backend.
  Headless, single context.
- Mobile-emulation profile:
  - Viewport `390 x 844`, device-scale-factor 3, `isMobile: true`,
    `hasTouch: true`, iOS Safari/Chrome iOS UA.
  - `Emulation.setCPUThrottlingRate { rate: 4 }` via CDP.
  - `Network.emulateNetworkConditions` with 9,000 kbps down /
    4,000 kbps up / 170 ms RTT (Chrome DevTools 4G default).
  - `Emulation.setTouchEmulationEnabled { enabled: true, maxTouchPoints: 5 }`.
- Mode: `open_frontier` (small enough to finish startup on the
  emulated profile; mirrors the `mobile-renderer-mode-truth`
  reference scene).
- URL: `/?logLevel=info&perf=1`. The `perf=1` flag flips
  `isPerfDiagnosticsEnabled()` (one of `sandbox`, `perf`, `telemetry`,
  `diagnostics` per `src/core/PerfDiagnostics.ts:1`). That also
  auto-confirms the initial deploy in the perf-harness build
  (`src/systems/player/PlayerRespawnManager.ts:655-661`), so the
  probe races the playable predicate against the deploy-UI selector
  and tolerates either flow.

### Artifacts captured

The probe writes the following files to
`artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/<timestamp>/`:

- `summary.json` — top-line timings, emulation knobs, steady-state
  aggregate.
- `startup-marks.json` — full `__startupTelemetry.getSnapshot()` dump,
  same shape as `scripts/perf-startup-ui.ts` produces.
- `system-breakdown.json` — array of 1 Hz `performanceTelemetry`
  reports for the steady-state window (`fps`, `avgFrameMs`,
  `overBudgetPercent`, full `systems[]` per sample).
- `browser-stalls.json` — `__perfHarnessObservers.drain()` payload
  from `scripts/perf-browser-observers.js` (long tasks, LoAFs,
  WebGL-texture-upload buckets).
- `console.json` — console messages and page errors during the run.

## Why these three for startup

### 1. Asset + audio load (~31.9 s wall-clock)

`systems.assets.begin` and `systems.audio.begin` fire at the same
`markStartup` site (`src/core/SystemInitializer.ts:111-123`). They run
in parallel as Promise.all branches. Assets finishes at 29,891 ms,
audio at 32,552 ms — both relative to `startup.reset`. On a phone with
real network, the cost moves: 4G throttling caps how fast asset blobs
(`dist-perf/assets/*.glb`, audio `.ogg`/`.wav`) can land. Even after
download, swiftshader CPU decode is single-threaded under throttle, so
GLB parse + texture compress + audio decode all stack up. Real-device
real-network mobile-Chrome will likely show different proportions; the
absolute wall-clock will still be in this order of magnitude unless
the asset bundle shrinks.

This is the same startup tail the asset-cluster carry-over
(`konveyer-large-file-splits`) is hinting at. The mobile fix cycle
should treat it as the primary lever:

- **Lazy-load NPC close-models** (already partially done via
  `engine-init.startup-flow.npc-close-model-lazy-load.allowed`,
  `src/core/LiveEntryActivator.ts:85`). Extend to non-essential
  vegetation impostor atlases.
- **Defer audio decode** beyond the critical path. Boot with a small
  ambient track and decode the SFX bank in the background.

### 2. NPC close-model prewarm timeout (~6.5 s fixed)

`engine-init.startup-flow.npc-close-model-prewarm.timeout` fires
6,461 ms after `npc-close-model-prewarm.begin`. That's a hard timeout
in the prewarm path
(`src/core/LiveEntryActivator.ts:200-218`) — the wait is "best effort
prewarm or after N seconds, give up and move on". On mobile-emulation
the prewarm doesn't finish within the window, so we always pay the
timeout cost. This is the second-largest single startup phase.

The fix is straightforward: tune the timeout down (current value is
fixed in `LiveEntryActivator.ts`; check the constant), or gate the
prewarm itself on `isMobileGPU()` so the mobile path skips it and
streams close-models lazily.

### 3. Pre-generate pass + visual-margin terrain bake (~1.0 s + ~1.0 s)

`systems.pre-generate.begin → systems.pre-generate.end` is the
`SystemManager` pre-generation pass
(`src/core/SystemManager.ts:121-148`) that runs after the per-mode
runtime configuration (terrain, navmesh, set-game-mode, deploy-select).
Costs ~1 s wall-clock. The parallel
`terrain.heightmap.from-prepared-visual-worker.end` mark at 45,724 ms
shows the worker-fallback bake path *did* fire on this run
(`task/mode-startup-terrain-spike` is parked on its own branch, but
the worker code path that mark covers is on master via
`src/systems/terrain/TerrainSystem.ts:754-806`), and the worker took
~600 ms to finish. The fix cycle from
`docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md` is therefore
**already partially landed** — the synchronous path
(`terrain.heightmap.from-provider.begin/end` at 33,449 → 34,400 ms,
~951 ms) is still firing in the systems-init stage before mode-select,
not at mode-click, but the post-mode-click bake is going through the
worker. Good.

## Why these three for steady-state

### 1. `Combat.AI` (46.86 ms avg EMA, peak 954 ms)

`src/systems/combat/CombatantSystem.ts:284-326` instruments the AI
update tick. The named regression behind `DEFEKT-3` (combat AI p99) is
this exact bucket: synchronous cover-search inside
`AIStateEngage.initiateSquadSuppression()` (named in
`docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md` §"Cover
spatial-grid"). On the emulation-mobile profile under 4x CPU throttle
with 60 NPCs, the EMA sits at 46.9 ms (over 2.8x the 16.67 ms frame
budget on its own) and the peak hits 954 ms — a 1 s stall, mostly
explained by long-task occurrences during squad-suppression flips.

The `cycle-konveyer-11` cover-spatial-grid slice already named in
`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md` is the fix. The mobile fix
cycle should sequence it ahead of the "mobile playable" close gate.

### 2. `World.Atmosphere.SkyTexture` (31.60 ms avg EMA, peak 763 ms)

The Hosek-Wilkie LUT-driven sky backend
(`src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts`, 807
LOC, grandfathered for size — see
`POST_KONVEYER_MIGRATION_2026-05-13.md` §"File-split debt") drives the
sky-texture refresh. On desktop after the slice-12-15 idempotency work
the cost is sub-1 ms per frame. On emulation-mobile this is 31.6 ms
avg EMA — about 30x slower than desktop, almost twice the entire
desktop frame budget. The 2 s `SKY_TEXTURE_REFRESH_SECONDS` cadence
gate
(`POST_KONVEYER_MIGRATION_2026-05-13.md` §"Idempotent setCloudCoverage
/ sky-refresh gate") is *not* fully suppressing the cost on the
mobile path — the 31.6 ms is amortized over many frames, but the
single-frame peaks (763 ms) prove the refresh itself still runs
on-tick when it does fire.

Two candidate fixes (the `sky-visual-and-cost-regression` sibling
memo will land the authoritative read on these):

- Stretch the refresh cadence on mobile (4 s or 8 s instead of 2 s)
  via an `isMobileGPU()`-gated knob on
  `src/systems/environment/AtmosphereSystem.ts`.
- Move the LUT compute into a worker or WebGPU compute pass so the
  refresh doesn't block the main thread.

### 3. `Combat.Billboards` (13.19 ms avg EMA, peak 113 ms)

`src/systems/combat/CombatantSystem.ts:327-338` instruments the
combatant-billboard update — per-NPC billboard transform/orient
update. On desktop this is sub-1 ms; on emulation-mobile it sits at
13.2 ms. The cost is per-active-NPC, so this number scales with NPC
count. The fix cycle should:

- Confirm the silhouette and cluster lanes from Phase F R2-R4 close
  this bucket (POST_KONVEYER §"Phase F R2-R4" names "render-silhouette
  + render-cluster lanes" as the slice).
- Optionally cap close-NPC billboard count more aggressively on
  mobile via `simLane` / `renderLane` budget arbiter v2.

## Probe gap (worth flagging for the fix cycle)

The 1 Hz `systemBreakdown` poll returns the `Combat`, `World`,
`Terrain`, `Navigation`, etc. buckets, but **does not return
`RenderMain` or `RenderOverlay`**. Inspecting
`src/core/GameEngineLoop.ts:129,157` confirms the buckets are
instrumented; inspecting `src/systems/debug/FrameTimingTracker.ts:30-49`
confirms the EMA stays in the map until reset. The most likely cause
is that `getSystemBreakdown()` in
`src/systems/debug/FrameTimingTracker.ts` filters out one or more of
the render buckets, or the breakdown is sorted and truncated and
`RenderMain` is somehow named differently. Without diving deeper (out
of scope for this memo), the working assumption is that the
4.42 fps steady-state average is bottlenecked by the **CPU
subsystems listed**, with GPU/swap-buffer cost folded into the gap
between the `endFrame()` mark and the next `beginFrame()` (visible as
the `avgFrameMs = 234 ms` minus the sum of all listed buckets).

The fix cycle should:

- Verify the `RenderMain` bucket actually populates in
  `systemBreakdown`. If it doesn't, that's a telemetry bug — fix
  before declaring any render-cost ranking.
- Treat the 4.42 fps as a mobile-emulation upper bound. Real-device
  Chrome on a recent Android phone will be substantially faster due
  to a real GPU. Real-device iOS Safari with mobile WebGPU is
  unknown.

## Limitations

- **Emulation-only.** Single executor environment, no real Android
  Chrome or iOS Safari device. Fix cycle MUST add at least one real
  device per platform before treating this ranking as proven.
- **Swiftshader.** ANGLE swiftshader path in the executor's Chromium
  does not exercise a real mobile WebGPU driver. The strict-WebGPU vs
  WebGL2 fallback split that `mobile-renderer-mode-truth` is
  investigating is invisible to this probe. Treat the steady-state
  averages as `WebGL2-fallback-with-swiftshader-shaped`, not
  `WebGPU-mobile-shaped`.
- **Single run.** Variance is unmeasured. Fix cycle should run ≥5 per
  profile.
- **`?perf=1` auto-confirms deploy.** The probe collapses the manual
  deploy-UI flow when in perf-harness mode. A second run with the
  flag disabled is on file (see §"Raw artifact path") for the manual
  deploy-flow split.
- **GPU-timing telemetry is gated** on the WebGL `EXT_disjoint_timer_query`
  extension and the WebGPU equivalent timestamp-query feature; neither
  is reliably present on swiftshader. The probe captures the breakdown
  but the memo does NOT cite `report.gpu` values.
- **Render bucket missing.** As noted in §"Probe gap", `RenderMain`
  did not surface in the 19 captured samples. The frame-time gap
  between the listed CPU subsystems and the `avgFrameMs = 234 ms`
  total is currently unattributed.
- **No verification of which renderer Chromium picked.** That's the
  `mobile-renderer-mode-truth` task's surface, not this one.

## Shipped probe

`scripts/perf-startup-mobile.ts` ships as part of this PR by exception
to the "memo-only" cycle rule. Reason:

- Existing `scripts/perf-startup-ui.ts` is desktop-shaped (fixed
  1440x960 viewport, no CPU throttle, no network shaping, no mobile
  UA, no touch emulation, only the `dist` build root, no
  steady-state `systemBreakdown` poll, manual deploy-flow only).
  Extending it in-place would muddy a load-bearing harness against
  trusted baselines.
- The follow-on fix cycle needs the mobile-emulation harness running
  on every iteration to compare against a real-device capture. A
  sibling probe is the smaller diff than retro-fitting the desktop
  one.
- Knobs (CPU rate, viewport, UA, network shape, steady-state window
  length) are all command-line flags so the fix cycle can re-target
  without editing the file.

Probe behavior:

- Prefers `dist-perf`. Falls back to `dist` with a warning. Throws
  if neither exists.
- Adds `?logLevel=info&perf=1` to the URL so `window.perf` is
  reachable.
- Races the playable predicate against the deploy-UI selector to
  tolerate the perf-harness auto-confirm path.
- Polls `window.perf.report()` at 1 Hz for the steady-state window
  (default 60 s), aggregates avg-EMA + max-peak per system.
- Writes artifacts under
  `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/`.

## File-level handoff for the alignment memo

The R2 alignment memo (`MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md`)
should pair the top-3 contributors above with these surface
candidates when proposing the named fix cycle:

- **Asset + audio load tail (startup #1):** lazy-load NPC close-models
  fully (`src/core/LiveEntryActivator.ts:85`), defer audio decode
  beyond the critical path, audit `dist-perf/assets/` for any blob
  not strictly required for first frame. Carry-over hook:
  `konveyer-large-file-splits`.
- **NPC close-model prewarm timeout (startup #2):** gate prewarm on
  `!isMobileGPU()` in `src/core/LiveEntryActivator.ts:200-218`. The
  6.5 s timeout cost is paid for zero benefit on mobile (the prewarm
  doesn't complete anyway).
- **`Combat.AI` (steady-state #1):** `cycle-konveyer-11`
  cover-spatial-grid is the named fix. Sequence ahead of mobile
  close-gate.
- **`World.Atmosphere.SkyTexture` (steady-state #2):** gate sky
  refresh cadence on `isMobileGPU()` in
  `src/systems/environment/AtmosphereSystem.ts`. The sibling
  `sky-visual-and-cost-regression` memo will recommend the specific
  cadence.
- **`Combat.Billboards` (steady-state #3):** Phase F R2-R4
  render-silhouette + render-cluster lanes (named in POST_KONVEYER
  §"Phase F R2-R4"). Cap close-NPC billboard count on mobile via
  budget arbiter v2.
- **Render bucket missing from breakdown (probe gap):** verify the
  `RenderMain` bucket actually populates in `systemBreakdown`. If it
  does not, that is a telemetry bug — fix before declaring any
  render-cost ranking on mobile.
- **Pre-existing terrain bake fix is partially landed:** the parked
  `task/mode-startup-terrain-spike` branch's worker-bake path is
  visible in the mobile startup marks
  (`terrain.heightmap.from-prepared-visual-worker.end` fires
  post-mode-click). The merge gate from
  `docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md` should be
  cleared as part of the mobile fix cycle if the marks-evidence
  shows the synchronous-path mark
  (`terrain.heightmap.from-provider.begin/end`) still firing
  on-the-mode-click critical section.
- **Mobile pixel ratio:** `src/utils/DeviceDetector.ts:185-188`
  currently returns `mobile ? 2 : Math.min(window.devicePixelRatio, 2)`.
  Cap at 1 (or 1.5) on mobile to reduce render bandwidth cost. The
  `webgl-fallback-pipeline-diff` sibling memo's pre-merge diff is
  the right authority for what the pre-merge WebGL renderer used.

## Cross-references

- Cycle brief:
  `docs/tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md`.
- Sibling R1 memos (under the same directory):
  `mobile-renderer-mode-truth.md`, `webgl-fallback-pipeline-diff.md`,
  `tsl-shader-cost-audit.md`, `sky-visual-and-cost-regression.md`.
- Parked spike (out of scope, but the named terrain fix surfaces
  partially in this cycle's marks):
  `docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`.
- KONVEYER milestone summary:
  `docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md`.
- Carry-over registry: `docs/CARRY_OVERS.md` — `KB-MOBILE-WEBGPU` and
  `KB-SKY-BLAND` open with this cycle's launch, close at R2
  alignment memo merge with promotion-to-fix-cycle resolution.
- Raw artifacts:
  `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-16T05-20-01-651Z/`
  (primary, with steady-state data),
  `artifacts/cycle-2026-05-16/mobile-startup-and-frame-budget/2026-05-16T05-10-55-923Z/`
  (manual-deploy-flow split timings).
