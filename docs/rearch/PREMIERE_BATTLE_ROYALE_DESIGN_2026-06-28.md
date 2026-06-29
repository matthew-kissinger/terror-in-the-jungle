# Premiere Battle Royale — Design & Feasibility — 2026-06-28

Design/feasibility memo for the A Shau "premiere" Battle Royale: a player-led
battalion fighting ~25 NPC teams inside a closing storm on the 21 km A Shau DEM.
**Design only — defer the build.** This memo gives the owner and a future cycle
a concrete, engine-grounded plan and an honest read on what must improve before
the build is worth starting.

Brief: [../tasks/premiere-battle-royale-design.md](../tasks/premiere-battle-royale-design.md).
Campaign: [../CAMPAIGN_2026-06-28-field-readiness.md](../CAMPAIGN_2026-06-28-field-readiness.md) (Phase 6).
Informed by the shipped Phase 5 `faction-side-picker`
([../tasks/archive/cycle-2026-06-28-deploy-armory-faction-select/faction-side-picker.md](../tasks/archive/cycle-2026-06-28-deploy-armory-faction-select/faction-side-picker.md)).

> **Scale qualifier (mandatory, per ROADMAP/CURRENT):** the engine is
> architected for 3,000 combatants via materialization tiers; live-fire combat is
> verified at 120 NPCs while an ECS hot path is evaluated (Phase F). The numbers
> below treat the 3,000 figure as a *strategic-agent ceiling*, not 3,000
> simultaneous live-fire combatants — that distinction is the whole feasibility
> story.

---

## 1. Mode definition

### 1.1 The pitch

Battle Royale, Vietnam combined-arms flavor, on the real A Shau valley. Instead
of 100 lone individuals, the field is **~25 teams** (squads/platoons) plus the
**player's own battalion**. The play area shrinks over time — the "closing
storm" — herding survivors toward the valley floor for an escalating endgame.
Last team standing (or last team with a live commander) wins. The player both
fights in first person and commands their battalion via the existing squad
command + radio surface — the project's core "rifle and a radio" loop, dropped
into a BR frame.

This is deliberately *not* a clone of solo-drop BR. It leans on what this engine
is uniquely good at: large strategic-agent counts behind materialization tiers,
faction doctrine, and combined-arms (infantry + vehicles + air).

### 1.2 Forces & composition

- **~25 NPC teams.** Each team = one strategic squad in `WarSimulator` terms
  (`StrategicSquad`, 8–12 members per `AShauValleyConfig.warSimulator.squadSize`).
  25 teams × ~10 = **~250 agents** as the BR-active population. That is well
  under the 3,000-agent strategic ceiling (`totalAgents: 3000`) — BR does not
  need the full theater population; it needs ~250 agents that *feel* alive.
- **Player battalion.** The player commands one team (their own squad/platoon),
  using the existing `SquadCommandConfig` leash + radio. Whether "battalion"
  means literally one large player squad or a small cluster of allied squads is
  an MVP-scoping decision (§3) — start with one commandable squad, the proven
  path.
- **Faction.** The player picks a side at deploy via the Phase-5 picker (see
  §1.6). The other ~24 teams are a mix of factions per `factionMix`
  (BLUFOR US/ARVN vs OPFOR NVA/VC), so the BR is genuinely free-for-all-by-team,
  not strictly two-sided. Team identity, not alliance, is the win unit.

### 1.3 The closing storm (shrinking play area + push)

The signature mechanic. A circular (or valley-shaped) safe zone shrinks in
timed phases; outside it, a damaging "storm" forces teams inward.

- **Geometry.** A Shau is a valley: a pure circle reads oddly against the
  ridgelines. Two options to evaluate at build time: (a) classic shrinking
  circle centered on a random valley-floor point; (b) a valley-aware mask that
  collapses *along* the valley axis toward a final firebase/airstrip arena
  (e.g. around `tabat_airstrip` or `firebase_ripcord`, which already exist as
  features). Option (b) is more on-theme and uses real terrain chokes but is
  more work; **MVP ships (a)**.
