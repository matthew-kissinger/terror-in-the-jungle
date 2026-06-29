<!-- Last verified: 2026-06-28 -->
# Tasking Director — Spike Memo (A Shau, opt-in dynamic tasking)

**Cycle:** `cycle-2026-06-28-ashau-purpose-and-missions` (Field Readiness, Phase 6)
**Brief:** [docs/tasks/tasking-director-spike.md](../tasks/tasking-director-spike.md)
**Status:** Design spike. No code. This is the blueprint the follow-on
`tasking-director-mvp` executor builds from.

## 1. Why this exists

Owner decision (2026-06-28): A Shau's purpose is *both* — surface the war/zone
systems the engine already runs, AND give the player an opt-in "what should I do
next" loop. The strategic layer (`WarSimulator`, `ZoneManager`, `TicketSystem`)
already produces a living battle every frame; the player just has no curated
thread through it. The **tasking director** reads that live state, derives a
small set of missions, and offers the player one at a time. It invents no new
simulation.

Hard constraint from the brief and from `WarSimulator`'s own budget comments
(`update()` is a 2 ms/frame system): **the director adds no new per-frame hot
path.** It is event-driven off the war event stream and polls a tiny amount of
already-computed state on a slow cadence.

## 2. The state the engine already tracks (read surface)

Everything below is read-only and already maintained by live systems. No new
computation. Paths and accessors verified against source on 2026-06-28.

### Zone state — via `IZoneQuery` (fenced read interface)

`src/types/SystemInterfaces.ts` exports `IZoneQuery`. The director takes the same
read-only handle `WarSimulator` and `HUDZoneDisplay` already consume — no new
interface, no fence change:

- `getAllZones(): readonly CaptureZone[]`
- `getCapturableZones(): readonly CaptureZone[]` — non-home-base zones
- `getZoneById(id): CaptureZone | null`
- `getZonesByOwner(faction): readonly CaptureZone[]`
- `getNearestCapturableZone(position, faction?): CaptureZone | null`

`CaptureZone` (defined in `src/systems/world/ZoneManager.ts`) exposes the fields
the director keys on:

- `id`, `name`, `position` (`THREE.Vector3`), `radius`
- `owner: Faction | null`, `state: ZoneState`, `captureProgress: number`
- `isHomeBase: boolean`, `ticketBleedRate: number`

`ZoneState` (`src/systems/world/ZoneManager.ts`) is the
`{ NEUTRAL, BLUFOR_CONTROLLED, OPFOR_CONTROLLED, CONTESTED }` enum.

`HUDZoneDisplay` (`src/ui/hud/HUDZoneDisplay.ts`) is the existing reference for
turning this state into player-facing language. Its `prioritySortZones()` already
ranks contested-first then by distance, and `getStatusText()` already maps zone
state to `'LOSING' | 'ATTACKING' | 'CONTESTED' | 'SECURED' | 'HOSTILE' |
'NEUTRAL' | 'CAPTURING n%'` relative to `playerAlliance`. The director reuses
this exact mapping so task language matches the objectives panel the player
already sees — no second vocabulary.

### War / squad state — via `WarSimulator` (read-only queries)

`src/systems/strategy/WarSimulator.ts` already exposes read-only queries the
director consumes without touching the sim's internals:

- `isEnabled(): boolean` — director only offers tasks when the war is live
- `getAllSquads(): Map<string, StrategicSquad>`
- `getAllAgents(): Map<string, StrategicAgent>`
- `getAliveCount(faction?: Faction): number`
- `getMaterializedCount(): number`
- `getZoneName(zoneId): string`
- `getElapsedTime(): number`

`StrategicSquad` (`src/systems/strategy/types.ts`) carries the fields a
"destroy"-class task keys on: `id`, `faction`, `x`, `z`, `strength` (0-1 alive
ratio), `objectiveZoneId`, `stance`, `combatActive`. `StrategicAgent` carries
`faction`, `x`, `z`, `alive`, `tier`.

### War events — via `WarSimulator.events` (pub/sub, no polling)

`WarSimulator.events` is a public `WarEventEmitter`
(`src/systems/strategy/WarEventEmitter.ts`) with `subscribe(listener): () =>
void`. Events are flushed once per war tick inside `WarSimulator.update()` (step
6, `this.events.flush()`). The `WarEvent` union (`src/systems/strategy/types.ts`)
includes exactly the lifecycle signals the director needs to clear/complete
tasks:

- `zone_captured` `{ zoneId, zoneName, faction, timestamp }`
- `zone_contested` `{ zoneId, zoneName, timestamp }`
- `zone_lost` `{ zoneId, zoneName, faction, timestamp }`
- `squad_wiped` `{ squadId, faction, timestamp }`
- `squad_engaged`, `reinforcements_arriving`, `major_battle`, `agent_killed`,
  `faction_advantage`

**`StrategicFeedback` (`src/systems/strategy/StrategicFeedback.ts`) is the proven
template.** It is a `GameSystem` whose `update()` does nothing per-frame
(`"Feedback is event-driven via subscription, no per-frame work needed."`); it
subscribes in `setWarSimulator()` via `simulator.events.subscribe(...)` and
turns events into HUD messages. The tasking director copies this shape exactly.

### Ticket / phase state — via `TicketSystem`

`src/systems/world/TicketSystem.ts`:

- `getGameState(): GameState` → `phase` (`'SETUP' | 'COMBAT' | 'OVERTIME' |
  'ENDED'`, etc.), `gameActive`, `isTDM`
- `getTickets(faction: Faction): number`

The director gates the same way `WarSimulator.update()` does: no tasks during
`SETUP`, suppress/clear when `phase === 'ENDED'`. `getTickets()` feeds the
"impact" half of the reward model (see §4).

## 3. Mission archetypes

Three archetypes, each a thin read over the state above. All three are derivable
*today* — none requires new sim work.

### A. CAPTURE a contested / enemy zone ("Seize {zoneName}")

- **Trigger:** a capturable zone exists that the player does not own —
  `ZoneState.CONTESTED`, `ZoneState.OPFOR_CONTROLLED` (from the player's
  perspective; reuse `getStatusText()` → `ATTACKING`/`CONTESTED`/`HOSTILE`), or
  `NEUTRAL` with `captureProgress > 0`. Prefer contested + nearest, identical to
  `HUDZoneDisplay.prioritySortZones()`.
- **Read paths:** `zoneQuery.getCapturableZones()` filtered by `state`/`owner`
  vs `playerAlliance`; `zone.position` + player position for distance;
  `zone.captureProgress` for progress hinting.
- **Completion signal:** `zone_captured` event with `zoneId === task.zoneId` and
  `faction` on the player's alliance.
- **Failure / clear:** `zone_lost` for the same zone to the enemy after offer, or
  the zone flips to player-owned by other means (still counts as complete), or
  expiry (§4).

### B. DEFEND a held, threatened zone ("Hold {zoneName}")

