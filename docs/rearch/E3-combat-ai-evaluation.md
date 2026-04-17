# E3 — Combat AI paradigm evaluation

**Spike branch:** `spike/E3-combat-ai-paradigm`
**Status:** decision memo, no merge
**Author:** E3 executor agent
**Date:** 2026-04-16

---

## 1. Question

Can the current hand-written per-NPC state machines (`AIStateEngage`, `AIStateDefend`, `AIStatePatrol`, `AIStateMovement`) scale to rich faction doctrine (VC guerrilla, NVA conventional, US combined arms, ARVN hybrid), or do we need a higher-level paradigm (utility AI, GOAP, behavior trees)?

Decision matters because **D2 (faction doctrine starter)** is queued on the assumption that doctrine is a thin parameter layer over the existing state machines. If that assumption breaks for realistic doctrine scenarios, D2's scope is wrong.

---

## 2. Current architecture (the reference point)

- 10 states in `CombatantState` (PATROLLING, ALERT, ENGAGING, SUPPRESSING, ADVANCING, SEEKING_COVER, DEFENDING, IDLE, RETREATING, DEAD, plus vehicle states).
- **`RETREATING` is declared in the enum but has no handler** (grep confirms no `case CombatantState.RETREATING` anywhere in `CombatantAI.ts`). Withdraw behavior today is implicit — when a combatant loses its target, it falls back to PATROLLING or DEFENDING.
- Per-NPC tick in `CombatantAI.updateAI()`: a `switch (combatant.state)` dispatches to one of four handler classes.
- Squad-level coordination is bolted on as a **second update path** — `AIFlankingSystem` runs its own state machine (`PLANNING -> SUPPRESSING -> FLANKING -> ENGAGING -> COMPLETE`) and mutates individual combatants into states the per-NPC machine then reads. `AIStateEngage.initiateSquadSuppression()` does a similar thing inline.
- There is no "doctrine" concept in the type system. `Faction` is only used for alliance checks (`isOpfor`, `isBlufor`) and a handful of burst-length tweaks in `AIStateEngage`.
- There is **zero existing hook for cross-system requests** (e.g. call-for-gunship). Grep for `helicopter|gunship|air.?support|airstrike` under `src/systems/combat/` returns no matches.

**Bolt-on count for AI behavior today: 2 machines (per-NPC + flanking) plus inline squad-suppression, plus a `SquadCommand` override path for player-controlled squads in `CombatantAI.applySquadCommandOverride()`.** Each new behavior has historically come in as a new sibling system. This is drift pressure we want to look at squarely before D2 adds a fourth bolt-on.

---

## 3. Three concrete doctrine scenarios

Each scenario specifies trigger -> transitions -> failure modes. Tuning constants are not the interesting axis; **structural requirements** are.

### Scenario A — VC fire-and-fade under squad-level suppression

**Doctrine:** VC squad member withdraws when *friendly* suppression level (aggregated across the squad, not self-only) exceeds a low threshold AND terrain cover is available in the withdrawal bearing (direction pointing away from the threat).

**State transitions expected:**
- ENGAGING -> WITHDRAWING(bearing, cover-point) when suppressionAvg(squad) > T_vc AND hasCoverInBearing(away-from-threat, radius).
- WITHDRAWING -> SEEKING_COVER if cover reached.
- WITHDRAWING -> ENGAGING if threat breaks off (alertTimer expires).
- WITHDRAWING -> DEFENDING if squad rallies behind cover.

**Structural requirements:**
1. Squad-level suppression aggregate, not the per-combatant `suppressionLevel` field (which decays per-unit).
2. Directional cover query: "cover in bearing X ± arc Y." Current `AICoverSystem` finds "best cover relative to threat" — not the same thing.
3. A WITHDRAWING state with a handler that understands why it was entered.

**Failure mode if we get it wrong:** VC units flee into open ground, or refuse to flee because only their own `suppressionLevel` is below threshold while the squad is being shredded around them.

---

### Scenario B — NVA platoon coordinated base-of-fire / maneuver

**Doctrine:** NVA platoon (two squads under one platoon leader) splits: squad 1 establishes base-of-fire (suppressing) while squad 2 executes a flanking maneuver. Commit to the assault — do not withdraw when squad 2 takes first casualty. Abort only on >40% platoon casualties.

