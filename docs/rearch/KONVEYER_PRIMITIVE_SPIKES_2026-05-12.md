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

### Current primitive

`HosekWilkieSkyBackend.update(deltaTime, sunDirection)` re-runs the
full Hosek-Wilkie analytic sky model every frame and rewrites the
sky-dome material uniforms. The model evaluates a 9-coefficient
spectral sky color formula across multiple sample directions per
update. Sun direction is read from `AtmosphereSystem.sunDirection`
which only changes when a `todCycle` is active (most scenarios have
no todCycle and the sun is static).

### Candidate primitives

| # | Primitive | Sketch | Est. saving | Cost / risk |
|---:|---|---|---:|---|
| 1.a | **Per-N-frames throttle** (slice 12 plan) | Accumulate `deltaTime`; only call `backend.update` when accumulator > 200 ms (≈5 Hz). Sun lerps over the gap if needed. | ~4.5 ms | Trivial — one accumulator + a guard. No visual change for static-sun scenarios. todCycle modes need a lerp on the dome uniforms between updates. |
| 1.b | **Input-keyed recompute** | Cache last `(sunDirection, scenarioKey, turbidity)`. Skip recompute when key unchanged. | ~5.0 ms in static-sun modes; ~0 in todCycle | Cheap. Doesn't help A Shau day cycle. |
| 1.c | **Precomputed LUT** | 3D texture indexed by `(sunAzimuth, sunElevation, turbidity)` — built once per scenario, sampled by the dome shader. Replace per-frame analytic eval with a single texture sample. | ~5.0 ms permanently | Medium. LUT build is offline. Loses analytical accuracy on edge cases (extreme turbidity changes). |
| 1.d | **Spherical-harmonic sky** | Project Hosek-Wilkie to 9- or 16-coefficient SH bands on sun change. Eval cheap per-pixel; recompute coefficients only on sun delta. | ~4.5 ms | Medium. SH loses some sky variance but is standard for environment lighting. |
| 1.e | **WebGPU compute pass** | Move analytic eval to a compute shader. Async; result feeds the dome material as a texture write. | ~5.0 ms CPU; +variable GPU | High complexity. Earns its weight only if it composes with future GPU work (cubemap, water reflection, fog volume). |

### Recommendation

Land **1.a (throttle, slice 12)** immediately — it's a single
commit, free across all modes, and unblocks every other rearch slice
by removing the dominant cost. Then evaluate **1.c (LUT)** as the
durable replacement once the throttle's edge cases (todCycle lerp,
weather-driven turbidity change) are characterized.

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

## Recommended slice order (post-spike)

1. **Slice 12 — Sky-backend throttle (1.a)**. ~4.5 ms across all
   modes. Trivial diff. Unblocks every other measurement.
2. **Slice 13 — Weather event-driven (3.a)**. ~0.7 ms. Bundle with
   slice 12 verification probe.
3. **Slice 14 — Cover-candidate spatial grid (2.b)**. ~1.0–2.0 ms.
   Closes DEFEKT-3 surface.
4. **Slice 15 — Squad-aggregated strategic sim (2.d, Phase F memo
   slice 3)**. The 3,000-combatant scaling primitive.
5. **Slice 16 — Sky LUT prototype (1.c)**. Durable replacement for
   slice 12's throttle. Only after slice 12 evidence shows what the
   todCycle / weather edge cases need.
6. **Slice 17 — WebGPU compute pipeline shape**. Either as cover
   visibility (2.c) or sky LUT generation (1.c). Earns its weight by
   composing.

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
