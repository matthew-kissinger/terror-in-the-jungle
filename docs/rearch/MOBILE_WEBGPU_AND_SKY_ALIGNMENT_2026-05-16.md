# Mobile WebGPU + Sky Recovery — Alignment Memo

Last verified: 2026-05-16

R2 deliverable for
[`cycle-2026-05-16-mobile-webgpu-and-sky-recovery`](../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md).
Orchestrator-authored synthesis of the five R1 investigation memos under
[`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/).
Closes `KB-MOBILE-WEBGPU` and `KB-SKY-BLAND` with promotion-to-fix-cycle
resolution.

## TL;DR — one picture of the regression

Two independent regressions, two named fix cycles.

**KB-MOBILE-WEBGPU** is a TSL-fragment-cost regression plus a startup
overhead regression. Mobile lands on the **WebGL2 backend of
`WebGPURenderer`** (not the classic `THREE.WebGLRenderer`). The
`strictWebGPU=false` gate (commit `4aec731e`) is the only reason mobile
boots at all — strict mode rejects the fallback with a fatal overlay.
Once running, mobile pays three things the pre-merge `WebGLRenderer`
path did not: (1) the bootstrap-renderer-then-dispose-and-swap dance
plus a dynamic `import('three/webgpu')` chunk, (2) TSL-translated GLSL
on every active material — with terrain in particular forcing **all 8
biome samplers per fragment** (~146 effective samples/fragment vs ~19
pre-merge — an 8x amplification rooted in a `mix(prev, sample, step(...))`
unroll of what used to be an `if`-branched chain), and (3) periodic
8192-texel CPU sky-LUT bakes and a synchronous cover-search in combat
AI (`DEFEKT-3`) that were already painful on desktop and become
unworkable under mobile CPU throttle. The fix cycle is
**`cycle-mobile-webgl2-fallback-fix`** below.

**KB-SKY-BLAND** is a **visual-fidelity** regression, not a perf
regression. The sky pass actually got *cheaper* on GPU post-merge (one
textured sphere vs. a per-fragment Preetham + 5-octave cloud fbm + HG
sun-disc), but the swap from `ShaderMaterial` to a 128×64 CPU-baked
`DataTexture` on `MeshBasicMaterial` cost ~3 orders of magnitude of
effective sky resolution. Four compounding losses produce the bland
look: under-resolved LUT, HDR clamp to `[0,1]` at bake time, missing
`toneMapped: false` routing the dome through `ACESFilmicToneMapping`
that the pre-merge GLSL deliberately bypassed, and a sun-disc lerped
into a peak-normalised color (no HDR pearl). The fix cycle is
**`cycle-sky-visual-restore`** below; small enough to lead.

The two cycles are independent — no DAG edge between them. The
recommended sequencing is `sky-visual-restore` first (small, visual,
unblocks owner playtest acceptance) then `mobile-webgl2-fallback-fix`
(larger, requires real-device evidence to merge).

## R1 perf-taint caveat (carried verbatim)

> PRs #203 and #206 ran wall-clock perf captures (Playwright +
> emulated mobile; CPU 4x throttle + 4G network throttle) on the host
> machine while the other R1 worktrees were concurrent. The
> qualitative ordering (Combat.AI > Sky > Billboards; renderer mode =
> WebGL2 fallback) is robust; the magnitudes (Combat.AI 954 ms peak,
> 31.9 s asset load, 4.42 fps steady-state, the 5/30/60 s frame-time
> samples in #203) are host-contended and must be marked
> "directionally indicative; fix cycle re-captures on real device" in
> the R2 alignment memo. The structural findings from #204, #205, #207
> are not affected (static analysis + visual capture).

Both fix cycles below treat the wall-clock numbers as priors for
ranking, and require re-capture on a real Android Chrome device and a
real iOS Safari device as the merge gate (not as scoping evidence).
The structural findings — renderer mode, TSL sampler counts, sky bake
shape, pre-merge GLSL diff, paired sky screenshots — are accepted as
proven inputs to fix-cycle scoping.

## Synthesis of the five R1 memos

### What mobile actually runs

[`mobile-renderer-mode-truth.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-renderer-mode-truth.md)
proved with adapter-info evidence (Pixel 5 emulation + iPhone 12
emulation, both with `navigator.gpu` present + `requestAdapter()`
returning `null`) that production-default mobile lands at
`capabilities.resolvedBackend === "webgpu-webgl-fallback"` —
`WebGPURenderer` from `three/webgpu` constructed, with Three's internal
`WebGLBackend` engaged because no adapter was granted. The
`strictWebGPU` gate at [`GameRenderer.ts:253-269`](../../src/core/GameRenderer.ts)
(commit `4aec731e`) catches the fallback and rejects only in
explicit-strict mode; default mode silently accepts. The
explicit `?renderer=webgl` escape hatch still works and resolves
`backend === "webgl"` — useful A/B target for the fix cycle.

