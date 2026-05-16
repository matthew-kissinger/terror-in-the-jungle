# Cycle: Mobile WebGL2 Fallback Fix

Last verified: 2026-05-16

## Status

Queued at position #2 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](../CAMPAIGN_2026-05-13-POST-WEBGPU.md).
Closes `KB-MOBILE-WEBGPU` (already moved to Closed in
`docs/CARRY_OVERS.md`; this cycle ships the fix).

## Skip-confirm: no

Wait-for-go from the owner after R1 lands. The R3 real-device
validation step requires the owner to attach a phone (or arrange
remote-debug) — the orchestrator can't dispatch that round without
owner involvement.

## Concurrency cap: 5

R1 ships up to 3 parallel tasks; R2 up to 4; R3 is sequential.

## Objective

Restore mobile playability on the WebGL2-fallback path of
`WebGPURenderer`. Lead with the terrain TSL early-out (biggest
per-fragment lever per the R1 audit), then the mobile-specific knobs,
then validate on real devices.

Source memo:
[docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md).

Mobile lands on `resolvedBackend === "webgpu-webgl-fallback"` —
WebGPURenderer's internal WebGL2 backend, not classic
`THREE.WebGLRenderer`. The terrain TSL biome-sampler chain unrolled
into `mix(prev, sample, step(...))` forces all 8 biome samplers per
fragment → ~146 effective samples/fragment vs ~19 pre-merge (8x
amplification). This is the load-bearing fix; the mobile-specific
knobs and probe-gap fix are supporting work.

## Branch

- Per-task branches: `task/<slug>`.
- Final integration: orchestrator merges in dispatch order with
  rebase-merges.

## Required Reading

1. [docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md](../rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md)
   — R2 alignment memo with full fix-candidate ranking.
2. [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/tsl-shader-cost-audit.md)
   — terrain TSL sampler-count audit.
3. [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/webgl-fallback-pipeline-diff.md)
   — eight pipeline elements new in post-merge WebGL2 path.
4. [docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md](../rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md)
   — startup + steady-state contributors + probe-gap.
5. [.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md](../../.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md)
   — TSL `If/ElseIf` reference for the terrain early-out.
6. `src/systems/terrain/TerrainMaterial.ts:275-286` — the unrolled
   biome sampler chain (primary fix target).
7. `src/utils/DeviceDetector.ts:185-188` — mobile pixel-ratio
   site.
8. `src/core/LiveEntryActivator.ts:200-218` — NPC close-model
   prewarm timeout.
9. `src/systems/debug/FrameTimingTracker.ts:30-49` —
   `getSystemBreakdown` probe-gap site.
10. `src/core/SystemInitializer.ts:111-123` — asset+audio load tail.
11. `scripts/mobile-renderer-probe.ts` — existing reusable probe
    (shipped by `mobile-renderer-mode-truth` R1).

## Critical Process Notes

1. **Strict-WebGPU desktop evidence is mandatory.** Any TSL early-out
   rewrite must capture strict-WebGPU evidence (no fallback) on
   desktop to prove no regression on the production-default path.
   The mobile WebGL2 fallback is where the win lands, but the
   strict-WebGPU path is the acceptance bar (per campaign hard
   stop).
2. **Real-device validation is the merge gate.** R3's
   `real-device-validation-harness` task is the merge gate for the
   whole cycle. Emulation-only is acceptable as scoping evidence
   (R1 + R2); it is NOT acceptable as merge evidence.
3. **Owner playtest required.** The cycle marks "Playtest
   recommended" — the owner attaches an Android Chrome device and an
   iOS Safari device for the R3 capture. Emulator-only sign-off is
   not acceptance.
4. **No perf-baseline refresh.** Cycle #12 owns that.
5. **The `?renderer=webgl` escape hatch must keep working.** Don't
   break the explicit-WebGL path while fixing the WebGL2-fallback
   path; the escape hatch is the A/B target.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `terrain-tsl-biome-early-out`, `terrain-tsl-triplanar-gate`, `render-bucket-telemetry-fix` | 3 | Foundation. Biome early-out is the load-bearing fix; triplanar gate compounds; telemetry fix unblocks fix-cycle measurement. |
| 2 | `mobile-pixel-ratio-cap`, `mobile-skip-npc-prewarm`, `mobile-sky-cadence-gate`, `asset-audio-defer` | 4 | Mobile-specific knobs. Independent of each other; merge in cap-allowed order. |
| 3 | `tsl-shader-cost-probe`, `real-device-validation-harness` | 2 | Validation. Probe first (regression gate), then real-device capture. R3 sequential; orchestrator pauses for owner to attach devices. |

## Task Scope

### terrain-tsl-biome-early-out (R1, load-bearing)

