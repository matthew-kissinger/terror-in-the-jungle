# engine-trajectory-memo: research + recommendations for reusing the codebase as a general engine

**Slug:** `engine-trajectory-memo`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 1
**Priority:** P2 — research, not code. Informs future cycles.
**Playtest required:** NO (memo-only deliverable).
**Estimated risk:** zero — documentation only.
**Budget:** no LOC cap for the memo; no code changes.
**Files touched:**

- Create: `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md`.

## What this memo exists for

The game is heading toward reuse across multiple locations / games. The human wants a concrete assessment of: what are we using well, what are we using poorly or reinventing, what would a generalized engine look like, and what sequencing would get us there without a rearch pause?

This is not a decision document. It is a map + recommendations that future cycles can act on.

## Required reading first

- `package.json` — current dep list.
- `CLAUDE.md` + `AGENTS.md` — project orientation.
- `docs/blocks/*.md` — authoritative block docs (~10 files covering all subsystems).
- `docs/REARCHITECTURE.md` — prior Phase E paradigm questions (ECS, rendering, combat AI, agent API, determinism, vehicle physics).
- `docs/INTERFACE_FENCE.md` — fenced interfaces (the stability contract).
- `src/types/SystemInterfaces.ts` — the fenced surface.
- `src/core/GameEngine.ts` + `SystemManager.ts` + `SystemRegistry.ts` + `SystemInitializer.ts` — the engine skeleton.
- `src/core/GameplayRuntimeComposer.ts` + `OperationalRuntimeComposer.ts` — subsystem composition.

## Structure of the memo

The executor writes a ~2000-3500 word memo with these sections. Opinion is welcome; cite specifics.

### 1. Current stack snapshot

One-page table: every runtime dependency, version, last-updated, what it does for us, whether it's still the right choice in 2026-04. Candidates to verify (not exhaustive):
- `three@0.184` — check latest stable; note any breaking changes on the upgrade path.
- `three-mesh-bvh` — check latest.
- `@recast-navigation/{core,generators,three}` — check latest, confirm maintained.
- `@preact/signals-core` — installed but not widely used; is it still the right reactivity primitive?
- `tweakpane` (landing this cycle) — note as new dev-only dep.
- `vite@8`, `vitest@4`, `typescript`, `eslint` — toolchain cadence.

### 2. What we reinvented

List our hand-rolled subsystems and evaluate whether the reinvention is worth it or a tech-debt surface:
- `Airframe` (fixed-wing physics) vs Rapier / Cannon-es / custom.
- `SystemManager` + registry pattern vs bitecs / koota / standard ECS.
- `InfluenceMapSystem` — is there a canonical influence-map lib, or is ours fine?
- `CombatantLODManager` — compared to Unity/UE LOD patterns.
- `PostProcessingManager` (ACES + quantize + Bayer) vs Vincent Schwenk's `postprocessing` lib.
- Noise / heightmap gen (verified by `terrain-param-sandbox` executor) — are we on `simplex-noise` or hand-rolled?
- Custom `InputManager` vs stitched/canonical input libs.

For each: is the reinvention intentional (domain-specific, intentional abstraction) or accidental (no one evaluated the lib)?

### 3. Fenced interfaces review

Look at `src/types/SystemInterfaces.ts`. Are the right things fenced? Are there leaky abstractions that should be fenced but aren't? Are there things fenced that should be free?

### 4. What a multi-location / multi-game reuse would require

Concrete engineering work grouped by blast radius:
- **Trivial:** data-driven items (map seeds, faction configs, weapon lists) that already live in config files.
- **Tractable:** subsystems that are close to standalone but have a few coupling points (terrain, navmesh, audio, atmosphere).
- **Painful:** subsystems tightly bound to Terror-in-the-Jungle specifics (combat AI has Vietnam-era-specific tuning, airframe configs have US vs NVA aircraft).
- **Unknown:** areas that haven't been surveyed (rendering, post-processing, UI framework).

### 5. Recommended sequence

One-line-per-task prioritized list of what cycles would move us toward reuse. Examples:
- Extract terrain system into a package that can boot without `GameEngine` (seeded by `terrain-param-sandbox` this cycle).
- Generalize `FactionCombatTuning` into a doctrine-library pattern that games plug their own doctrines into.
- Standardize asset-pipeline conventions so a new location's assets drop in via a manifest.
- Evaluate ECS adoption (bitecs or koota) by applying to one subsystem (combat NPCs) as a spike.

### 6. What NOT to do

List anti-recommendations — tempting moves that would hurt more than help. Examples:
- Do NOT adopt `@needle-tools/engine` (forks three@0.145.4; covered in cycle README).
- Do NOT rewrite `Airframe` on Rapier unless multi-vehicle parity becomes a blocker.
- Do NOT adopt a React/Svelte/Vue UI layer; DOM overlays + signals-core suffice.

### 7. Immediate vs long-term

A 2-column table: "things we should do in the next 3 cycles" vs "things we should do in the next 6 months." Roughly 5 entries per column.

## Steps

1. Read required reading. Take notes on surprises vs expectations.
2. Run `npm outdated` to see the gap between pinned versions and current registry state. Include this in section 1.
3. Web-fetch the Three.js release notes between r184 and latest (or the latest two minor versions) to identify relevant changes.
4. Spot-check one or two of the "what we reinvented" claims by grepping for library import patterns (e.g., is `simplex-noise` imported anywhere?).
5. Write the memo.
6. No code changes. `npm run lint`, `npm run test:run`, `npm run build` green (should be trivially green since no code).
7. Commit with `docs(rearch): engine trajectory memo (engine-trajectory-memo)`.

## Exit criteria

- `docs/rearch/ENGINE_TRAJECTORY_2026-04-23.md` exists with the 7 sections listed above.
- Memo is ≥ 2000 words and ≤ 4500 words (quality over padding; cite specifics).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- PR body summarizes the top-3 recommendations in 3 bullet points.

## Non-goals

- No code changes. Not one line.
- Do not propose a full rearch. Propose the smallest-blast-radius paths.
- Do not recommend adopting `@needle-tools/engine`, Rapier, or bitecs without a concrete justification tied to a current pain point.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP (should never happen — this is a memo).
- Scope creep toward code changes → STOP, memo only.

## Pairs with

- `terrain-param-sandbox` (provides the first concrete seed of the memo's recommendations).
- Future rearch cycles (this memo is their input).
