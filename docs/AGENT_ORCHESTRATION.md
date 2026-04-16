# Agent Orchestration DAG

Last updated: 2026-04-16

This file is the master plan for an orchestrator agent draining the drift-correction backlog in a single focused pass. Read this first. Then read the task files under `docs/tasks/` as you dispatch them.

## Mission

Correct accumulated drift without re-architecting the whole system. The deliverables for this pass are:

1. **Foundation (already landed):** `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`, `src/types/SystemInterfaces.ts` fence headers.
2. **Batch A (test triage, 5 tasks):** prune implementation-mirror tests across 5 directories. Drop test count by 30-50% without losing behavior coverage.
3. **Batch B (bug fixes, 3 tasks):** NPC combat response, active driver teleport, NPC terrain stall.
4. **Batch C (infrastructure, 4 tasks):** build-mode perf capture, recast-wasm dedup, deploy workflow doc, dev-mode stability.
5. **Batch D (combat carve-out, 2 tasks):** first-class combat subsystem + Open Frontier pacing. **Runs after A+B+C fully merged.**

Batch E runs **in parallel with A/B/C** as an R&D track. E agents produce decision memos with prototype data, not merged behavior changes. See `docs/REARCHITECTURE.md` for the five open paradigm questions and `docs/tasks/E*.md` for the individual spike briefs.

Batch F (actual rearchitecting) is **out of scope for this run**. It gets planned from the E memos in a separate, deliberate pass.

## DAG

```
                  Foundation (F1+F2, DONE in master)
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    │                             │                             │
 Batch A (parallel)          Batch B (parallel)            Batch C (parallel)         Batch E (parallel R&D,
  A1 vehicle tests            B1 NPC combat response        C1 build-mode perf          decision memos only)
  A2 combat tests             B2 active driver fix          C2 recast wasm dedup       E1 ECS spike
  A3 navigation tests         B3 NPC terrain stall          C3 deploy workflow doc     E2 rendering-at-scale
  A4 terrain tests                                          C4 dev-mode stability     E3 combat AI paradigm
  A5 ui tests                                                                          E4 agent-as-player API
                                                                                       E5 deterministic sim
                                                                                       E6 vehicle physics rebuild
                                  │
                     (all A + B + C merged; E memos delivered)
                                  │
                           Batch D (serial)
                           D1 combat carve-out
                           D2 OF combat pacing
                                  │
                              (stop for tonight)
                                  │
                        Batch F (separate later run,
                        planned from E memos)
```

## Dependency rules

- **A2 depends on B1.** A2 rewrites combat tests; B1 changes combat behavior. B1 must merge first, then A2 runs against the new contract.
- **All other A/B/C tasks are mutually independent** and can fan out fully in parallel.
- **D1 depends on A2, B1, B3.** Carving out the combat subsystem assumes the bugs and test drift inside it are already cleaned.
- **D2 depends on D1.**
- **Foundation is already done** (this worktree's commit lands with these docs). Orchestrator starts Batch A+B+C.

## Dispatch protocol

The orchestrator, for each task in parallel-eligible batches:

1. Read `docs/tasks/<task-id>.md`. It contains scope, required reading, steps, verification, non-goals.
2. Create a fresh worktree (or delegate via the preferred spawn mechanism).
3. Spawn an implementation agent with the task file contents as the brief. The agent operates in isolation.
4. When the agent reports done + PR branch pushed, orchestrator:
   - Runs CI check.
   - If CI green, merges to master via fast-forward or squash merge (project convention: fast-forward when possible).
   - If CI red, tags the task "blocked" with the failing job name, moves on.
5. After each merge, orchestrator advances any task whose dependencies are now satisfied.

## Merge protocol

- **Preferred:** fast-forward push to master. Only works if the branch is based on current master and has no divergent history.
- **Fallback:** rebase branch onto master, re-run CI, then fast-forward.
- **Never:** force-push to master. Never squash a merge without explicit instruction.
- After every merge: re-run `npm run perf:capture:combat120` if the PR touched any system in `src/systems/`. Budget is 7 min; this is the cost of parallelism.

## Playtest queue

Some tasks require human playtest before merge (flagged in the task file under `**Playtest required:** yes`). The orchestrator:

- Does **not** merge playtest-required PRs. Instead, collects them in a pending list.
- Hands the pending list to the human at the end of the run or on request.
- Merges playtest-optional PRs immediately on CI green.

Tasks that are playtest-optional: docs changes, infrastructure (C-series), test triage (A-series), isolated bug fixes that don't change user-visible behavior.

Tasks that are playtest-required: anything in the flight path, combat AI behavior, vehicle/helicopter feel, UI responsiveness. (B1 is playtest-required. D1 and D2 are playtest-required.)

## Failure handling

If an agent reports failure, the orchestrator:

1. Reads the agent's failure report (what was attempted, what broke).
2. Does **not** automatically retry. Retries rarely succeed where the first attempt failed.
3. Marks the task blocked with a reason.
4. Moves on to independent tasks.
5. At the end of the run, produces a summary: merged, blocked, playtest-pending.

If a **fence change** is proposed by an agent (any change to `src/types/SystemInterfaces.ts`), orchestrator must stop that task, surface the proposed change to the human, and wait.

## Ground rules for dispatched agents

Every task brief starts with these ground rules as context:

1. **Read `docs/TESTING.md` before writing or modifying tests.**
2. **Read `docs/INTERFACE_FENCE.md` before touching `src/types/SystemInterfaces.ts`.** If you need a fence change, stop and surface it — do not push.
3. **Small diffs over big ones.** If your task grows past ~400 lines of diff, stop and reassess — you're probably drifting scope.
4. **Don't rewrite code that isn't in scope.** The task file lists files to touch. Anything outside that list, including comments and formatting, is off-limits unless required by the change.
5. **Verify locally before pushing:** `npm run lint`, `npm run test:run`, `npm run build`.
6. **Write behavior tests, not implementation tests.** See `docs/TESTING.md` for the rule.
7. **Report concisely:** what you changed, why, what you ran for verification, any surprises.

## Progress tracking

Orchestrator maintains a live status table (in memory or scratchpad). Status values: `pending`, `in-progress`, `awaiting-merge`, `merged`, `playtest-pending`, `blocked`.

At end of run, orchestrator prints:

```
Batch A: 5/5 merged
Batch B: 2/3 merged (B1 playtest-pending)
Batch C: 4/4 merged
Batch D: not yet started (awaits B1 merge)

Playtest queue:
- B1: NPC combat response — link to CI artifact
- D1, D2: not ready yet

Blocked:
- (none)
```

## End-of-run checklist

Before finishing:

- [ ] All playtest-optional tasks merged to master.
- [ ] Playtest-pending list handed to human.
- [ ] Blocked list handed to human with agent failure reports.
- [ ] `npm run perf:capture:combat120` run against final master, numbers recorded.
- [ ] Summary printed.

## References

- Task files: `docs/tasks/*.md`
- Test contract: `docs/TESTING.md`
- Fence rules: `docs/INTERFACE_FENCE.md`
- Playtest: `docs/PLAYTEST_CHECKLIST.md`
- Current backlog (deferred items): `docs/BACKLOG.md`