Replace the `mix(prev, sample, step(N-0.5, biomeSlot))` unroll in
`sampleBiomeTextureRaw` with a TSL `If/ElseIf` chain so the compiled
WebGL2 fragment can early-out on the chosen biome.

**Files touched:**
- `src/systems/terrain/TerrainMaterial.ts` (`:275-286`
  `sampleBiomeTextureRaw`; possibly the `sampleBiomeTexture` wrapper
  at `:268-274` for parity).

**Method:**
1. Read `.claude/skills/webgpu-threejs-tsl/docs/core-concepts.md` on
   `If/ElseIf` node usage (referenced in TSL skill).
2. Rewrite `sampleBiomeTextureRaw` to use `If(biomeSlot.equal(0))
   ... .ElseIf(biomeSlot.equal(1)) ... ...` chain over the 8 biome
   samplers.
3. Verify the compiled WebGL2 GLSL via `renderer.compileAsync` (use
   `scripts/perf-tsl-shader-cost.ts` from R3 if it ships first, else
   inline probe in this PR — drop the probe before merge).
4. Capture strict-WebGPU desktop screenshot + WebGL2-fallback
   screenshot at Open Frontier noon + A Shau dawn to prove visual
   parity.
5. Commit message: `perf(terrain): TSL If/ElseIf early-out for biome sampler chain (terrain-tsl-biome-early-out)`.

**Acceptance:**
- `npm run lint`, `npm run test:run`, `npm run build` all green.
- Strict-WebGPU desktop screenshot matches pre-cycle visual.
- WebGL2-fallback emulation perf: terrain-fragment time drops by
  ≥4x vs cycle-start emulation baseline (target: 8x; floor: 4x).
  Use `scripts/perf-startup-mobile.ts` 60-s steady-state capture.
- terrain-nav-reviewer APPROVE (this touches
  `src/systems/terrain/**`).

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

### terrain-tsl-triplanar-gate (R1)

Gate triplanar sampling on `triplanarBlend > epsilon` via a TSL `If`
node. Triplanar branches are dead weight on flat terrain (Open
Frontier flat, A Shau valley floors) but the GPU still evaluates all
six triplanar calls under the unrolled `mix` pattern.

**Files touched:**
- `src/systems/terrain/TerrainMaterial.ts` (`:541-565` primary +
  secondary triplanar paths).

**Method:**
1. Wrap the triplanar sample sub-graph in
   `If(triplanarBlend.greaterThan(0.001))` (or whatever epsilon
   matches the existing `smoothstep` clip).
2. The flat-side path returns the planar-only sample; the triplanar
   side stays as-is.
3. Verify on a flat-terrain scene (Open Frontier midday) that the
   compiled fragment skips triplanar samples.
4. Commit message: `perf(terrain): TSL If gate on triplanar sample sub-graph (terrain-tsl-triplanar-gate)`.

**Acceptance:**
- Tests + build green.
- Open Frontier flat-terrain emulation perf: terrain-fragment time
  drops by an additional ≥30% on top of `terrain-tsl-biome-early-out`.
- A Shau triplanar scenes: no perf regression (triplanar path still
  fires when slope > threshold).
- Visual parity confirmed via paired strict-WebGPU screenshots.

**Reviewer gate: `terrain-nav-reviewer` required pre-merge.**

### render-bucket-telemetry-fix (R1)

Fix `RenderMain` / `RenderOverlay` not surfacing in `systemBreakdown`.
The `mobile-startup-and-frame-budget` R1 memo flagged this gap; the
fix-cycle must close it before declaring any render-cost ranking.

**Files touched:**
- `src/systems/debug/FrameTimingTracker.ts:30-49` (likely cause:
  `getSystemBreakdown` filters out one or more buckets).
- Possibly `src/core/GameEngineLoop.ts:129,157` if the buckets are
  named differently than the tracker expects.

**Method:**
1. Read both files. Find the filter or naming mismatch.
2. Fix in place. Add a regression test in
   `FrameTimingTracker.test.ts` that asserts `RenderMain` +
   `RenderOverlay` appear in the breakdown after a single tick.
3. Re-run `scripts/perf-startup-mobile.ts` against `dist-perf` and
   confirm the buckets populate.
4. Commit message: `fix(telemetry): surface RenderMain/RenderOverlay in systemBreakdown (render-bucket-telemetry-fix)`.

**Acceptance:**
- Tests + build green.
- New regression test passes.
- Mobile-emulation capture now reports `RenderMain` in the breakdown.

### mobile-pixel-ratio-cap (R2)

Cap mobile pixel ratio at 1.0 (or 1.5 if owner playtest in R3
prefers).

**Files touched:**
- `src/utils/DeviceDetector.ts:185-188`.

