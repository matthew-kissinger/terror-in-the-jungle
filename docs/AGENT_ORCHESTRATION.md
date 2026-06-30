# Agent Orchestration — Runbook

This file is the master runbook for multi-agent cycles in this repo. It has
two parts:

1. **Operating model + dispatch / merge patterns.** Durable across cycles.
2. **Cycle lifecycle.** Conventions for task IDs, cycle IDs, and the
   end-of-cycle ritual. Durable across cycles.

Current cycle state lives in [docs/DIRECTIVES.md](DIRECTIVES.md). Past
cycles live in `docs/BACKLOG.md` "Recently Completed" and their briefs
under `docs/tasks/archive/<cycle-id>/`.

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

### Campaign auto-advance (Phase 0 + realignment plan, 2026-05-09; trimmed 2026-05-20)

A **campaign** is a coordinated batch of cycles. There are two shapes:

- **Small (≤3 cycles, typically parallel):** No separate manifest file.
  List the active cycles inline in this file's `## Active cycles` block
  (under "Current cycle"). The orchestrator dispatches all R1 tasks
  across the listed cycles in parallel; no `next-cycle` chaining is
  needed because the cycles are concurrent. Hold-list / owner-gated
  cycles live in `docs/BACKLOG.md` "Owner-gated cycles" section.
- **Large (≥4 sequenced cycles):** Use a campaign manifest at
  `docs/CAMPAIGN_<date>-<slug>.md` with the queue, `auto-advance`
  flag, and posture declarations. The orchestrator chains the
  sequenced cycles per the manifest:
  1. Run the current cycle's dispatch loop normally.
  2. At end-of-cycle, run the ritual (move briefs, append BACKLOG,
     refresh `docs/CARRY_OVERS.md` via
     `npm run check:cycle -- <slug> --close`).
  3. Read the campaign manifest. If a `next-cycle` is queued and not
     gated by a hard-stop, update this file's "Current cycle" section
     to point at the next cycle's brief and **continue without
     prompting**.
  4. Hard-stops still surface and halt the campaign:
     - Fence-change proposal in any executor report
     - >2 CI red or blocked tasks in a single round
     - Perf regression >5% p99 on `combat120` after any round
     - Carry-over count grew during a cycle (cycle becomes INCOMPLETE; campaign halts)
     - Any executor reports `isolation=worktree` failure
  5. Hard-stops surface as: print the failure summary, set "Current
     cycle" in this file to the **failed** cycle (with status
     `INCOMPLETE` / `BLOCKED`), and halt. The human resumes the
     campaign manually.

Without `auto-advance: yes` (or for small campaigns where no manifest
exists), the orchestrator stops after each cycle close and waits for
the next `/orchestrate` invocation. That's the legacy single-cycle
pattern.

Archived campaign manifests stay where they are
(`docs/archive/CAMPAIGN_*.md`) as historical record; do not delete or
backfill them.

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

**"Current cycle" template shape (small campaigns, ≤3 cycles).** When
running a small campaign, fill in an `## Active cycles` block under
"Current state" instead of authoring a separate campaign manifest:

```
## Active cycles
- cycle-<slug-a> — <one-line scope> — <ID-list>
- cycle-<slug-b> — <one-line scope> — <ID-list>
- cycle-<slug-c> — <one-line scope> — <ID-list>

(Optional: posture/auto-advance flags, hard-stops, owner-gated triggers)
```

For larger campaigns (≥4 sequenced cycles) point "Current state" at the
manifest file as usual.

## Current state

