# Cycle: KONVEYER Materialization Rearchitecture (Phase F continuation)

Last verified: 2026-05-12

## Status

Queued. Pickup branch: `origin/exp/konveyer-webgpu-migration` HEAD
(currently `1b31379c` — slice 15 idempotent `setCloudCoverage`).
Predecessor cycle [cycle-2026-05-11-konveyer-scene-parity](cycle-2026-05-11-konveyer-scene-parity.md)
closed the scene-parity arc and the atmosphere CPU collapse (slices 9-15).
Atmosphere worst-case now 0.52 ms on A Shau (was 5.99 ms); Combat is the
relatively largest CPU contributor at 1.5-6.5 ms across modes.

## Skip-confirm: yes

Autonomous continuation on the experimental branch. Hard stops still
force a halt-and-surface (see `Hard Stops`).

## Concurrency cap: 3

## Objective

Move the WebGPU/TSL branch from "credible renderer architecture" into
"3,000-combatant capable" by shipping the remaining Phase F memo slices:
sub-attribution where it is still missing, the lane-rename refactor that
unlocks the v2 budget arbiter, the cover-search spatial grid that closes
DEFEKT-3 surface, and the render-silhouette / render-cluster / squad-
aggregated-strategic-sim primitives.

Each slice ships as a single coherent commit on the experimental branch.
Strict WebGPU multi-mode proof (Open Frontier, Zone Control, Team
Deathmatch, `ai_sandbox`/combat120, A Shau Valley) and `npm run
build:perf` before every probe run are mandatory.

## Branch

- Continue `exp/konveyer-webgpu-migration`.
- Do NOT merge to `master`.
- Do NOT deploy experimental renderer code.
- Do NOT update `perf-baselines.json`.
- Do NOT edit `src/types/SystemInterfaces.ts` without an
  `[interface-change]` PR pre-approved by the owner.
- Do NOT accept WebGL fallback as migration proof; WebGL is named
  diagnostic comparison only.

## Required Reading

1. `AGENTS.md`
2. `docs/state/CURRENT.md` (slice 14+15 evidence + the dist-perf bundle
   process note)
3. `docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md` (reviewer-ready
   synthesis: accepted / blocked / needs-rearch + WebGPU verdict)
4. `docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md` (better compute
   primitives for SkyTexture, Combat, World; revised slice order at the
   bottom)
5. `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md` (sim-lane
   vs render-lane vocabulary; named target cases)
6. `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md`
7. `docs/INTERFACE_FENCE.md`
8. `docs/TESTING.md`
9. `docs/CARRY_OVERS.md`
10. `src/systems/combat/ai/AICoverFinding.ts` (cover-search target)
11. `src/systems/combat/CombatantSystem.ts` (sub-attribution target —
    internal `profiler.profiling.*` tracking exists but is not
    surfaced through `performanceTelemetry.beginSystem`)
12. `src/systems/combat/CombatantLODManager.ts` (lane-rename blast
    radius)
13. `src/systems/environment/AtmosphereSystem.ts`,
    `src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts` (sky
    refresh investigation)

## Critical Process Notes

These caused ~30 minutes of false-negative measurement in slice 13;
do not repeat:

1. **The crop probe runs against a pre-built `dist-perf` bundle**, not
   HMR source. Source changes are NOT auto-rebuilt. Run
   `npm run build:perf` BEFORE every probe run after editing source.
2. **The crop probe requires `--headed`** to reach WebGPU on this
   workstation. The headless adapter resolves to swiftshader/CPU.
3. The relevant probe entry-point: `scripts/konveyer-asset-crop-probe.ts`.
   It captures perf-window + system breakdown + sky-refresh stats and
   writes `artifacts/perf/<ISO>/konveyer-asset-crop-probe/*.json`.

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `konveyer-combat-sub-attribution`, `konveyer-materialization-lane-rename`, `konveyer-sky-refresh-investigate` | 3 | R1 establishes diagnostics + the surface arbiter v2 writes to + closes the small sky-refresh residual. |
| 2 | `konveyer-cover-spatial-grid`, `konveyer-render-silhouette-lane` | 2 | R2 starts after R1 sub-attribution lands (needs Combat child timings to verify the saving). |
| 3 | `konveyer-squad-aggregated-strategic-sim`, `konveyer-budget-arbiter-v2` | 2 | R3 composes the lane vocabulary into a single arbiter that consumes per-frame inputs. Blocked on R1 lane-rename. |
| 4 | `konveyer-render-cluster-lane`, `konveyer-strict-webgpu-cross-mode-proof-v2`, `konveyer-docs-review-packet-v2` | 3 | R4 ships the final lane + multi-mode proof + reviewer packet update. |

