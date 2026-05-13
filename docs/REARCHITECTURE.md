# Rearchitecture — Open Paradigm Questions

> **Status note (2026-05-12).** E2 (rendering paradigm at scale) has settled in favor of **WebGPU + TSL** — Three.js 0.184 `WebGPURenderer` is exclusive on `exp/konveyer-webgpu-migration`, target for master merge after the materialization rearch cycle completes. E1 (ECS), E3 (AI paradigm), and the remaining E-track questions remain open. See [docs/rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md](rearch/KONVEYER_REVIEW_PACKET_2026-05-12.md) for current state.

Last updated: 2026-04-16

This document names the architectural decisions that surgical cleanup work (Batches A-D) deliberately does **not** settle. Without explicit framing, those decisions get made by default — the "current shape" becomes "the correct shape" without anyone having argued for it.

This file lists the five open questions, why each matters, and what a decision on each requires. Task briefs for each live under `docs/tasks/E*.md` and run as R&D spikes in parallel with surgical work.

## Purpose of Phase E

- **R&D, not implementation.** E-track agents produce decision memos with prototype data, not merged behavior changes.
- **Parallel to A/B/C.** Rearch thinking happens WHILE surgical cleanup happens, not after.
- **Checkpointable.** Each E task is scoped to a spike + memo. Implementation of the chosen direction is a separate, later pass.
- **Reversibility-weighted.** Prefer decisions where the prototype data is decisive. Skip philosophical debates without measurement.

## Vision anchor

From `CLAUDE.md`:

- Large-scale AI combat (up to 3,000 agents).
- Stable frame-time tails under load.
- Realistic/testable large-map scenarios (21km DEM).
- Aspirational: game playable by agents in real time (not a pillar, but a forcing function for certain design choices).

Every E question is evaluated against these anchors.

---

## E1: ECS migration (bitECS)

### The question

Should combatants, projectiles, and/or other high-count entities migrate to an entity-component-system model using `bitECS`? Or is the object-graph-of-classes model sufficient to reach 3,000 agents?

### Why it matters

Current combatants are objects in a `Map<string, Combatant>`. Each tick touches dozens of fields across scattered heap locations. At 120 NPCs we already see p99 ~34ms. Cache behavior degrades roughly linearly; by ~800-1500 NPCs, the OOP model will hit a wall.

`bitECS` stores components in typed arrays (struct-of-arrays). 10-100x better cache behavior for the hot path. Tradeoff: all component access becomes indexed-into-arrays rather than property access. Large refactor.

### What a decision requires

- Prototype: port ONE subsystem (projectiles or combatants) to bitECS in a throwaway branch.
- Measure: throughput (entities updated per frame per ms) against current OOP at 120, 500, 1000, 2000 entities.
- Decision rule: if bitECS wins by ≥3x at 1000+ entities AND the port is bounded (estimable in <2 weeks), do it. If it wins by <2x or the port is unbounded, don't.

### Out of scope for the decision memo

- Migrating everything. Pick one subsystem.
- Building wrappers to make bitECS look like OOP. Measure the native form.

---

## E2: Rendering paradigm at scale

### The question

Does the classic Three.js scene graph (one `Object3D` per entity) scale to 3,000 animated combatants + vehicles + projectiles + effects? Or do we need GPU-driven rendering (instanced meshes, compute-updated transforms, indirect draws) — possibly via WebGPU?

### Why it matters

Every `Object3D` carries a matrix, a visibility bit, parent pointers. At 3,000 entities, just matrix-world recomputation per frame is non-trivial, and draw calls multiply. We already merge static meshes via `ModelDrawCallOptimizer`; the question is whether dynamic entities need similar treatment.

### What a decision requires

- Stress test: spawn 500, 1000, 2000, 3000 dummy entities with current renderer. Measure frame time.
- Prototype: instance-rendered 3000 animated combatants in a throwaway scene. Compare.
- Survey: WebGPU renderer status in Three.js r18x — is it stable enough for production, or still preview?
- Decision rule: if current renderer comfortably handles 2000+ at PASS frame budget, defer. If it degrades before 1500, start designing GPU-driven path.

### Out of scope

- Full WebGPU migration. This is a paradigm decision, not an implementation plan.

---

## E3: Combat AI paradigm

### The question

Can hand-written per-NPC state machines (`AIStateEngage`, `AIStateDefend`, `AIStatePatrol`, etc.) scale to rich faction doctrine, or do we need utility AI / GOAP / behavior trees?

### Why it matters

D2 (faction doctrine starter) assumes we can express doctrine as thin parameter tweaks on the existing state machines. That assumption may break quickly if we want NVA to coordinate multi-squad assaults while VC maintain fire-and-fade behavior — those demand different planning structures, not different constants.

### What a decision requires

- Write 3 concrete doctrine scenarios that current state machines CANNOT express cleanly. Examples: "VC squad withdraws when friendly suppression reaches threshold AND terrain cover is available in the withdrawal direction"; "NVA platoon attempts coordinated suppression on one flank while another flank maneuvers."
- Attempt to express each as a state-machine extension. Note the breakage.
- Prototype ONE scenario as a utility-AI / GOAP / BT expression. Compare.
- Decision rule: if 2+ scenarios break cleanly and the prototype is readable, design a replacement. If 0-1 break or the prototype is a ball of mud, keep state machines and invest in doctrine-as-data.

