# continuous-contact-contract-memo: architectural design memo (paper only)

**Slug:** `continuous-contact-contract-memo`
**Cycle:** `cycle-2026-04-22-flight-rebuild-overnight`
**Round:** 4
**Priority:** P1 - design output only; enables future architectural work in a human-gated cycle.
**Playtest required:** NO (memo is text).
**Estimated risk:** none - no code.
**Budget:** no LOC cap; memo length ~1500-2500 words.
**Files touched:**

- Create: `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md`.

## Purpose

Capture the unified contact-contract proposal so the human can review it with coffee and decide whether to open a follow-up implementation cycle.

## Required reading first

- `docs/FLIGHT_REBUILD_ORCHESTRATION.md` "Why this plan exists" and "Repo pulse" sections (source of truth for the diagnosis).
- `docs/rearch/` existing memos for format precedent (e.g. `docs/rearch/E6-vehicle-physics-design.md` if present).
- `src/systems/vehicle/airframe/Airframe.ts`, `src/systems/vehicle/airframe/terrainProbe.ts`, `src/systems/combat/CombatantMovement.ts`, `src/systems/combat/CombatantLODManager.ts`, `src/systems/combat/CombatantRenderInterpolator.ts`, `src/systems/world/WorldFeatureSystem.ts`, `src/systems/terrain/TerrainFeatureCompiler.ts` - enough to describe each subsystem's current contact discipline accurately.

## Memo structure

1. **Problem statement** - cite the four symptom classes this plan addressed (sticky takeoff, tick-back-and-forth, phase-through, NPC leap). Note that Round 1-3 of this cycle treated the symptoms; this memo proposes the architectural fix so the class of bug cannot re-emerge.
2. **Current contact disciplines** - one paragraph each for airframe, NPC low-LOD, NPC high-LOD, distant-culled NPC, prop placement. Cite file:line.
3. **Proposed contract** - three rules:
   - (a) any actor translating with `|velocity| * dt > threshold` sweeps its motion vector against registered obstacles;
   - (b) any simulated body rendered to screen exposes `prev / current` pose and renders at `alpha = accumulator / dt`;
   - (c) any prop placed on heightmap samples its full footprint, rejects unsafe slopes, and snaps to min-corner or flattens before place.
4. **API shapes** - what `ContactSweepRegistry.registerStatic(mesh)` would look like, how `Airframe` / `CombatantMovement` / `WorldFeatureSystem` consume it.
5. **Migration plan** - ordering: introduce the BVH + registry; migrate airframe (already partly migrated); migrate NPC low-LOD path; migrate prop placement. Estimate LOC per migration.
6. **Risk and rollback** - what breaks if the BVH is wrong; per-migration rollback strategy.
7. **Scope estimate for implementation cycle** - task count, parallelism, expected time.
8. **Open questions** - things the human needs to decide before implementation starts.

## Steps

1. Read Required reading.
2. Draft the memo. Lean on the diagnosis already in `docs/FLIGHT_REBUILD_ORCHESTRATION.md`; do not re-derive.
3. Commit as `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md` on a branch `task/continuous-contact-contract-memo`.
4. Open PR. CI runs lint on markdown if configured; otherwise lint is vacuous for this task.

## Exit criteria

- Memo exists at `docs/rearch/CONTINUOUS_CONTACT_CONTRACT.md`.
- Memo has all 8 sections listed above.
- No new source files committed.
- `npm run lint`, `npm run test:run`, `npm run build` green (should be unchanged since no code edits).

## Non-goals

- Do not write any source code.
- Do not modify the orchestration plan or `docs/AGENT_ORCHESTRATION.md`.

## Hard stops

- Author realizes the contract cannot be expressed cleanly as three rules -> STOP, surface. The memo is still useful as a problem framing even without a proposal; write what you can.
