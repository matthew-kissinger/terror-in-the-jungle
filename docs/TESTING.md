# Testing Contract

Last updated: 2026-04-16

This file is the authoritative test-layer policy. **Every agent and human touching tests must read this first.** The point is to prevent implementation-mirror tests that enshrine today's code shape and block tomorrow's refactor.

## Why this exists

The repo has grown ~3,700 tests across ~180 files. A large fraction assert *implementation details* (specific phase-state names, envelope constant values, exact command magnitudes) rather than *behavior*. When the implementation changes — even correctly — those tests fail and have to be rewritten. The net effect: tests block refactors that would make the game better.

This document tells you which kind of test to write and which to prune.

## The four layers

| Layer | What it tests | Runtime target | Environment | Can touch |
|-------|---------------|----------------|-------------|-----------|
| **L1** | Pure functions, data transforms, math | whole layer < 10 s | node / vitest | no side effects |
| **L2** | One system with mocks for deps | whole layer < 30 s | vitest + jsdom | one system, mocked boundary |
| **L3** | Small scenario: 2-3 systems wired together | whole layer < 2 min | vitest + jsdom | gameplay slice (squad vs squad, vehicle enter/exit/fire) |
| **L4** | Full engine + browser (Playwright probe, perf capture) | CI-only, ~5-10 min | Playwright + Vite preview | entire engine |

Target totals across all four layers: **under 10 minutes for CI, under 30 s for local `test:quick`.**

## Behavior tests vs implementation tests

A **behavior test** asserts what the system *does* from a caller's perspective. It survives refactors.

A **implementation test** asserts how the system does it internally. It dies in refactors.

### Good (behavior):

```ts
it('AC-47 lifts off within 10 seconds at full throttle + elevator', async () => {
  const result = await flyScenario({ aircraft: 'AC47_SPOOKY', throttle: 1, elevator: 1, durationSec: 12 });
  expect(result.liftoffTimeSec).toBeLessThan(10);
  expect(result.isStalled).toBe(false);
});
```

### Bad (implementation):

```ts
// dies the moment phase names change, envelope constants shift, or command gain is retuned
it('rotation phase emits pitchCommand >= 0.85 when pitchIntent > 0.08', () => {
  expect(command.pitchCommand).toBeGreaterThanOrEqual(0.85);
});
```

### Good (behavior):

```ts
it('shooting an enemy combatant reduces their health by the weapon damage', () => {
  combat.applyDamage(target, 25);
  expect(target.health).toBe(75);
});
```

### Bad (implementation):

```ts
// tests that the internal suppression constant is 0.3, which is a tuning value
it('applyDamage bumps suppressionLevel by exactly 0.3', () => {
  expect(target.suppressionLevel).toBe(0.3);
});
```

## Rules

1. **Test through public interfaces.** If the interface is in `src/types/SystemInterfaces.ts`, you can test against it. If it's a private method, you probably shouldn't be testing it directly.
2. **Don't assert on tuning constants.** Numbers like `0.3`, `0.6`, `18`, phase names like `'rotation'` — these will change. Assert on observable outcomes.
3. **Don't assert on internal state names.** If your test breaks because someone renamed `phase` to `flightState`, the test is testing the wrong thing.
4. **Don't stub more than you have to.** Over-mocking creates ceremony that breaks on any refactor. If a system has 8 dependencies and you need to mock all of them to write the test, the test is probably at the wrong layer — move it to L3.
5. **Use fixture aircraft / combatants.** Prefer shared test fixtures in `src/test-utils/` over inline object literals that enshrine specific config values.
6. **Names matter.** Test names should describe behavior in domain terms: *"squad retreats when under sustained fire"*, not *"AIStateEngage.transitionTo called with RETREAT when suppressionLevel > 0.7"*.
7. **When in doubt, delete.** A test you wrote and the behavior is now tested by a higher-level scenario test — delete the lower one. Redundant coverage isn't value, it's drag.

## What to delete aggressively

- Tests that enshrine a specific enum value, phase name, or state-machine label.
- Tests that assert on specific numeric constants (thresholds, gains, magnitudes).
- Tests that recreate 90% of a system to test 10% of behavior, with mocks of mocks.
- Tests that have been failing or skipped for more than a week.
- Tests whose only failure mode is "implementation changed."

## When to write a new L4 test

Rarely. L4 is expensive (Playwright + Vite preview + browser). Reserve for:

- Liftoff / takeoff / landing validation for new aircraft or vehicle types.
- Mode-switching without hang (e.g. Open Frontier → Zone Control).
- Perf budget scenarios that can't be exercised in L3.
- Deployment / page-load correctness.

## Playtest is not a test layer

Playtest is a separate checkpoint (`docs/PLAYTEST_CHECKLIST.md`). Tests confirm code correctness. Playtest confirms feel. Passing L1-L4 is necessary, not sufficient. Any PR that changes flight, driving, combat rhythm, or UI responsiveness must link to a playtest run.

## Pruning procedure (for agents doing triage)

When you are asked to triage tests in a directory:

1. Read each test file. For each `it()` block:
   - Classify: **behavior** (keep), **implementation-mirror** (rewrite to behavior or delete), **redundant** (delete), **broken/skipped** (delete).
2. For rewrites: preserve the original intent — what was the test trying to prevent? — and express it as a behavior assertion.
3. For deletes: leave a one-line comment above the removed block at first, so the reviewer can see what went. After review, strip the comments.
4. Run the affected test file. It must pass.
5. Run `npm run test:run`. The whole suite must pass.
6. Report: files touched, `it()` blocks kept / rewritten / deleted, final test count for the directory.

Target: **drop test count by 30-50% without losing behavior coverage.** If you can't, the directory didn't have much drift — report as low-yield and move on.

## Forbidden patterns

- `vi.spyOn(obj, 'privateMethod')` on private methods (prefix `_`). Test through the public interface.
- `expect(someConstantExport).toBe(0.3)`. Don't assert on tuning constants.
- Snapshot tests of DOM structures or object literals that are meant to evolve.
- Tests that depend on `Date.now()` or `Math.random()` without seeding / mocking — they'll flake.
- Tests that rely on insert-order of a `Map` or `Set` — engine-dependent.

## Amending this document

If you are proposing a new test pattern not covered here, add it to this file in the same PR. Amendments require tagging the owner (see `docs/INTERFACE_FENCE.md`).