**Method:**
1. Change the current `mobile ? 2 : Math.min(window.devicePixelRatio, 2)`
   to `mobile ? 1 : Math.min(window.devicePixelRatio, 2)`.
2. Document the rationale in a code comment with the
   webgl-fallback-pipeline-diff memo citation.
3. Add a sibling test if missing; otherwise extend an existing one.
4. Commit message: `perf(mobile): cap pixel ratio at 1.0 (mobile-pixel-ratio-cap)`.

**Acceptance:**
- Tests + build green.
- Mobile-emulation capture confirms pixel ratio = 1.0; render
  bandwidth proportionally reduced.

### mobile-skip-npc-prewarm (R2)

Gate the NPC close-model prewarm on `!isMobileGPU()` in
`src/core/LiveEntryActivator.ts:200-218`. The prewarm doesn't
complete on mobile-emulation anyway (always hits the 6.5 s timeout).

**Files touched:**
- `src/core/LiveEntryActivator.ts:200-218`.
- Possibly `src/utils/DeviceDetector.ts` to expose `isMobileGPU` if
  not already exported.

**Method:**
1. Wrap the prewarm dispatch in `if (!isMobileGPU()) { ... }`. On
   mobile, skip to the lazy-load path that the prewarm was
   pre-empting.
2. Verify with `scripts/perf-startup-mobile.ts` that the
   `npc-close-model-prewarm.begin` / `.timeout` marks disappear from
   the startup trace on mobile.
3. Confirm desktop startup is unchanged.
4. Commit message: `perf(mobile): skip NPC close-model prewarm on mobile (mobile-skip-npc-prewarm)`.

**Acceptance:**
- Tests + build green.
- Mobile startup: 6.5 s prewarm timeout no longer fires.
- Desktop startup: no measurable delta.

### mobile-sky-cadence-gate (R2)

Gate sky refresh cadence on `isMobileGPU()` — bump from 2 s to 8 s
on mobile.