## Task Scope

### konveyer-combat-sub-attribution (R1)

`CombatantSystem.update` has internal `profiler.profiling.{influenceMapMs,
aiUpdateMs, billboardUpdateMs, effectPoolsMs}` tracking but no
`performanceTelemetry.beginSystem` children, so the probe sees Combat as
one bucket (1.5-6.5 ms across modes). Wrap each sub-step with
`beginSystem('Combat.Influence')`, `beginSystem('Combat.AI')`,
`beginSystem('Combat.Billboards')`, `beginSystem('Combat.Effects')` and
extend the crop probe to drain `systemBreakdown` for the `Combat.*`
keys. This is the diagnostic input for `konveyer-cover-spatial-grid`
sizing.

**Acceptance**: probe artifact shows non-zero EMA values for each
`Combat.*` child across all five modes; aggregate `Combat` cost matches
the sum of children within 5% margin (small per-call overhead is
expected and acceptable).

### konveyer-materialization-lane-rename (R1)

Pure refactor — `Combatant.lodLevel` → `Combatant.simLane`; introduce
`Combatant.renderLane`. No behavior change. Wide blast radius
(`CombatantLODManager`, telemetry, tests, `MaterializationProfile`
rows). The `simLane` enum stays {`HIGH`, `MEDIUM`, `LOW`, `CULLED`};
`renderLane` enum is the new {`close-glb`, `impostor`, `silhouette`,
`cluster`, `culled`} (with `silhouette`/`cluster` not yet emitted by
the renderer — that comes in R2/R4). This is the surface that
`konveyer-budget-arbiter-v2` writes to.

**Acceptance**: `npm run lint`, `npm run test:run`, `npm run build`
all pass. Probe artifact unchanged. No public API regression.

### konveyer-sky-refresh-investigate (R1)

Slice 14's refresh-counter exposed that sky-texture refresh still fires
5-10×/sec after slice 15 despite `SKY_TEXTURE_REFRESH_SECONDS=2.0`.
Likely cause: `LUT_REBAKE_COS_THRESHOLD` fires on tiny sun motion in
`todCycle` scenarios. Trace the dirty-flag origin (`markSkyTextureDirty`
callers in `HosekWilkieSkyBackend.ts`) and either tighten the threshold
or make the threshold-driven path idempotent like `setCloudCoverage`
was in slice 15. Expected saving: per-frame ~0.5 ms → ~0.1 ms.

**Acceptance**: probe artifact shows refresh fires ≤2 per 4.5s window
across all five modes; SkyTexture EMA ≤0.2 ms in every mode.

### konveyer-cover-spatial-grid (R2)

Primitive-spike target 2.b. `AIStateEngage.initiateSquadSuppression` runs
a synchronous BVH-style cover search per engagement; spike doc names a
uniform 8 m spatial grid indexed by combatant position as the
replacement primitive. Reuse the existing `SpatialGrid` telemetry
infrastructure rather than introducing a new one. Closes DEFEKT-3
surface.

**Acceptance**: probe artifact shows `Combat` aggregate drops by
≥1.0 ms in `ai_sandbox` and `a_shau_valley`; cover-search authority
unchanged (no AI behavioral regressions in
`src/integration/combat-*.test.ts`); A Shau p99 holds ≤33 ms.

### konveyer-render-silhouette-lane (R2)

Primitive-spike + materialization-tiers doc target. Adds a low-cost
billboard tier between impostor and culled: single sprite, single
tone, no animation, capped per CDLOD cluster. Lets A Shau read as
visibly populated from flight-altitude views without per-actor draws.
Renderer-side only — `renderLane === 'silhouette'` is emitted by the
v1 arbiter as a placeholder; v2 (R3) wires the explicit assignment.

**Acceptance**: probe artifact shows visible silhouette draws in
A Shau review pose; close-GLB cap behavior unchanged; A Shau p99
holds ≤33 ms; no console errors.

### konveyer-squad-aggregated-strategic-sim (R3)