- **Trigger:** a zone the player's alliance owns is under attack — owned by
  player alliance AND `ZoneState.CONTESTED` (this is exactly
  `HUDZoneDisplay`'s `LOSING` / `zone-urgent` state) or owned with rising enemy
  `captureProgress`. High `ticketBleedRate` zones rank first (bleed is the
  strategic cost of losing it).
- **Read paths:** `zoneQuery.getZonesByOwner(playerFaction)` then filter
  `state === CONTESTED`; `zone.ticketBleedRate` for ranking; `zone.position` for
  the HUD waypoint.
- **Completion signal:** the zone returns to a stable owned state — observed as
  the absence of further `zone_contested` for that zone across a hold window, or
  a `zone_captured` re-confirming player ownership. MVP keeps this simple: hold
  the zone owned + uncontested for a fixed dwell (poll `getZoneById().state`).
- **Failure / clear:** `zone_lost` for that zone to the enemy.

### C. DESTROY a strategic target ("Break the {zoneName} push" / "Wipe enemy squad")

- **Trigger:** an enemy `StrategicSquad` is pressing a player objective —
  `combatActive === true`, `faction` is enemy, and its `objectiveZoneId` is a
  player-owned or contested zone, OR it is the strongest enemy squad
  (`strength`) within a radius of the player. This is the "there's a force you
  can break" task.
- **Read paths:** `warSimulator.getAllSquads()` → filter enemy faction +
  `combatActive` + proximity (`squad.x/z` vs player) + `objectiveZoneId`
  resolved through `zoneQuery.getZoneById()`; `squad.strength` for ranking.
- **Completion signal:** `squad_wiped` event with `squadId === task.squadId`
  (enemy faction), or `squad.strength` polled to `0`.
- **Failure / clear:** the target squad disengages (`combatActive` false) and
  leaves the player's area, or expiry.

> **MVP recommendation: ship A + B first** (zone capture + zone defend). They
> share one read path (`IZoneQuery` + zone events), reuse `HUDZoneDisplay`'s
> existing state→language mapping verbatim, and cover the two most common "what
> now?" moments. Archetype **C (destroy)** is the natural Phase-2 add because it
> introduces a second target type (squads) and squad-proximity ranking — keep it
> out of the first MVP to protect the LOC budget (§5). The director is built with
> an archetype list so C drops in without restructuring.

## 4. Opt-in UX and reward model

### Offer / accept / decline

- The director holds **at most one active task and at most one pending offer** at
  a time. No queue, no nag. This keeps both the UX and the state machine tiny.
- When a candidate is derived (and no task is active and the player is not in the
  cooldown window), the director surfaces a **task offer card** in the HUD.
- **Accept:** key press (proposed `T`, owner to confirm in playtest) or tapping
  the card on mobile. The offer becomes the active task; a HUD waypoint/marker
  points at `task.position` (the zone or squad centroid). The card collapses to a
  compact "active task" strip.
- **Decline / dismiss:** a second key press or the card's dismiss affordance.
  The candidate is suppressed for a cooldown (proposed 60 s) so the same task
  does not immediately re-offer. Declining costs nothing.
- **Ignore:** an unaccepted offer auto-dismisses after a short timeout (proposed
  20 s) and enters the same cooldown. Opt-in means silence is a valid answer.

### Where the card lives in the HUD

The objectives panel already owns the lower-information zone list via
`HUDZoneDisplay` writing into `HUDElements.objectivesList`. The task card sits as
a **distinct, higher-emphasis element directly above the objectives list** (same
column, so it reads as "your assignment" sitting atop "all objectives"). It is a
new sibling element, not a mutation of `HUDZoneDisplay`'s DOM — the director owns
its own card element and never reaches into the zone-list scratch state.

Composition mirrors `StrategicFeedback`: the director is a `GameSystem`
constructed in `src/core/SystemInitializer.ts` (alongside
`refs.warSimulator`/`refs.strategicFeedback`), registered in
`src/core/SystemRegistry.ts` / surfaced via `src/core/SystemManager.ts`, and given
its `WarSimulator` + `IZoneQuery` + `HUDSystem` handles by setters at scenario
wiring time (the same wiring path that calls `setWarSimulator()` on
`StrategicFeedback`). It is added to the update list with a **slow internal
cadence** (see §5), not a per-frame body.

### How a task clears

- **Completed:** the archetype's completion event fires (§3) for the active
  task's `zoneId`/`squadId`. Card shows a brief "MISSION COMPLETE" state, awards
  the reward, then clears after the animation.
- **Failed/voided:** the failure event fires (e.g. `zone_lost` on a DEFEND
  target). Card clears with a muted "lost" state, no reward.
- **Expired:** an active task older than a cap (proposed 4 min) clears silently to
  avoid a stale marker pointing at a resolved fight.
- **Game ended:** `phase === 'ENDED'` clears any active task and stops offering.

### Reward model

Two coupled rewards, both already expressible through existing systems:

1. **Player score popup** — reuse `HUDSystem.spawnScorePopup(type, points,
   multiplier?)` (which fans out to `ScorePopupSystem.spawn()` in
   `src/ui/hud/ScorePopupSystem.ts`). The existing types include `'capture'`,
   `'defend'`, and `'secured'`, which already map cleanly:
   - CAPTURE task complete → `spawnScorePopup('capture', N)` with a director
     bonus on top of the base capture award.
   - DEFEND task complete → `spawnScorePopup('defend', N)`.
   The MVP uses the existing types; **no new `ScorePopup` type is required**,
   which keeps the popup system untouched. (Adding a dedicated `'mission'` type is
   an optional Phase-2 polish, explicitly out of MVP scope.)

2. **Strategic impact (read-only framing, not a new sim lever)** — the *value* of
   a task is already encoded in state the director reads: a high-`ticketBleedRate`
   zone is worth more, and ticket swing is observable via
   `TicketSystem.getTickets()`. The director scales the score reward by the
   zone's `ticketBleedRate` band (low/med/high → reward multiplier) so the player
   is steered toward strategically meaningful fights. **Crucially, the director
   does not write tickets or zone ownership** — capturing the zone already moves
   tickets through the existing `ZoneManager`/`TicketSystem` path. The reward is
   purely the player-facing score bonus; "impact" is a display/ranking concept,
   not a second source of truth.

This keeps the reward model honest: the director can only *recognize and reward*
outcomes the war systems already produce. It cannot fabricate strategic effects.

## 5. Perf budget and reuse strategy

### Budget

- **No new per-frame hot path.** The director's `update()` body is, like
  `StrategicFeedback`, near-empty. All completion/failure detection is
  **event-driven** through `WarSimulator.events.subscribe()` — zero polling for
  the clear path.
- **Candidate derivation runs on a slow throttle**, not every frame. Proposed
  cadence: re-evaluate candidates at most once every ~1.5–2 s (accumulate
  `deltaTime`, early-return otherwise), and only when there is no active task and
  no pending offer. Each evaluation is a single pass over
  `getCapturableZones()` (≤ a handful of zones on A Shau) plus, once archetype C
  lands, one pass over `getAllSquads()` (~100 squads) doing only cheap field
  reads and distance compares — comfortably sub-0.1 ms and gated behind the
  throttle so it is not on the frame's critical path.
- **No new allocation in the steady state.** Reuse the scratch-array pattern
  already used throughout (`HUDZoneDisplay`'s `*Scratch` arrays, `WarSimulator`'s
  iteration lists): the director keeps a reusable candidate buffer and a single
  task object, mutated in place.
- **Read-only off existing state.** The director never mutates `WarSimulator`,
  `ZoneManager`, or `TicketSystem`. It holds the fenced `IZoneQuery` handle and
  read-only `WarSimulator` queries. **No `SystemInterfaces.ts` change is
  required** — the read surface it needs already exists on `IZoneQuery` and as
  public `WarSimulator`/`TicketSystem` methods.

### Reuse strategy

- **Event plumbing:** `WarSimulator.events` (existing `WarEventEmitter`).
- **State→language mapping:** `HUDZoneDisplay.getStatusText()` /
  `prioritySortZones()` semantics (re-expressed, same vocabulary).
- **Reward surface:** `HUDSystem.spawnScorePopup()` → `ScorePopupSystem`.
- **System lifecycle/wiring:** the `StrategicFeedback` template
  (`GameSystem` + `SystemInitializer` construction + setter injection).
- **Off switch:** opt-in by construction. A `?tasking=off` query flag (or a
  config bool) lets the MVP ship default-on but trivially disable, matching the
  repo's kill-switch convention.

### Recommended MVP scope and the ≤400-net-LOC call

**Build A + B (capture + defend) only, single active task, single pending
offer, event-driven clear, score-popup reward scaled by `ticketBleedRate`
band.** Concretely the MVP is:

1. `TaskingDirector` system (`src/systems/strategy/TaskingDirector.ts`) —
   throttled candidate derivation for archetypes A + B, the one-task/one-offer
   state machine, event subscription for clear/complete, reward dispatch.
   (~180–230 LOC.)
2. A small HUD task-card element (`src/ui/hud/TaskCard.ts` or folded into the
   objectives column) — render offer/active/complete/failed states; accept and
   dismiss affordances. (~110–150 LOC.)
3. Wiring: construction in `SystemInitializer`, registry entry, setter injection,
   update-list insertion, and the accept/decline input binding. (~30–50 LOC.)

**Call: A + B fit comfortably in ≤400 net LOC** (estimate ~320–430 incl. wiring;
keep the card lean to stay under). Archetype **C (destroy a strategic target) is
a clean Phase-2 follow-on** — it adds a squad target type, squad-proximity
ranking, and the `squad_wiped` clear path, which is its own ~120–180 LOC and
would push the first PR past budget. **Recommended split: `tasking-director-mvp`
ships A + B; a `tasking-director-destroy` (or Phase-2 of the MVP) adds C.** The
director is structured as an archetype list from day one so C is additive, not a
rewrite.

## 6. Explicit non-goals (carried from the brief)

- No new strategic/AI computation. The director reads; it does not simulate.
- No premiere battle-royale mode (that is `premiere-battle-royale-design`).
- No `src/types/SystemInterfaces.ts` change — the read surface already exists.
- No mutation of ticket/zone/war state; the director only recognizes and rewards
  outcomes the existing systems produce.

## 7. Test layer guidance for the MVP (per docs/TESTING.md)

- **L1/L2 (vitest):** candidate-derivation behavior — "a contested enemy-owned
  zone produces a CAPTURE candidate", "a player-owned contested zone produces a
  DEFEND candidate", "no candidate during `SETUP`", "completion event for the
  active task's `zoneId` clears the task and awards a reward". Mock `IZoneQuery`
  and a fake event emitter; assert **observable outcomes** (a candidate is
  offered, the task clears, a reward is dispatched) — not internal phase names or
  tuning constants (throttle interval, cooldown seconds, reward magnitudes are
  tuning values per docs/TESTING.md §Rules 2–3).
- **No L4 needed** unless playtest surfaces a HUD-responsiveness concern.
- This task **is playtest-required for the MVP** (it changes UI responsiveness
  and adds an input binding) — the spike itself is doc-only and is not.