The renderer-mode hard-stop named in the cycle brief did NOT trigger.
The cost surface is **hypothesis (c)**: WebGL2 fallback engaged but
heavier than the pre-migration `WebGLRenderer` path. Native-WebGPU on
mobile is not the cost surface in any captured environment.

**Limitation that the fix cycle inherits:** the probe ran on
Playwright Chromium with swiftshader. Real Android Chrome 121+ on a
WebGPU-capable Mali/Adreno GPU may grant an adapter and resolve
`webgpu`. Real iOS Safari 18+ may also grant. The fix cycle's real-
device validation MUST discriminate "mobile gets WebGPU" vs "mobile
gets WebGL2 fallback" before declaring any renderer-architecture
claim.

### What the WebGL2 fallback pipeline costs

[`webgl-fallback-pipeline-diff.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md)
enumerated eight pipeline elements that are new in the post-merge
WebGL2-fallback path vs the pre-merge classic-`WebGLRenderer` path.
Three matter most:

1. **Renderer construction overhead** — a throwaway `WebGLRenderer` is
   built and disposed at every boot; the canvas is replaced and
   re-attached; `import('three/webgpu')` adds a large JS chunk parsed
   before the WebGPU adapter probe even runs (which itself must time
   out on a mobile browser without an adapter before the fallback
   fires). Cited at
   [`GameRenderer.ts:99,247,250,272-278`](../../src/core/GameRenderer.ts)
   and
   [`RendererBackend.ts:101-110,136-166`](../../src/core/RendererBackend.ts).
2. **`MeshStandardNodeMaterial` terrain via WebGPURenderer's WebGL2
   backend** — replaces `MeshStandardMaterial + onBeforeCompile` from
   pre-merge. Compiled GLSL is emitted by the TSL→WebGL node generator,
   not Three's hand-tuned `ShaderLib`. Cited at
   [`TerrainMaterial.ts:639`](../../src/systems/terrain/TerrainMaterial.ts).
3. **CPU-baked sky `DataTexture` refresh** — 8192-texel loop every
   2 s, EMA ~5 ms on desktop, plausibly 15-30 ms on a thermal-throttled
   phone. Cited at
   [`HosekWilkieSkyBackend.ts:436-525`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts).

The fix cycle should treat all three as targets. Items 4-8 (NPC
impostor TSL, vegetation billboard TSL, atmosphere radiance compressor,
muzzle flash, water — water is actually a **win** for mobile) are
honourable mentions, not top priorities.

### What the TSL materials actually compile to

[`tsl-shader-cost-audit.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md)
audited every production TSL material. There are **three** —
`TerrainMaterial` (`MeshStandardNodeMaterial`), the NPC Pixel Forge
impostor (`MeshBasicNodeMaterial`), and the vegetation billboard
(`MeshBasicNodeMaterial`). Sky is **not** TSL (clarification carried
into the fix-cycle scope: `KB-SKY-BLAND` is not a TSL-fragment-shader
issue).

Per-fragment cost ranking, worst first:

1. **Terrain ~146 effective samples/fragment** (8 biome samplers all
   evaluated unconditionally × triplanar × anti-tile rotation) vs ~19
   pre-merge. Pre-merge used `if (biomeSlot < 0.5) return ...; else if
   ...` chains the driver could short-circuit; post-merge uses
   `mix(prev, sample, step(N-0.5, biomeSlot))` unrolled across all 8
   samplers. Cited at
   [`TerrainMaterial.ts:275-286`](../../src/systems/terrain/TerrainMaterial.ts).
   Triplanar branches are dead weight on flat terrain (Open Frontier
   flat, A Shau valley floors) but the GPU still evaluates all six
   triplanar calls and multiplies their contributions by zero — the
   driver does not dead-code-eliminate because the samples are on the
   active TSL graph. **Floor amplification 8x; ceiling unknown** (depends
   on whether mobile drivers serialize dynamic-branched texture fetches
   in the pre-merge path).
2. **NPC impostor ~10-15% per-fragment regression**, dominated by
   unconditional dual-path fog/atmosphere math (post-merge always
   evaluates both exp and linear fog regardless of mode select). Cited
   at [`CombatantMeshFactory.ts:394`](../../src/systems/combat/CombatantMeshFactory.ts).
   Overdraw count is the binding constraint, not per-fragment depth.
3. **Vegetation billboard ~15-20% per-fragment regression**, same
   pattern (unconditional fog + dual-lighting-mode eval). Cited at
   [`BillboardNodeMaterial.ts:168`](../../src/systems/world/billboard/BillboardNodeMaterial.ts).
   Same overdraw caveat.

The terrain finding is the strongest TSL-cost signal in the audit and
the highest-leverage fix candidate.

### Why the sky looks bland

[`sky-visual-and-cost-regression.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md)
shipped paired pre/post screenshots across all five scenarios
(committed under
[`MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/))
and identified four compounding visual losses:

1. **Texture resolution drop** — 128×64 = 8192 texels stretched across
   ~1920 horizontal pixels = ~15 screen pixels per texel.
   `SKY_TEXTURE_WIDTH = 128`, `SKY_TEXTURE_HEIGHT = 64` at
   [`HosekWilkieSkyBackend.ts:9-10`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts).
2. **HDR clamp at bake time** — `evaluateAnalytic` clamps radiance to
   `[0, 8]` and `refreshSkyTexture` then sqrt-gamma encodes into a
   `Uint8Array` with `clamp01` (snips at 1.0). Cited at
   [`HosekWilkieSkyBackend.ts:512-515,801-805`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts).
   Entire HDR headroom destroyed before sRGB encode.
3. **Missing `toneMapped: false`** — the post-merge `MeshBasicMaterial`
   inherits the default `toneMapped: true`, so the renderer's
   `ACESFilmicToneMapping`
   ([`GameRenderer.ts:145`](../../src/core/GameRenderer.ts)) processes
   the dome each frame. ACES on already-LDR input desaturates and pulls
   to middle grey — exactly the look in the post-merge captures. The
   pre-merge GLSL deliberately bypassed tonemapping (comment block at
   `git show 79103082:src/systems/environment/atmosphere/hosekWilkie.glsl.ts:16-20`).
4. **Sun-disc HDR pearl gone** — pre-merge integrated
   `vSunE * 19000.0 * Fex` per fragment with no tonemap. Post-merge
   lerps a peak-normalised color into the sky LUT at bake time. Cited
   at
   [`HosekWilkieSkyBackend.ts:548-556,655-657`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts).

Cost analysis: post-merge sky is ~10x cheaper on GPU, modestly more
expensive on CPU (8192-texel bake every 2 s). The trade is fine on
desktop. On mobile the trade is mixed (the periodic CPU burst is
visible as a steady-state cost in the mobile breakdown — see below).
**The regression is overwhelmingly visual, not perf.**

### What the mobile frame budget actually looks like

