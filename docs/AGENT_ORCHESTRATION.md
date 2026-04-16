# Agent Orchestration DAG

Last updated: 2026-04-16

This file is the master plan for an orchestrator agent draining the drift-correction backlog in a single focused pass. Read this first. Then read the task files under `docs/tasks/` as you dispatch them.

## Kickoff (read this first if you are the orchestrator)

You are the orchestrator. You will spawn implementation subagents in parallel, wait for them, run CI, merge, and advance the DAG. You do not write code yourself — executors do.

1. Confirm your effort level is `xhigh` (`/effort xhigh` if not).
2. Confirm you are on `master` at the latest origin tip (`git fetch origin && git status`).
3. Use `TaskCreate` to create one task per brief in `docs/tasks/`. Keep a live status table.
4. Read this whole file (Mission, DAG, Dependency rules, Dispatch protocol, Merge protocol, Failure handling, Ground rules).
5. Dispatch **Round 1** per the round schedule below. Cap: **5 concurrent executors max per round.**
6. Poll CI with `Monitor` or `gh pr view --json statusCheckRollup`. Do not sleep-poll.
7. Merge playtest-optional AND playtest-required tasks on CI green (no parking — user chose parallel-merge-revert-if-needed policy).
8. After every system-touching merge, schedule a post-round perf capture (batched, not per-task).
9. Interrupt and surface to the user on: fence-change proposal, 2+ task failures in a batch, CI total regression.
10. At end, print the end-of-run summary (see `## End-of-run checklist`).

**Execution model:** all subagents run Opus 4.7 at effort `xhigh`. Executors use `subagent_type: "executor"` with the task file contents as their brief. Use `isolation: "worktree"` so each gets its own branch + directory.

**Concurrency cap:** 5 parallel executors max. This is a workstation thermal + context-budget limit, not a Claude Code limit.

## Round schedule

Do not dispatch all 17 parallel-eligible tasks at once.

- **Round 1 (5 parallel):** B1, C1, C2, C3, C4 — B1 first because A2 is gated on it.
- **Round 2 (5 parallel, starts immediately after Round 1 dispatch returns, overlaps with Round 1 merges):** A1, A3, A4, A5, B2.
- **Round 3 (2–3 parallel):** B3, A2 (only after B1 merges), any retries from Round 1–2.
- **E-track (background, staggered):** Dispatch E1, E2, E3 in Round 1+; E4, E5, E6 after Round 2 dispatch returns. E tasks write to `spike/*` branches and produce memos at `docs/rearch/E*-*.md` — they do not merge to master and never conflict with A/B/C.
- **Round 4 (serial, after all A+B+C merged):** D1 then D2. D1 likely surfaces a fence change — stop and surface to user before proceeding.

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

## Playtest policy (current run)

**Merge-first, revert-if-needed.** For this run, playtest-required PRs are merged on CI green along with everything else. The user accepts revert risk in exchange for DAG throughput. The orchestrator still:

- Flags PRs that were playtest-required in the end-of-run summary, under a `Playtest recommended` section.
- Recommends a playtest pass against combat120 + Open Frontier after the run completes.
- Does **not** auto-revert. Revert decisions are human.

Tasks currently flagged playtest-required in their briefs: **B1, D1, D2**. Treat these as "merge + flag for follow-up playtest," not "block on playtest."

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

- [ ] All merged tasks listed with PR URLs.
- [ ] `Playtest recommended` section lists B1 + any D-batch PRs that landed, with a one-line "what to try" per PR.
- [ ] Blocked list handed to human with agent failure reports (what was attempted, what broke, suggested next step).
- [ ] E-track memos delivered under `docs/rearch/E*-*.md`, summarized in the final report.
- [ ] `npm run perf:capture:combat120` run against final master, delta vs pre-run baseline recorded.
- [ ] Summary printed in this shape:

```
Run complete.

Merged (N): <list of PR URLs, one per line>
Blocked (N): <task-id — reason>
Playtest recommended: B1, (D1, D2 if landed)
E-track memos: E1, E2, E3, E4, E5, E6 → docs/rearch/

Perf vs pre-run master:
  combat120 p95: X ms (Δ +/- Y%)
  combat120 p99: X ms (Δ +/- Y%)

Next session: review E memos, plan Batch F.
```

## Agents you will spawn

All defined under `.claude/agents/`:

- **`executor`** (`.claude/agents/executor.md`) — the implementation agent. Spawn N per round with `subagent_type: "executor"`, `isolation: "worktree"`, and the task file contents in the prompt.
- **`combat-reviewer`** (`.claude/agents/combat-reviewer.md`) — post-implementation review for tasks touching `src/systems/combat/**`. Spawn after the executor reports done, before merge.
- **`terrain-nav-reviewer`** (`.claude/agents/terrain-nav-reviewer.md`) — same pattern for `src/systems/terrain/**` + `src/systems/navigation/**`.
- **`perf-analyst`** (`.claude/agents/perf-analyst.md`) — post-round perf capture analysis.

All four agents are pinned to Opus 4.7 at effort `xhigh` via frontmatter.

## References

- Task files: `docs/tasks/*.md`
- Test contract: `docs/TESTING.md`
- Fence rules: `docs/INTERFACE_FENCE.md`
- Playtest checklist (for recommended follow-up): `docs/PLAYTEST_CHECKLIST.md`
- Current backlog (deferred items): `docs/BACKLOG.md`
- Rearchitecture questions (Batch E inputs): `docs/REARCHITECTURE.md`
