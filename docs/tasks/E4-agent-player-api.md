# Task E4: Agent-as-player action / observation API design

**Phase:** E (parallel R&D track, design + small prototype)
**Depends on:** Foundation
**Blocks:** Batch F planning
**Playtest required:** no
**Estimated risk:** low (design work; small prototype stays in throwaway branch)
**Files touched:** deliverable is a decision memo + optional prototype branch

## Goal

Design (not fully build) a structured action/observation interface that lets an external agent drive a character in the game, separate from the human keyboard/mouse/touch input path. Prove the design is sound by prototyping the existing `scripts/perf-active-driver.js` on top of it.

## Vision anchor

Aspirational goal: game playable by agents in real time. Not a pillar, but a forcing function for correct primitives. Existing active driver's bugs (teleport, thrash) come from riding the keystroke path. A structured API would solve those as a byproduct.

## Required reading first

- `docs/REARCHITECTURE.md` E4 section.
- `scripts/perf-active-driver.js` — current active driver.
- `scripts/perf-capture.ts` — how active driver is wired in.
- `src/systems/player/PlayerController.ts` — the existing player surface.
- `src/systems/player/PlayerInput.ts` — the keystroke path.

## Steps

1. **Design action space.** Proposed: `moveTo(pos)`, `faceBearing(angleRad)`, `fireAt(targetId | position)`, `takeCover(coverId)`, `enterVehicle(vehicleId)`, `exitVehicle()`, `callSupport(type)`. Small, typed, bounded. Document the full set.
2. **Design observation space.** Proposed: `ownState` (position, health, ammo, current weapon, current vehicle), `visibleEntities` (array of entity snapshots within cone/radius), `objectives`, `damageEvents` (recent). Also small and bounded.
3. **Prototype.** Implement the action/observation API as a TypeScript interface + minimal adapter that sits on top of `PlayerController`. Port `perf-active-driver.js` to use it.
4. **Compare.** Does the new driver behave more coherently? Log state-transition rate; it should be lower than the keystroke path.
5. **Decision memo.**

## Deliverable: decision memo

File: `docs/rearch/E4-agent-player-api-evaluation.md`.

Sections:

1. **Question.**
2. **Proposed action space** (full list with signatures).
3. **Proposed observation space** (full structure).
4. **Adapter sketch** (how it sits on `PlayerController`).
5. **Prototype results** (active driver on the new API vs keystroke — state transition rates, coherence).
6. **Cost estimate** (implementing fully, including hooking into NPC AI for eventual dogfooding).
7. **Value estimate** (better active driver, path to agent playability, easier automated testing).
8. **Recommendation** (land in next run / iterate further / defer / no).

## Verification

- Memo exists with action/observation surface.
- Prototype runs and shows the active driver working via the new API.
- No changes merged to master (prototype is in a throwaway branch or lands only the design doc).

## Non-goals

- **No network/RPC layer.** Local in-process only.
- No pixel observations. Structured data only.
- No RL training pipeline.
- Do not touch fenced interfaces (unless flagged in the memo as a future fence change).

## Exit criteria

- Decision memo delivered with concrete signatures.
- Prototype validates the design.
- Orchestrator flags memo delivered.