Phase F memo slice 3. The CULLED sim-lane today ticks each entity
independently every 8 s; at 3,000 combatants that is 3,000 distant
ticks per cycle. Replace with per-squad bulk move via `SquadManager`
+ `WarSimulator`. O(squads) not O(entities). Required before a
real `combat3000` scenario is meaningful.

**Acceptance**: A Shau `WarSim` EMA drops at least 50% from the
post-slice-15 baseline (0.26 ms — likely smaller absolute number but
the scaling property is the load-bearing claim); strategic-spawn
cadence holds (no NPC despawn regressions); A Shau p99 ≤33 ms.

### konveyer-budget-arbiter-v2 (R3)

Extends slice 5's `inActiveCombatWeight` from "one more weight in the
candidate priority score" to a single function consuming per-frame
inputs (camera frustum, active-zone list, heap/frame budget, sorted
candidates) and assigning one `simLane` + one `renderLane` per
combatant with explicit budget accounting. Required before
silhouette/cluster lanes are composable without re-implementing
per-system caps.

**Acceptance**: review-pose state across all five modes shows valid
assignments for every materialization row (no `unknown` lane); A Shau
in-combat actors at hard-near distance now resolve to `silhouette`
instead of `impostor:total-cap` when the close-GLB cap is exhausted.

### konveyer-render-cluster-lane (R4)

One billboard per squad with squad-count badge beyond silhouette range.
The proxy is not a combatant; `Combatant` records still exist as
strategic state, they just aren't drawn. Composes with the v2 arbiter.

**Acceptance**: probe artifact shows cluster draws in A Shau from
flight-altitude view; per-squad badge count accurate vs. squad
membership; A Shau p99 ≤33 ms.

### konveyer-strict-webgpu-cross-mode-proof-v2 (R4)

Multi-mode strict-WebGPU evidence packet covering R1-R4 together. All
five modes resolve `resolvedBackend=webgpu` with zero console/page
errors. Per-mode steady-pose p99 must hold ≤33 ms (the Phase F memo
slice 7 gate); A Shau is the tightest margin.

**Acceptance**: artifact under
`artifacts/perf/<ISO>/konveyer-asset-crop-probe/asset-crop-probe.json`
showing all five modes pass; deltas tabled against the slice 15
baseline (`2026-05-12T20-46-15-213Z`).

### konveyer-docs-review-packet-v2 (R4)

Update `docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md` (or write a
successor `KONVEYER_REVIEW_PACKET_2026-05-13.md`) with the new
accepted/blocked/needs-rearch tables. Update `docs/state/CURRENT.md`
last-verified date and Phase F slice list. Refresh
`docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md` slice-order
table with results.

**Acceptance**: source-of-truth docs reflect post-cycle state; no
contradictions with the active artifacts.

## Dependencies

```
combat-sub-attribution      ─┐
materialization-lane-rename ─┼─→ cover-spatial-grid       ─┐
sky-refresh-investigate     ─┘  render-silhouette-lane     │
                                                           ↓
                          squad-aggregated-strategic-sim ──┐
                          budget-arbiter-v2 ───────────────┤
                                                           ↓
                          render-cluster-lane ─────────────┼─→ strict-webgpu-cross-mode-proof-v2 ─→ docs-review-packet-v2
```

## Reviewer Policy

- `combat-reviewer` on PRs touching `src/systems/combat/**` or
  `src/integration/**combat*` — applies to
  `konveyer-combat-sub-attribution`, `konveyer-cover-spatial-grid`,
  `konveyer-budget-arbiter-v2`, and (likely)
  `konveyer-render-silhouette-lane` / `konveyer-render-cluster-lane`.
- `terrain-nav-reviewer` on any touch to `src/systems/terrain/**` or
  `src/systems/navigation/**` (none expected this cycle, but the
  reviewer matrix policy still applies).
- `perf-analyst` after `konveyer-strict-webgpu-cross-mode-proof-v2`
  publishes the multi-mode artifact.

## Out of Scope (parked / blocked)

These remain blocked on owner decisions and do NOT progress in this
cycle:

- **A Shau finite-edge** (KONVEYER-12) — owner decision required (real
  outer DEM, explicit flight/camera boundary, or documented hybrid).
- **Cloud representation** — art/representation decision (volumetric /
  layered noise / Pixel Forge cloud asset pass).
