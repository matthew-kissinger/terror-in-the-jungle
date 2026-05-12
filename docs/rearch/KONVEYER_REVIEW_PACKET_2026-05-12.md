# KONVEYER Review Packet

Last verified: 2026-05-12

Branch: `exp/konveyer-webgpu-migration`. Source-of-truth pickup point:
`origin/exp/konveyer-webgpu-migration` HEAD, not any frozen SHA in this doc.

This packet is the reviewer-ready synthesis of what the KONVEYER WebGPU/TSL
experimental branch has actually delivered against the game vision — dense
Vietnam jungle, readable combatants, credible sky/weather from ground and
flight, finite maps that do not look unfinished, water as a visible and
interactive scene system, and materialization tiers toward 3,000 combatants.

It explicitly names what is accepted, what is blocked, what needs
rearchitecture, and whether WebGPU/TSL is becoming the right renderer
architecture for this game.

Hard stops remain in force throughout: no `master` merge, no production
deploy, no `perf-baselines.json` refresh, no fenced-interface edit
(`src/types/SystemInterfaces.ts`), no WebGL fallback as migration proof.

## TL;DR

- Renderer migration: KONVEYER-0..9 closed. Strict WebGPU resolves on
  headed hardware across all five game modes with zero console/page errors.
  Terrain ground tone is accepted.
- Materialization track: six Phase F slices shipped during cycle
  2026-05-11 (parity) → 2026-05-12 (Phase F). The close-model layer now
  has a working priority-based arbiter with combat-state awareness,
  parseable per-row diagnostics, multi-mode evidence including A Shau,
  and a typed event surface for subscriber systems.
- WebGPU/TSL is becoming the right renderer architecture. Recommendation:
  keep building toward 3,000 combatants on this baseline. Specific
  rearchitecture proposals listed below.
- Scene parity is **not** finished. A Shau finite-edge, sky/cloud
  representation, water shader/art, vegetation+NPC asset acceptance, and
  terrain/fire authority (DEFEKT-6) remain open. These are
  art/representation or deeper-architecture questions, not migration
  blockers.

## What Is Accepted (Shipped + Proven)

### Renderer migration (KONVEYER-0..9)

- Strict WebGPU is the default and only acceptance path. Default startup
  fails loudly if Three resolves to WebGL.
- Active production render blockers (`ShaderMaterial`,
  `RawShaderMaterial`, `onBeforeCompile`, `WebGLRenderTarget`,
  `EffectComposer`) are zero on the active runtime path. K7 ported
  vegetation, NPC impostors, terrain CDLOD, sky, water, muzzle flashes
  to TSL node materials or standard materials.
- Headed hardware proof on RTX 3070: WebGPU adapter PASS, all five
  modes (Open Frontier, Zone Control, Team Deathmatch, combat120 /
  ai_sandbox, A Shau Valley) reach gameplay under
  `?renderer=webgpu-strict`.
- Live combat120 capture proves the path under load.
- Documented in `docs/rearch/KONVEYER_PARITY_2026-05-10.md` (KONVEYER-0
  through KONVEYER-9 ledger).

### Terrain ground-tone acceptance

- `artifacts/perf/2026-05-11T02-00-18-828Z/projekt-143-terrain-visual-review/visual-review.json`
  is the accepted terrain visual packet under strict WebGPU.
- 2026-05-11 terrain/lighting repair restored CDLOD placement, bounded
  sky/fog lighting, sRGB albedo policy, and Open Frontier + A Shau
  ground tone.

### Materialization tier model (Phase F slices 0..6, shipped 2026-05-12)

