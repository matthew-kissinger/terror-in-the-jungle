# Engineering Culture

Last verified: 2026-05-10

This file is the single-read culture + working-rules synthesis for any agent
or human doing work on this repo, especially **unattended multi-stream R&D
runs** (overnight Codex / Claude / Cursor passes that touch stabilization,
code-golf, optimization, perf, and features in one run).

It exists because the rules are otherwise scattered across `AGENTS.md`,
`CLAUDE.md`, `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`,
`docs/AGENT_ORCHESTRATION.md`, `docs/CARRY_OVERS.md`, and
`.claude/agents/executor.md`. An agent landing on this repo for the first
time should read THIS file plus the docs it points at, in that order.

## Five work modes

A single overnight pass can touch all five. Each mode has a distinct
"shipped" definition.

| Mode | What it ships | Branch prefix | Where it lives |
|------|---------------|---------------|----------------|
| **Stabilization** | Closes a carry-over from `docs/CARRY_OVERS.md` Active table. Every change references the carry-over ID in the PR description. | `stab/<carry-over-id>` | PR opened, draft if owner review needed; merge gated. |
| **Code-golf** | Net LOC reduction or split of a grandfathered file in `scripts/lint-source-budget.ts`. Behavior unchanged. | `golf/<scope>` | PR opened, lint-budget delta in description. |
| **Optimization** | Algorithmic improvement (allocation reduction, worker offload, pool sizing, BVH rebuild thresholds). Verified with a measurement, not vibes. | `opt/<scope>` | PR opened with before/after numbers. |
| **Perf** | Measured frame-time / p99 / heap improvement on a tracked scenario (combat120, ashau:short, openfrontier:short, frontier30m). Baseline updated only with owner approval. | `perf/<scope>` | PR opened with `npm run perf:compare` output attached. |
| **Features** | Closes a directive from `docs/DIRECTIVES.md` or a well-bounded slice of one. References directive ID (VODA-1, VEKHIKL-1, SVYAZ-3, etc.). | `feat/<directive-or-slug>` | PR opened. May ship a "first slice" that unblocks the rest of the directive. |

**Spike** is a sixth mode, distinct: research / prototype that may NEVER
merge. Branches `spike/<topic>`. Output is a memo under `docs/rearch/` plus
optional perf evidence under `artifacts/spike/<topic>/`. Never opens a PR
without explicit owner direction.

## Diff and file budgets

- **Per task:** ≤500 LOC source + ≤300 LOC tests. Hard stop above unless
  the task is explicitly a planned migration / split.
- **Per file:** ≤700 LOC and ≤50 public methods. Grandfathered exceptions
  in `eslint.config.js` and `scripts/lint-source-budget.ts`. New files
  must respect the budget on day one; do not add to the grandfather list.
- **New `src/systems/**/*.ts` requires a sibling `*.test.ts`.** Behavior
  tests, not implementation-mirror.
- **Net-deletion is a feature.** Code-golf and stabilization PRs that
  delete more than they add are encouraged. Aim for net-negative LOC when
  the work allows.

## Test discipline (cheat sheet — full rules in `docs/TESTING.md`)

- **Behavior tests, not implementation-mirror.** Assert what the system
  does from a caller's perspective. Don't enshrine constants, phase
  names, or internal method spelling.
- **Four layers:** L1 pure / L2 single-system / L3 small-scenario / L4
  full-engine browser. Pick the lowest layer that proves the behavior.
  L4 is expensive — reserve for liftoff/landing, mode switches, perf,
  deployment.
- **When in doubt, delete.** Redundant coverage is drag. Aim for −30% to
  −50% test count when triaging a directory.
- **Don't stub more than you have to.** Over-mocking creates ceremony
  that breaks on any refactor. If a system has 8 deps and you mock all,
  it's at the wrong layer — promote to L3.
- **Forbidden:** spying on private methods, asserting on tuning constants
  or enum strings, snapshot tests of evolving structures, time/random
  without seed, Map/Set insert-order assumptions.

## Comment discipline

- **Default to no comments.** Identifiers should carry meaning.
- **Comment only when WHY is non-obvious:** a hidden constraint, a
  workaround for a specific bug, a counterintuitive invariant.
