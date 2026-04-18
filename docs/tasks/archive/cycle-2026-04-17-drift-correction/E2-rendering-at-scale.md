# Task E2: Rendering paradigm at scale

**Phase:** E (parallel R&D track, decision memo only)
**Depends on:** Foundation
**Blocks:** Batch F planning
**Playtest required:** no
**Estimated risk:** low (throwaway scene, no master impact)
**Files touched:** throwaway branch; deliverable is a decision memo

## Goal

Decide whether the classic Three.js scene-graph + per-entity `Object3D` model scales to 3,000 animated combatants + vehicles + projectiles + effects. If it doesn't, frame what the GPU-driven alternative looks like (instanced meshes, compute-updated transforms, indirect draws, possibly WebGPU).

## Vision anchor

3,000-agent target, stable frame-time tails under load, 21km DEM maps.

## Required reading first

- `docs/REARCHITECTURE.md` E2 section.
- Current `Combatant*` rendering path (likely `CombatantRenderer.ts`).
- `ModelDrawCallOptimizer.ts` — existing static-mesh merging.
- Three.js r18x `InstancedMesh` and `BatchedMesh` docs.
- Three.js WebGPU renderer current status (tech preview? production-ready for r18x?).

## Steps

1. **Current-path stress test.** Spawn 500, 1000, 2000, 3000 dummy entities using the CURRENT renderer (Object3D per entity, or existing instanced path if combatants already instance). Measure frame time. Record.
2. **Identify the bottleneck.** If frame time degrades, is it draw calls? Matrix updates? CPU-side culling? GPU vertex shading?
3. **GPU-driven prototype.** Build a throwaway scene with 3000 InstancedMesh-rendered "combatants" (cubes or simple meshes are fine) with per-frame transform updates. Measure.
4. **WebGPU survey.** Not a build. Just: read current Three.js WebGPU docs, note maturity, note migration cost.
5. **Decision memo.**

## Deliverable: decision memo

File: `docs/rearch/E2-rendering-evaluation.md`.

Sections:

1. **Question.**
2. **Current-path measurements** (frame time at N = 500/1000/2000/3000).
3. **Identified bottleneck** (where does time go when it goes).
4. **Instanced-path measurements** (for contrast).
5. **WebGPU status snapshot** (one paragraph: maturity, migration cost).
6. **Cost estimate** (what would it take to migrate combatant rendering to an instanced path).
7. **Value estimate** (frame budget gained at various N).
8. **Recommendation** (defer / design instanced path now / commit to WebGPU / etc.).

## Verification

- Memo exists.
- Measurements reproducible.
- No changes merged to master.

## Non-goals

- Do not migrate the actual renderer.
- Do not full-port anything to WebGPU.
- Do not change fenced interfaces.
- Do not touch the current renderer code outside the stress test.

## Exit criteria

- Decision memo delivered with reproducible measurement commands.
- Orchestrator flags memo delivered, moves on.