### Out of scope

- Adopting a third-party AI library without measurement.
- Rewriting existing AI just to prove the paradigm.

---

## E4: Agent-as-player action / observation API

### The question

What does a structured action/observation interface look like that lets an external agent drive a character in this game? This is distinct from the human input path (keyboard, mouse, touch).

### Why it matters

Two reasons this isn't just hypothetical:

1. The existing `scripts/perf-active-driver.js` is already an agent-as-player (even if a dumb one). Its bugs (teleport, thrash) come from riding the human-keyboard path. A structured action API would solve those classes of bugs.
2. Your stated aspiration: "game for agents in real time." Not a pillar, but building toward it is cheap *if* we design primitives correctly and expensive *if* we bolt it on later.

### What a decision requires

- Design (not code): propose an action space (move-to, face-bearing, fire-at, take-cover, enter-vehicle, exit-vehicle, call-support). Small, typed, bounded.
- Design: propose an observation space (visible entities within cone/radius, own-state snapshot, mission objectives).
- Prototype: back the active driver with the new action API. Does it behave better than the current keystroke-emulation approach?
- Decision rule: if the new API makes the active driver significantly more robust AND the surface area is small (<20 methods total), land it. The aspirational "full agent player" can come later with the plumbing already there.

### Out of scope

- Network/RPC layer for agents over the wire. Local in-process call only for this spike.
- Full RL-style observation (no need for pixel observations; structured data only).

---

## E6: Vehicle physics rebuild — first principles

### The question

Should the fixed-wing flight model be rebuilt as one coherent system, rather than the current four-layer arrangement (`FixedWingPhysics` + `FixedWingControlLaw` + `FixedWingPlayerAdapter` + `FixedWingConfigs`)? If yes, what does the replacement look like?

### Why it matters

Current state: four files, written at different times by different agents, each owning a piece of the flight model. Hidden modes (`assisted`, `direct_stick`, `orbit`) cross all four. Ground/air transition is fragile. Collision is point-sample height lookup, so climbing aircraft can pass through rising terrain. Input ergonomics ("arrow-up at low speed does almost nothing visible") don't match player expectations. Cross-vehicle state may bleed between helicopter and fixed-wing adapters — entering a plane after a helicopter session reportedly behaves differently than entering fresh. Surgical patches have kept producing whack-a-mole — the 24a94e7 arcade rewrite fixed one failure mode (props dragging on ground) and exposed two others (arrow-key unresponsiveness perception, terrain pass-through).

### What a decision requires

- Audit the current vehicle physics surface (state, invariants, cross-file dependencies).
- Propose a unified architecture: one simulation type, one intent type, one command type, one config schema.
- Design swept collision (not point-sample).
- Prototype the core loop on one aircraft (Skyraider). Run an isolated scenario, measure feel + frame time.
- Sketch a migration path to production (feature flag, shadow-run, playtest, flip).

### Out of scope

- Helicopters and ground vehicles in the first prototype. Fixed-wing only. Rollout to others follows.
- Landing the rebuild. That's Batch F.

---

## E5: Deterministic sim + replay

### The question

Is it worth the engineering cost to make the simulation deterministic enough to replay a session from a seed + input log?

### Why it matters

Determinism unlocks:
- Reliable perf regression testing (same scenario, same numbers, different builds).
- Agent training (if E4 lands) without noise from non-determinism.
- Bug repro ("here's the replay that shows the stall").
- Rollback for networking (if that ever comes).

Cost: physics stepping must be deterministic (fixed-step already partially there), random seed must flow through all systems, floating-point inconsistencies across hardware must be tamed or accepted.

### What a decision requires

- Audit: list every source of non-determinism (wall-clock, `Math.random`, `performance.now` in logic, iteration order of `Set`/`Map`).
- Estimate: cost to replace each with deterministic equivalents.
- Prototype: record inputs + seed during a 30-second session. Replay. Compare final state byte-by-byte (tolerances allowed).
- Decision rule: if cost is <1 week of focused work AND at least 2 listed benefits are high-value, invest. Otherwise defer.

### Out of scope

- Cross-machine determinism (different FPU behavior). Single-machine determinism is enough for most use cases.

---

## Meta: decision framework

For each E-task, the decision memo follows this template:

1. **Question** (the one-liner).
2. **Measurement** (what the prototype showed).
3. **Cost estimate** (how much work to fully implement).
4. **Value estimate** (which of the vision anchors it unlocks, and by how much).
5. **Reversibility** (how hard to undo if we pick wrong).
6. **Recommendation** (do it now / prototype further / defer / no).

Recommendations don't auto-execute. They feed into a human-led decision session that produces Phase F task briefs.

## What happens after Phase E

Phase F — actual rearchitecting — is planned from the decision memos, not from wishful thinking. Phase F is a separate, larger, deliberate pass. Don't start Phase F without memos in hand.

## Amending this document

New open questions get added here first, task briefs get written under `docs/tasks/E*.md`, and the orchestrator picks them up for parallel R&D. Don't skip this document — rearchitecting questions that aren't written down become rearchitecting that doesn't happen.
