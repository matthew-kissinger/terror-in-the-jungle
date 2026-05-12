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
