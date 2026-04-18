# Agent Orchestration DAG

Last updated: 2026-04-18

This file is the master plan for the current orchestrator run. Read this first. Then read the task files under `docs/tasks/` as you dispatch them.

## Current cycle: Plane debugging enablement

**Why this cycle exists:** the fixed-wing plane has been broken for months. Every surgical fix attempt has failed because the engine has too much concurrent noise (3000 AI, streaming terrain, LOD, HUD, squad logic) to debug flight behavior in. The plane's unit tests pass while the feature is broken. The prior drift-correction run (2026-04-17) completed and left the repo in PASS-leaning WARN shape — combat is healthy, the plane is not.

This cycle does ONE thing: land the isolated test harness (F1) so that (a) a human can feel the controls without engine noise, and (b) future rebuild work has a real feedback loop. The rebuild itself is NOT in this cycle — it's the next cycle, planned from what F1 reveals.

Small cycle, one task, deliberately. No more whack-a-mole.

## Kickoff (read this first if you are the orchestrator)

You are the orchestrator. You will spawn one implementation subagent, wait for it, run CI, merge on green, then stop and surface the result to the user.

1. Confirm your effort level is `xhigh` (`/effort xhigh` if not).
2. Confirm you are on `master` at the latest origin tip (`git fetch origin && git status`).
3. Use `TaskCreate` to create one task for F1. Keep a live status.
4. Read this whole file (Mission, DAG, Dispatch protocol, Merge protocol, Failure handling, Ground rules).
5. Dispatch **Round 1** (F1 only — see round schedule).
6. Poll CI with `Monitor` or `gh pr view --json statusCheckRollup`. Do not sleep-poll.
7. Merge on CI green. F1 is dev-mode-only and risk-low, so no playtest gate.
8. Run a post-merge perf capture (`npm run perf:capture:combat120`) to confirm no regression.
9. Interrupt and surface to the user on: fence-change proposal, CI red, perf regression >5%.
10. At end, print the end-of-run summary (see `## End-of-run checklist`) AND a clear recommendation to the human about whether to dispatch Round 2 (E6 prototype refresh) in a follow-up cycle.

**Execution model:** all subagents run Opus 4.7 at effort `xhigh`. Executors use `subagent_type: "executor"` with the task file contents as their brief. Use `isolation: "worktree"` so each gets its own branch + directory.

**Concurrency cap:** 1 executor this cycle. F1 is the only task. The 5-parallel cap from prior cycles does not apply.

## Round schedule

- **Round 1 (1 executor):** F1 — plane test mode + L3 integration test harness.
- **Post-merge:** perf capture + summary.
- **Round 2 (NOT in this cycle):** E6 prototype refresh using the new harness. Surface recommendation to human at end of Round 1; wait for human OK before Round 2 gets scoped as its own cycle.

## Mission

Land `docs/tasks/F1-plane-test-mode.md`:

- A URL-param-reachable dev scene (`?mode=flight-test`) with flat terrain, one plane, debug overlay, no engine noise.
- An L3 Vitest integration test driving the real input → physics → render path with 5 scenarios.
- Tests 1 (flat-ground takeoff) and 5 (cliff) are expected to FAIL against current code — this documents the regression and gives future rebuild work a target.

Non-goals for this cycle:

- Do not fix the plane. F1 is the harness, not the fix.
- Do not rewrite `FixedWingPhysics.ts`, `FixedWingControlLaw.ts`, `FixedWingPlayerAdapter.ts`, or `FixedWingConfigs.ts`.
- Do not change `SystemUpdater` order (even though audit found it wrong — that's E6).
- Do not touch fenced interfaces in `src/types/SystemInterfaces.ts`.

## DAG

```
                    master (post drift-correction, 2026-04-17)
                                    │
                                 Round 1
                                F1 harness
                                (1 executor)
                                    │
                              CI green → merge
                                    │
                            post-merge perf capture
                                    │
                            end-of-run summary +
                         Round 2 recommendation to human
                                    │
                              (cycle stops)
                                    │
                     Round 2 (next cycle, if human OKs)
                      E6 prototype refresh in harness
```

## Dependency rules

- F1 depends on nothing. It's pure new surface.
- F1 must NOT depend on or modify existing flight code beyond a minimal entry hook in `src/bootstrap.ts`.

## Dispatch protocol

The orchestrator, for F1:

1. Read `docs/tasks/F1-plane-test-mode.md`. It contains scope, required reading, scene requirements, test requirements, exit criteria.
2. Also give the executor pointers to the reference clones at `examples/flight-references/` — see `examples/flight-references/README.md` for which files matter. These are gitignored study material, not code to copy.
3. Create a fresh worktree via `isolation: "worktree"`.
4. Spawn the executor with the task file contents + reference-clones pointer as the brief.
5. When the agent reports done + PR branch pushed, orchestrator:
   - Runs CI check.
   - If CI green, merges to master via fast-forward.
   - If CI red, reports the failing job to the user and stops.

## Merge protocol

- **Preferred:** fast-forward push to master.
- **Fallback:** rebase onto master, re-run CI, then fast-forward.
- **Never:** force-push to master. Never squash without explicit instruction.
- **Post-merge perf capture:** `npm run perf:capture:combat120`. F1 is dev-mode-only and shouldn't move combat perf — if it does by >5%, flag it, don't revert unilaterally.

## Playtest policy (this cycle)

F1 is itself a playtest harness, not a feature merge. No playtest gate. The orchestrator's end-of-run summary should include a one-line "human should now try" entry pointing at `?mode=flight-test` and the failing integration tests.

## Failure handling

If the F1 executor reports failure, the orchestrator:

1. Reads the failure report (what was attempted, what broke).
2. Does **not** automatically retry.
3. Surfaces the full failure report to the human. F1 is the only task in the cycle; there's nothing to fall back to.

If a **fence change** is proposed (any change to `src/types/SystemInterfaces.ts`), orchestrator stops immediately and surfaces to the human. F1 should not need fence changes — if the executor thinks it does, the scope is wrong.

## Ground rules for dispatched agents

Every task brief starts with these ground rules as context:

1. **Read `docs/TESTING.md` before writing or modifying tests.** F1's integration test must be a real L3 test, not an L2 mock or L4 full-engine scenario.
2. **Read `docs/INTERFACE_FENCE.md` before touching `src/types/SystemInterfaces.ts`.** F1 should not require fence changes.
3. **Read `examples/flight-references/README.md` for loop-ordering and terrain-sampling patterns before writing the harness.**
4. **Small diffs over big ones.** F1 should be <500 lines of new code + test. If it's growing past that, stop and reassess.
5. **Don't rewrite code that isn't in scope.** F1 touches new files + a tiny bootstrap hook. Do not touch `FixedWingPhysics.ts`, `FixedWingControlLaw.ts`, `FixedWingPlayerAdapter.ts`, `FixedWingConfigs.ts`, or `SystemUpdater.ts`.
6. **Verify locally before pushing:** `npm run lint`, `npm run test:run`, `npm run build`.
7. **Write behavior tests, not implementation tests.** See `docs/TESTING.md`.
8. **Report concisely:** what you changed, why, what you ran for verification, and — importantly — which of the 5 integration test scenarios pass vs fail on current code. The failing ones are the point.

## Progress tracking

Orchestrator maintains a live status table. Status values: `pending`, `in-progress`, `awaiting-ci`, `awaiting-merge`, `merged`, `blocked`.

At end of run:

```
Round 1: 1/1 merged (F1) | blocked | failed

Integration test baseline on current code:
- Test 1 (flat takeoff): PASS/FAIL
- Test 2 (level cruise): PASS/FAIL
- Test 3 (dive): PASS/FAIL
- Test 4 (pitch-up): PASS/FAIL
- Test 5 (cliff): PASS/FAIL

Perf delta (combat120):
  p95: X ms (Δ +/- Y%)
  p99: X ms (Δ +/- Y%)

Recommendation for next cycle:
- Dispatch Round 2 (E6 prototype refresh using the F1 harness)? YES/NO + one-line reason.
```

## End-of-run checklist

Before finishing:

- [ ] F1 merged with PR URL captured.
- [ ] 5 integration test scenarios each recorded as PASS or FAIL against current master code.
- [ ] `?mode=flight-test` verified reachable in a local build (executor should confirm, not orchestrator).
- [ ] `npm run perf:capture:combat120` run, delta recorded.
- [ ] `examples/flight-references/` still gitignored (sanity check — no accidental commit of reference clones).
- [ ] Round 2 recommendation written to the user: should they start the E6 prototype refresh cycle next, or playtest F1 first and come back?
- [ ] Summary printed in the shape above.

## Agents you will spawn

All defined under `.claude/agents/`:

- **`executor`** (`.claude/agents/executor.md`) — the implementation agent. One spawn this cycle for F1.
- **`perf-analyst`** (`.claude/agents/perf-analyst.md`) — post-merge perf capture analysis. Cheap; always run.
- **(Not needed this cycle):** `combat-reviewer`, `terrain-nav-reviewer` — F1 doesn't touch combat or terrain/nav code paths.

All agents are pinned to Opus 4.7 at effort `xhigh` via frontmatter.

## References

- Task brief (this cycle): `docs/tasks/F1-plane-test-mode.md`
- Downstream rebuild task (next cycle candidate): `docs/tasks/E6-vehicle-physics-rebuild.md`
- Reference clones: `examples/flight-references/` (gitignored; see its `README.md`)
- Test contract: `docs/TESTING.md`
- Fence rules: `docs/INTERFACE_FENCE.md`
- Playtest checklist (for eventual full rebuild validation, not this cycle): `docs/PLAYTEST_CHECKLIST.md`
- Current backlog: `docs/BACKLOG.md`
- Rearchitecture spike memos (prior cycle): on `spike/E*-*` branches, not in master