- **Never comment WHAT the code does.** Code with good names already
  documents WHAT.
- **Never reference the current task, PR, fix, or callers** in comments.
  ("Used by X", "added for the Y flow", "handles case from issue #N").
  Those belong in the PR description and rot in the codebase.
- **Never add `// removed` placeholders for deleted code.** Just delete.
- **Never rename `unused_var` to `_unused_var`.** If it's actually
  unused, delete it.

## Don't add what wasn't asked

- **No drive-by refactors.** A bug fix doesn't need a surrounding cleanup.
  A one-shot operation doesn't need a helper class. Three similar lines
  is better than a premature abstraction.
- **No defensive checks for impossible cases.** Trust internal code and
  framework guarantees. Validate only at system boundaries (user input,
  external APIs, network).
- **No backwards-compat shims when you can just change the code.** Feature
  flags and shims are for genuine migration, not "in case someone needs
  the old behavior."
- **No half-finished implementations.** Stub or finish; don't leave
  TODO-shaped craters.

## Style

- **No emojis.** Anywhere. Code, docs, commits, PR descriptions.
- **Hyphens, not em dashes.** US English.
- **Latest versions of everything.** Three.js, TypeScript, Vite, Node —
  if the live deploy is on `r185` and the local repo claims `r184`, that
  drift is worth a sweep. Same for TS / Vite minors.
- **Measure, don't assume.** If you claim a perf win, attach
  `npm run perf:compare` output. If you claim a behavior change, attach
  test names. Never ship "should be faster" without numbers.
- **Real fix, not workaround.** No `--no-verify`, no `git reset --hard`
  to make problems disappear, no `--force` on `git push` to a public
  branch. Diagnose root cause; if you can't, file the carry-over and
  move on.

## Senior-engineer judgment

These are the moves that distinguish a "code monkey just following the
brief" from someone who actually owns the outcome.

- **The brief might be wrong.** If the diagnosis doesn't match the code
  you're reading, STOP and surface it. Don't rationalize an outdated
  task. (See cycle 2.4 cdlod-edge-morph for a worked example: the brief
  conflated `tileResolution` with `tileGridResolution`; reviewer caught
  it pre-merge; orchestrator surfaced before re-dispatching blindly.)
- **The reviewer might be wrong too.** Verify the reviewer's specific
  citations against the code before treating their verdict as
  load-bearing. Cite specific lines back if you disagree.
- **Investigate before retrying.** A failing test, a stuck merge, a
  red CI — diagnose first. Re-running the same command and hoping is
  not engineering.
- **Don't over-tighten perf assertions.** A 2.6× ceiling-to-mean ratio
  is borderline; 5× is comfortable. CI runners aren't your dev box. If
  a perf test flakes once, raise the ceiling, don't revert the test.
- **Trust executor reports, but verify before merge.** Reviewer + CI
  catch the real issues. Don't read every diff yourself.
- **Surface fence-change proposals.** `src/types/SystemInterfaces.ts` is
  fenced. Any modification requires `[interface-change]` in the PR
  title and human approval. Try the non-fence solution first.

## Cycle work vs. parallel R&D

The repo's primary delivery vehicle is the **cycle** — a
single-orchestrator, single-DAG, sequential pass through one or more
tasks that closes one user-observable gap. Cycles are tracked in
`docs/AGENT_ORCHESTRATION.md` ("Current cycle"), `docs/CAMPAIGN_*.md`
("queue"), and `docs/tasks/<slug>.md` (briefs).

**Parallel R&D** is the secondary delivery vehicle — overnight
unattended runs that touch the five work modes above without going
through the cycle process. It is governed by this section.

### Hard rules for parallel R&D

1. **Never touch active-cycle artifacts.** Don't modify
   `docs/AGENT_ORCHESTRATION.md`, `docs/CAMPAIGN_*.md`,
   `docs/CARRY_OVERS.md`, `docs/TESTING.md`, `docs/INTERFACE_FENCE.md`,
   `docs/tasks/cycle-*.md`, or `docs/tasks/<slug>.md` for any slug
   listed in the active cycle's "Tasks in this cycle". To propose a
   change, file a memo under `docs/rearch/<topic>.md` and include the
   proposed change as a unified diff in the memo.
