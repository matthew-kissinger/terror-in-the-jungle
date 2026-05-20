# Agent Orchestration — Runbook

Last verified: 2026-05-20 (campaign 2026-05-20-vehicle-boarding-and-water CLOSED — 3 parallel cycles, 15 PRs merged; production deploy gate fired; carry-over count unchanged at 6; next campaign not yet queued — see `docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md` for the post-campaign framework work)

This file is the master runbook for multi-agent cycles in this repo. It has
three parts:

1. **Operating model + dispatch / merge patterns.** Durable across cycles.
2. **Cycle lifecycle.** Conventions for task IDs, cycle IDs, and the
   end-of-cycle ritual. Durable across cycles.
3. **Current cycle.** Reset every cycle. Past cycles live in
   `docs/BACKLOG.md` "Recently Completed" and their briefs under
   `docs/tasks/archive/<cycle-id>/`.

If you are the orchestrator, read this file top to bottom. If you are an
executor, read only the task brief the orchestrator hands you plus the required
reading inside it.

## Operating model

- **The main Claude Code session plays the orchestrator role.** Subagents
  cannot reliably spawn further subagents in this harness (they do not receive
  an `Agent` tool regardless of what frontmatter claims). The 2026-04-17
  drift-correction run worked because the main session WAS the orchestrator.
  Do not try to spawn an "orchestrator" subagent — the run will deadlock at
  dispatch.
- **Executors are subagents.** Each is spawned with
  `subagent_type="executor"`, `isolation="worktree"`, and the full task-brief
  contents as the prompt.
- **Reviewers are subagents.** `combat-reviewer` on PRs touching
  `src/systems/combat/**`, `terrain-nav-reviewer` on PRs touching terrain or
  nav paths.
- **Perf analyst is a subagent.** Run after each round to diff perf vs
  baseline.
- **Concurrency cap:** default 5 parallel executors. The current cycle can
  override.

## Cycle lifecycle

The project runs multi-task cycles through this runbook. The cycle-specific
section (below) is reset at the start of every cycle; the rest of this file
is durable across cycles.

**Task IDs are descriptive slugs, not phase letters.** Use
`plane-test-harness`, not `A1`. Phase letters were retired on 2026-04-18
after two consecutive cycles claimed fresh A/B/C prefixes and queued a
`D1` for the next one — linear, and the alphabet doesn't scale. A cycle
can have as many tasks as its DAG requires without running out of letters.

**Cycle IDs are dated slugs.** Format: `cycle-YYYY-MM-DD-<slug>`, e.g.
`cycle-2026-04-18-rebuild-foundation`. The cycle ID is the archive
subfolder name and the section header in `docs/BACKLOG.md` when the cycle
closes.

**Branches follow the slug.** `task/<slug>`, no letter prefix. Commit
first-line format: `<type>(<scope>): <summary> (<slug>)`.

**Dependencies** are declared via `addBlockedBy` on task slugs inside the
current cycle's DAG (see the "Dependencies" subsection of "Current cycle").

### Cycle-name stoplist (Phase 0 rule, enforced by `scripts/cycle-validate.ts`)

New cycle slugs **cannot** contain any of these substrings: `polish`,
`cleanup`, `drift-correction`, `stabilization-reset`, `debug-cleanup`,
`housekeeping`, `tidy`, `chore-only`. Each cycle must close one
user-observable gap or feature; doctor-doc work happens inside a feature
cycle, not as its own. Run `npx tsx scripts/cycle-validate.ts <slug>` before
seeding a new cycle to verify.

### Carry-over discipline

`docs/CARRY_OVERS.md` is the single source of truth for unresolved items.
At cycle close, the orchestrator measures active count vs. cycle-start. If
the count grew, the cycle is **INCOMPLETE**; the cycle ID is reused with a
`-2` suffix until the count holds or shrinks. Carry-overs open ≥5 cycles are
red-flagged and must be named in the next cycle's plan.