**State transitions expected:**
- Platoon-level decision: observed-enemy-strength < own-strength AND terrain affords a flank.
- Platoon sets squad 1 -> SUPPRESSING, squad 2 -> ADVANCING on flank path.
- Platoon tracks casualty count; at 40% aborts (both squads switch to WITHDRAWING).
- Individual NVA combatant overrides its own cover-seeking if its squad is the assaulting arm — commit, don't go prone.

**Structural requirements:**
1. **Platoon tier** above squad. Current code has no platoon type. `AIFlankingSystem` operates per-squad and picks which members suppress vs flank *inside one squad*.
2. Shared goal state across two squads. Per-combatant state machine has no way to ask "is my sister squad currently in the suppression arm?"
3. Plan-level abort (40% platoon casualties). Per-NPC machines only see own health.
4. Plan-level override of sub-behavior: "skip your normal seek-cover behavior, you are in the assault arm."

**Failure mode if we get it wrong:** Suppressing squad moves up because their local "should I advance?" heuristic fires. Flanking squad stops to take cover because their local "should I seek cover?" heuristic fires. The plan dissolves into individual firefights.

---

### Scenario C — US squad requests gunship support against superior force

**Doctrine:** US squad engaged by a force of >=1.5x size AND within a zone with a callable support asset (helicopter or fixed-wing available) AND support-cooldown expired -> request gunship support at current contact location. While waiting for gunship, squad breaks contact and goes DEFENDING on nearest favorable terrain. When gunship arrives, squad spots contact for the gunship and re-engages with supporting fire.

**State transitions expected:**
- ENGAGING -> (emit event: `RequestSupport(type=gunship, pos, priority)`) -> DEFENDING(nearest-favorable).
- DEFENDING -> SPOTTING(contact-pos) when gunship arrives overhead (entity-level event).
- SPOTTING -> ENGAGING when gunship engages.
- If support denied (cooldown/none available), fall back to scenario A withdrawal logic.

**Structural requirements:**
1. **Outbound request channel** from AI to strategic layer (`src/systems/strategy/**`) or vehicle system. Does not exist. Grep for `helicopter|gunship|air.?support` under `src/systems/combat/` returns zero matches.
2. **Inbound event channel** from vehicle/strategic layer back to AI ("support inbound, ETA 20s"). Does not exist.
3. Memory of request state (`awaitingSupport`, `supportETA`, `supportDeniedReason`). New per-combatant or per-squad fields.
4. Sub-goals: wait for support, then switch to spotting, then re-engage. This is a **plan over time** that individual state machines don't model — each tick starts fresh from `combatant.state`.

**Failure mode if we get it wrong:** US squads fire the request but then transition back to ENGAGING on their own; gunship arrives to a squad already overrun. Or: squad stays in DEFENDING forever because no one ever emits "support arrived."

---

## 4. State-machine expression attempts

For each scenario, honest attempt at expressing it in the existing paradigm, with the breakage noted.

### 4A. Scenario A in state machines

**Can we do it?** Partially — the ugly 70%.

Steps:
1. Implement `handleRetreating()` — fill in the orphaned `CombatantState.RETREATING`. Takes ~80 LOC parallel to `AIStateMovement.handleAdvancing`.
2. Add `squadSuppressionAverage` field on `Squad` and update it once per tick in `CombatantAI.beginFrame()` or `updateTacticalSystems()`.
3. Add a faction-indexed `RETREAT_SUPPRESSION_THRESHOLD` constant table.
4. Add transition from ENGAGING to RETREATING in `AIStateEngage.handleEngaging()` gated on the squad aggregate and a new directional cover query on `AICoverSystem`.

**Where it breaks:**
- **Directional cover query is a real extension, not a tweak.** `AICoverSystem.findBestCover()` signature takes (combatant, threatPos) and picks best-scored cover in the global neighborhood. A "cover in bearing ± arc" query is a new method. That is fine but notable.
- **Squad-level aggregation for a per-NPC decision** means the state machine now reads data that changes as a side effect of sibling NPCs' state. Works, but the clean mental model ("this NPC decides from its own fields") weakens.
- **Engage vs seek-cover vs retreat** now form a three-way priority inside `AIStateEngage.handleEngaging()`. Four branches in that function already handle priority (full-auto, cover, flank initiation, suppression initiation). This becomes the fifth. Readable? Yes. Tunable? No — no code-free way to re-order these priorities. To change "retreat before seek-cover at high suppression" requires reordering an `if/else` ladder, not editing a score table.