**CAMPAIGN COMPLETE — [CAMPAIGN_2026-06-29-cinematic-field-pass.md](CAMPAIGN_2026-06-29-cinematic-field-pass.md)**
(7 phases + P4b wiring + PX terrain-spike). CLOSED 2026-06-29 (autonomous-loop).
All 9 PRs (#457-#465) merged to `master`, ZERO fence changes, combat120 baseline
restored (P0), full suite 7238 green. Shipped: TSL post-stack (filmic grade +
bloom + atmospheric depth, DEFAULT-OFF); 3D orbital topo map (deploy/pause rich-3D
+ opt-in hold-M, default 2D); revived radial radio dial (desktop wheel + touch
sheet) on a dedicated HUD slot + a headless `RadioStationSystem` (3 Kevin MacLeod
CC-BY tracks, lazy, DEFAULT-OFF) wired to the dial (P4b); day/night
`SoundscapeDirector` replacing the permanent loop; device-aware tasking-director
card; and a terrain-tower fix (impostor card height clamped — the ~100m "towers"
were inflated GLB billboard cards, NOT terrain). NOT deployed (deploy is MANUAL —
owner ships after the walk). Owner feel-walks + the post default-on flip (behind a
MAIN-worktree combat120 p99 neutrality proof) are queued in
[PLAYTEST_PENDING](PLAYTEST_PENDING.md). No active cycle.

**Prior campaign — [CAMPAIGN_2026-06-28-field-readiness.md](CAMPAIGN_2026-06-28-field-readiness.md)**
(6 phases, `auto-advance: yes`, `posture: autonomous-loop`; scaffolded 2026-06-28
from the owner playtest triage). Phase 1
(`cycle-2026-06-28-control-discoverability`) CLOSED 2026-06-28 (#425-#428,
playtest-deferred); Phase 2 (`cycle-2026-06-28-combat-vehicle-feel`) CLOSED
2026-06-28 (#429-#433, perf A/B PASS, playtest-deferred); Phase 3
(`cycle-2026-06-28-terrain-vegetation-asset-defects`) CLOSED 2026-06-28 (#434-#440,
perf A/B PASS −23%, playtest-deferred); Phase 4 (`cycle-2026-06-28-arsenal-expansion`)
CLOSED 2026-06-28 (#441-#443, perf A/B PASS, playtest-deferred); Phase 5
(`cycle-2026-06-28-deploy-armory-faction-select`) CLOSED 2026-06-29 (#444-#450,
no perf gate — UI/deploy, playtest-deferred); Phase 6
(`cycle-2026-06-28-ashau-purpose-and-missions`) CLOSED 2026-06-29 (#451-#455, perf
A/B PASS R1 −5.6% / R2 +0.6%, playtest-deferred). **CAMPAIGN COMPLETE** — all 6
phases closed; 31 PRs (#425-#455) merged, zero fence changes. NOT deployed (deploy
is MANUAL — owner ships after the morning walk). The owner-walk deferrals for all 6
phases are queued in [PLAYTEST_PENDING](PLAYTEST_PENDING.md). No active cycle.

Prior campaigns (engineering closed; owner walks pending in
[PLAYTEST_PENDING](PLAYTEST_PENDING.md)) — both 2026-06-09 `/goal` campaigns completed
2026-06-10:

- [CAMPAIGN_2026-06-09-lighting-rig.md](CAMPAIGN_2026-06-09-lighting-rig.md)
  — ALL PHASES COMPLETE (#363-#381): unified rig is the shipped default
  lighting path, legacy paths deleted, standing `check:tod-coherence`
  acceptance gate landed. Owner prod acceptance walk is the formal exit gate.
- [CAMPAIGN_2026-06-09-craft-specialization.md](CAMPAIGN_2026-06-09-craft-specialization.md)
  — ALL PHASES COMPLETE (11 PRs, zero fence changes); three feel-walk rows
  pending.

Also merged 2026-06-10 (standalone owner request): `task/konveyer-rename`
#382 — the konveyer codename retired from the live surface (env vars,
identifiers, scripts, live docs; archives keep the historical narrative).

Before these: the consultation-remediation campaign
([CAMPAIGN_2026-06-09-consultation-remediation.md](CAMPAIGN_2026-06-09-consultation-remediation.md)),
5 phases, 25/25 merged (#337-#361).

Directive status: [docs/DIRECTIVES.md](DIRECTIVES.md).

## Current cycle

- **Active:** none. No cycle is in flight. The cinematic-field-pass campaign
  closed 2026-06-29 (all 9 PRs #457-#465 merged; see "Current state" above and
  BACKLOG "Recently Completed"). The next `/goal` or `/orchestrate` invocation
  fills this section from a fresh cycle brief.
- **Previous:** `CAMPAIGN_2026-06-29-cinematic-field-pass` (7 phases + P4b + PX,
  closed 2026-06-29, autonomous-loop, playtest-deferred) — P0 cinematic
  foundations (combat120 baseline restore + shared `src/core/tsl/` lib +
  non-fenced `TerrainSystem.getBakedHeightmap()`), TSL post-stack (DEFAULT-OFF),
  3D orbital topo map (opt-in, default 2D), revived radio dial + wired
  `RadioStationSystem` (CC-BY, DEFAULT-OFF), day/night `SoundscapeDirector`,
  device-aware task card, terrain-tower (impostor-card) fix. Zero fence changes;
  full suite 7238 green. Briefs archived at
  `docs/tasks/archive/cycle-2026-06-29-cinematic-field-pass/`. See PLAYTEST_PENDING
  for the owner walks + the post default-on flip (behind a MAIN combat120 p99 proof).

## Dispatch protocol

For each round, in a single orchestrator turn:

1. Select the next batch per the round schedule (≤ concurrency cap).
2. Send one message with N parallel `Agent` calls:
   (`Agent(...)` here denotes the Task/subagent dispatch the main session
   drives via the `/orchestrate` skill — not a literally-named `Agent` tool.)
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
   - If `pr_url: blocked-by-sandbox` → the executor hit a sandbox
     `ask`-list rule, and agent sessions cannot answer the prompt.
     **Policy change 2026-06-12 (owner directive — approval prompts were
     stalling overnight cycles):** `git commit` / `git push` /
     `git checkout` / `git switch` / `git merge` / `gh pr merge` /
     `gh pr create` are on the `allow` list in `.claude/settings.local.json`
     on the primary workstation, so executors commit, push, and open PRs
     unattended; only `git tag` and `gh repo edit` still ask.
     `settings.local.json` is intentionally untracked — replicate the
     allow-list on a new machine or this fallback fires again. If it does
     fire, the orchestrator finishes from the main session on the
     executor's behalf:
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
3. Small diffs. If you pass ~400 lines net and you are not deleting retired
   code (a task whose brief is explicitly flagged as a large retired-code
   deletion is the one kind that can go larger), stop and reassess.
4. Do not modify files outside the task's `Files touched` scope.
5. Verify locally before pushing: `npm run lint`, `npm run test:run`,
   `npm run build`. New rules as of Phase 0 (2026-05-09):
   - Files ≤700 LOC and ≤50 public methods (grandfathered exceptions
     listed in `scripts/lint-source-budget.ts`; run `npm run lint:budget`).
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
  backlog): preserved as immutable tags `spike-E1-archive` through
  `spike-E6-archive` (commits previously lived on `spike/E*` branches,
  pruned 2026-05-20). Index: [docs/archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md](archive/E_TRACK_SPIKE_MEMO_INDEX_2026-05-07.md).
  Resolve with `git checkout spike-E2-archive` (etc.) or browse
  `https://github.com/matthew-kissinger/terror-in-the-jungle/tree/spike-E2-archive`.