**No zero-cycle carry-overs (2026-05-20, framework recovery Pass 2 R2.2).**
Carry-overs track only items spanning ≥2 cycles. A gap opened and closed
inside a single cycle goes in the PR description as a user-observable gap
line, NOT as a CARRY_OVERS entry. The carry-over registry is a
shrinking-progress audit trail for multi-cycle work, not a bookkeeping
ledger for in-cycle gaps that the PR description already names. Enforced
by `scripts/cycle-validate.ts <slug> --close`, which diffs the CARRY_OVERS
"Closed" section against a cycle-start snapshot and FAILs on any newly
closed ID that was not in the Active list at cycle start. Existing
zero-cycle entries already in `Closed` are historical record and are NOT
retroactively flagged; the check applies only to new entries.

### Campaign auto-advance (Phase 0 + realignment plan, 2026-05-09)

A **campaign** is an ordered sequence of cycles queued in
[docs/archive/CAMPAIGN_2026-05-09.md](archive/CAMPAIGN_2026-05-09.md). When the active
campaign declares `auto-advance: yes`, the orchestrator chains cycles
without human input:

1. Run the current cycle's dispatch loop normally.
2. At end-of-cycle, run the ritual (move briefs, append BACKLOG, refresh
   `docs/CARRY_OVERS.md` via `npm run check:cycle -- <slug> --close`).
3. Read the campaign manifest. If a `next-cycle` is queued and not
   gated by a hard-stop, update this file's "Current cycle" section to
   point at the next cycle's brief and **continue without prompting**.
4. Hard-stops still surface and halt the campaign:
   - Fence-change proposal in any executor report
   - >2 CI red or blocked tasks in a single round
   - Perf regression >5% p99 on `combat120` after any round
   - Carry-over count grew during a cycle (cycle becomes INCOMPLETE; campaign halts)
   - Any executor reports `isolation=worktree` failure
5. Hard-stops surface as: print the failure summary, set "Current cycle"
   in this file to the **failed** cycle (with status `INCOMPLETE` /
   `BLOCKED`), and halt. The human resumes the campaign manually.

Without `auto-advance: yes`, the orchestrator stops after each cycle close
and waits for the next `/orchestrate` invocation. That's the legacy
single-cycle pattern.

### Autonomous-loop posture (2026-05-16, `/goal`-aligned runs)

When the campaign manifest declares **both** `auto-advance: yes` **and**
`posture: autonomous-loop`, the orchestrator runs as an unattended
all-night loop. Per-cycle playtest-required gates become deferred
(not blocking) so the owner can walk through them after the campaign
completes.

Overrides under `posture: autonomous-loop`:

1. **Owner-playtest tasks become Playwright smoke + screenshot capture.**
   The executor runs the feature's golden-path smoke, commits
   screenshots to `artifacts/cycle-<slug>/playtest-evidence/`, and
   writes a `docs/playtests/<slug>.md` memo flagged "automated smoke;
   owner walk-through pending."
2. **"Owner playtest rejects twice → halt" hard-stops are removed.**
   Replaced by "Playwright smoke errors twice → halt" (true
   automation signal only).
3. **"Real-device validation infeasible → halt" becomes a documented
   limitation, NOT a hard stop.** Merge proceeds on CI green +
   reviewer APPROVE. The cycle's close memo and
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md) get the deferral
   note.
4. **The orchestrator appends to
   [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)** at every cycle
   close that had a playtest task, listing what the owner should
   walk through post-campaign.
5. **Cycle-close commits append `(playtest-deferred)`** to the subject
   line when the cycle had playtest gates, so `git log` makes
   deferred items easy to grep.

The true hard-stops (fence change, >2 CI red, perf regression > 5%
p99, carry-over growth, worktree failure, twice-rejected reviewer)
still halt the autonomous loop and surface to the human.

To exit `posture: autonomous-loop` mid-campaign: edit the campaign
manifest and remove the `posture: autonomous-loop` line (or flip
`auto-advance: yes` → `PAUSED`). The orchestrator finishes the
in-flight cycle and stops.

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: (none — campaign-2026-05-20 closed; framework recovery plan pending owner review)

