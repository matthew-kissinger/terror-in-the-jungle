# Task E5: Deterministic simulation + replay

**Phase:** E (parallel R&D track, decision memo + audit)
**Depends on:** Foundation
**Blocks:** Batch F planning
**Playtest required:** no
**Estimated risk:** low (audit + scoped prototype)
**Files touched:** deliverable is a decision memo + audit report

## Goal

Decide whether to invest in deterministic simulation + replay. Produce an audit of non-determinism sources, a cost estimate, and a prototype that records + replays a short session.

## Vision anchor

Deterministic sim unlocks:
- Reliable perf regression testing (same inputs → same numbers).
- Agent training (if E4 lands).
- Bug repro ("here's the replay of the stall").
- Future networking rollback.

## Required reading first

- `docs/REARCHITECTURE.md` E5 section.
- `src/utils/FixedStepRunner.ts` — already-deterministic core.
- Sources of non-determinism to audit:
  - `Math.random()` in logic paths.
  - `Date.now()` / `performance.now()` in logic (not just telemetry).
  - `Set` / `Map` iteration order.
  - Async resolution order.
  - Float precision (esp. in physics, where order-of-operations matters).

## Steps

1. **Audit.** Grep the codebase for `Math.random`, `Date.now`, `performance.now`, `setTimeout`, `setInterval` in `src/systems/`. Classify each: logic (problem) or telemetry (fine). Produce a list.
2. **Estimate.** For each non-determinism source in logic, estimate the cost to replace (e.g. "seed a central RNG and inject everywhere" vs "pass a seed into each system at construction").
3. **Prototype.** On a throwaway branch, record inputs + seed for a 30-second sim run. Replay from the same seed. Compare final state (dump position/health of all combatants, for instance).
4. **Evaluate.** Are the replays identical? If not, where did they diverge? Can you fix the top 2-3 divergences cheaply?
5. **Decision memo.**

## Deliverable: decision memo + audit

Files: `docs/rearch/E5-determinism-evaluation.md` and `docs/rearch/E5-nondeterminism-audit.md`.

**Audit sections:**
- Per-file list of `Math.random` / `Date.now` / `performance.now` call sites used in logic.
- Classification and estimated fix cost for each.
- Iteration-order risks (Set/Map usage in hot paths).

**Memo sections:**
- Question.
- Audit summary (headline counts).
- Prototype results (did replay work? what diverged?).
- Cost estimate (full fix).
- Value estimate (which of the listed benefits you'd get, weighted).
- Recommendation (invest / scope it smaller / defer).

## Verification

- Memo and audit both exist.
- Prototype shows either a working replay or a clear divergence report.
- No production code changes merged.

## Non-goals

- Do not implement full determinism.
- Do not pursue cross-machine determinism (FPU consistency).
- Do not change fenced interfaces.
- Do not touch `FixedStepRunner` (already deterministic).

## Exit criteria

- Memo + audit delivered.
- Orchestrator flags delivered, moves on.
