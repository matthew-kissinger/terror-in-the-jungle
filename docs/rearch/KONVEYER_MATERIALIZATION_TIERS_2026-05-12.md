# KONVEYER Materialization Tier Architecture (Draft)

Last verified: 2026-05-12

Status: draft memo, not a contract. Branch: `exp/konveyer-webgpu-migration`.
Purpose: capture the current implicit tier model and the proposed Phase F
hot/cold/render-residency model toward the canonical vision sentence
("engine architected for 3,000 combatants via materialization tiers; live-fire
combat verified at 120 NPCs while the ECS hot path is built out"). This memo is
input for Phase F, not a separate gate. Hard stops still apply: no master
merge, no production deploy, no perf baseline update, no fenced-interface edit,
no WebGL fallback proof.

## What "Materialization" Actually Means Here

A combatant is not a single object. It is a coordinated bundle:

- a **simulation entity** (`Combatant` record with AI state, weapons, health,
  zone affiliation, squad membership);
- a **render representation** (close-GLB, impostor billboard, or hidden);
- a **scheduling assignment** (which AI bucket runs this frame; how often
  movement integrates; when distant-sim ticks);
- an **asset binding** (GLB pool slot, billboard index, weapon socket).

Materialization is the policy that decides which of those bundles each
combatant gets given current player position, frustum, faction, squad
membership, and budget. Today these decisions are scattered across
`CombatantLODManager`, `CombatantRenderer`, `CombatantSpawnManager`, and the
shared `Combatant` type. The Phase F goal is to make the policy explicit and
addressable so it can scale from 120 live combatants to ~3,000.

## Current Implicit Tier Model (2026-05-12)

### Simulation lanes (`CombatantLODManager`)

| Tier | Default range | AI cadence | Driver |
|------|---------------|-----------|--------|
| HIGH | ≤200 m (desktop) | full AI every 3 frames; capped at 20 high updates/frame | `STAGGER_HIGH`, `maxHighFullUpdatesPerFrame` |
| MEDIUM | ≤400 m | full AI every 5 frames; capped at 24 medium/frame | `STAGGER_MEDIUM`, `maxMediumFullUpdatesPerFrame` |
| LOW | ≤600 m | full AI every 8 frames; visual-only velocity integration with `NpcLodConfig.visualOnlyIntegrateVelocity` | `STAGGER_LOW` |
| CULLED | >600 m | distant-sim every `NpcLodConfig.culledDistantSimIntervalMs` (default 8 s); position scattered + advanced along squad/objective vectors | `DISTANT_SIM_*`, `STAGGER_CULLED_NEAR` |

GPU tier downshifts apply: medium GPUs use {120, 250, 450}; mobile/low GPUs use
{60, 120, 250}.

### Render lanes (`CombatantRenderer`)

| Render mode | Eligibility | Cap | Asset |
|-------------|-------------|-----|-------|
| `close-glb` | distance ≤ `PixelForgeNpcDistanceConfig.closeModelDistanceMeters` (120 m); priority-sorted (`hardNear`+`spawnResident`+`onScreen`+`squad`+`distance`) | `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` (8) + `spawnResidencyExtraCap` (4 when crowded spawn cluster) | full Pixel Forge GLB pool per faction; skeleton, animations, weapon socket |
| `impostor` | high LOD beyond close radius, or medium/low LOD | shared GPU billboard cap | crop-map atlas (TSL `MeshBasicNodeMaterial`) |
| `culled` | LOD = CULLED | none | hidden; no draw |

Fallback reasons recorded per candidate: `perf-isolation`, `pool-loading`,
`pool-empty`, `total-cap`. The public dev surface is
`window.npcMaterializationProfile(maxRows)`.

### Hard-near cluster reserve (renamed 2026-05-12 from "spawn residency")

The reserve lifts the close-GLB cap above the steady value
`PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` (8) whenever the density of
combatants inside `hardNearReserveDistanceMeters` (64 m) overflows it. The
formula is `effectiveCap = TOTAL_CAP + clamp(reserveCount - TOTAL_CAP, 0,
hardNearReserveExtraCap)`. The trigger is real-time density (every-frame
distance check), not a spawn-time snapshot — the legacy "spawn-residency"
naming was misleading. The policy serves any dense close cluster (initial
reveal, contested objective, midgame firefight), not just first reveal.

Phase F slice 1 (shipped 2026-05-12) renamed the config keys
(`spawnResidency*` → `hardNearReserve*`) and bumped
`hardNearReserveExtraCap` from 4 to 6 so dense modes get more close-GLB
slots. Per-faction pool size grows from 12 to 14.

Multi-mode strict-WebGPU verification under the new policy is recorded at
`artifacts/perf/2026-05-12T02-24-10-594Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
All five modes resolve `resolvedBackend=webgpu` with zero console/page errors.
Per-mode effective cap and review-pose fallback counts versus the prior
`01-50-30-290Z` evidence (TOTAL_CAP+4):

| Mode | Prior cap | New cap | Prior fallbacks | New review fallbacks |
| --- | ---: | ---: | --- | --- |
| `open_frontier` | 8 | 10 | total-cap:4 | none |
| `zone_control` | 9 | 11 | total-cap:3 | none |
| `team_deathmatch` | 12 | 14 | total-cap:4 | total-cap:1 |
| `ai_sandbox` (combat120) | 12 | 14 | total-cap:18, pool-empty:2 | total-cap:5, pool-empty:6 |
| `a_shau_valley` | 8 | 8 | 0 candidates | 0 candidates |

Combat120 retains a residual `pool-empty:6` finding: with 25 close-radius
candidates the US pool exhausts at the new 14-slot limit while the NVA pool
keeps 4 slack. Faction-asymmetric pool sizing is the next slice (faction
balance for the budget-arbiter v1), not a re-cap question.

## Gaps Versus Vision

The current model handles 120 live combatants well, but the path to 3,000 has
five problems:

1. **No "render-cluster" tier between impostor and culled.** Beyond ~600 m the
   only option is "hide". A distant infantry company should still be visible
   as a cohesive squad-shaped silhouette or smoke smear, not vanish.
2. **No "sim-strategic" tier between distant-sim and CULLED.** Today CULLED
   simulates each entity independently every 8 s. At 3,000 combatants that is
   3,000 distant entities being ticked separately. Squad-level aggregation
   (one tick per squad-of-8) would cut work ~8×.
3. **Sim and render lanes are coupled by distance.** A combatant's render mode
   is derived from its distance, but render budget should also pull from
   on-screen-ness, gameplay relevance (player's squad, defending objective),
   and active-combat status independent of the sim cadence.
4. **No explicit budget arbiter.** Every renderer/manager owns its own caps.
   When the system is at scale we will need a single arbiter that distributes
   close-GLB slots, impostor slots, and AI ticks against the combined budget
   for the frame.
5. **No reactive change set.** Promotions/demotions across tiers happen on
   read inside the LOD update loop. Tier transitions are not a first-class
   event that other systems (audio, minimap, fog-of-war, perception) can
   subscribe to.

## Proposed Phase F Tier Model

This is the architectural target, not an implementation commitment. Each row
is a *lane*, not a level: a combatant has one sim-lane and one render-lane,
and the two are decided by separate policies that share a budget arbiter.

### Sim lanes

| Lane | Cadence | Authority | When |
|------|---------|-----------|------|
| `sim-hot` | every frame, full AI | CombatantAI per-entity | inside HIGH range, in player's squad, or active firefight participant |
| `sim-warm` | staggered 3-5 frames | CombatantAI per-entity | MEDIUM range, on-screen but not engaging |
| `sim-cool` | staggered 8-12 frames, visual-only velocity integration | CombatantAI per-entity | LOW range, mostly off-screen |
| `sim-strategic` | one tick per squad per cadence (~2 s) | SquadManager bulk move | distant culled units inside a coherent squad |
| `sim-dormant` | event-only (death, zone capture, spawn) | ZoneManager + WarSimulator | strategic reserve; positions sampled, not stepped |

`sim-strategic` is the new lane. It replaces today's per-entity culled tick
with a squad-aggregated tick that scales O(squads) not O(entities). The
strategic AI authority lives in the existing `SquadManager` and `WarSimulator`
rather than `CombatantAI`. A combatant moved into `sim-strategic` retains its
identity, weapon, health, faction, and squad membership — only its tick
authority changes.

### Render lanes

| Lane | Asset | Cap shape | When |
|------|-------|-----------|------|
| `render-close` | full Pixel Forge GLB, weapon, skinning, animation | hard cap from `PIXEL_FORGE_NPC_CLOSE_MODEL_TOTAL_CAP` plus spawn-residency reserve | inside 120 m, priority-selected |
| `render-impostor` | crop-atlas billboard (TSL) | soft cap by visible-impostor budget per faction | impostor radius, on-screen-ish |
| `render-silhouette` | low-detail billboard or stamped sprite, single tone, no animation | per-region cap from CDLOD cluster count | beyond impostor radius, on-screen but >800 m |
| `render-cluster` | one billboard per squad with squad-count badge | soft cap from active strategic squads | beyond silhouette range, on-screen |
| `render-statistic` | minimap dot, HUD aggregate, no world draw | unbounded (counter only) | off-screen, fog-of-war, or beyond cluster range |

`render-silhouette` and `render-cluster` are new. They fill the gap between
"single impostor billboard" and "no draw at all". They also let a 3,000-unit
A Shau Valley scenario read as visibly populated from a flight-altitude
camera without each entity costing an instanced draw.

### Cross-lane rules

- Lane choice is decided by the *budget arbiter*, not by each system. Every
  frame the arbiter receives: player position, camera frustum, active-zone
  list, current heap/frame budget, and the sorted candidate set. It assigns
  one sim-lane and one render-lane per combatant.
- Render-close inherits priority from `hardNear`, `spawnResident`, `onScreen`,
  `squad`, `distance`, plus a new `inActiveCombat` weight (a combatant
  currently being shot at by the player or shooting back is render-close
  eligible even at 130 m).
- Tier transitions emit events: `MaterializationTierChanged { combatantId,
  fromSim, toSim, fromRender, toRender }`. Audio, minimap, and visibility-aware
  systems subscribe instead of polling.
- Render-cluster billboards are not combatants. They are scene proxies. The
  underlying `Combatant` records still exist; they just are not draws.

### What stays the same

- `Combatant` type. The simulation record is the same shape; lanes are
  metadata.
- `CombatantAI` per-entity AI. Hot/warm/cool lanes still drive it.
- Asset pipeline. GLBs and impostor atlases stay as today.
- Render authority. `CombatantRenderer` still owns the close-GLB pool and
  impostor billboards; it gets two new responsibilities (silhouette draws,
  cluster proxies).
- Strict WebGPU proof gate. No new lane is allowed to claim acceptance from a
  WebGL fallback.

## Concrete Next Slices (Phase F)

These are independently shippable. Each one assumes branch hard-stops.

0. **Hard-near cluster reserve generalization (shipped 2026-05-12).**
   Renamed `spawnResidency*` config/constants to `hardNearReserve*` so the
   policy is named for its real semantics (real-time cluster density, not a
   spawn-time snapshot). Bumped `hardNearReserveExtraCap` from 4 to 6 so
   dense modes (Team Deathmatch, combat120, Zone Control) get a measurable
   benefit. Pool size per faction grew from 12 to 14. Evidence is recorded
   above; the next density-driven sizing question is per-faction pool slack
   in combat120, not a steady-cap bump.
0a. **Close-model active-set churn pre-release (shipped 2026-05-12).**
    `CombatantRenderer.updateCloseModels` now pre-releases active close
    models that fall outside this frame's top-`effectiveActiveCap`
    prospective set, before the candidate iteration. This eliminates the
    phantom `pool-empty` fallback that combat120 review showed (6
    fallbacks under slice 0): when the active set churned, prior-frame
    actives held pool slots through iteration and new higher-priority
    candidates of the same faction hit a false pool-empty even though the
    slot would have been released milliseconds later. Multi-mode strict
    WebGPU verification:
    `artifacts/perf/2026-05-12T03-06-33-332Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
    combat120 review: `pool-empty:6` → `pool-empty:0`; all 22 fallbacks now
    `total-cap`, which is the designed materialization tier boundary.
    Open Frontier and Zone Control regressed to cap 8 in this run only
    because the steady review pose has no actor inside the 64 m hard-near
    bubble — the reserve correctly does not engage. Behavior is consistent
    with slice 0; not a regression.
0f. **Tier-transition event capture (shipped 2026-05-12, probe-side).**
    `bootstrap.ts` now exposes `window.__materializationTierEvents()`
    under `?diag=1`, draining a bounded ring of
    `materialization_tier_changed` events from `GameEventBus`. The crop
    probe consumes this in `captureTierTransitionEvents` to record an
    empirical view of the materialization flow during the directed-warp
    + lazy-load + review window per mode. No game-code behavior change;
    the slice extends the diagnostic surface added by slice 0e.

    Strict WebGPU multi-mode evidence:
    `artifacts/perf/2026-05-12T13-59-07-487Z/konveyer-asset-crop-probe/asset-crop-probe.json`.

    Per-mode capture (counts of transitions in a single probe window):

    | Mode | Total | impostor→close-glb | close-glb→impostor | null→close-glb | null→impostor | null→culled |
    | --- | ---: | ---: | ---: | ---: | ---: | ---: |
    | `open_frontier` | 7 | 0 | 0 | 0 | 0 | 7 |
    | `zone_control` | 21 | 11 | 9 | 0 | 0 | 0 |
    | `team_deathmatch` | 8 | 8 | 0 | 0 | 0 | 0 |
    | `ai_sandbox` (combat120) | 43 | 23 | 20 | 0 | 0 | 0 |
    | `a_shau_valley` | 199 | 60 | 41 | 4 | 94 | 0 |

    Findings:
    - **A Shau** is the high-churn case: 41 close-glb→impostor
      demotions and 60 impostor→close-glb promotions in one window
      reflect cap-boundary cycling as the WarSimulator materializes
      strategic-tier units into Hill 937. Slice 2 pre-release handles
      this without `pool-empty` (zero observed), but the visual pop-in
      cadence is worth a follow-up review.
    - **combat120** shows the same two-way churn pattern in miniature:
      23 promotions, 20 demotions.
    - **TDM** shows pure promotion (8 of 8) — the cap is not exhausted
      at the review pose, so no demotion cycle.
    - **Open Frontier** shows only `null→culled` transitions for
      first-observation of far-LOD combatants beyond billboard range.
    - **A Shau** has 85 `impostor:pool-loading` reason events, which
      confirms the lazy-growth path fires hard during the
      directed-warp materialization spike but settles to zero by
      review pose.

0e. **Tier-transition events (shipped 2026-05-12, Phase F memo slice 6).**
    `CombatantRenderer.updateBillboards` now emits a typed
    `materialization_tier_changed` event on `GameEventBus` whenever a
    combatant's render mode (`close-glb` / `impostor` / `culled`) changes
    between frames. Payload carries `{ combatantId, fromRender, toRender,
    reason, distanceMeters }`. First observation of a combatant emits
    with `fromRender: null`. Pruning runs every frame so the
    `previousRenderModes` map stays bounded.

    Subscribers can now react to materialization changes without polling
    the renderer: minimap dot promotion, audio mixer ducking, perception
    onset, future fog-of-war reveal, telemetry sinks. The bus is already
    batched and flushed end-of-frame, so emitting here adds no
    synchronous fan-out cost.

    Strict WebGPU multi-mode regression proof:
    `artifacts/perf/2026-05-12T12-55-00-499Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
    No close-NPC materialization regressions vs slice 5: per-mode caps,
    rendered counts, and fallback counts are equivalent.

    New unit test asserts the contract: first observation emits with
    `fromRender: null`; steady frames emit nothing; mode transitions
    (close-glb → impostor when distance crosses the close radius) emit
    a single event with the correct from/to/reason. Re-appearance of a
    pruned ID emits as a first observation again.

0d. **Budget arbiter v1: combat-state promotion (shipped 2026-05-12).**
    `PixelForgeNpcDistanceConfig.inActiveCombatWeight=8` is added to the
    close-model candidate priority score. The `CloseModelCandidate` now
    carries `isInActiveCombat` derived from `combatant.state` at
    selection time. Actors currently ENGAGING / SUPPRESSING / ADVANCING
    get a priority boost sized between `squadWeight` (4) and
    `onScreenWeight` (10), so combat state composes with the other
    signals (hard-near reserve, hard-near, on-screen, squad, distance,
    recently-visible) instead of dominating them. The Phase F memo
    target case ("a combatant being shot at by the player or shooting
    back is render-close eligible even at 130 m") is now realized as a
    weight, not a hard override.

    Strict WebGPU multi-mode proof:
    `artifacts/perf/2026-05-12T09-45-53-698Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
    Effect on the densest mode (combat120 / ai_sandbox): 7 of the 14
    close-GLB slots are now in-combat actors (slice 4 had 0 measured
    in-combat promotions). The single remaining "missed" in-combat
    actor in combat120 is at 88.1 m — outside the hard-near reserve
    bubble (64 m); the weight composition correctly lets a closer
    on-screen non-combat actor outrank it. A Shau directed-warp
    similarly promoted 1 in-combat actor to close-GLB and left 2
    in-combat misses at hard-near distances; investigation shows those
    are most likely off-screen actors outranked by on-screen non-combat
    actors (on-screen weight 10 > in-combat weight 8). This is by
    design: in-combat is a strong signal but not absolute.

    New unit test locks the arbiter behavior: an ENGAGING actor at 100 m
    wins a close-GLB slot over a non-combat cluster at 80..87 m that
    would otherwise fill the cap by distance alone.

0c. **MaterializationProfile v2 (shipped 2026-05-12).**
    `CombatantMaterializationRow` now carries `reason` and `inActiveCombat`,
    surfaced through `window.npcMaterializationProfile()` and the crop
    probe's `nearest[]` projection. `reason` is parseable
    (`close-glb:active`, `impostor:total-cap`, `impostor:pool-empty`,
    `impostor:pool-loading`, `impostor:perf-isolation`,
    `impostor:beyond-close-radius`, `impostor:not-prioritized`,
    `culled:lod-culled`, `culled:no-billboard`). `inActiveCombat` is true
    when state is ENGAGING/SUPPRESSING/ADVANCING. This is the budget
    arbiter's input surface — slice 5 of the Phase F memo. Strict WebGPU
    multi-mode proof:
    `artifacts/perf/2026-05-12T04-48-59-955Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
    First architectural finding the diagnostic surfaces: A Shau's
    review-pose `nearest[]` contains actors with `inActiveCombat=true`
    stuck on `impostor:total-cap` (e.g., combatant_40 at 7.9 m) — exactly
    the case the Phase F memo names ("a combatant currently being shot
    at by the player or shooting back is render-close eligible even at
    130 m"). The current cap policy does not promote based on combat
    state; the budget arbiter v1 will. This slice ships the input
    surface; the arbiter is the next slice.

0b. **A Shau directed-warp evidence (shipped 2026-05-12, probe-only).**
    The crop probe now performs a directed warp to a contested zone
    (Hill 937 / Hamburger Hill) when running in `a_shau_valley`, waits
    for the WarSimulator to materialize live combatants near the new
    player position, then runs the normal close-NPC review pose. No
    game-code change — `prepareDirectedZoneWarp` in
    `scripts/konveyer-asset-crop-probe.ts` reads
    `engine.systemManager.zoneManager.getAllZones()` and warps to the
    first contested non-home-base zone. Five-mode strict WebGPU proof
    after slices 0/0a/0b:
    `artifacts/perf/2026-05-12T03-33-59-816Z/konveyer-asset-crop-probe/asset-crop-probe.json`.
    A Shau wait observation: 5865 ms from warp to first live combatants
    (0 → 4 within close radius); by review phase the WarSimulator
    populated 60 candidates inside the close radius, of which 14 render
    as close GLBs (cap=14) and 46 fall back to impostor (`total-cap:46`,
    the designed materialization tier boundary). Zero pool-empty / zero
    pool-loading across all five modes; every fallback is now at the
    cap, not at the pool. A Shau's strategic-tier simulation is
    materializing live close-radius combatants as designed. The 5865 ms
    spawn cadence after a player warp is a separate finding worth
    profiling (WarSimulator strategic-spawn tick interval) but is not a
    materialization-tier blocker.
1. **Lane-naming refactor.** Rename current `lodLevel` to `simLane` and
   introduce `renderLane` as a separate field on `Combatant`. No behavior
   change. Adds the surface that the arbiter writes to.
2. **`MaterializationProfile` v2.** Extend `window.npcMaterializationProfile`
   to return per-row `simLane`, `renderLane`, `reason`, `inActiveCombat`. Used
   by the existing crop probe and any future budget-arbiter test.
3. **Squad-aggregated strategic sim.** Replace per-entity CULLED tick with
   SquadManager bulk move when a coherent squad is in `sim-strategic`.
   Keeps per-entity AI for non-squadded culled units (rare).
4. **Render-silhouette prototype.** Single low-cost billboard or sprite for
   on-screen units beyond impostor range. Prove visibility from flight
   altitude in A Shau before scaling.
5. **Budget arbiter v1.** Single function reads candidates, computes sim+render
   assignments, emits transition events. Replace today's two separate
   decision points in `CombatantLODManager.update` and
   `CombatantRenderer.updateCloseModels`.
6. **Tier-transition events.** Emit on the existing event bus; let the
   minimap and audio mixer subscribe.
7. **3,000-unit scenario perf gate.** New `combat3000` scenario. Strict
   WebGPU. Budget: p99 ≤ 33 ms with the new lanes active.

## What This Memo Does Not Decide

- Whether the simulation entity store moves to bitECS or stays as
  `Map<string, Combatant>`. That is `phase-f-bitecs-prototype`. Tier model is
  independent of storage choice.
- Whether cover and visibility queries move to GPU compute. That is
  `phase-f-async-cover-search`. The tier model just says: hot/warm/cool drive
  whatever the cover authority becomes.
- Cloud/sky/weather, water, terrain edge, and asset acceptance work. Those
  belong to KONVEYER-10 and the principles-first scene rearchitecture review,
  not this memo.
- The interface fence. The proposed lane fields and arbiter live inside the
  combat system. `IGameRenderer`, `ITerrainRuntime`, and friends are
  untouched.

## Evidence Inputs

- `src/systems/combat/CombatantLODManager.ts` — current sim lanes
- `src/systems/combat/CombatantRenderer.ts` — current render lanes, close-GLB
  pool, spawn-residency reserve
- `src/systems/combat/PixelForgeNpcRuntime.ts` — distance/cap config
- `artifacts/perf/2026-05-12T01-26-56-068Z/konveyer-asset-crop-probe/asset-crop-probe.json`
  — Open Frontier 11 close-GLB residency proof
- `docs/rearch/KONVEYER_WEBGPU_STACK_RESEARCH_SPIKES_2026-05-11.md` — Spike 6
  (ECSY/materialization vocabulary)
- `docs/tasks/cycle-2026-05-16-phase-f-ecs-and-cover-rearch.md` — Phase F
  cycle that will host this work