The close-model layer ("which combatants render as full Pixel Forge GLBs,
which as impostor billboards, which as culled") has a working
priority-based arbiter. Six concrete slices landed:

| Slice | Commit | What it does |
|------:|--------|--------------|
| 0 | (pre-cycle) | Spawn-residency reserve: lift close-GLB cap when a crowded spawn cluster lands inside 64 m of the player. |
| 1 | `f056f5...` | Generalize reserve from spawn-only to **real-time hard-near cluster density**. Renamed `spawnResidency*` → `hardNearReserve*`. Bumped extra-cap 4 → 6. Pool 12 → 14 per faction. |
| 2 | `2656df...` | **Pre-release stale actives** before candidate iteration so cross-frame churn no longer produces phantom `pool-empty` fallbacks. combat120 review went from `pool-empty:6` → `pool-empty:0`. |
| 3 | `039bbf...` | **A Shau directed-warp evidence (probe-only).** Crop probe teleports player to a contested A Shau zone (Hill 937) before close-NPC review so the WarSimulator materializes live combatants. Strategic-tier 3,000-unit simulation now has multi-mode evidence parallel to the other four modes. |
| 4 | `1ede03...` | **MaterializationProfile v2**: `CombatantMaterializationRow` carries `reason` (parseable render-lane reason — `close-glb:active`, `impostor:total-cap`, etc.) and `inActiveCombat` (firefight participation flag). Surfaced through `window.npcMaterializationProfile()` and the crop probe's `nearest[]`. |
| 5 | `d283c7...` | **Budget arbiter v1**: `inActiveCombatWeight=8` added to the close-model candidate priority score. Actors currently ENGAGING/SUPPRESSING/ADVANCING get a priority boost between `squadWeight` (4) and `onScreenWeight` (10), so combat state composes with the other signals rather than dominating them. The Phase F memo's named target case ("a combatant being shot at is render-close eligible even at 130 m") is now realized as a weight. |
| 6 | `d90db3...` | **Tier-transition events**: `CombatantRenderer.updateBillboards` emits `materialization_tier_changed` on `GameEventBus` when a combatant's render mode changes between frames. Payload: `{ combatantId, fromRender, toRender, reason, distanceMeters }`. Subscribers (minimap, audio, perception, fog-of-war) can react without polling. |
| 7 | probe-side | **Materialization perf-window gate**: the crop probe drains `window.__metrics` and captures a 4500 ms steady-pose perf window per mode. Five-mode p99 frame times under strict WebGPU on RTX 3070 are now recorded (`open_frontier` 16.5 ms, `zone_control` 16.6 ms, `team_deathmatch` 16.6 ms, `ai_sandbox` 23.0 ms, `a_shau_valley` 31.0 ms). All inside the memo slice-7 budget (p99 ≤ 33 ms). This is the falsifiable bar future rearch slices get measured against. |

Multi-mode strict-WebGPU evidence (canonical per slice):

| Slice | Artifact |
|------:|----------|
| 1 | `artifacts/perf/2026-05-12T02-24-10-594Z/konveyer-asset-crop-probe/asset-crop-probe.json` |
| 2 | `artifacts/perf/2026-05-12T03-06-33-332Z/konveyer-asset-crop-probe/asset-crop-probe.json` |
| 3 | `artifacts/perf/2026-05-12T03-33-59-816Z/konveyer-asset-crop-probe/asset-crop-probe.json` |
| 4 | `artifacts/perf/2026-05-12T04-48-59-955Z/konveyer-asset-crop-probe/asset-crop-probe.json` |
| 5 | `artifacts/perf/2026-05-12T09-45-53-698Z/konveyer-asset-crop-probe/asset-crop-probe.json` |
| 6 | `artifacts/perf/2026-05-12T12-55-00-499Z/konveyer-asset-crop-probe/asset-crop-probe.json` |

All five modes resolve `resolvedBackend=webgpu` with zero console/page
errors across every slice. Per-mode review-pose state after slice 6:

| Mode | Cap | Candidates ≤120 m | Rendered close-GLB | Fallbacks |
| --- | ---: | ---: | ---: | --- |
| `open_frontier` | 10 | 10 | 10 | none |
| `zone_control` | 9 | 13 | 9 | total-cap:4 |
| `team_deathmatch` | 14 | 16 | 14 | total-cap:2 |
| `ai_sandbox` (combat120) | 14 | 29 | 14 | total-cap:15 |
| `a_shau_valley` | 14 | 60 | 14 | total-cap:46 |

Zero `pool-empty` and zero `pool-loading` across all five modes. Every
remaining fallback is at the designed materialization-tier cap boundary.

### Sky/cloud anchoring (interim)

- K13 first slice (commit `ca5876...`) replaced UV-texture cloud sampling
  with a world/altitude-projected 1,800 m cloud deck inside the
  camera-followed sky dome. Strict WebGPU proof:
  `artifacts/perf/2026-05-11T22-11-28-128Z/konveyer-scene-parity/scene-parity.json`.
- Cloud anchoring model is accepted as an interim, not as final cloud art.

### Water/hydrology bridge

- `npm run check:hydrology-bakes` passes. Source audit + runtime proof
  exist; `WaterSystem.sampleWaterInteraction` is the consumer-ready
  contract for buoyancy/swimming/wading.
- Runtime proof: `artifacts/perf/2026-05-11T21-33-31-662Z/projekt-143-water-runtime-proof/water-runtime-proof.json`.
- Bridge is accepted; shader/art/physics is not.

## What Is Blocked

### A Shau finite-edge presentation (KONVEYER-12)

- DEM has no real outer source data. The synthetic 1,600 m collar
  experiment at
  `artifacts/perf/2026-05-11T21-58-04-137Z/konveyer-scene-parity/scene-parity.json`
  read as a tan/gold synthetic band and was rejected.
- Owner decision needed: real outer DEM/source data, explicit
  flight/camera boundary, or a documented hybrid. Do not re-tune the
  collar probe.

### Sky/cloud representation (KONVEYER-10)

- World/altitude anchoring is in place, but cloud art still produces
  straight-line cutoffs, hard bands, alignment seams, and blocky
  low-resolution puffs in some camera poses.
- Either a new cloud representation (volumetric / layered noise / authored
  weather assets) or a Pixel Forge cloud asset pass is needed. This is a
  representation/art decision, not a tuning question.

### Vegetation + NPC asset acceptance (KONVEYER-10)

- Asset-material audit:
  `artifacts/perf/2026-05-11T22-24-56-014Z/konveyer-asset-material-audit/asset-material-audit.json`.
- Findings: NPC impostor atlases are very dark and lifted heavily by
  material uniforms; NPC normal maps absent in the active probe;
  vegetation impostors have sparse alpha plus a bright green tint bias.
- Decision input for Pixel Forge regeneration / impostor rebake /
  texture edit. Not a shader-tuning question.

### Water shader / art / physics

- Hydrology contract proved; shader, intersections, flow, visual
  acceptance, and gameplay consumers (buoyancy, swimming, wading,
  watercraft) all open. Tracked under VODA-1/2/3.

### Terrain / fire authority (DEFEKT-6)

- Player report: enemies can still be shot through terrain. First slice
  patched one player-fire BVH-miss gap, but the broader contract
  (player fire, NPC fire, AI LOS, cover, active-driver shot validation,
  materialization-state caches) needs a shared authority pass.
- Strict WebGPU browser proof of the patched case:
  `artifacts/perf/2026-05-11T19-14-54-162Z/konveyer-terrain-fire-authority/terrain-fire-authority.json`.

### Atmosphere over-budget (re-prioritization, found 2026-05-12)

- Slice 10's system-timings probe extension found `World.Atmosphere`
  is the dominant CPU contributor in every mode at 5.16–6.39 ms vs
  a 0.38 ms budget (13.6×–16.8× over). In front of `Combat` (1.55–
  3.24 ms), `World` (0.40–1.43 ms), `Terrain` (0.07–0.60 ms),
  `WarSim` (0.26 ms in A Shau).
- Slice 11 sub-attribution: 99%+ of the Atmosphere cost is in
  `World.Atmosphere.SkyTexture` (the Hosek-Wilkie backend update).
  `LightFog` and `Clouds` are correctly cheap at <0.05 ms combined.
  Evidence:
  `artifacts/perf/2026-05-12T16-22-28-343Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
- The Hosek-Wilkie backend does not need a 60 Hz update — sun
  direction changes are small per frame and the sky depends only on
  `(sun, scenario preset)`. Throttling backend update to ~5 Hz
  should drop SkyTexture from ~5 ms to ~0.4 ms, freeing ~4.5 ms per
  frame across all modes. **Targeted-restructure fix; slice 12.**
- This is a re-prioritization signal. The materialization rearch
  slices (sim-strategic, render-silhouette, render-cluster, lane
  refactor) remain architecturally correct but their frame-budget
  payoff will stay invisible until the sky throttle lands.

### Startup stamped-heightmap rebake (KONVEYER-10 perf attribution)

- ~48.5 ms in Open Frontier startup, dominated by grid iteration over
  1,363 stamps on the 1024 grid. Small wins (~2-4 ms) available from
  sqrt-skip / dedupe; larger wins (~30+ ms) need a Web Worker.
- Tractable when the larger slice is acceptable; not a renderer
  blocker.

### combat120 perf baseline refresh (STABILIZAT-1)

- Latest tracked compare against the prior baseline is WARN, not FAIL.
  Strict WebGPU runtime is healthy (avg 16.8 ms, p99 37.8 ms in the
  pre-slice runs). Baseline refresh is policy-blocked on this branch
  per the hard stops.

### Asymmetric residual misses in the budget arbiter

- combat120 review still leaves 1 in-combat actor at 88.1 m on
  `impostor:total-cap` (outside the 64 m hard-near reserve bubble;
  correctly outranked by closer hard-near actors).
- A Shau review leaves 2 in-combat actors at hard-near distances on
  `impostor:total-cap` (most likely off-screen, outranked by on-screen
  non-combat actors).
- These are not regressions — they are correct outputs of the v1
  weighted composition. A v2 arbiter (see below) could promote them
  further, but the current behavior is the documented design.

## What Needs Rearchitecture

These are the architecturally load-bearing next slices toward the vision
goal of 3,000 combatants. Each is independently shippable and each
respects the hard stops.

### Sim-strategic lane (Phase F memo slice 3)

- Today the CULLED lane ticks each entity independently every 8 s. At
  3,000 combatants that's 3,000 distant ticks.
- Proposal: a `sim-strategic` lane that ticks per-squad bulk move via
  `SquadManager` + `WarSimulator`, scaling O(squads) not O(entities).
- WarSimulator strategic-spawn cadence finding from slice 3 (~5.9 s
  between player teleport and first close-radius materialization) is
  relevant here: the same cadence policy decides both when distant
  units tick and when they promote toward the player.

### Render-silhouette lane (Phase F memo slice 4)

- Today beyond impostor range a combatant is hidden (CULLED).
- Proposal: a `render-silhouette` lane — single low-cost billboard or
  sprite, single tone, no animation, capped per CDLOD cluster — fills
  the gap between impostor and culled. Lets A Shau read as visibly
  populated from a flight-altitude camera without per-actor draws.

### Render-cluster lane (Phase F memo)

- One billboard per squad with a squad-count badge, beyond silhouette
  range. The proxy is not a combatant; the `Combatant` records still
  exist as strategic state, they just are not draws.

### Lane-naming refactor (Phase F memo slice 1)

- Rename current `Combatant.lodLevel` to `simLane`; introduce
  `renderLane` as a separate field. No behavior change. Adds the surface
  that the future budget arbiter v2 writes to.
- Wide blast radius across `CombatantLODManager`, telemetry, tests.
  Ships strictly as a refactor.

### Budget arbiter v2 (extending slice 5)

- Today the v1 arbiter is one weight (`inActiveCombatWeight`) added to a
  priority score. A v2 arbiter would be a single function that consumes
  per-frame inputs (camera frustum, active-zone list, heap/frame
  budget, sorted candidates) and assigns one `simLane` + one
  `renderLane` per combatant, with explicit budget accounting.
- Required before the render-silhouette and render-cluster lanes can be
  composed without re-implementing per-system caps.

### 3,000-unit scenario perf gate (Phase F memo slice 7)

- **Probe-side gate landed 2026-05-12.** Rather than a synthetic
  `combat3000` mode, the crop probe now drains
  `window.__metrics` and captures a 4500 ms steady-pose perf window
  against the actual five game modes — including A Shau Valley, which
  is the existing 3,000-unit strategic simulation with selective
  materialization. Evidence:
  `artifacts/perf/2026-05-12T15-39-11-477Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
- Per-mode steady p99 frame time (RTX 3070, headed, strict WebGPU):
  `open_frontier` 16.5 ms; `zone_control` 16.6 ms;
  `team_deathmatch` 16.6 ms; `ai_sandbox` (combat120) 23.0 ms;
  `a_shau_valley` 31.0 ms. All pass the memo slice-7 budget
  (p99 ≤ 33 ms). A Shau has the tightest margin at 2.0 ms; that is
  the bar future rearch slices (sim-strategic, render-silhouette,
  render-cluster, budget arbiter v2) get measured against.
- The remaining server-of-record gap is a dedicated `combat3000`
  fully-live scenario (3,000 simultaneous live combatants, not
  strategic-tier). That requires a sim-strategic lane to exist; until
  then it would only test a worst-case the engine is not yet
  architected to handle. A Shau remains the right canonical scenario.

## Is WebGPU/TSL The Right Renderer Architecture?

**Yes, with named conditions.**

The branch has shipped a substantive Phase F materialization layer on
top of a clean WebGPU/TSL migration. The renderer itself is stable: zero
production render blockers, strict WebGPU resolves on real hardware
across five game modes, and the close-model + impostor + culled tier
model now has a working priority-based arbiter with a typed event
surface for subscribers.

This is no longer "WebGPU migration parity"; the materialization
diagnostics, budget arbiter v1, and tier-transition events go beyond
the WebGL implementation's prior compromises. The renderer/material/
event surface is now better suited to the game vision than the WebGL
path was.

Conditions on continuing this direction:

1. **Master merge gating** remains owner-approved. This packet does not
   merge anything; it documents what is reviewable.
2. **WebGL is named diagnostic comparison only**, never a fallback
   success path. The renderer matrix script enforces this.
3. **A Shau finite-edge** must get a real owner decision (DEM/source
   data, flight/camera boundary, or documented hybrid) before any
   public claim about A Shau as a flight-scale environment.
4. **Cloud representation** needs a representation or asset-authoring
   decision before any claim about flight-scale weather feel.
5. **3,000-unit perf gate** is now in place as the probe's
   materialization perf-window (4500 ms steady samples against the
   live A Shau strategic scenario). Future rearch slices must hold
   or improve A Shau's p99 31.0 ms; any regression past 33 ms is
   a gate failure.
6. **Fenced interface change** (`src/types/SystemInterfaces.ts`) needs
   an explicit `[interface-change]` PR with reviewer approval before the
   `WebGLRenderer` types in that file change.

## Hard Stops

Restated for completeness. These remain in force regardless of any
slice landing on this branch:

- No `master` merge.
- No production deploy.
- No `perf-baselines.json` refresh.
- No fenced-interface edit (`src/types/SystemInterfaces.ts`).
- No WebGL fallback accepted as KONVEYER proof.
- Explicit WebGL diagnostics are allowed only as named comparison
  evidence.

## Companion Docs

- `docs/state/CURRENT.md` — top-level current-truth snapshot.
- `docs/DIRECTIVES.md` (KONVEYER-10 entry) — directive-level success
  criteria + findings.
- `docs/rearch/KONVEYER_PARITY_2026-05-10.md` — KONVEYER-0..9 migration
  ledger.
- `docs/rearch/KONVEYER_MATERIALIZATION_TIERS_2026-05-12.md` — Phase F
  sim/render tier model + the six shipped slices in detail.
- `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md` —
  WebGPU/TSL stack research spike (terrain, clouds, water, assets,
  ECS/materialization vocabulary).
- `docs/rearch/KONVEYER_PRIMITIVE_SPIKES_2026-05-12.md` — research
  spike: better compute primitives for the expensive systems
  (SkyTexture, Combat, World) identified by slices 10–11.
- `docs/tasks/cycle-2026-05-11-konveyer-scene-parity.md` — active cycle
  brief.
- `docs/CARRY_OVERS.md` — single source of truth for unresolved items.