**Files touched:**
- `src/systems/environment/AtmosphereSystem.ts`.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts:26`
  (the `SKY_TEXTURE_REFRESH_SECONDS` constant; expose an override
  setter).

**Method:**
1. Add a setter on `HosekWilkieSkyBackend` for refresh cadence.
2. From `AtmosphereSystem`, call it with `isMobileGPU() ? 8 : 2`.
3. Verify on mobile-emulation: the 31.60 ms avg-EMA sky bucket
   drops to ~8 ms (4x cadence reduction).
4. Commit message: `perf(mobile): mobile-gated sky refresh cadence 2s -> 8s (mobile-sky-cadence-gate)`.

**Acceptance:**
- Tests + build green.
- Mobile-emulation `World.Atmosphere.SkyTexture` avg-EMA drops by
  ~4x vs cycle-start.
- Desktop sky behavior unchanged.

### asset-audio-defer (R2)

Defer audio decode beyond the critical path. Boot with a small
ambient track and decode the SFX bank in the background.

**Files touched:**
- `src/core/SystemInitializer.ts:111-123` — the parallel
  `Promise.all` that fires `systems.assets.begin` and
  `systems.audio.begin`.
- Possibly `src/systems/audio/AudioManager.ts` to expose a
  `deferDecodeFor(seconds)` helper if not already present.

**Method:**
1. Split the audio init into "boot-critical" (ambient + UI) and
   "background" (SFX bank, music). Background decodes after first
   playable frame.
2. Verify via `scripts/perf-startup-mobile.ts`: the
   `systems.audio.end` mark fires earlier in the playable-frame
   bracket.
3. Confirm no audio gap on combat start (the SFX bank needs to be
   decoded before first shot).
4. Commit message: `perf(startup): defer SFX bank decode beyond critical path (asset-audio-defer)`.

**Acceptance:**
- Tests + build green.
- Mobile startup tail (`modeClickToPlayableMs`) drops by ≥3 s on
  emulation.
- No audio gap on first combat shot (verify in playtest).

### tsl-shader-cost-probe (R3)

Build a Playwright probe under `scripts/perf-tsl-shader-cost.ts`
that runs `renderer.compileAsync(scene, camera)` against production
scenes and writes per-material `instructionCount` / `samplerCount` /
`uniformCount` to a JSON artifact.

**Files touched:**
- New: `scripts/perf-tsl-shader-cost.ts` (≤400 LOC).
- Possibly a small dev-only telemetry surface on `RendererBackend.ts`
  to expose `WebGLNodesHandler` compiled-program debug info.

**Method:**
1. Model on `scripts/mobile-renderer-probe.ts` shape: serve
   `dist-perf/`, drive Playwright Chromium, run
   `renderer.compileAsync(scene, camera)` on the active terrain +
   billboard + impostor scene.
2. Harvest compiled GLSL via the `WebGLNodesHandler` debug surface
   (or via `renderer.info.programs` if accessible).
3. Write per-material instruction count + sampler count + uniform
   count to
   `artifacts/cycle-mobile-webgl2-fallback-fix/tsl-shader-cost/<ts>/report.json`.
4. Run before-and-after the R1 terrain TSL early-out to show the
   sampler count drop.
5. Commit message: `feat(probe): TSL shader-cost compileAsync probe (tsl-shader-cost-probe)`.

**Acceptance:**
- Probe runs end-to-end on dev workstation.
- Report shows pre-fix vs post-fix sampler counts on terrain
  material; post-fix count is ≥4x lower.
- Probe behind dev-only path; no production runtime cost.

### real-device-validation-harness (R3, merge gate)

Validate the cycle on a real Android Chrome device and a real iOS
Safari device. This is the MERGE GATE for the whole cycle.

**Files touched:**
- New: `scripts/real-device-validation.ts` (extends
  `mobile-renderer-probe.ts` with real-device remote-debug support).
- Or: documentation under
  `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md`
  recording the owner-attached device capture results.

**Method:**
1. Owner attaches an Android Chrome 120+ device via ADB + Chrome
   remote-debug. Or arranges a remote BrowserStack/SauceLabs session.
2. Run `scripts/real-device-validation.ts` (or
   `mobile-renderer-probe.ts` with `--device=remote-debug`) against
   the production scene.
3. Capture: `resolvedBackend`, adapter info, 60 s steady-state
   `avgFps`, top-3 system breakdown buckets.
4. Repeat on iOS Safari (owner-attached iPhone, or
   BrowserStack/SauceLabs).
5. Document results under
   `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md`.
6. Commit message: `docs(mobile): real-device validation closes cycle-mobile-webgl2-fallback-fix (real-device-validation-harness)`.

**Acceptance:**
- Real Android Chrome: `avgFps` ≥ 30 fps on a mid-tier 2022+ phone.
- Real iOS Safari: owner-playtest "playable" sign-off.
- Adapter-info results recorded (discriminates "real mobile gets
  WebGPU" vs "real mobile gets WebGL2 fallback").
- Cycle close-commit references the validation memo.

## Hard Stops

Standard:
- Fenced-interface change (`src/types/SystemInterfaces.ts`) → halt,
  surface to owner.
- Worktree isolation failure → halt.
- Twice-rejected reviewer on a single task → halt.

Cycle-specific:
- **TSL early-out regresses strict-WebGPU path on desktop.** Visual
  parity is mandatory; perf regression > 5% p99 on `combat120` is
  also a campaign hard stop. Either condition halts.
- **Real-device-validation infeasible across the board.** If owner
  can't attach a real Android device AND can't arrange remote-debug
  AND can't run on BrowserStack/SauceLabs, the cycle halts and
  awaits owner direction. Emulation-only is NOT acceptable as merge
  evidence.
- **`?renderer=webgl` escape hatch breaks.** The explicit-WebGL
  path is the A/B target; any regression on it halts.

## Reviewer Policy

- `terrain-nav-reviewer` is a pre-merge gate for tasks
  `terrain-tsl-biome-early-out` and `terrain-tsl-triplanar-gate`
  (both touch `src/systems/terrain/**`).
- No reviewer for other tasks (none touch combat or navigation
  paths).
- Orchestrator reviews each PR for acceptance + visual/perf
  evidence.

## Acceptance Criteria (cycle close)

- All R1 + R2 + R3 task PRs merged.
- Mobile-emulation steady-state `avgFps` ≥ 20 fps (up from 4.42 fps;
  directional target).
- Real Android Chrome (mid-tier 2022+) steady-state `avgFps` ≥ 30 fps.
- Owner-playtest "playable" sign-off on real iOS Safari.
- No regression on desktop `combat120` perf baseline (>5% p99 is
  hard-stop).
- `RenderMain` / `RenderOverlay` buckets populated in
  `systemBreakdown` on both desktop and mobile.
- `KB-MOBILE-WEBGPU` row in `docs/CARRY_OVERS.md` Closed entry
  updated with this cycle's close-commit SHA + real-device
  validation memo path.

## Out of Scope

- Rolling back the WebGPU + TSL migration. The direction stands;
  this cycle makes the WebGL2 fallback playable.
- Re-introducing the classic `THREE.WebGLRenderer` as the
  production renderer. The explicit `?renderer=webgl` escape hatch
  remains.
- Touching `src/systems/combat/**`,
  `src/systems/navigation/**` (terrain touches expected and gated).
- Fenced-interface touches.
- Perf-baseline refresh.

## Carry-over impact

KB-MOBILE-WEBGPU is already in Closed in `docs/CARRY_OVERS.md` from
the prior cycle close. This cycle ships the fix; no carry-over
movement. Net cycle delta: 0.