No active cycle. Last campaign (campaign-2026-05-20-vehicle-boarding-and-water)
closed on 2026-05-20 with the production deploy gate fired against master
tip `e99be58e`. Manifest archived at
[docs/archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md](archive/CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md).

The next work batch is the **framework recovery plan** at
[docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](FRAMEWORK_RECOVERY_PLAN_2026-05-20.md)
(landed 2026-05-20 as commit `45d77250`). Owner reads it post-compact
with fresh eyes, answers the 5 decision questions, and gates the
3-pass execution:
- Pass 1 (CI trim) + Pass 3 (README + tags align) ship as a single
  low-risk doctor PR.
- Pass 2 (framework trim — touches governance) spawns its own focused
  cycle once the doctor PR lands.

**Hold list (owner-gated, do NOT auto-promote):**
- `cycle-vekhikl-seat-swaps` — pilot↔gunner swap on M48 + PBR.
  Trigger: owner signs off on `cycle-vekhikl-player-boarding-wire`
  playtest evidence (deferred row in
  [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)).
- `cycle-vekhikl-5-fleet-expansion` — M113 APC + M35 truck + T-54
  tank (+ optional ZU-23-2 AA + LCM-8). Trigger: owner signs off
  on both `cycle-vehicle-wayfinding-and-prompts` and
  `cycle-vekhikl-player-boarding-wire`.
- `cycle-sky-screen-space-quad` — Hillaire-style screen-space sky
  rework. Carried over from the 2026-05-19 campaign hold list.
- `cycle-stabilizat-1-baselines-refresh` — STABILIZAT-1 / combat120
  baseline refresh. Carried over from the post-WebGPU campaign close.

**Resume:** once owner approves the framework recovery plan, the next
`/orchestrate` invocation dispatches Pass 1 + Pass 3 as a single
doctor PR (no cycle wrapper needed; touches CI yaml + README +
package.json tags). Pass 2 (framework governance trim) gets its own
cycle brief at that point.

Hard-stops flip `Auto-advance: yes` → `PAUSED` in the campaign manifest,
mark the failing cycle's row `BLOCKED`, and halt.

### Last closed cycle

`campaign-2026-05-20-vehicle-boarding-and-water` closed on 2026-05-20.
Three parallel cycles, **15 PRs merged**, zero fence changes, zero
hard-stops at cycle close. One mid-campaign hard-stop in cycle #1 R1
(3 of 5 executors terminated mid-thought at ≥90k tokens) handled via
re-dispatch with tighter inline prompts; the largest task was split
into a factory module + a handler/composer wire to fit the executor
context budget. The intermittent sandbox blocked git commit/push from
3 worktrees; orchestrator-side push from the main session unblocked
each.

