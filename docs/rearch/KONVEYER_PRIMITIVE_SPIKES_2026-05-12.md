# KONVEYER Primitive Research Spike — Expensive Systems

Last verified: 2026-05-12

Branch: `exp/konveyer-webgpu-migration`. Companion to
[KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md](KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md),
[KONVEYER_REVIEW_PACKET_2026-05-12.md](KONVEYER_REVIEW_PACKET_2026-05-12.md),
and the pre-existing
[KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md](KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md).

Purpose: name the underlying **compute primitive** used by each
expensive system on this branch, list candidate replacement primitives
that would lower steady-state cost, and rank them by leverage. This is
research, not commitment. Each candidate either justifies a measurable
prototype slice or is parked.

Hard stops remain: no master merge, no deploy, no perf-baseline
refresh, no fenced interface edits, no WebGL fallback proof.

## What "primitive" means here

The fundamental compute pattern a system uses to do its job — full
recompute every frame, sparse update keyed on input change, GPU
compute pass, spatial-index lookup, async double-buffered query, etc.
The same problem solved by different primitives can have very
different steady-state cost profiles. Choosing better primitives is
rearchitecture work, not tuning.

## Empirical input

Strict-WebGPU multi-mode evidence (RTX 3070, headed, 4500 ms steady
review pose):
`artifacts/perf/2026-05-12T16-22-28-343Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

Ranked cost per mode (EMA):

| Mode | Atmosphere.SkyTexture | Combat | World | Terrain | Other |
| --- | ---: | ---: | ---: | ---: | ---: |
| `open_frontier` | 5.03 | 1.55 | 0.40 | 0.21 | <0.5 |
| `zone_control` | 5.14 | 1.42 | 1.00 | 0.11 | <0.5 |
| `team_deathmatch` | 5.39 | 2.06 | 0.66 | 0.09 | <0.5 |
| `ai_sandbox` | 5.21 | 3.05 | 0.51 | 0.07 | <0.5 |
| `a_shau_valley` | 5.96 | 3.24 | 1.43 | 0.60 | <0.5 |

Top three systems (SkyTexture, Combat, World) own >90% of the CPU
frame in every mode. Everything else (Terrain, WarSim, Vehicles,
Player, Weapons, TacticalUI, Billboards, Audio) is at or below 0.5 ms
and is **not in scope** for this spike.

## 1. Atmosphere.SkyTexture (5.03–5.96 ms; 99%+ of Atmosphere)

### Current primitive — and why it is wrong for WebGPU

`HosekWilkieSkyBackend.update(deltaTime, sunDirection)` runs the full
Hosek-Wilkie analytic sky model **on the CPU**, evaluating per-pixel
across an 8,192-pixel (128×64) `CanvasTexture`, writes the result via
`putImageData`, then triggers `skyTexture.needsUpdate = true` to
force a sync GPU upload. The refresh is timer-gated (every 0.5 s
when `cloudCoverage > 0`) plus dirty-flagged on sun motion past
`LUT_REBAKE_COS_THRESHOLD`.

**Slice 12 update — this is the wrong primitive for WebGPU.** Web
search confirms two independent issues with this architecture:

1. **Three.js's own `examples/jsm/objects/Sky.js`** ships the
   Preetham analytic **as a fragment shader on the dome material**.
   Per-pixel work happens on the GPU in parallel. Uniforms
   (`sunPosition`, `turbidity`, `mieCoefficient`, etc.) only re-upload
   when sun or scenario state changes — typically once per scene
   load + once per visible sun-direction tick. There is no
   CanvasTexture, no `putImageData`, no per-pixel CPU work. This is
   the standard primitive for atmospheric sky in Three.js since well
   before WebGPU.
2. **`CanvasTexture + needsUpdate`-every-frame is a documented
   WebGPU anti-pattern.** The renderer must read pixels off the
   canvas on the CPU and re-upload via `texSubImage2D`; under
   WebGPU's stricter pipeline this stalls the GPU during the upload.
   See three.js issues #28101 (chunked texture upload requested),
   #31055 (WebGPURenderer slower than WebGL on uploads),
   discourse 50288 (CanvasTexture needsUpdate-every-frame perf
   issue), discourse 66535 (CanvasTexture in WebGPU specifically).

Slice 12 (LUT-driven CPU refresh) and slice 13 (DataTexture +
`SKY_TEXTURE_REFRESH_SECONDS` 0.5 → 2.0) DO save ~1.5–2.5 ms
across all modes — but this was hidden by a stale `dist-perf`
bundle.

**Slice 14 diagnostic resolved the "phantom EMA" puzzle.** The
crop probe uses `vite preview --outDir dist-perf` against a
pre-built bundle, NOT dev-mode HMR source. After running
`npm run build:perf` to rebuild against current source, the
slice 12+13 EMA improvements appeared correctly. Earlier
diagnostic experiments (bypass refresh body / remove
`trackAtmosphereTiming`) had been running against the
pre-slice-12 build the whole time. Probe artifact
`2026-05-12T18-59-46-847Z` is the corrected baseline:

| Mode | SkyTexture EMA (slice 11 baseline → slice 14) | Real per-frame |
| --- | ---: | ---: |
| `open_frontier` | 5.03 → 3.26 | 0.35 |
| `zone_control` | 5.14 → 3.22 | 0.39 |
| `team_deathmatch` | 5.39 → 3.43 | 0.37 |
| `ai_sandbox` | 5.21 → 3.32 | 0.50 |
| `a_shau_valley` | 5.96 → 3.47 | 0.63 |

The EMA reports per-fire cost (~3 ms each); the actual per-frame
amortized cost is 0.35–0.63 ms — much smaller than the EMA
suggested. Refresh fires ~16×/sec across all modes despite the
2 s timer; investigation pending but the per-frame cost is small
enough that this is no longer the dominant concern.

**Process improvement**: the probe's `dist-perf` bundle must be
rebuilt before perf measurements (`npm run build:perf`). The crop
probe should either force a rebuild or detect-and-rebuild on a
stale-output check; this gap caused several false-negative
measurements in slices 11–13.

### Candidate primitives

| # | Primitive | Sketch | Est. saving | Cost / risk |
|---:|---|---|---:|---|
| 1.f | **TSL fragment-shader port (RECOMMENDED)** | Port the Hosek-Wilkie analytic eval, sun disc, and cloud-deck composition from CPU to a TSL fragment shader on the existing sky dome mesh. Uniforms: `sunDirection`, `turbidity`, `mieCoefficient`, `mieDirectionalG`, `rayleigh`, `exposure`, `cloudCoverage`, `cloudWindDir`, `cloudAnchor`, `cloudTime`. Drop `CanvasTexture` + `refreshSkyTexture` + per-pixel `putImageData` entirely. Retire `LUT_AZIMUTH_BINS x LUT_ELEVATION_BINS` CPU LUT — fragment shader runs the analytic per-pixel in parallel on GPU. | ~5.0 ms permanently across all modes (Atmosphere drops to <0.3 ms total) | Medium. Real engineering work — a few hundred lines of TSL plus uniform plumbing — but well-trodden (Three.js Sky.js example is the reference implementation). Must preserve `getSun/getZenith/getHorizon` accessors that feed fog + hemisphere lights; those can sample a tiny CPU LUT baked once per sun change. |
| 1.a | ~~Per-N-frames throttle~~ | Throttle outer `backend.update` to ~5 Hz. **Tried in slice 12; did not move EMA — outer call frequency is not the bottleneck, the inner refresh-timer is already 0.5 s gated.** | ~0 ms measured | Rejected. |
| 1.c | LUT-driven CPU refresh | Replace per-pixel `evaluateAnalytic` inside `refreshSkyTexture` with bilinear sample from the existing 32×8 LUT. | <0.5 ms measured | Correct micro-improvement but does not retire the `CanvasTexture` upload — the WebGPU anti-pattern remains. **Shipped as slice 12 but not the load-bearing fix.** |
| 1.g | DataTexture + 2 s refresh + LUT sample | Replace `CanvasTexture` with `DataTexture` (Uint8Array, direct upload), bump refresh period 0.5 s → 2 s, keep LUT-sample refresh body. | EMA unchanged (~5 ms) | All three architecturally-correct. None individually move EMA. **Shipped as slice 13 — checkpoint, not load-bearing.** |
| 1.d | Spherical-harmonic sky | Project Hosek-Wilkie to 9- or 16-coefficient SH bands on sun change. Eval cheap per-pixel; recompute coefficients only on sun delta. | ~4.5 ms | Medium. Same upload anti-pattern still applies if SH eval still ends in `CanvasTexture`. Architecturally inferior to 1.f. |
| 1.e | WebGPU compute pass | Move analytic eval to a compute shader. Async; result feeds the dome material as a `copyTextureToTexture` write. | ~5.0 ms CPU; +variable GPU | Higher complexity than 1.f. Compose later as a primitive shared with water reflections / cubemap bake; not needed for sky alone. |

### Recommendation

**Land 1.f (TSL fragment-shader port) as the real slice 12.**
Three.js ships a near-identical implementation for Preetham; porting
Hosek-Wilkie sun/cloud composition to TSL is mechanical work, and
it's the canonical WebGPU primitive for procedural sky. Expected
saving: ~5 ms across all modes; Atmosphere drops out of the top-3
CPU contributors.

Slice 12's LUT-driven CPU refresh ships as a checkpoint
improvement but is explicitly **not** the load-bearing fix. It
narrows the scope of the eventual TSL port (since the LUT and
fragment-shader analytic agree to bilinear precision) but does not
retire the `CanvasTexture` upload path.

## 2. Combat (1.42–3.24 ms)

### Current primitive

Per-entity AI tick from `CombatantLODManager.update`, distance-tiered
cadence (HIGH 3-frame stride, MEDIUM 5, LOW 8, CULLED 8 s). The
expensive sub-call is `AIStateEngage.initiateSquadSuppression` →
synchronous cover search — documented as the carry-over DEFEKT-3 with
combat AI p99 ~34 ms historically (now ~3 ms EMA after materialization
work hid most of it via culling, but the structure is unchanged).

### Candidate primitives

| # | Primitive | Sketch | Est. saving | Cost / risk |
|---:|---|---|---:|---|
| 2.a | **Async cover search (worker)** | Move BVH traversal to a worker; AI receives a candidate cover-point next frame via a double-buffered slot. | up to 2.0 ms | Medium. Requires snapshot-on-request semantics for combat state. |
| 2.b | **Spatial grid for cover enumeration** | 8 m uniform grid indexed by combatant position; cover-candidate scan walks only adjacent cells. Replaces O(N) BVH traversal with O(K) cell walk. | 1.0–2.0 ms | Low complexity; reuses existing SpatialGrid telemetry. |
| 2.c | **GPU compute visibility** | Compute shader does ray-march vs heightmap for all cover candidates in one pass. Result is a visibility mask returned to AI. | 1.5–2.5 ms | High complexity; needs a stable WebGPU compute pipeline. Aligned with the broader compute-shader bet. |
| 2.d | **Squad-aggregated AI** (Phase F memo slice 3) | One AI tick per squad; per-entity inherits squad-level decisions. Scales O(squads), not O(entities). | depends on density | Medium. Aligned with sim-strategic lane. Hits the 3,000-combatant scaling story directly. |
| 2.e | **bitECS storage** | Replace `Map<string, Combatant>` with SoA columnar storage. Cache-friendly iteration on hot fields (position, state, faction). | 0.5–1.0 ms | High blast radius (49+ file `lodLevel` rename territory). |

### Recommendation

**2.b (spatial grid)** is the smallest principled slice and unblocks
DEFEKT-3 directly. **2.d (squad-aggregated)** is the load-bearing
slice for 3,000-combatant scaling — it's a Phase F memo named slice
and remains the right second-step. **2.e (bitECS)** is deferred per
the existing Phase F memo guidance ("memo does not decide
storage choice"). Don't ship bitECS without a measured prototype
showing >0.5 ms savings on the hot path.

## 3. World (0.40–1.43 ms)

### Current primitive

Aggregated `World.*` includes Zone, Tickets, Weather, Water,
Atmosphere children. Atmosphere is already pulled out separately; the
residual 0.4–1.4 ms is dominated by `World.Weather` (0.68 ms in ZC,
0.82 ms in A Shau) and `World.Zone` (0.10–0.16 ms).

### Candidate primitives

| # | Primitive | Sketch | Est. saving | Cost / risk |
|---:|---|---|---:|---|
| 3.a | **Weather event-driven** | Today weather state ticks every frame; transition rolls are independent of frame rate. Move to a 1 Hz ticker. | ~0.7 ms | Trivial. |
| 3.b | **Zone state diff** | Today zone occupancy recomputes every frame; only the player-and-NPC enter/exit events change it. Hook into materialization tier events; skip steady frames. | ~0.10 ms | Cheap. Less leverage. |

### Recommendation

**3.a (weather 1 Hz)** is a free win once the sky throttle (slice 12)
is in. Bundle them.

## Cross-cutting primitive themes

- **Sparse update vs full recompute**: Atmosphere SkyTexture, Weather,
  Zone all recompute every frame despite per-frame input changes
  being null or negligible. A general "input-key cache + dirty flag"
  pattern lifts at least 5 ms per frame across these systems.
- **WebGPU compute** as a primitive shows up three times (sky LUT
  generation, cover visibility, water flow). It's worth one compute-
  pipeline prototype slice that proves the pipeline shape; subsequent
  slices reuse it.
- **Spatial-grid indexing** shows up twice (cover, materialization
  candidate selection). The existing SpatialGrid telemetry suggests
  the infrastructure already exists; a slice to wire AI candidate
  enumeration through it is small and unblocks the cover-search
  rewrite.
- **Worker offload** shows up twice (cover search, heightmap rebake)
  — worth a shared worker-protocol slice that handles request/response
  framing once.

## What this spike does NOT decide

- Whether to commit to WebGPU compute as a renderer-wide primitive.
  That needs a measured pipeline-shape prototype.
- Whether to migrate Combatant storage to bitECS. Orthogonal to the
  primitive question; depends on observed entity-churn cost.
- Whether the Hosek-Wilkie analytic sky is still the right sky model
  for the game vision. Throttle vs LUT vs SH is a cost question;
  cloud/weather representation is a separate art-direction question
  tracked in KONVEYER-10.
- Which specific terrain-edge / cloud-rep / asset-acceptance choice
  to make. Those tracks remain blocked on owner design decisions.

## Recommended slice order (post-spike, revised 2026-05-12 after
slice-12 empirical findings)

1. **Slice 12 (shipped, checkpoint) — LUT-driven CPU sky refresh.**
   Bilinear LUT sample replaces per-pixel `evaluateAnalytic`.
2. **Slice 13 (shipped, checkpoint) — DataTexture + 2 s refresh
   period + LUT sample.** Replaces `CanvasTexture` with
   `DataTexture`, bumps `SKY_TEXTURE_REFRESH_SECONDS` 0.5 → 2.0.
   None of slice 12 or 13 moves the SkyTexture EMA from ~5 ms.
   Confirms measurement is either artifactual or the cost lives in
   a path not addressable by the refresh-body. **Empirical
   exhaustion of CPU-side levers.**
3. **Slice 14 — TSL fragment-shader sky port (LOAD-BEARING).** Port
   Hosek-Wilkie analytic + sun disc + cloud-deck to a TSL fragment
   shader on the dome mesh. Retire `CanvasTexture` and the entire
   `refreshSkyTexture` path entirely. ~5 ms saving expected across
   all modes if measurement reflects reality; if measurement is
   artifactual the EMA will still drop because we delete the
   `beginSystem('World.Atmosphere.SkyTexture')` call. Either way,
   slice 14 is the diagnostically dispositive next step. References:
   three.js `examples/jsm/objects/Sky.js` (Preetham, fragment-
   shader), discourse threads on CanvasTexture+WebGPU anti-pattern.
4. **Slice 15 — Weather event-driven (3.a)**. ~0.7 ms.
5. **Slice 16 — Cover-candidate spatial grid (2.b)**. ~1.0–2.0 ms.
   Closes DEFEKT-3 surface.
6. **Slice 17 — Squad-aggregated strategic sim (2.d, Phase F memo
   slice 3)**. The 3,000-combatant scaling primitive.
7. **Slice 18 — WebGPU compute pipeline shape**. Cover visibility
   (2.c). Earns its weight by composing with other GPU work.

## Evidence inputs

- `artifacts/perf/2026-05-12T15-39-11-477Z/...` — slice 9 perf-window
  baseline.
- `artifacts/perf/2026-05-12T16-06-33-882Z/...` — slice 10
  system-timings attribution.
- `artifacts/perf/2026-05-12T16-22-28-343Z/...` — slice 11 atmosphere
  sub-attribution (THIS spike's primary input).
- `src/systems/environment/AtmosphereSystem.ts` — sky update site.
- `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` — the
  expensive analytic backend.
- `src/systems/combat/CombatantLODManager.ts` — Combat per-entity tick.
- `src/systems/combat/ai/AICoverFinding.ts` — synchronous cover search.
- `src/core/SystemUpdater.ts` — `WORLD_CHILD_BUDGET_MS` budgets that
  predated slice 10 measurement.