**Verdict:** doable but state machine grows another branch and another cross-NPC read. **Call it 1 scenario the state machines can express, grudgingly.** Messy but not catastrophic.

---

### 4B. Scenario B in state machines

**Can we do it?** Only with a **third parallel system** like `AIFlankingSystem`, at the platoon level.

The existing flanking system is a precedent and also the cautionary tale: `AIFlankingSystem` is ~360 LOC, has its own status enum (`FlankingStatus`), its own role enum (`FlankingRole`), its own cooldowns, its own role manager, its own tactics resolver, and still has to *reach into* each combatant and mutate `combatant.state`, `combatant.destinationPoint`, etc. to get its plan honored.

To do platoon coordination we would duplicate that pattern:
- `AIPlatoonAssaultSystem` (new, ~400 LOC analog of `AIFlankingSystem`).
- Platoon data structure (new type — does not exist in `types.ts`).
- Override logic inside per-NPC handlers: "if you're in an active platoon assault as assault-arm, ignore your own seek-cover heuristic." This means `AIStateEngage.handleEngaging()` grows conditional *skip* branches for each orchestrating system above it.

**Where it breaks:**
- **Override hell.** Every orchestrating system above per-NPC needs bolted-in skip-clauses inside per-NPC handlers. We already see this: `CombatantAI.applySquadCommandOverride()` is exactly that — player-squad commands reach down and mutate per-NPC state before the state machine runs. Add platoon assault, add doctrine callouts, add support requests — each adds another override layer. **The override layer count grows O(N orchestrating systems).**
- **Plan-level abort (40% casualties)** has no home in per-NPC handlers. It lives in the orchestrator, which then has to mutate 10+ NPC states at once (each into WITHDRAWING, which we are also inventing). Action-at-a-distance.
- **Sibling squad awareness.** Per-NPC handler in squad 1 cannot easily read "what is squad 2 doing right now?" — the data is there via the Squad map, but joining "my squad's role in the current platoon assault" to "the other squad's role" requires the orchestrator to tell us, which means another per-combatant field (`currentAssaultRole: 'base'|'flank'|null`) synced by the orchestrator.

**Verdict:** expressible only by adding a second `AIFlankingSystem`-shaped orchestrator. **The state machine per se does not grow — the pile of orchestrators around it does.** Shipping N-doctrine-scenarios in this shape means shipping N orchestrators. **Scenario expressible only at the cost of more bolt-ons.** Count this as 0.5 — the individual AI can be driven, but the coordination layer is where the real work lives, and it's a separate system each time.

---

### 4C. Scenario C in state machines

**Can we do it?** Not without new infrastructure that isn't AI at all.

Breakdown:
1. **Outbound request channel** — must exist in strategic or vehicle layer. Not an AI-paradigm problem; this plumbing is needed no matter which AI paradigm we pick. Add event type `SupportRequested` to `GameEventBus`.
2. **Inbound response channel** — same story. Add `SupportInbound`, `SupportDenied`, `SupportArrived` events.
3. **Per-squad memory** — new `Squad.pendingSupport` field.
4. **AI state transitions** — now the AI paradigm question kicks in:
   - `ENGAGING -> (emit) -> DEFENDING`: fine as a transition.
   - `DEFENDING -> SPOTTING`: new state, new handler.
   - `SPOTTING -> ENGAGING`: trivial.
   - **But**: DEFENDING does not "know" it's waiting for support. It has to check `squad.pendingSupport` every tick, which leaks scenario-specific logic into `AIStateDefend.handleDefending()`. And if we add scenario D ("wait for mortar"), we add another branch inside DEFENDING.