2. **Never push to master.** All work goes to a branch. PRs are opened
   for owner review; the agent does NOT merge.
3. **Never close a carry-over without owner approval.** Stabilization
   PRs may PROPOSE the close (move to Closed table in the PR diff) but
   the orchestrator owns the actual transition during cycle close.
4. **Never change baselines.** `perf-baselines.json` updates only via
   `npm run perf:update-baseline` with owner approval. Perf PRs attach
   measurements; they don't rewrite the baseline themselves.
5. **Validate before push.** `npm run lint`, `npm run test:run`,
   `npm run build` — all green per branch. For perf-track PRs add
   `npm run perf:capture:combat120` + `npm run perf:compare`.
6. **One stream, one branch, one PR.** Don't bundle stabilization +
   perf + feature in one PR. The reviewer can't gate them at different
   bars.
7. **Time-box.** ≤6 hours per Tier-1 prototype, ≤2 hours per
   stabilization close, ≤90 min per investigative memo. If you blow
   the budget, file a partial memo and move on.
8. **Carry-over economics.** A parallel R&D run can decrement carry-over
   count by closing items via stabilization PRs. It cannot increment
   without owner approval. If you discover a new carry-over candidate,
   file a memo proposing it; the orchestrator decides on intake.

### What's safe to touch in parallel

- `src/systems/**` files NOT on the active cycle's "Files touched" list.
- `src/ui/**` for cosmetic / accessibility / a11y improvements.
- `scripts/**` for tooling sweeps.
- `tests/**`, `*.test.ts` for test triage and behavior conversions.
- `docs/rearch/**` for new memos.
- `artifacts/spike/<topic>/**` for evidence captures.
- `package.json` ONLY for dev-dep bumps with measured impact.

### What's NOT safe to touch in parallel

- `src/types/SystemInterfaces.ts` (fenced).
- Active cycle's `Files touched` list (check
  `docs/tasks/cycle-*.md` "Current cycle").
- `perf-baselines.json` (owner approval required).
- `master` branch directly.
- Orchestration metadata (see hard rule #1).
- Any file in `dist/`, `dist-perf/`, or `node_modules/`.

## Reporting standard

Multi-stream overnight runs return a single end-of-run summary in this
shape. One block per stream touched.

```
=== Overnight R&D run summary ===

Stream: stabilization
  Carry-overs proposed-closed:
    - <id>: <one-line resolution> (PR <url>, <branch>)
    - <id>: <one-line resolution> (PR <url>, <branch>)
  Carry-over count delta: -<N> (proposed; orchestrator owns final)

Stream: code-golf
  Files simplified:
    - <path>: <before-LOC> → <after-LOC> (Δ-<N>) (PR <url>)
    - <path>: <before-LOC> → <after-LOC> (Δ-<N>) (PR <url>)
  Grandfather list delta: -<N> entries

Stream: optimization
  Hot paths touched:
    - <path>: <change> (PR <url>, expected impact: <one line>)

Stream: perf
  Scenarios captured:
    - combat120: p99 <before>ms → <after>ms (Δ <±%>)
    - <other>: ...
  PRs: <urls>

Stream: features
  Directives advanced:
    - <directive-id>: <slice shipped> (PR <url>, branch <name>)

Stream: spike
  Memos:
    - docs/rearch/<topic>.md (branch spike/<topic>, <one-line takeaway>)

Hard-stops triggered: <none | description>
Fence-change proposals: <none | memo paths>
Files NOT pushed (local-only): <list, if any>
Recommended for next /orchestrate cycle: <slug or "none">
```

## When in doubt

- Find the smallest valid scope. If the work explodes, stop and ask.
- File a memo. Memos are cheap, decisions are expensive.
- Surface, don't rationalize. The orchestrator and the human prefer
  early surface to late surprise.
- Read `docs/TESTING.md` for tests, `docs/INTERFACE_FENCE.md` for fence
  questions, `docs/AGENT_ORCHESTRATION.md` for cycle questions, and
  this file for everything else.