- **Vegetation + NPC asset acceptance** — Pixel Forge regen / impostor
  rebake / texture edit pipeline decision.
- **Water shader / art / physics** (VODA-1/2/3) — hydrology contract
  proved; shader, intersections, flow, swimming/buoyancy, watercraft
  remain open.
- **Terrain / fire authority** (DEFEKT-6) — shared authority pass
  across player fire, NPC fire, AI LOS, cover, active-driver shot
  validation, materialization-state caches.
- **Startup stamped-heightmap rebake** (~48 ms one-time) — tractable
  via Web Worker but not a runtime gating issue.
- **TSL fragment-shader sky port** — after slice 15 Atmosphere is
  <1 ms; saving is now ~0.4 ms across modes. Park unless a future
  slice surfaces a regression.

## Cycle-level Success Criteria

1. **Combat sub-attribution shipped** — probe artifact shows Combat
   broken into Influence / AI / Billboards / Effects across all five
   modes.
2. **Lane-rename refactor shipped** — `Combatant.simLane` and
   `Combatant.renderLane` are the canonical fields; tests + telemetry
   updated; no behavior change.
3. **Cover-search spatial grid shipped** — `Combat` aggregate drops
   ≥1.0 ms on `ai_sandbox` and `a_shau_valley`; AI behavior unchanged.
4. **Render-silhouette + render-cluster lanes shipped** — A Shau and
   flight-altitude views read as populated; per-actor draw count
   does not balloon at the silhouette/cluster cap boundary.
5. **Squad-aggregated strategic sim shipped** — CULLED tier scales
   O(squads); strategic-spawn cadence holds.
6. **Budget arbiter v2 shipped** — single function assigning simLane +
   renderLane per combatant; explicit budget accounting; named A Shau
   in-combat cases resolve to `silhouette` instead of
   `impostor:total-cap`.
7. **Strict-WebGPU multi-mode proof passes** — all five modes; p99
   ≤33 ms held across cycle; A Shau is the tightest margin.
8. **Review packet updated** — `KONVEYER_REVIEW_PACKET_*` and
   `KONVEYER_PRIMITIVE_SPIKES_*` reflect post-cycle state.

If 1-6 ship but the multi-mode proof shows any mode regressing past
33 ms p99, the cycle is INCOMPLETE; cycle ID is reused with `-2`
suffix until the gate holds.

## Hard Stops

Restated:

- Fenced-interface change (`src/types/SystemInterfaces.ts`) → halt,
  surface to owner, do not edit.
- `perf-baselines.json` refresh → not allowed on this branch.
- `master` merge or production deploy → not allowed on this branch.
- WebGL fallback as migration proof → not allowed; WebGL is named
  diagnostic comparison only.
- Any A Shau p99 regression past 33 ms after a slice → revert the
  slice, surface to owner.
- Carry-over count growth across the cycle → cycle is INCOMPLETE.

## End-of-cycle Ritual

Auto-advance: NO. This is experimental-branch work; the next cycle
selection waits for owner approval after the review packet update.

Standard ritual:

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/cycle-2026-05-13-konveyer-materialization-rearch/<slug>.md`.
2. Append `## Recently Completed (cycle-2026-05-13-konveyer-materialization-rearch)`
   to `docs/BACKLOG.md` with commit list + one-line summaries.
3. Reset `AGENT_ORCHESTRATION.md` "Current cycle" section.
4. Commit: `docs: close cycle-2026-05-13-konveyer-materialization-rearch`.

## Pickup Hand-off (for the agent that runs this cycle)

You are picking up `origin/exp/konveyer-webgpu-migration` HEAD. The
predecessor cycle closed the atmosphere CPU collapse — total
Atmosphere is now <1 ms across all five modes. Combat is the next
relatively-largest CPU contributor at 1.5-6.5 ms with no
sub-attribution yet.

Start in Round 1 with all three tasks in parallel. The sub-attribution
slice is the diagnostic input for R2's cover-spatial-grid sizing, so
land it first; the lane-rename refactor and sky-refresh investigate
slices are independent.

The single most important process discipline: **run `npm run
build:perf` before every probe run after touching source.** The probe
uses `vite preview --outDir dist-perf` against the pre-built bundle.
Without the rebuild, your measurements are meaningless. Slice 14 spent
~30 minutes debugging this; that experience is in
`docs/state/CURRENT.md` slice-14 evidence — read it.