**Where it breaks:**
- **DEFENDING becomes a dumping ground** for "waiting for something." State machines express waits poorly — they start to sprout per-reason branches inside a generic state.
- **Recovery paths multiply.** If support is denied, fall back to the scenario-A retreat logic. If support arrives but is killed in flight, go back to ENGAGING. Each recovery is a new edge on the state graph, and the state graph already has ~25 edges (10 states, transitions between roughly half of them).
- **Cross-system coupling** isn't an AI-paradigm problem, but the event plumbing is the bulk of the work and would be needed regardless. The fact that we'd need this plumbing *and* a state-machine retrofit suggests the cost is similar to a paradigm change.

**Verdict:** state machines can express it, but the state graph metastasizes per-scenario. Every "wait for X" scenario adds branches inside DEFENDING or a new sibling state. **Count this as 1 — expressible, but ugly and non-composing.**

---

### 4D. Tally

Scenarios the state machines can express with straight-line extensions:

- A (VC withdraw): **yes, but ugly** (new directional cover query, new cross-NPC read, new branch in `handleEngaging()`).
- B (NVA platoon maneuver): **only via a new parallel orchestrator system**; not expressible inside per-NPC machines.
- C (US call gunship): **yes, but each such "wait for external event" scenario adds branches inside generic states**; doesn't compose.

**2 of 3 can be shoehorned in**, one requires new orchestrator infrastructure. The deciding question is not "can it be done?" but **"what does the codebase look like after 10 doctrine scenarios?"**

Projection to 10 scenarios:
- N new parallel orchestrator systems (one per coordination-requiring doctrine).
- N-ish new branches inside `AIStateEngage.handleEngaging()` (already the hot path).
- N-ish new branches inside `AIStateDefend.handleDefending()` for "waiting for X" patterns.
- O(N) new cross-combatant fields to let orchestrators communicate with per-NPC handlers.
- Combined `CombatantAI` + state handlers + orchestrators: currently ~1,200 LOC of AI; projecting to 2,500-3,500 LOC.

That is a scaling problem, not a cliff. We can ship it. We'd regret it.

---

## 5. Prototype expression

File: `docs/rearch/E3-prototype/utility-withdraw.mjs`.
Paradigm chosen: **utility AI**.
Run: `node docs/rearch/E3-prototype/utility-withdraw.mjs`. ~200 lines, no deps, no build step.

Scenario chosen: Scenario A (VC withdraw under suppression with directional cover gate).

### Shape

Three actions — `engage`, `seek_cover`, `withdraw`. Each scores itself every tick on a small set of **considerations**: `suppressionUtility`, `healthUtility`, `coverGateUtility`, `aggressionUtility`. Highest-scoring action wins.

Faction doctrine is **one row in the DOCTRINE table**:

```
VC:   { withdrawSuppressionThreshold: 0.35, withdrawHealthPivot: 0.55, aggression: 0.3 }
NVA:  { withdrawSuppressionThreshold: 0.80, withdrawHealthPivot: 0.25, aggression: 0.8 }
US:   { withdrawSuppressionThreshold: 0.60, withdrawHealthPivot: 0.40, aggression: 0.6 }
ARVN: { withdrawSuppressionThreshold: 0.55, withdrawHealthPivot: 0.45, aggression: 0.5 }
```

The cover gate is a **hard multiplier** on the withdraw score — withdraw scores zero if no cover lies in the away-from-threat bearing, no matter how high the pressure. That is the exact "compound trigger" the state machine cannot express without surgical additions.

### What the prototype demonstrates

Run output (condensed):

| Case | Self | Expected | Chose |
| --- | --- | --- | --- |
| VC, light pressure, healthy | VC hp=0.9 suppr=0.2 | engage | engage (0.27) |
| VC, above threshold, cover in withdraw bearing | VC hp=0.7 suppr=0.6 | withdraw | **withdraw** (0.31) |
| VC, above threshold, NO cover in bearing | VC hp=0.7 suppr=0.6 | seek_cover (gate fails) | seek_cover (0.23) |
| NVA, same pressure as VC breakpoint | NVA hp=0.7 suppr=0.6 | engage | engage (0.56) |
| NVA, heavy pressure + low health + cover | NVA hp=0.2 suppr=0.9 | withdraw | **withdraw** (0.47) |

Same decision code, different DOCTRINE row, different behavior. **Faction doctrine is a configuration noun, not a code-path verb.**

### What scales nicely

