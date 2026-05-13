# Template: god-module split

Last verified: 2026-05-09

This template defines the shared structure all Phase 3 split tasks follow.
Individual task briefs reference this file rather than restating the
boilerplate.

## Goal of every split task

Take a single oversized source file (≥700 LOC or ≥50 public methods) and
split it into:

- **Orchestrator** — owns the per-frame entry point, ≤300 LOC, public API
  unchanged from the caller's perspective.
- **Helpers** — focused modules under a sibling subdirectory, each ≤500 LOC,
  each owning one cohesive concern.

## Behavior preserving

- Public API of the orchestrator is unchanged (same class name, same
  exported methods, same signatures).
- All existing tests against the orchestrator continue to pass without
  modification. **If a test starts failing, the split is wrong, not the
  test.**
- Internal data structures may change. Cross-helper communication via
  pure function calls or events; no shared mutable state without a lock.

## Required reading first

- `docs/TESTING.md` — behavior tests, not implementation-mirror
- `docs/INTERFACE_FENCE.md` — the orchestrator's class is NOT a fenced
  interface, but if a fenced interface mentions it, do NOT change the
  fence. Adapter pattern instead.
- `docs/dev/worldbuilder.md` — if the orchestrator system has a
  WorldBuilder consumer flag, preserve the flag-check after the split
- `scripts/lint-source-budget.ts` — the rule the split closes; remove
  the orchestrator's grandfather entry on completion

## Standard steps

1. `npm ci --prefer-offline`.
2. Read the source file end-to-end. Identify cohesive sections (often
   already grouped by `// region` comments or class member ordering).
3. Define the split topology: orchestrator + N helpers. Each helper has
   one responsibility, named after that responsibility.
4. Move code in order:
   - Pure helpers first (no engine dependencies)
   - State-holding helpers next
   - Orchestrator becomes the thin coordinator last
5. Update imports in callers if the orchestrator's class location moved
   (it usually doesn't — keep the orchestrator at the same path).
6. Run `npm run lint`, `npm run lint:budget`, `npm run typecheck`,
   `npm run test:run` — all green.
7. Run the **parity test**: a deterministic 60-second scenario before/after
   the split that asserts identical game state at frame 3,600. Must be
   byte-identical for combat counts, tickets, zone capture timeline, and
   HUD state at sample frames.
8. Run `npm run perf:capture:combat120 && npm run perf:compare -- --scenario combat120`.
   p99 must be within ±2% of the pre-split baseline.
9. **Run a 10-minute manual playtest** in dev preview against the matching
   game mode. Confirm no visible feel regression.
10. Remove the orchestrator's entry from `scripts/lint-source-budget.ts`
    `GRANDFATHER` map.
11. Update `docs/ARCHITECTURE.md` if the fan-in heatmap moved meaningfully.

## Standard verification block

Each task brief's "Verification" section should include all of:

```
- npm run lint            clean
- npm run lint:budget     0 fail; grandfather list shrinks by 1+
- npm run lint:docs       no new failures
- npm run typecheck       clean
- npm run test:run        all green; new helper tests added
- parity test             byte-identical at frame 3,600 across before/after
- combat120 p99 delta     ≤±2%
- 10-min playtest         no visible feel regression
```

## Standard non-goals

- Do NOT change behavior. Pure refactor.
- Do NOT change the fenced interface in `src/types/SystemInterfaces.ts`.
- Do NOT add new features, optimizations, or bug fixes during the split.
  File those as separate tasks for a later cycle.
- Do NOT split files outside the brief's `Files touched` list.
- Do NOT rewrite tests just because the implementation moved. Re-run them
  against the new orchestrator. If they fail, the split is wrong.

## Standard branch / PR

- Branch: `task/<slug>`
- Commit: `refactor(<scope>): split <FileName> into <orchestrator> + <N> helpers (<slug>)`
- PR title same.
- PR description includes: parity test result, combat120 perf delta,
  10-min playtest signoff line.

## Standard reviewer policy

- Touch under `src/systems/combat/**` → combat-reviewer pre-merge
- Touch under `src/systems/terrain/**` or `src/systems/navigation/**` →
  terrain-nav-reviewer pre-merge
- Anywhere else → no required reviewer (optional)

## Standard playtest

Required. The split is behavior-preserving on paper, but feel regressions
hide. 10-minute play in the matching mode catches them.

## Hard stops

- Split forces a fenced-interface change → stop, report, do not push.
- Parity test fails → stop, debug, do not push. The split is wrong.
- Perf regression >5% p99 → stop, debug. Don't ship a perf hit on a refactor.
- Diff exceeds 1,500 lines → scope is wrong. The split should add helpers
  and remove same-LOC from the orchestrator. Net change is small unless
  there's significant boilerplate duplication being removed (rare).

## What this template does NOT cover

- **Adding tests where the file had none** — `Airframe.ts` and similar.
  Those are separate "test-coverage" tasks, not splits. They have their
  own briefs in the cycle.
- **Async / threading rework** — out of scope. Splits don't change the
  execution model.
- **ECS migration** — Phase F (cycle 8). Splits stay in OOP shape; ECS port is later.
