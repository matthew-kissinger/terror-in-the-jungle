# Backlog

Last verified: 2026-05-16 (post `cycle-mobile-webgl2-fallback-fix` close)

This file is the compact Strategic Reserve index. **Active carry-overs and
unresolved items live in [docs/CARRY_OVERS.md](CARRY_OVERS.md)** (Phase 0
realignment, 2026-05-09). Active directives live in
[docs/DIRECTIVES.md](DIRECTIVES.md). Current verified state lives in
`docs/STATE_OF_REPO.md` (also targeted for Phase 1 split into `docs/state/`).
Historical cycle records live under `docs/cycles/<cycle-id>/RESULT.md`.

Keep this file at or below 200 measured lines. Do not place long cycle
retrospectives, PR logs, or active directive status here.

## Current Release Routing

1. Post-WebGPU master is the release posture: WebGPU + TSL default, automatic
   WebGL2 fallback, strict WebGPU evidence for renderer claims.
2. Runtime claims require an entry in `docs/DIRECTIVES.md` plus artifact paths.
3. Live release claims require `check:live-release` evidence after manual
   deploy.
4. Performance baseline refresh remains blocked until STABILIZAT-1 passes from
   a trusted combat120 chain.
5. Mode-startup claims must separate cache delivery from runtime CPU bake.
   `KB-STARTUP-1` owns the active terrain-bake hardening branch.
6. Human playtest remains required for flight, driving, combat rhythm, and UI
   responsiveness.

## Active Directive Routing

Use [docs/DIRECTIVES.md](DIRECTIVES.md) instead of duplicating active work here.

| Work area | Directive |
|---|---|
| Water surface, hydrology placement, water query/interaction API | VODA-1 |
| Ground vehicles and stationary weapons | VEKHIKL-1 / VEKHIKL-2 |
| Helicopter parity, aircraft weapons, maneuvers, Cobra import | AVIATSIYA-3 through AVIATSIYA-7 |
| Squad commands, pings, air-support radio | SVYAZ-1 through SVYAZ-4 |
| Respawn, map spawn, loadout, deploy flow | UX-1 through UX-4 |
| Combat120 baseline and live release | STABILIZAT-1 through STABILIZAT-3 |
| Baseline drift, doc/code drift, combat p99 (`DEFEKT-3`), route quality | DEFEKT-1 through DEFEKT-4 |
| WebGPU scene parity and rollout gating | KONVEYER-10 (closed; follow-ups through post-WebGPU campaign) |
| Mode-start terrain surface bake and startup UI delay | KB-STARTUP-1 |

## Active Branch (task/mode-startup-terrain-spike)

Opened 2026-05-13 for the user-reported "click a game mode and it takes
forever" issue. The investigation found that Cloudflare/Recast/WASM cache
delivery was already correct; the stall was synchronous terrain surface baking
after mode select.

The branch moves mode-start terrain surface baking to the terrain worker pool,
uses transferable typed arrays for height/normal buffers, and batches mode
terrain configuration through `TerrainSystem.configureModeSurface(...)`.
Spike memo and evidence:
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

Merge-hardening left: Open Frontier and A Shau visual review of the coarse
source-delta cache used for the render-only visual margin; if rejected, promote
persistent/prebaked visual-surface artifacts or an IndexedDB/OPFS bake cache.

## Recently Completed (cycle-mobile-webgl2-fallback-fix)

Campaign position #2 of 12 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(autonomous-loop posture). Three-round cycle, 9 PRs merged. Closes
the shipped fix for `KB-MOBILE-WEBGPU` (the post-WebGPU-merge
WebGL2-fallback mobile-unplayable regression).

PRs merged in dispatch order across 3 rounds:

R1 — Foundation (terrain TSL early-outs + telemetry plumbing):
- [#213](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/213) `6e7a8879` `terrain-tsl-biome-early-out` — Replaces the 8-way `mix(prev,sample,step(N-0.5,biomeSlot))` unroll in `TerrainMaterial.sampleBiomeTextureRaw` with a TSL `If/ElseIf` chain inside `Fn(()=>...)`. terrain-nav-reviewer **APPROVE-WITH-NOTES**. Notes: compile-time sampler-count verification deferred to R3 `tsl-shader-cost-probe`; strict-WebGPU desktop visual deferred to owner walk-through.
- [#211](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/211) `9e1ccab5` `terrain-tsl-triplanar-gate` — Wraps triplanar sample sub-graph in `If(triplanarBlend > 0.001)` so flat-terrain compiles skip the 6 triplanar samples. terrain-nav-reviewer **APPROVE-WITH-NOTES**. Identity-preservation argument: `mix(planar, triplanar, 0)` equals `planar`, so both branches yield byte-equivalent output.
- [#212](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/212) `0b3b749d` `render-bucket-telemetry-fix` — Root cause was an ordering interaction in `SystemUpdater.updateSystems()` calling `endFrame()` before `GameEngineLoop.animate()` opened `RenderMain`/`RenderOverlay` buckets; the `currentFrame` was null and the `beginSystem`/`endSystem` short-circuit dropped every render sample. Fix tracks pending starts on a separate map. 4 new behavior tests.

R2 — Mobile-specific knobs:
- [#215](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/215) `99044966` `mobile-pixel-ratio-cap` — `DeviceDetector.ts` mobile UA returns 1.0 pixel ratio instead of 2.0; proportionally reduces render bandwidth.
- [#214](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/214) `ca725369` `mobile-skip-npc-prewarm` — Gates the NPC close-model prewarm dispatch on `!isMobileGPU()` in `LiveEntryActivator.ts`; mobile-emulation was always hitting the 1.8s prewarm timeout for zero benefit. Adds a `npc-close-model-prewarm.skipped-mobile` startup mark for visibility.
- [#216](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/216) `706ad344` `mobile-sky-cadence-gate` — `HosekWilkieSkyBackend` exposes `setRefreshCadenceSeconds()`; `AtmosphereSystem` calls it with `isMobileGPU() ? 8 : 2`. Mobile sky `World.Atmosphere.SkyTexture` avg-EMA expected to drop ~4x.
- [#217](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/217) `83fb9fb0` `asset-audio-defer` — Splits audio init into boot-critical (ambient+UI) and background (SFX bank, music). Background decodes after first playable frame via new `whenSfxReady()` seam. **Measured: `modeClickToPlayableMs` 19,341ms → 11,349ms (−7,992ms)**. First-shot audio gap check deferred to PLAYTEST_PENDING.

R3 — Validation (probe + harness):
- [#218](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/218) `ff87e635` `tsl-shader-cost-probe` — New `scripts/perf-tsl-shader-cost.ts` (405 LOC) + dev-only `collectKonveyerNodeMaterialShaders()` surface on `RendererBackend.ts` (+278 LOC; dual-renderer-path: WebGL `_latestBuilder` vs WebGPU mangled `nodeBuilderCache`). `window.__tslShaderCost()` wired behind `?diag=1` gate. Closes the R1 terrain-nav-reviewer's "compile-time perf evidence deferred to R3" note.
- [#219](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/219) `a81d8cda` `real-device-validation-harness` — New `scripts/real-device-validation.ts` (484 LOC) extends mobile-renderer-probe with Playwright remote-debug for `android-chrome-debug` + `ios-safari-manual`. Cycle close memo at `docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/cycle-close-validation.md` documents owner-attach steps. Pixel 5 + iPhone 12 emulation captures (23.68 / 28.30 avgFps) committed; real-device walk-through deferred to PLAYTEST_PENDING.

Out-of-band CI fix (root cause for the 30-min mobile-ui timeout flake):
- `47c42216` `ci(mobile-ui): matrix fan-out 4 devices into parallel jobs` — 4 device cases × ~12 min each (post-WebGPU mode-startup bake) = ~48 min sequential vs 30 min timeout = impossible. Matrix-fans the 4 device cases into parallel jobs at 18-min per-job ceiling; wall time max-of-devices ≈ 3-10 min. New `scripts/mobile-ui-check.ts --device-id <id>` flag; local invocations unchanged. Verified on R2 PRs: all 4 mobile-ui matrix jobs pass under 10 min, no timeouts.

Carry-over delta: 0. KB-MOBILE-WEBGPU was already in Closed at cycle start;
the Closed entry is updated with all 9 merge SHAs, the CI-fix commit, and
the harness/memo paths.

Perf delta (post-R1 perf-analyst + post-R2 perf-analyst, both rounds): same
pattern as cycle #1 — literal >5% p99 trip on `combat120` (R1 +34%, R2
+34%), both rounds explicitly diagnosed by perf-analyst as **runner-environment
noise, NOT real signal**. Evidence: (1) per-PR p99 ordering placed the
**telemetry-only PR #212 as the WORST** in R1 (an impossible GPU signal —
proves variance dominates); (2) the R2 worst-by-p99 was **PR #215
mobile-pixel-ratio-cap**, which only changes a UA-gated numeric constant
that cannot affect desktop combat120; (3) all four R2 captures ran the
WebGPU→WebGL2 fallback path on the CI Linux runner with mid-capture
WebGL context loss spam, while the baseline is the WebGL-native pre-WebGPU
build from 4 weeks ago. Campaign manifest explicitly defers strict 5% rule
until cycle #12 baseline refresh. No PAUSE fired per the cycle #1 precedent;
proper signal will come from the deferred real-device walk-through + the
cycle #12 quiet-machine re-capture.

Deferrals appended to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md):
- `asset-audio-defer` first-shot audio gap (automated assertion too
  heavyweight for single-task scope).
- `real-device-validation-harness` walk-through on real Android Chrome +
  real iOS Safari (run `scripts/real-device-validation.ts` per the
  close-validation memo).

Follow-ups for the next cycle (#3, `cycle-konveyer-11-spatial-grid-compute`):
- The R1 terrain-nav-reviewer flagged `customProgramCacheKey 'KonveyerTerrainTSL_v1'`
  not bumped after the structural change — bundle a `_v2` bump or removal
  into the next terrain-material touch.
- The R1 terrain-nav-reviewer flagged a `Switch(value).Case(N, fn)` TSL
  alternative to chained `If/ElseIf` — re-bench with `tsl-shader-cost-probe`
  in place. Low priority.
- The triplanar-gate capture script names "strict" but captures
  `webgpu-webgl-fallback` (truthfulness nit); rename or extend the script
  on next terrain-touch.

## Recently Completed (cycle-sky-visual-restore)

Campaign position #1 of 12 in
[docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md](CAMPAIGN_2026-05-13-POST-WEBGPU.md)
(autonomous-loop posture). Single-round cycle, three parallel R1 tasks all
touching `src/systems/environment/atmosphere/**`. Closes the shipped fix for
`KB-SKY-BLAND` (the post-WebGPU-merge sky-bland visual regression).

PRs merged in dispatch order:

- [#208](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/208)
  `2118177f` `sky-dome-tonemap-and-lut-resolution` —
  `MeshBasicMaterial` constructor on the dome gets `toneMapped: false`
  (bypasses ACES in `GameRenderer`); `SKY_TEXTURE_WIDTH/HEIGHT` bumped from
  128×64 to 256×128 in `HosekWilkieSkyBackend.ts`. LUT-bake EMA capture
  deferred — the 2s-gated refresh path didn't fire during the harness sample
  window; static reasoning (~18-20 ms projected, amortized 0.5% frame budget)
  recorded in PR description.
- [#210](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/210)
  `3455fa96` `sky-hdr-bake-restore` — Sky LUT `DataTexture` migrates from
  `UnsignedByteType` + sqrt-gamma + `clamp01` to `HalfFloatType` (`Uint16Array`
  of `THREE.DataUtils.toHalfFloat` bit patterns; matches Three.js r184
  `Float16BufferAttribute` storage and WebGPU `RGBA16Float` upload). Texture
  `colorSpace` flips `SRGBColorSpace → LinearSRGBColorSpace` (correct for
  fp16 linear payload). Analytic ceiling lifts `Math.min(8, …)` → `Math.min(64, …)`
  so the sun-disc spike survives bake without overflowing fp16's exponent.
  `compressSkyRadianceForRenderer` deliberately untouched (cap correct for
  downstream fog + hemisphere readers).
- [#209](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/209)
  `9e1ce7c7` `sky-sun-disc-restore` — New `SunDiscMesh.ts` (196 LOC, under
  200 cap) + 7-test sibling `SunDiscMesh.test.ts`. Additive HDR sprite
  (`PlaneGeometry` + `MeshBasicMaterial` with `toneMapped: false`,
  `AdditiveBlending`, `depthWrite/Test: false`) billboarded to the camera,
  positioned at `sunDir * (domeRadius * 0.99)`. Hidden when sun
  `.y < 0`. Existing dome `mixSunDisc` soft glow stays; sprite is the
  bright pin-point on top.

Carry-over delta: 0. KB-SKY-BLAND was already in Closed at cycle start;
the Closed entry is updated with the three merge SHAs + Playwright
screenshot evidence path (`artifacts/cycle-sky-visual-restore/playtest-evidence/`).

Perf delta (post-round perf-analyst diff vs `perf-baselines.json` baseline,
`combat120`): raw numbers show p99 +9.8 ms (+29.3%) on the cumulative final
state vs the 4-week-old baseline, but the analyst reads this as no
detectable sky-attributable regression after accounting for measurement
trust (WARN on all three captures, probeP95 41-46 ms i.e. inside the
delta), baseline staleness (STABILIZAT-1 has blocked baseline refresh for
~4 weeks), and the within-cycle trajectory (p99 monotonically *improved*
66.6 → 73.7 → 43.2 ms across the three merges in order — inconsistent with
a sky-attributable cumulative regression). No >5% p99 hard-stop fired.
Independent confirmation requires a quiet-machine re-capture, which is
STABILIZAT-1 work (closes at campaign cycle #12).

CI notes for the cycle retro: `mobile-ui` CI job timed out at exactly the
30-minute mark on each of the three PRs — the known BACKLOG retro nit
(timeout flake on a job unrelated to sky scope). Master is unprotected so
merge was not blocked; flake count was 3-of-3 PRs in the round, well below
any reasonable real-signal threshold for a known-flaky timer-bound job.

Owner playtest deferred under autonomous-loop posture; the three sky
deferrals are appended to [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)
for the owner to walk after the 12-cycle campaign completes (or during a
planned break).

Follow-ups for the next cycle (#2, `cycle-mobile-webgl2-fallback-fix`):
- Real-device validation can confirm the noon sky reads "right" on a phone.
- LUT-bake EMA on a mobile-emulation capture can quantify whether the
  256×128 step needs to fall back to 192×96 on phones (cycle-specific
  graceful-degradation hard-stop is wired but uncaught here).

## Recently Completed (cycle-2026-05-16-mobile-webgpu-and-sky-recovery)

Investigation cycle covering two owner-reported 2026-05-15 post-WebGPU-merge
playtest regressions: mobile unplayable + sky bland. Five parallel R1
investigation memos landed under
`docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/` with `file:line`
citations, paired pre/post sky screenshots, mobile-emulation adapter-info
evidence, and labelled-emulation perf magnitudes (with explicit
host-contention perf-taint caveat carried into the R2 alignment memo).
R2 alignment memo synthesised findings and named two fix cycles, both
queued at the top of `docs/CAMPAIGN_2026-05-13-POST-WEBGPU.md`.

Headline findings:
- Mobile lands on `webgpu-webgl-fallback` (WebGL2 backend of `WebGPURenderer`),
  not classic `WebGLRenderer`. `strictWebGPU=false` (commit `4aec731e`) is
  the only reason mobile boots at all.
- Terrain TSL biome-sampler chain unrolled into `mix(prev, sample, step(...))`
  forces all 8 biome samplers per fragment → ~146 effective samples/fragment
  vs ~19 pre-merge (8x amplification). Highest per-fragment cost lever.
- Sky-bland is visual-fidelity only (not perf): 128×64 CPU-baked DataTexture
  replaced per-fragment Preetham, HDR clamped to [0,1], missing
  `toneMapped: false` routes dome through ACES, sun-disc normalised to peak
  1.0 kills HDR pearl.

PRs merged:

- [#203](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/203) `mobile-renderer-mode-truth` — Pixel 5 + iPhone 12 Playwright emulation probe; `capabilities.resolvedBackend === "webgpu-webgl-fallback"` in both contexts. Ships `scripts/mobile-renderer-probe.ts` for fix-cycle re-validation.
- [#204](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/204) `tsl-shader-cost-audit` — three production TSL materials inventoried; terrain TSL biome-sampler chain identified as the dominant per-fragment regression (~8x sampler amplification, ~146 effective samples/fragment worst case).
- [#205](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/205) `sky-visual-and-cost-regression` — four-part visual diff + paired pre/post screenshots across 5 scenarios; root cause is `MeshBasicMaterial`+`DataTexture` resolution drop + HDR clamp + ACES on dome + sun-disc normalisation.
- [#206](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/206) `mobile-startup-and-frame-budget` — mode-click → playable timings, 60s steady-state `systemBreakdown` (`Combat.AI` 46.86 ms / `World.Atmosphere.SkyTexture` 31.60 ms / `Combat.Billboards` 13.19 ms avg-EMA at 4.42 fps under 4x CPU throttle). Ships `scripts/perf-startup-mobile.ts`.
- [#207](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/207) `webgl-fallback-pipeline-diff` — eight new pipeline elements in WebGL2-fallback path vs pre-merge; top-3 cost contributors flagged (terrain TSL, renderer construction overhead, CPU-baked sky refresh).
- Plus the R2 alignment memo `docs/rearch/MOBILE_WEBGPU_AND_SKY_ALIGNMENT_2026-05-16.md` (orchestrator-authored).

Carry-over delta: +2 opened (`KB-MOBILE-WEBGPU`, `KB-SKY-BLAND`) at launch
(9 → 11); −2 closed at cycle end with promotion-to-fix-cycle resolution
(11 → 9). Net cycle delta: 0. Active count back to **9**.

Fix cycles named:
- `cycle-sky-visual-restore` (small, leads): set `toneMapped: false` on dome,
  bump LUT resolution, restore HDR sun-disc.
- `cycle-mobile-webgl2-fallback-fix` (larger, real-device validation = merge
  gate): TSL terrain biome-sampler early-out, mobile pixel-ratio cap, skip
  NPC prewarm, mobile-gated sky cadence.

Optional sequencing: `cycle-konveyer-11-spatial-grid-compute` (already
queued) closes the steady-state #1 mobile bucket (`Combat.AI` / `DEFEKT-3`)
independently and can run in parallel.

## Recently Completed (cycle-2026-05-13-konveyer-materialization-rearch + doc-vision-alignment + master-merge)

R1 of the Phase F materialization rearch plus the doc-vision-alignment pass
landed on the `exp/konveyer-webgpu-migration` branch and merged to `master`
on 2026-05-13 as PR #192. **Master is now the WebGPU + TSL renderer branch
by default**, with automatic WebGL2 fallback for browsers without WebGPU.
KONVEYER-10 closes with this arc.

- [#183](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/183) `konveyer-combat-sub-attribution` — `Combat.{Influence,AI,Billboards,Effects}` telemetry children wired into `CombatantSystem.update` blocks; probe-side child breakdown captured across all five modes.
- [#184](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/184) `konveyer-materialization-lane-rename` — pure refactor: `Combatant.lodLevel` → `simLane` + `renderLane`. Surface for the budget arbiter v2.
- [#185](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/185) `konveyer-sky-refresh-investigate` — sky-refresh idempotency at the 2 s cadence; `setCloudCoverage` no-op on unchanged input.
- [#186](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/186) `doc-align-historical-headers` — historical "Last verified" headers added to `CAMPAIGN_2026-05-09.md`, `STABILIZATION_CHECKPOINT_2026-05-09.md`, and `REARCHITECTURE.md`.
- [#187](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/187) `doc-align-roadmap-and-agents` — ROADMAP and AGENTS docs aligned with the 3,000-combatant vision sentence; Phase 6 Ground Vehicles flipped to IN PROGRESS.
- [#188](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/188) `doc-align-claude-and-carryovers` — CLAUDE.md "Current focus" reflects the 2026-05-12 vision confirmation; AVIATSIYA-2/3 parked.
- [#189](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/189) `rearch-ground-vehicle-physics` — `docs/rearch/GROUND_VEHICLE_PHYSICS_2026-05-13.md` memo (wheeled physics, Ackermann steering, ground-normal conform) and the 2026-05-13 addendum to `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md`.
- [#190](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/190) `rearch-tank-systems` — `docs/rearch/TANK_SYSTEMS_2026-05-13.md` memo (skid-steer, independent turret, gunner seat, ballistic cannon, damage states).
- [#191](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/191) `rearch-browser-runtime-primitives` — `docs/rearch/BROWSER_RUNTIME_PRIMITIVES_2026-05-13.md` memo (Rust-WASM, compute, audio, and related runtime primitives).
- [#192](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/192) `exp→master merge` — `exp/konveyer-webgpu-migration` folded into `master` (merge commit `1df141ca`); WebGPU + TSL becomes the default production renderer.
- Inline fix on PR #192 (commit `4aec731e`) — gate WebGL-fallback rejection on strict mode only. Production users without WebGPU now automatically hit Three.js's WebGL2 backend.

Carry-over delta: −1 closed (KONVEYER-10), +0 opened. Active count: 9 → 8.
Follow-up cycles queued on master: cover-spatial-grid, render-silhouette/cluster
lanes, squad-aggregated strategic sim, budget arbiter v2, strict-WebGPU
multi-mode proof, docs review packet v2.

## Recently Completed (cycle-2026-05-09-cdlod-edge-morph)

Hot-fix cycle 2.4 (single task), inserted ahead of Phase 2.5 to address a
P1 user-reported visual regression: white seam cracks at terrain chunk
borders from helicopter altitude on A Shau. Predecessor `terrain-cdlod-seam`
(cycle-2026-05-08) closed same-LOD parity but explicitly deferred the
LOD-transition T-junction case; this cycle shipped the canonical
Strugar-style fix. The first live deployment still left user-visible white
crack risk, so the 2026-05-10 release-stewardship pass added two-sided CDLOD
skirt walls in `5e3436c`.

- [#178](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/178) `cdlod-edge-morph` — 4 commits (3 staged + 1 harden). Stage 2 ships: per-edge `edgeMorphMask` attribute on `CDLODTile` + integer-cell-keyed neighbor pass in `CDLODQuadtree.resolveEdgeMorphMasks` + `Float32Array` per-instance attribute on `CDLODRenderer` + shader force-morph at coarser-neighbor edges. Stage 1 (snap-math) reverted in harden commit — terrain-nav-reviewer caught a wiring conflation in the brief (`tileResolution` vertex count vs. `tileGridResolution` quad count). Master's pre-PR `parentStep = 2/tileGridResolution` was geometrically correct. Net diff: +410 / -9 across 6 files. terrain-nav-reviewer APPROVE-WITH-NOTES.

Carry-over delta: −0 closed, +0 opened. Active count holds at **12** (at
the ≤12 limit). Cycle ships a user-observable feature (closes the seam
regression) — COMPLETE under the "ship a user-observable gap" half of the
rule.

Post-cycle follow-up status:

- A Shau mask-test claim softening, the CDLOD perf ceiling, and the
  `tileKey()` guard comment were closed by `a9ebfbe`.
- Mobile UI CI timeout was bumped from 25 to 30 minutes by `6892a36`.
- Post-merge combat120 evidence exists at
  `artifacts/perf/2026-05-10T10-45-07-263Z`, but `perf:compare` still fails
  avg, p99, and max-frame gates. STABILIZAT-1 remains open.
- Terrain visual evidence exists at
  `artifacts/perf/2026-05-10T10-53-32-328Z/projekt-143-terrain-visual-review/visual-review.json`.
  That historical gate WARNed because one A Shau river-ground screenshot timed
  out and Open Frontier water/exposure remained washed out. The later KONVEYER
  strict-WebGPU terrain packet supersedes the terrain-color concern; water
  polish remains routed through VODA and rest-of-scene WebGPU parity through
  KONVEYER-10.
- **Visual A/B at A Shau north ridgeline** (helicopter altitude, screenshot
  coordinate from the original 2026-05-09 user report) is the human gate
  per the cycle brief. Save before/after PNGs into
  `artifacts/cdlod-edge-morph/{before,after}/`.

Comprehensive context: cycle brief at
`docs/tasks/archive/cycle-2026-05-09-cdlod-edge-morph/cycle-2026-05-09-cdlod-edge-morph.md`.

## Recently Completed (cycle-2026-05-10-zone-manager-decoupling)

Phase 2 of the realignment campaign. ZoneManager fan-in 52 → 17 read / 5
concrete via `IZoneQuery` interface. **Stabilization checkpoint after this
cycle**; campaign auto-advance paused.

- [#173](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/173) `zone-manager-design-memo` — `docs/rearch/zone-manager-decoupling.md` (303 LOC), 6-method `IZoneQuery` shape proposal, batch plan
- [#174](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/174) `izone-query-fence` — `[interface-change]` PR; `IZoneQuery` added to fence; ZoneManager implements; +3 trivial accessors (`getZoneAt`/`getZoneById`/`getCapturableZones`); terrain-nav-reviewer APPROVE
- [#175](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/175) `zone-decoupling-batch-a-readonly` — HUD/Compass/Minimap/FullMap migrated to `IZoneQuery`
- [#176](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/176) `zone-decoupling-batch-b-state-driven` — Combat/Tickets/WarSim migrated; ZoneManager.update() now publishes `zone_captured`/`zone_lost` events; combat-reviewer APPROVE-WITH-NOTES
- [#177](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/177) `zone-decoupling-batch-c-owners` — PlayerRespawn + CommandInputManager migrated; adapter shims dropped; ZoneManager removed from lint-source-budget grandfather list; `docs/ARCHITECTURE.md` heatmap updated; combat-reviewer APPROVE-WITH-NOTES

Carry-over delta: −0 closed, +3 opened (`cloudflare-stabilization-followups`,
`weapons-cluster-zonemanager-migration`, `perf-doc-script-paths-drift`).
Active 9 → 12 (at the `≤12 active` rule limit). The +3 are deferred work
formally registered as part of the **stabilization checkpoint**; the cycle
ships its user-observable feature (fan-in reduction) and would be COMPLETE
under the "ship a feature" half of the rule but registers INCOMPLETE under
the strict-decrease half — flagged for the next cycle's plan to close ≥2
of the 12 active before Phase 3 dispatches.

Comprehensive context: [docs/archive/STABILIZATION_CHECKPOINT_2026-05-09.md](archive/STABILIZATION_CHECKPOINT_2026-05-09.md).
Live audit findings: `artifacts/live-audit-2026-05-09/FINDINGS.md`.

## Recently Completed (cycle-2026-05-09-doc-decomposition-and-wiring)

Phase 1 of the 12-week realignment campaign. Doc surface decomposed and
WorldBuilder god-mode flags wired into engine consumers.

- [#167](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/167) `state-doc-split` — `docs/STATE_OF_REPO.md` (2,708 LOC) → `docs/state/` (3 files ≤140 LOC each)
- [#168](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/168) `codex-decomposition` — `docs/PROJEKT_OBJEKT_143*.md` archived; `docs/DIRECTIVES.md` (199 LOC) replaces Article III
- [#169](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/169) `perf-doc-split` — `docs/PERFORMANCE.md` (2,332 LOC) → `docs/perf/` (4 files ≤200 LOC each)
- [#170](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/170) `script-triage` — 89 `check:projekt-143-*` → 12 plain-named retained; 80 archived under `scripts/audit-archive/`
- [#171](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/171) `artifact-gc` — weekly `artifact-prune.yml` workflow; ~7.4 GB local prune
- [#172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172) `worldbuilder-wiring` — 6 god-mode flags wired into PlayerHealthSystem, AmmoManager, PlayerMovement, PostProcessingManager, AtmosphereSystem, AudioManager (all DEV-gated, Vite DCE confirmed)

Carry-over delta: −6 worldbuilder-wiring closed, +2 opened (artifact-prune
baseline-pin fix; `oneShotKills` 7th flag wiring). Net −4. Active count
13 → 9. Cycle COMPLETE.

Follow-ups for next cycles (combat-reviewer notes from PR #172):
- Update stale "703 LOC" reason text in `scripts/lint-source-budget.ts:54` (file is now 718 LOC).
- `oneShotKills` flag wiring (carry-over filed).
- `artifact-prune.ts` baseline-pin regex fix (carry-over filed).

## Strategic Reserve

Items below are acknowledged but not active directives unless the project
owner opens or reassigns them.

### KB-LOAD

- Accepted Pixel Forge vegetation candidate import and runtime proof.
- Dense vegetation ecology, bamboo and palm clustering, grass, ground cover,
  and disturbed trail edges.
- Pixel Forge building and vehicle replacement with foundation, collision, and
  pivot checks.
- GLB migration into the content-addressed asset manifest after terrain
  delivery is stable.

### KB-TERRAIN

- Far-canopy and distance-policy after evidence for Open Frontier and A Shau.
- A Shau route and NPC movement quality beyond representative-base connectivity.
- Terrain texture improvements.
- Road network generation with splines, intersections, and pathfinding.
- Additional DEM modes such as Ia Drang and Khe Sanh.

### KB-CULL

- Broad HLOD.
- Static-cluster policy.
- Vegetation culling.
- Parked-aircraft playtest coverage.
- Building and prop residency decisions after renderer-category evidence.

### KB-OPTIK / KB-EFFECTS

- Human-signed atmosphere and cloud readability.
- Vegetation normal-map and material parity follow-ups.
- Music, soundtrack, weapon sound variants, and impact/body/headshot sounds.
- Stress-scene grenade and explosion validation after combat120 trust returns.

### KB-STRATEGIE

- WebGPU, OffscreenCanvas worker render, WASM-SIMD, SharedArrayBuffer, and
  cross-origin isolation branches. Reopen only with project-owner direction.
- Multiplayer and networking.
- Destructible structures.
- Survival / roguelite mode.
- Campaign system.
- Theater-scale tiled DEM maps.

### Phase F Candidates

- E1: ECS evaluation remains deferred; bitECS measured about parity with the
  current Vector3-shaped runtime in the old spike.
- E2: GPU-driven rendering and WebGPU migration are now active on
  `exp/konveyer-webgpu-migration` (KONVEYER-0 through KONVEYER-10). The
  scene/material/materialization rearchitecture memo lives at
  `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md`; concrete
  instancing-capacity cliffs may still be fixed in place on `master` while
  the experimental branch matures.
- E3: Utility-AI combat layer expansion remains a design candidate; do not
  block present faction tuning on it.
- E4: Agent/player API unification needs a minimal movement/observation
  prototype before any full active-driver rewrite.
- E5: Deterministic sim and seeded replay need a `SimClock` / `SimRng` pilot
  before any broad pass.
- E6: Vehicle physics rebuild needs a flagged Skyraider `Airframe` prototype
  and human playtest before any full migration.

## Known Deferred Risks

1. Fixed-wing and helicopter feel are not human-signed-off.
2. Pointer-lock fallback is implemented but not usability-signed.
3. Airfield height authority is partially repaired, not fully unified.
4. NPC route-follow quality is not signed off.
5. Production freshness must be rechecked after every player-testing push.
6. Main production/perf chunks remain heavy.
7. `frontier30m` baseline remains stale until a quiet-machine soak.
8. Mixed UI paradigms remain architecture debt.
9. SystemManager and composer ceremony remain architecture debt.
10. Variable-delta physics remains architecture debt outside fixed-step vehicle
    systems.

## Historical Cycle Index

| Cycle | Record |
|---|---|
| cycle-mobile-webgl2-fallback-fix | `docs/tasks/archive/cycle-mobile-webgl2-fallback-fix/cycle-mobile-webgl2-fallback-fix.md` |
| cycle-sky-visual-restore | `docs/tasks/archive/cycle-sky-visual-restore/cycle-sky-visual-restore.md` |
| cycle-2026-05-10-zone-manager-decoupling | `docs/tasks/archive/cycle-2026-05-10-zone-manager-decoupling/cycle-2026-05-10-zone-manager-decoupling.md` |
| cycle-2026-05-09-doc-decomposition-and-wiring | `docs/tasks/archive/cycle-2026-05-09-doc-decomposition-and-wiring/cycle-2026-05-09-doc-decomposition-and-wiring.md` |
| cycle-2026-05-09-phase-0-foundation | `docs/tasks/archive/cycle-2026-05-09-phase-0-foundation/cycle-2026-05-09-phase-0-foundation.md` |
| cycle-2026-05-08-stabilizat-2-closeout | `docs/cycles/cycle-2026-05-08-stabilizat-2-closeout/RESULT.md` |
| cycle-2026-04-23-debug-cleanup | `docs/cycles/cycle-2026-04-23-debug-cleanup/RESULT.md` |
| cycle-2026-04-23-debug-and-test-modes | `docs/cycles/cycle-2026-04-23-debug-and-test-modes/RESULT.md` |
| cycle-2026-04-22-heap-and-polish | `docs/cycles/cycle-2026-04-22-heap-and-polish/RESULT.md` |
| cycle-2026-04-22-flight-rebuild-overnight | `docs/cycles/cycle-2026-04-22-flight-rebuild-overnight/RESULT.md` |
| cycle-2026-04-21-stabilization-reset | `docs/cycles/cycle-2026-04-21-stabilization-reset/RESULT.md` |
| cycle-2026-04-21-atmosphere-polish-and-fixes | `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/RESULT.md` |
| cycle-2026-04-20-atmosphere-foundation | `docs/cycles/cycle-2026-04-20-atmosphere-foundation/RESULT.md` |
| cycle-2026-04-18-harness-flight-combat | `docs/cycles/cycle-2026-04-18-harness-flight-combat/RESULT.md` |
| cycle-2026-04-18-rebuild-foundation | `docs/cycles/cycle-2026-04-18-rebuild-foundation/RESULT.md` |
| cycle-2026-04-17-drift-correction-run | `docs/cycles/cycle-2026-04-17-drift-correction-run/RESULT.md` |
| cycle-2026-04-06-vehicle-stack-foundation | `docs/cycles/cycle-2026-04-06-vehicle-stack-foundation/RESULT.md` |

## Research References

- `examples/prose-main/` remains a gitignored external-repo reference target for
  declarative runtime config and orchestration patterns.
- Write generalized findings to `docs/rearch/prose-research.md` before using
  them as implementation guidance.