- **Scenario C fits the same pattern.** An `action: 'request_gunship'` gets scored on an `isSupportAvailable()` consideration (gates to 0 if unavailable), plus an `enemyStrengthRatio` consideration. It competes with engage/withdraw/seek_cover in the same ranking. No new state. No new orchestrator. Recovery paths become "support_arrived gate drops, support_denied gate re-enables withdraw" — all data-driven.
- **Scenario B is less clean in raw utility AI** because it is genuinely multi-unit. Utility AI alone does not solve coordination. It does cleanly express the *individual*'s decision within the coordination ("am I assault arm? engage. am I base-of-fire? suppress."), while a thinner orchestrator issues role tags. The orchestrator's own decisions ("should we attempt an assault right now?") can themselves be utility-scored at the squad/platoon tier.

### What does not scale nicely

- **Debuggability:** utility AI decisions are "why did score=0.31 beat score=0.28?" That's harder to reason about than "the state machine transitioned because condition X fired." Needs tooling (a debug overlay that draws the top-3 scored actions per unit).
- **Determinism:** any `Math.random()` inside consideration curves becomes a determinism source (relevant to E5). The prototype uses no randomness in decisions; it would need seeded randomness if we want the existing "variance in picks" behavior.

---

## 6. Cost estimate — if we migrate

Assume we pick **utility AI** as the replacement paradigm for per-NPC decision making, with **hand-written coordination** at the squad/platoon tier (retain `AIFlankingSystem`-shape orchestrators, have them issue role tags into unit blackboards).

### Scope

- New: `CombatantUtilityCore.ts` (~400 LOC) — actions, considerations, scoring loop.
- New: `DoctrineRegistry.ts` — per-faction consideration curves + action availability.
- New: `Blackboard` pattern on `Combatant` for coordinator -> unit tags (~30 LOC type change).
- Retired: `AIStateEngage`, `AIStateDefend`, `AIStatePatrol`, `AIStateMovement` handler chains.
- Retained (rewrapped): `AITargeting`, `AICoverSystem`, `AIFlankingSystem` (orchestrator tier).
- Migration of existing behaviors (engage, cover-seek, patrol, defend, flanking) to action+considerations form.
- New test suite (behavior-level, per `docs/TESTING.md`): one test per doctrine scenario.
- Debug overlay for utility scores (table driven).

### Time

- **Core + migration:** 2 weeks focused work by one senior agent.
- **Tests + debug tooling:** 1 week.
- **Playtest / tune / ship:** 1-2 weeks.
- **Total: ~4-5 focused weeks.**

### Risk

- **Medium-high.** Combat AI is load-bearing; perf budget is tight (combat120 p99 ~34ms already). A utility core that naively rescores every action every tick for 200+ NPCs is ~10x the per-tick work of the current "dispatch one switch case" model. Mitigation: only rescore on blackboard change or every N ticks with variance. This is the specific thing to prototype *before committing to a migration*, not the withdrawal-decision logic which the current prototype already proved.

### Fence impact

- **Zero changes to `src/types/SystemInterfaces.ts`.** Interfaces in the fence are player controller, HUD, terrain, audio, ammo, weapon, renderer — none of which touch AI internals. Safe.

---

## 7. Value estimate

### Doctrine richness unlocked

- **Four factions, 3-5 distinct doctrines each** become editable as rows in a table instead of branches in code.
- **Per-zone or per-mission doctrine overrides** ("NVA in reserve positions use defensive doctrine, NVA on the offensive use assault doctrine") is an action-availability and consideration-weight swap. State machines would require a per-zone override layer.
- **Scripted mission behavior** (A Shau scripted assaults) compose better: a mission sets a temporary blackboard flag, doctrine rows read it, no code changes.

### Tuning velocity per faction

- Current code: to tune VC panic threshold, find the `PANIC_THRESHOLD` constant in `AIStateEngage.ts`, grep consumers, edit, retest all factions because it's shared.
- Proposed: edit DOCTRINE.VC row. Done. Other factions unaffected by construction.

### What it does NOT unlock

- Scale (3,000 agents) is **unaffected** by this choice — the bottleneck is the ECS/rendering axis (E1, E2), not AI decision structure.
- Tactical quality is **mostly unaffected**; utility AI doesn't produce smarter decisions, it produces more composable ones.

### Vision anchor check