- **The push.** The storm edge is not just damage — it is also a *strategic
  signal*. The `StrategicDirector` should bias squad objectives toward the
  shrinking center so NPC teams converge instead of dying passively at the edge.
  This reuses the director's existing player-proximity zone-score boost
  (`StrategicDirector` biases zones near the player); a "storm-center bias"
  is the same shape of override.
- **Damage.** Out-of-zone agents take ticking damage. For materialized
  combatants this is a normal damage path; for SIMULATED/STRATEGIC agents it is
  an abstract attrition tick in the `AbstractCombatResolver` lane (cheap — no
  per-frame work, see §2).
- **Phases.** Wait → shrink → hold, repeated ~6–8 times, tightening the radius
  and raising storm DPS each phase, ending in a small final arena. The phase
  schedule is data (a config block), not code.

### 1.4 Win / lose conditions

- **Win:** the player's team is the last team with a live commander (or last
  team with any live member — pick one; "live commander" is more interesting and
  maps to `StrategicSquad.leaderId`). A team is eliminated when its strength
  (`StrategicSquad.strength`, the 0–1 alive ratio) hits 0.
- **Lose:** the player's team is eliminated, OR the player personally dies with
  no respawn (BR has no respawn by default — this is the key departure from Zone
  Control / Open Frontier, which lease respawns from `TicketSystem`).
- **Placement:** track finishing order (25th → 1st) for a post-match readout,
  reusing the scoreboard/stat plumbing that already tracks kills.
- **Match length:** bounded by the storm schedule (target ~12–18 min), so a
  match always terminates even if teams turtle — the storm guarantees an endgame.

### 1.5 How squad command plugs in