[`mobile-startup-and-frame-budget.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md)
captured the mode-click → first playable frame and 60 s steady-state
breakdown under labeled Chrome DevTools mobile-emulation (390×844,
mobile UA, CDP CPU throttle 4x, 4G network throttle, Open Frontier
mode, perf-harness `dist-perf` build).

Magnitudes are **host-contended** per the perf-taint caveat above; the
ordering is robust.

**Startup, mode-click → playable:** ~19.3 s on the auto-confirm-deploy
flow, ~11.0 s on the manual-deploy flow. Top contributors:

1. Asset-pack + audio load (overlapping) — **~31.9 s wall-clock** to
   `systems.audio.end`. Cited at
   [`SystemInitializer.ts:111-123`](../../src/core/SystemInitializer.ts).
2. NPC close-model prewarm timeout — **6.5 s fixed** (prewarm doesn't
   complete on mobile-emulation; the timeout always fires). Cited at
   [`LiveEntryActivator.ts:200-218`](../../src/core/LiveEntryActivator.ts).
3. Pre-generate pass + visual-margin terrain bake — **~2.0 s combined**.
   Cited at
   [`SystemManager.ts:121-148`](../../src/core/SystemManager.ts) and
   [`TerrainSystem.ts:754-806`](../../src/systems/terrain/TerrainSystem.ts).
   The worker-bake path from
   [`task/mode-startup-terrain-spike`](../../docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md)
   is firing post-mode-click (the worker mark surfaces in the capture);
   the synchronous-bake path still fires in systems-init before mode
   select.

**Steady-state, 60 s window:** **4.42 fps / 234 ms per frame** under
4x CPU throttle. Top per-frame buckets:

1. `Combat.AI` — **46.86 ms avg EMA, peak 954 ms**. This is
   `DEFEKT-3` manifesting on mobile (synchronous cover-search in
   `AIStateEngage.initiateSquadSuppression`). Cited at
   [`CombatantSystem.ts:284-326`](../../src/systems/combat/CombatantSystem.ts).
2. `World.Atmosphere.SkyTexture` — **31.60 ms avg EMA, peak 763 ms**.
   The 8192-texel CPU bake at the 2 s cadence, amortized over many
   frames in the average but visible as multi-hundred-ms single-frame
   peaks.
3. `Combat.Billboards` — **13.19 ms avg EMA, peak 113 ms**. Cited at
   [`CombatantSystem.ts:327-338`](../../src/systems/combat/CombatantSystem.ts).

**Probe gap surfaced for the fix cycle:** `RenderMain` /
`RenderOverlay` buckets did NOT surface in the breakdown despite being
instrumented. The frame-time gap between the listed CPU subsystems and
the 234 ms total is currently unattributed. The fix cycle MUST verify
this populates before declaring any render-cost ranking on mobile.

## Fix candidates, ranked

Pulled from the recommendations sections of the five R1 memos. Ranked
by impact × effort, low-effort first.

### Sky-visual fix candidates (KB-SKY-BLAND)

| # | Action | File:line | Effort | Impact |
|---|--------|-----------|--------|--------|
| 1 | Set `toneMapped: false` on the dome `MeshBasicMaterial` | [`HosekWilkieSkyBackend.ts:207-214`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) | one-line | restores pre-merge color handling on dome (ACES no longer desaturates) |
| 2 | Bump LUT resolution to 256×128 or 512×256 | [`HosekWilkieSkyBackend.ts:9-10`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) (constants), `:67-79` (texture creation) | two-line constant + verify bake cost (use the existing `getRefreshStatsForDebug` at `:533-540`) | restores visible sun placement + horizon ring |
| 3 | Stop clamping radiance to `[0,1]` at bake time. Either upload `THREE.FloatType` / `THREE.HalfFloatType`, or encode a fixed exposure curve that preserves sun spike | [`HosekWilkieSkyBackend.ts:512-515,801-805`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) | moderate (float texture changes upload path; exposure curve is in-place) | restores noon-blue saturation + headroom for sun |
| 4 | Restore HDR sun disc. Easiest: drop a small additive sprite/2-tri quad at the sun direction with its own tonemap-bypassed shader | new file, `AtmosphereSystem.ts` integration | small | restores visible pearl without re-introducing per-fragment shader on full dome |
| 5 | Leave 2 s refresh cadence as-is | — | n/a | not the cause; do not touch |

### Mobile-WebGL2-fallback fix candidates (KB-MOBILE-WEBGPU)

| # | Action | File:line | Effort | Impact |
|---|--------|-----------|--------|--------|
| 1 | Restore early-out biome sampling in TSL terrain. Replace `mix(prev, sample, step(...))` unroll with TSL `If/ElseIf` chain | [`TerrainMaterial.ts:275-286`](../../src/systems/terrain/TerrainMaterial.ts) | small (TSL `If` exists, see `.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md`) | **~6-8x reduction in terrain-fragment texture fetches** in common case |
| 2 | Gate triplanar sampling on `triplanarBlend > epsilon` via TSL `If` | [`TerrainMaterial.ts:541-565`](../../src/systems/terrain/TerrainMaterial.ts) | small | skips 48 samples/fragment on flat surfaces (Open Frontier, A Shau valley) |
| 3 | Gate hydrology / rock-accent / feature-surface paths on their masks | [`TerrainMaterial.ts:397,559-565`](../../src/systems/terrain/TerrainMaterial.ts) | small | recovers ~16 samples (rock) + feature-surface ALU chain |
| 4 | Cap mobile pixel ratio at 1 or 1.5 | [`DeviceDetector.ts:185-188`](../../src/utils/DeviceDetector.ts) | one-line | reduces render bandwidth proportionally |
| 5 | Gate NPC close-model prewarm on `!isMobileGPU()` | [`LiveEntryActivator.ts:200-218`](../../src/core/LiveEntryActivator.ts) | small | removes the **6.5 s fixed timeout** from mobile startup |
| 6 | Gate sky refresh cadence on `isMobileGPU()` (e.g. 4 s or 8 s instead of 2 s) | [`AtmosphereSystem.ts`](../../src/systems/environment/AtmosphereSystem.ts), [`HosekWilkieSkyBackend.ts:26`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts) | small | reduces 31.6 ms avg-EMA mobile sky cost on the WebGL2-fallback path |
| 7 | Fix `RenderMain` / `RenderOverlay` not surfacing in `systemBreakdown` | [`FrameTimingTracker.ts:30-49`](../../src/systems/debug/FrameTimingTracker.ts), [`GameEngineLoop.ts:129,157`](../../src/core/GameEngineLoop.ts) | small | telemetry bug; gate for any render-cost claim |
| 8 | Defer audio decode beyond critical path; lazy-load non-essential vegetation impostor atlases | [`SystemInitializer.ts:111-123`](../../src/core/SystemInitializer.ts) | medium | reduces asset-load tail (current ~31.9 s on emulation) |
| 9 | Compile-cost probe: Playwright probe under `scripts/perf-tsl-shader-cost.ts` running `renderer.compileAsync` against production scenes in `webgpu-force-webgl` mode | new script | medium | regression gate for the TSL fragment count changes from items 1-3 |
| 10 | Build a real-device validation harness (Android Chrome + iOS Safari) | new probe or extend `scripts/mobile-renderer-probe.ts` | medium | **merge gate** for the cycle |

Items 1-3 (terrain TSL early-outs) are the load-bearing fix. Items 4-6
are mobile-specific knobs. Items 7-9 are infrastructure for the cycle.
Item 10 is the merge gate.

**Sequencing call for the mobile fix cycle:** the
`cycle-konveyer-11-spatial-grid-compute` already queued in
[`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
closes `DEFEKT-3` (the `Combat.AI` 46.86 ms / 954 ms peak on mobile).
The owner can choose to sequence `cycle-konveyer-11-spatial-grid-compute`
ahead of `cycle-mobile-webgl2-fallback-fix` (closes the steady-state #1
bucket independently) or run them in parallel since they touch
disjoint code paths.

## Named fix cycles (queued in campaign manifest)

Both queued at the top of
[`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`](../CAMPAIGN_2026-05-13-POST-WEBGPU.md)
ahead of `cycle-vekhikl-1-jeep-drivable`. Owner picks ordering at
next `/orchestrate` dispatch.

### `cycle-sky-visual-restore`

Restore the pre-merge sky visual fidelity (saturated horizon, visible
sun pearl, deep noon blue) without re-introducing the per-fragment
Preetham shader on the full dome.

- **Closes:** KB-SKY-BLAND.
- **Files touched (expected):**
  [`HosekWilkieSkyBackend.ts`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts)
  primarily; possibly
  [`AtmosphereSystem.ts`](../../src/systems/environment/AtmosphereSystem.ts)
  for the sun-disc sprite integration.
- **Round structure (proposed):** single round, 2-3 tasks.
  - `sky-dome-tonemap-and-lut-resolution` — set `toneMapped: false`,
    bump `SKY_TEXTURE_WIDTH/HEIGHT` to ≥256×128, measure refresh cost
    via existing `getRefreshStatsForDebug`.
  - `sky-hdr-bake-restore` — stop clamping radiance to `[0,1]` at
    bake time; upload as `HalfFloatType` (or encoded exposure curve).
  - `sky-sun-disc-restore` — add additive HDR sun-disc sprite (or
    composite at downstream stage) so the pearl returns.
- **Acceptance:** owner-playtest sign-off against the paired
  pre/post screenshots in
  [`MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/img/).
  Plus: no perf regression > 5% p99 on `combat120`.
- **Out of scope:** re-introducing per-cloud highlight/shadow math;
  re-introducing the `CloudLayer` plane; switching to a real
  Hosek-Wilkie coefficient pipeline.

### `cycle-mobile-webgl2-fallback-fix`

Restore mobile playability on the WebGL2-fallback path. Lead with the
terrain TSL early-out (biggest per-fragment lever), then the mobile-
specific knobs, then validate on real devices.

- **Closes:** KB-MOBILE-WEBGPU.
- **Files touched (expected):**
  [`TerrainMaterial.ts`](../../src/systems/terrain/TerrainMaterial.ts)
  primarily (terrain TSL early-outs);
  [`DeviceDetector.ts`](../../src/utils/DeviceDetector.ts) (mobile
  pixel-ratio cap);
  [`LiveEntryActivator.ts`](../../src/core/LiveEntryActivator.ts)
  (mobile-skip prewarm);
  [`AtmosphereSystem.ts`](../../src/systems/environment/AtmosphereSystem.ts) +
  [`HosekWilkieSkyBackend.ts`](../../src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts)
  (mobile-gated sky cadence);
  [`SystemInitializer.ts`](../../src/core/SystemInitializer.ts)
  (asset/audio defer);
  [`FrameTimingTracker.ts`](../../src/systems/debug/FrameTimingTracker.ts)
  (probe-gap fix); plus the new `scripts/perf-tsl-shader-cost.ts` and
  real-device validation harness.
- **Round structure (proposed):** 2-3 rounds, 6-8 tasks.
  - **R1 (foundation):** `terrain-tsl-biome-early-out`,
    `terrain-tsl-triplanar-gate`, `render-bucket-telemetry-fix`.
  - **R2 (mobile knobs):** `mobile-pixel-ratio-cap`,
    `mobile-skip-npc-prewarm`, `mobile-sky-cadence-gate`,
    `asset-audio-defer`.
  - **R3 (validation):** `tsl-shader-cost-probe`,
    `real-device-validation-harness`. Real-device sign-off on Android
    Chrome + iOS Safari is the merge gate.
- **Acceptance:**
  - Steady-state `avgFps` ≥ **20 fps** on the Pixel 5 emulation
    profile (up from 4.42 fps; emulation number is a directional target
    given the perf-taint caveat above).
  - Steady-state `avgFps` ≥ **30 fps** on a real Android Chrome
    device (target hardware: mid-tier 2022+ phone).
  - Owner-playtest "playable" sign-off on a real iOS Safari device.
  - No regression on desktop `combat120` perf baseline (>5% p99 is
    a hard stop per `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`).
  - `RenderMain` / `RenderOverlay` buckets populated in
    `systemBreakdown` on both desktop and mobile.
- **Sequencing dependency on `cycle-konveyer-11-spatial-grid-compute`:**
  optional. Closing `DEFEKT-3` removes the steady-state #1 bucket
  independently and may be sequenced ahead, in parallel, or after.
  The mobile fix cycle's acceptance criteria are formulated such that
  closing `DEFEKT-3` alongside accelerates the playable-fps gate but
  is not strictly required.
- **Hard stops (cycle-specific):**
  - Any TSL early-out rewrite that regresses the strict-WebGPU path
    on desktop. Strict-WebGPU evidence (per
    [`POST_KONVEYER_MIGRATION_2026-05-13.md`](POST_KONVEYER_MIGRATION_2026-05-13.md)
    and `KONVEYER_REVIEW_PACKET`) remains the renderer-architecture
    acceptance bar.
  - Real-device-validation infeasible. Cycle must produce real-device
    evidence; emulation-only is not acceptable as merge evidence (it
    is acceptable as scoping evidence per the perf-taint caveat).
- **Out of scope:**
  - Rolling back the WebGPU + TSL migration. The directional choice
    stands; the cycle is about making the WebGL2 fallback path
    playable, not replacing it.
  - Re-introducing the classic `THREE.WebGLRenderer` as the production
    renderer. The explicit `?renderer=webgl` escape hatch remains as
    an A/B target and a user-facing fallback, but production-default
    stays on `WebGPURenderer` per the post-WebGPU master posture.

## Carry-over closure

`KB-MOBILE-WEBGPU` and `KB-SKY-BLAND` close at the merge of this memo
with the resolution:

> Investigation complete; fix work tracked under
> `cycle-sky-visual-restore` (KB-SKY-BLAND) and
> `cycle-mobile-webgl2-fallback-fix` (KB-MOBILE-WEBGPU). Both queued
> at the top of
> [`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
> Alignment memo:
> [`docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md`](MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).
> Five R1 investigation memos under
> [`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/).

Active carry-over count delta: 11 → 9 (back to pre-cycle level). Net
cycle delta: 0. Cycle exits clean, no INCOMPLETE flag.

## What this memo deliberately does NOT do

- Ship a fix. No product code touched. Two fix cycles are named and
  scoped above; the fix work lands in those cycles, not this one.
- Refresh `perf-baselines.json`.
  `cycle-stabilizat-1-baselines-refresh` owns that.
- Absorb or repurpose `task/mode-startup-terrain-spike`. That branch
  remains parked per
  [`MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md`](MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).
  The `mobile-startup-and-frame-budget` capture confirms its
  worker-bake path is already firing post-mode-click; the synchronous
  pre-mode-select path is what `cycle-mode-startup-terrain-bake-hardening`
  in the campaign manifest still owns.
- Pre-judge the owner's sequencing between
  `cycle-sky-visual-restore`, `cycle-mobile-webgl2-fallback-fix`, and
  `cycle-konveyer-11-spatial-grid-compute`. The recommendation is
  sky-first (small, visual, unblocks playtest), mobile-next, but the
  owner picks at next `/orchestrate` dispatch.
- Touch fenced interfaces (`src/types/SystemInterfaces.ts`).
- Touch `src/systems/combat/**`, `src/systems/terrain/**`, or
  `src/systems/navigation/**`. The fix cycles explicitly do.

## References

- Cycle brief:
  [`docs/tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md`](../tasks/cycle-2026-05-16-mobile-webgpu-and-sky-recovery.md).
- R1 memos:
  - [`mobile-renderer-mode-truth.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-renderer-mode-truth.md)
  - [`webgl-fallback-pipeline-diff.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md)
  - [`tsl-shader-cost-audit.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md)
  - [`sky-visual-and-cost-regression.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/sky-visual-and-cost-regression.md)
  - [`mobile-startup-and-frame-budget.md`](MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md)
- Campaign manifest:
  [`docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
- Carry-over registry:
  [`docs/CARRY_OVERS.md`](../CARRY_OVERS.md).
- Post-KONVEYER milestone:
  [`docs/rearch/POST_KONVEYER_MIGRATION_2026-05-13.md`](POST_KONVEYER_MIGRATION_2026-05-13.md).
- WebGPU + TSL skill:
  [`.claude/skills/webgpu-threejs-tsl/SKILL.md`](../../.claude/skills/webgpu-threejs-tsl/SKILL.md).
- Strict-WebGPU fallback gate: commit `4aec731e`.
- WebGPU migration merge: commit `1df141ca`.
- Pre-merge baseline SHA: `79103082`.