- Large-scale AI combat (3,000): neutral.
- Stable frame-time tails: neutral to slightly negative unless ticked-throttled.
- Realistic/testable scenarios: **strong positive** — testability per-doctrine is the main win.
- Game-for-agents aspiration: neutral to positive — structured action space overlaps with E4's needs.

---

## 8. Recommendation

**Recommendation: DESIGN A UTILITY LAYER — but do not start it now, and do not block D2 on it.**

Specifically:

1. **Land D2 as scoped** (thin parameter layer, one observable differentiation per faction). It will ship, it will be fine, it will not paint us into a corner because the differentiations D2 proposes (suppression thresholds, retreat speed, support preference) map cleanly to DOCTRINE-row entries in the eventual utility model. **D2 is not wasted work if we later adopt utility AI — the constants become utility-curve parameters.**
2. **Add `docs/rearch/E3-followup.md` as a Phase F candidate** to design the utility layer. Do not implement in Phase D or early F.
3. **Before implementing the utility layer, write 2 more doctrine scenarios** to stress the design (e.g. an ARVN mixed-loyalty scenario; a VC booby-trap-placement scenario). If those also fit cleanly, commit. If they fight the paradigm, reopen.
4. **Do not adopt GOAP or behavior trees.** The scenarios above do not exhibit the "long-horizon action sequence planning" that motivates GOAP, and the "readable tree of conditions" that motivates BTs is not a strength we need — our orchestrators (flanking, platoon assault) already supply that shape above the unit, and utility AI is strictly better for the individual-unit scoring of "which of N actions right now."

### Why not "keep state machines + data-driven tuning"

Because scenario B (platoon coordination) and every similar multi-tier doctrine scenario already forces us to add bolt-on orchestrators on top of per-NPC machines, and each bolt-on requires new override branches reaching into per-NPC handlers. The state-machine paradigm is **not the bottleneck** for individual-NPC logic (scenario A is ugly but shippable). It IS the bottleneck for **composing doctrine across many scenarios without drowning per-NPC handlers in skip-conditions**. Utility AI at the per-NPC tier solves this by making "what do I do right now?" a data lookup rather than a code branch — orchestrators then issue blackboard tags instead of mutating states.

### Impact on D2 (called out per orchestrator note)

**D2 scope is still correct.** D2 ships one per-faction constant (e.g. per-faction suppression retreat threshold). When a utility layer lands later, that constant moves into the DOCTRINE table. D2 is not predicated on the state machines scaling *forever* — it is predicated on the state machines scaling *for one small differentiation per faction today*, which is true.

**One caveat for the D2 executor:** do not bake the per-faction constant into a global module-level const (`const VC_RETREAT_THRESHOLD = 0.35` at the top of `AIStateEngage.ts`). Put it on a **tiny faction lookup** — e.g. `FACTION_COMBAT_TUNING[faction]` in a new module — even if there's only one entry per faction to start. This makes the eventual migration to DOCTRINE rows a rename, not a refactor.

---

## 9. Appendix — orphan state and other drift signals

While reading the AI code I noticed signals worth flagging even though they are out of scope for E3:

- **`CombatantState.RETREATING` has no handler.** The enum value exists in `types.ts` line 85; grep for `case CombatantState.RETREATING` finds zero results. Orphan. D2 may want to either remove it or implement it.
- **`CombatantState.IDLE` has no handler either.** Similarly orphaned.
- **Two squad-suppression paths exist:** `AIFlankingSystem` (the modern one, ~360 LOC) and `AIStateEngage.initiateSquadSuppression()` (the legacy inline one, still called as a fallback). Both mutate `CombatantState.SUPPRESSING` and `CombatantState.ADVANCING`. Noted for the D1 carveout.
- **`CombatantAI.applySquadCommandOverride()` is the third AI-behavior system** — player-squad command override. Three systems (per-NPC + flanking orchestrator + player command override) already mutate `combatant.state` as a side effect. Adding a fourth (doctrine override) follows the same pattern and gets increasingly hard to reason about.
- **No event plumbing for AI-to-strategic requests.** Scenario C's "call gunship" would need this regardless of AI paradigm; flag for whoever owns the strategic layer.

These do not change the recommendation above; they corroborate that "each new behavior becomes a new bolt-on" is the current pattern.

---

**End of memo.**