The player commands their team with the **already-shipped** squad command surface
(`SquadCommandConfig` leash: HOLD 18 m / ATTACK 22 m / PATROL, plus the radio
menu unified in Phase 1's `radio-command-menu`). BR adds no new command verbs;
it adds *stakes*: with no respawn, a bad ATTACK order is now lethal. The leash
already makes a standing order survive contact without chasing bait, which is
exactly the behavior a BR commander needs when funneling a squad into the storm
center. Fire-support call-ins (B-52 arc light, helicopter/aircraft support) layer
on as scarce, high-value BR plays — gated/limited so they're a climactic option,
not a spam.

### 1.6 How the faction picker plugs in

Phase 5 shipped `faction-side-picker`, gated to **A Shau + future premiere
modes only** via a mode flag, feeding the chosen side through the existing
`preferredFaction` → `resolveLaunchSelection` / `applyLaunchSelection` launch
path. The premiere BR is exactly the "future premiere mode" that flag was built
for: BR registers as a faction-selectable mode, the player's chosen faction
seeds **their** team's faction (loadout pool, sprites, doctrine), and the other
~24 teams are populated from the `factionMix` minus/around the player's pick.
**No new launch or faction plumbing is needed** — reuse `preferredFaction`. This
is the single cleanest dependency in the whole design: it is already done.

---

## 2. Engine feasibility mapping

This is the load-bearing section. The question is not "can the engine hold 3,000
units" (it can, *as strategic agents*) — it is "can ~25 teams of NPCs **fight a
BR** at an acceptable frame budget, and where is the honest gap."

### 2.1 The three tiers (what actually exists)

The `WarSimulator` already runs the exact tiering BR needs
(`src/systems/strategy/types.ts`, `MaterializationPipeline.ts`):

| Tier | What it is | Cost shape | BR role |
|---|---|---|---|
| **MATERIALIZED** | Full `CombatantSystem` entity: AI, navmesh movement, LOS, ballistics, rendering. | The expensive lane — this is the ~120 live-fire ceiling. | The fight *around the player*: a handful of teams in contact. |
| **SIMULATED** | Lightweight position lerp toward a destination, no rendering, no per-frame combat. | Cheap — `~120 bytes/agent`, throttled movement (`AGENT_MOVEMENT_MAX_PER_TICK = 512`). | Teams nearby but not engaged with the player. |
| **STRATEGIC** | Squad-level counter only; abstract combat on a 2 s tick (`abstractCombatInterval: 2000`). | Near-free — no individual position updates. | The rest of the 25 teams + storm attrition. |

The pipeline already does distance-banded promotion/demotion with hysteresis
(`materializationRadius: 800`, `dematerializationRadius: 900`, `simulatedRadius:
3000`), squad-coherent materialization, a hard cap (`maxMaterialized: 60`), and
per-frame throttles (`MAX_MATERIALIZE_PER_FRAME = 4`). **This is the BR engine.**
BR is, mechanically, "Open Frontier's war sim with a shrinking zone, no respawn,
and a last-team-standing win check."

### 2.2 The budget: 3,000 ceiling vs ~120 verified

The honest arithmetic for ~25 teams (~250 agents):

- **Strategic ceiling: 3,000** (`totalAgents: 3000`). 250 BR agents is **8%** of
  that. Holding 250 `StrategicAgent` records + 25 `StrategicSquad` records,
  running the director on a 5 s tick and abstract combat on a 2 s tick, is
  comfortably inside the WarSimulator's stated ~2 ms/frame budget. **No problem.**
- **Materialized ceiling: ~120 verified, capped at 60 in A Shau config**
  (`maxMaterialized: 60`). This is the real constraint. At any instant, only the
  teams *near the player* are materialized and fighting at full fidelity. With a
  60-cap that is ~5–6 squads in live contact simultaneously — plenty for the
  "fight around the player" feel, and the storm naturally concentrates that
  contact as the zone shrinks.
- **The gap, stated honestly:** the BR *fantasy* is "25 teams all fighting." The
  engine *reality* is "25 teams exist; ~5–6 are live-fire near you; the rest
  fight abstractly and you read their outcomes on the map/HUD." That is not a
  cheat — it is the same selective-materialization model A Shau already ships
  ("A Shau is a 3,000-unit strategic simulation with selective materialization,
  not 3,000 simultaneous live combatants", per CURRENT). **BR must be designed
  around this, not against it:** the storm, the map readout, and the no-respawn
  stakes make distant abstract combat *legible and meaningful* rather than a
  pop-in surprise.

### 2.3 LOD / AI-throttle levers that make it feasible

These already exist and are the dials a BR build tunes — it should not invent new
ones:

- **Per-tier AI stagger** (`CombatantLODManager`): full AI updates every 3 / 5 /
  8 / 12 frames for high/medium/low/culled-near tiers (`STAGGER_HIGH..
  STAGGER_CULLED_NEAR`). More materialized combatants → more sit in the cheap
  staggered tiers.
- **GPU-tier LOD ranges + update caps** (`LOD_RANGES_*`, `UPDATE_CAPS_*`): desktop
  vs medium vs low-GPU bands, with FPS-responsive scaling (`FPS_TARGET_DESKTOP =
  30`, scale up to 3×). The materialized population self-throttles under load.
- **Sim-lane classifier hysteresis** (`CombatantSimLaneClassifier`): high/medium/
  low/culled lanes with margin so combatants don't thrash lanes at a boundary —
  important when the shrinking storm pushes everyone into one band at once.
- **Abstract combat lane** (`AbstractCombatResolver`, 2 s tick): distant team-vs-
  team fights resolve as cheap probabilistic attrition; storm damage on distant
  teams rides the same lane.
- **Materialization throttle** (`MAX_MATERIALIZE_PER_FRAME = 4`): spawning is
  spread across frames so the endgame collapse (everyone funneled together) does
  not spike the frame when many squads enter `materializationRadius` at once.

### 2.4 What must improve first (the honest gaps)

Ranked, build-blocking-first:

1. **The materialized-density endgame.** The whole point of a closing storm is
   that survivors *converge*. As the zone shrinks, more teams fall inside
   `materializationRadius` of the player simultaneously — exactly the moment the
   60-cap and the ~120 live-fire ceiling bite hardest, and exactly the moment
   the player most wants a dense fight. Today's caps are tuned for a *spread-out*
   A Shau, not a *concentrated* endgame. **This needs a measured perf pass before
   the build is real** — it is the difference between "BR" and "BR that stutters
   in every final circle." See §3 risk #1.
2. **No verified quiet-machine perf baseline.** Per CURRENT/perf-trust:
   `perf-baselines.json` was removed, `perf:compare` prints raw metrics with no
   pass/fail gate, and the combat120 p99 trust is unestablished pending
   STABILIZAT-1. **You cannot honestly green-light a denser-than-120 endgame
   without first re-establishing that baseline** — otherwise every BR perf claim
   is ungrounded. STABILIZAT-1 is effectively a prerequisite.
3. **Navmesh coverage on the full 21 km A Shau DEM** (§3 risk #2).
4. **Storm-aware director bias.** The `StrategicDirector` biases toward the
   player and toward zone value; it has no concept of a moving safe-zone center.
   A "converge on storm center" objective override is net-new (small, but real)
   and is what makes the 25 teams *behave* like BR contestants instead of a
   static war.
5. **No-respawn / elimination accounting.** BR's win check (last team with a live
   leader) and placement tracking are net-new — the existing modes lease
   respawns from `TicketSystem` and never "eliminate" a team. This is light
   logic on top of `StrategicSquad.strength` + `leaderId`, but it is new.

None of these is a fence (`SystemInterfaces.ts`) change. All of them are config,
new system modules, or perf work — which is why BR is a *future campaign*, not a
fence escalation.

---

## 3. Phased build plan, risks, and what to prototype first

### 3.1 Phased build plan (MVP → full)

**Phase A — MVP: "BR-lite on the war sim" (smallest shippable loop).**
- A new mode definition flagged faction-selectable (reuse the Phase-5 picker).
- Reuse `WarSimulator` with a BR-tuned config: ~25 squads, `factionMix` spread,
  **no respawn** (decouple from `TicketSystem`).
- Closing storm v1: a shrinking **circle** centered on a random valley-floor
  point, timed phase schedule in config, ticking damage (abstract for
  distant/strategic agents, normal damage for materialized).
- Win/lose v1: last team with any live member; player death = loss; basic
  placement readout reusing scoreboard plumbing.
- Storm-center director bias (the converge override).
- **Cut from MVP:** valley-aware storm geometry, fire-support scarcity economy,
  multi-squad player "battalion," vehicles/air as BR objects, spectate.
- **Exit:** one full match runs start→finish on A Shau at an acceptable frame
  budget *with a measured perf capture* (not vibes), and the player can win/lose.

**Phase B — Feel & legibility.**
- The situational readout (Phase-6 `situation-readout-hud` is the natural host):
  storm timer/edge, alive-team count, "where the fights are," placement.
- Storm-edge audio/visual treatment so the push reads.
- Fire-support as a scarce, climactic BR play (limited charges).
- Tune the materialized endgame against measured captures.

**Phase C — Full.**
- Valley-aware / multi-stage storm geometry collapsing toward a real terrain
  arena (e.g. `tabat_airstrip`).
- Player commands a small allied cluster ("battalion"), not just one squad.
- Vehicles + air as BR pickups/objectives.
- Spectate-on-death, match summary, leaderboard hooks.

### 3.2 Ranked top risks

1. **Perf at scale in the endgame (HIGHEST).** The closing storm's defining
   moment — survivors converging — is the worst case for the 60-cap /
   ~120-live-fire ceiling, and there is **no trusted perf baseline** to measure
   against yet (STABILIZAT-1 open). If the final circle stutters, the mode's
   signature mechanic is also its failure mode. Mitigation: prototype the
   *endgame density* first (§3.3), re-establish the perf baseline as a hard
   prerequisite, and accept a designed-in materialized cap (the final arena is
   *small*, so fewer teams survive to be in it — the storm itself is the
   throttle if the schedule is tuned right).
2. **Navmesh on the 21 km A Shau DEM.** The DEM is a 2304×2304 float32 grid at
   9 m/pixel, ~21,136 m coverage (`AShauValleyConfig`); navmesh is prebaked
   (`scripts/prebake-navmesh.ts`) and CURRENT flags A Shau "static-tiled nav and
   route/NPC quality still need play-path validation." BR scatters teams across
   the *whole* valley (not just the player's start), so route quality in
   far/untested corners — and the storm funneling everyone through valley chokes
   — exercises navmesh paths the current modes may not. Mitigation: validate nav
   coverage across the full DEM before BR scatters teams there; lean on
   SIMULATED-tier lerp movement for distant teams (no navmesh cost until
   materialized near the player).
3. **AI density / behavior under convergence.** 25 teams all biased toward one
   shrinking center is novel director load and novel *behavior* — teams must
   converge without degenerate clumping, friendly-fire pileups, or all-stall
   loops at the chokes. The existing movement-stall tail work (CARRY_OVERS,
   STABILIZAT-1) is directly relevant: convergence is the stall-tail's worst
   case. Mitigation: storm-center bias must spread arrival points (the director
   already scatters objective arrivals via `OBJECTIVE_SCATTER_RADIUS_SCALE`);
   reuse that, don't funnel to a single point.

(Secondary: faction balance in a 25-team FFA; storm geometry reading well against
ridgelines; the no-respawn UX being punishing — all design-tunable, not
architectural.)

### 3.3 What to prototype first

**Prototype the endgame density, not the opening.** The opening (25 teams spread
across 21 km, mostly STRATEGIC/SIMULATED) is the *cheap* case the war sim already
handles. The risk lives in the *collapse*. So the first spike is:

> A throwaway scenario that force-spawns ~6–8 squads into a single small valley
> arena (a hand-placed final-circle radius), materializes as many as the cap
> allows, runs them in mutual contact, and **captures combat120-style perf
> through that fight** — with the perf baseline re-established first so the
> numbers mean something.

If that holds frame budget, BR is feasible and Phase A is worth funding. If it
stutters, the answer is either (a) a tighter designed-in final-circle cap, (b)
Phase-F materialization work landing first, or (c) accepting abstract-resolved
endgames with only the player's immediate fight materialized. Knowing *which* of
those three before writing mode code is the entire value of prototyping the
endgame first.

A cheap **second** spike (parallel, low-risk): wire the Phase-5 faction picker to
a stub "premiere" mode flag and confirm `preferredFaction` reaches a BR-shaped
launch selection end-to-end. That de-risks the one dependency that is already
mostly free and proves the faction seam before any storm/win-condition work.

---

## 4. Summary for the owner

- **Mode:** player-commanded team vs ~25 NPC teams, closing storm, no respawn,
  last team with a live commander wins — on the real A Shau valley, using the
  shipped squad command + radio and the shipped faction picker. No new launch or
  fence plumbing.
- **Feasibility:** the `WarSimulator` three-tier model *is* the BR engine; 250 BR
  agents is 8% of the 3,000 strategic ceiling and trivial at the strategic/
  simulated tiers. The real ceiling is the materialized lane (~120 verified, 60
  config cap), and the closing storm's converging endgame is exactly where that
  ceiling bites. **That, plus the missing trusted perf baseline (STABILIZAT-1),
  is the honest gap — and the single biggest feasibility risk.**
- **Recommended MVP:** "BR-lite on the war sim" — reuse `WarSimulator` with a
  BR config (25 squads, no respawn), a shrinking-circle storm v1 with a
  storm-center director bias, and a last-team-standing win check, **gated on
  first re-establishing the perf baseline and prototyping the endgame density.**
- **Prototype first:** the endgame collapse (force ~6–8 squads into a small final
  arena and measure perf), not the opening — the opening is the cheap case.

This is a future campaign. Nothing here is built; nothing here touches the fence.