- **Cycle #1 — `cycle-vekhikl-player-boarding-wire`** (opens+closes
  `VEKHIKL-UX-2`). 8 PRs: [#288](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/288)
  ground-adapter wire, [#289](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/289)
  tank-adapter wire, [#293](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/293)
  input-router (retry), [#296](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/296)
  watercraft + emplacement wire, [#297](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/297)
  factory-module-only (split A retry), [#298](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/298)
  handler + composer wire (split B retry), [#299](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/299)
  SystemUpdater wire, [#300](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/300)
  L3 integration test + playtest evidence. Closes the critical
  user-reported gap: the 2026-05-19 wayfinding cycle shipped the
  "Press F to board" HUD prompt but the F-key handler was never wired,
  so all five drivable vehicles were unenterable. Mortar fire stays
  on F via the fallback router.
- **Cycle #2 — `cycle-of-river-surface-enable`** (opens+closes
  `VODA-OF-1`). 4 PRs: [#286](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/286)
  `of-water-config-flip` (mandatory `terrain-nav-reviewer` APPROVE),
  [#291](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/291)
  `of-water-spawn-snap-resolver`, [#292](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/292)
  `of-water-capture-pair`, [#294](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/294)
  `of-water-playtest-evidence`. PR #292 post-captures stale at write
  time (captured before #286/#291 merged); cycle-close gate noted
  regeneration as deferred-playtest follow-up.
- **Cycle #3 — `cycle-motor-pool-reflow-and-tank-dedup`**
  (opens+closes `VEKHIKL-LAYOUT-1`). 3 PRs: [#287](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/287)
  `of-tank-relocate-to-motor-pool`, [#290](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/290)
  `motor-pool-heavy-reflow` (user-approved scope expansion: prefab
  split into `_of` + `_ashau` halves to preserve the A Shau motor
  pool footprint), [#295](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/295)
  `motor-pool-and-tank-dedup-playtest-evidence`.

Carry-over delta: 0 (3 zero-cycle IDs opened+closed in-campaign;
active list unchanged at 6). Production deploy gate fired against
master tip `e99be58e` via `gh workflow run deploy.yml --ref master`
(deploy run `26182116715`). No perf regression > 5% p99 on `combat120`.
Owner playtests deferred under autonomous-loop posture; deferred
rows already present in [docs/PLAYTEST_PENDING.md](PLAYTEST_PENDING.md)
for all three cycles.

Concurrent branch on the side: `task/mode-startup-terrain-spike`
remains parked at 1 commit (no PR). The cycle #2 mode-startup work
absorbed some of the synchronous-bake path concerns via the
asset-audio-defer + mobile-skip-npc-prewarm tasks; the spike's
terrain-bake-in-worker hardening criteria still live in
[docs/rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md](rearch/MODE_STARTUP_TERRAIN_BAKE_2026-05-13.md).

## Dispatch protocol

For each round, in a single orchestrator turn:

1. Select the next batch per the round schedule (≤ concurrency cap).
2. Send one message with N parallel `Agent` calls:
   ```
   Agent(
     subagent_type="executor",
     isolation="worktree",
     description="<slug>",
     prompt="<full task-brief contents + slug + ground rules>"
   )
   ```
3. Mark each task `in_progress` with `TaskUpdate`.
4. When an executor returns:
   - Read the structured report.
   - If `fence_change: yes` → stop; surface to human.
   - If `pr_url: blocked-by-sandbox` → the executor hit the sandbox
     `ask`-list on `git push` (`.claude/settings.local.json` keeps
     `Bash(git push:*)` under `ask` for safety, and agent sessions
     cannot answer the prompt). The orchestrator pushes from the main
     session and opens the PR on the executor's behalf:
     1. `git -C .claude/worktrees/<agent-dir> push -u origin task/<slug>`
        (or `git push origin task/<slug>:task/<slug>` from the main
        worktree if the branch is already visible).
     2. `gh pr create --title "<commit subject from report>" --body "<executor-supplied summary + verification block>"`.
     3. Treat the resulting PR URL as the executor's `pr_url` and
        continue at step 4's CI-poll path below.
   - If PR URL present but CI state unknown → poll
     `gh pr view <url> --json statusCheckRollup,mergeable` or stream via
     `Monitor` on `gh pr checks <url> --watch`.
5. On CI green:
   - **Reviewer runs BEFORE merge for combat / terrain-nav PRs (Phase 0
     change, 2026-05-09).** Spawn `combat-reviewer` if the diff touches
     `src/systems/combat/**`; spawn `terrain-nav-reviewer` if the diff
     touches `src/systems/terrain/**` or `src/systems/navigation/**`. CI
     green is necessary, not sufficient; the reviewer report must read
     APPROVE or APPROVE-WITH-NOTES before the merge step.
   - If reviewer returns CHANGES-REQUESTED: `TaskUpdate` to `in_progress`,
     re-dispatch the executor with the reviewer notes, do not merge.
   - On reviewer APPROVE / APPROVE-WITH-NOTES: merge via
     `gh pr merge <url> --rebase` (fast-forward preferred; fall back to
     `--merge` only if branch protection blocks rebase).
   - `TaskUpdate` to `completed` with the PR URL.
   - Advance any dependent tasks that just unblocked.
6. On CI red: `TaskUpdate` to `blocked`; do not retry.

## Merge protocol

- **Preferred:** rebase-merge via `gh pr merge --rebase`.
- **Fallback:** `--merge` if branch protection requires it.
- **Never:** force-push to master. Never squash without explicit instruction.
- **Branch cleanup:** `gh pr merge --rebase` auto-deletes the branch if
  configured; otherwise leave the branch, it's cheap.

## Reviewer invocation rules

- Combat PRs: touch any file under `src/systems/combat/**` or any test under
  `src/integration/**combat*` → `combat-reviewer`.
- Terrain / nav PRs: touch any file under `src/systems/terrain/**` or
  `src/systems/navigation/**` → `terrain-nav-reviewer`.
- The reviewer reads the diff, reports findings to the orchestrator. As of
  Phase 0 (2026-05-09), the reviewer **runs before merge and gates merge**
  for combat / terrain-nav PRs. Outcomes:
  - `APPROVE` → orchestrator merges.
  - `APPROVE-WITH-NOTES` → orchestrator merges; notes captured in cycle
    retro for follow-up.
  - `CHANGES-REQUESTED` → orchestrator re-dispatches the executor with the
    notes, does not merge.

## Ground rules for dispatched agents

Every task brief ends up in an executor prompt along with these:

1. Read `docs/TESTING.md` before writing tests. Behavior tests only.
2. Read `docs/INTERFACE_FENCE.md` before touching
   `src/types/SystemInterfaces.ts`. Any proposed fence change → stop and
   surface.
3. Small diffs. If you pass ~500 lines net and you are not deleting retired
   code (B1 is the one task that can go larger), stop and reassess.
4. Do not modify files outside the task's `Files touched` scope.
5. Verify locally before pushing: `npm run lint`, `npm run test:run`,
   `npm run build`. New rules as of Phase 0 (2026-05-09):
   - Files ≤700 LOC and ≤50 public methods (grandfathered exceptions
     listed in `eslint.config.js`).
   - New `src/systems/**/*.ts` requires a sibling `*.test.ts`.
   - PR description names a closed carry-over by ID (from
     `docs/CARRY_OVERS.md`) OR the user-observable gap shipped.
   - Touch to `src/types/SystemInterfaces.ts` requires `[interface-change]`
     in PR title and commit message; pre-flight via
     `npx tsx scripts/check-fence.ts`.
6. Branch: `task/<slug>`. Commit first line:
   `<type>(<scope>): <summary> (<slug>)`.
7. Never push to master directly.
8. Report back in the structured format from `.claude/agents/executor.md`.

## End-of-run summary format

Print this verbatim at cycle end, substituting the current cycle's values:

```
Cycle: <cycle-id>
Dates: <start> → <end>

Round 1: X/N merged | blocked | failed
Round 2: X/M merged
...

PR URLs:
  <slug>: <url>
  <slug>: <url>
  ...

Cycle-specific acceptance results (if any — e.g. integration-test before/after):
  <test name>: <before> → <after>

Perf deltas:
  combat120:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)
  <other-scenario>:
    p95: <ms> (Δ ±<%>)
    p99: <ms> (Δ ±<%>)

Playtest recommended: <slug>, <slug>, ...

Blocked / failed tasks:
  <slug>: <one-line cause>

Next cycle recommendation:
  <one-line>
```

## References

- Executor role spec: `.claude/agents/executor.md`
- Orchestrator playbook: `.claude/agents/orchestrator.md`
- Interface fence rules: `docs/INTERFACE_FENCE.md`
- Test contract: `docs/TESTING.md`
- Playtest checklist: `docs/PLAYTEST_CHECKLIST.md`
- Current backlog: `docs/BACKLOG.md`
- Past-cycle briefs: `docs/tasks/archive/<cycle-id>/`
- E-track spike memos (still referenced by Phase F candidates in the
  backlog): `origin/spike/E2-rendering-at-scale`,
  `spike/E3-combat-ai-paradigm`, `spike/E4-agent-player-api`,
  `spike/E5-deterministic-sim`, `spike/E6-vehicle-physics-rebuild`
