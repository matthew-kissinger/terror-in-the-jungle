# Agent Orchestration — Runbook

Last updated: 2026-04-18

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

**End-of-cycle ritual** (run as the last orchestrator action, or as a
standalone bookkeeping pass):

1. Move each merged brief from `docs/tasks/<slug>.md` →
   `docs/tasks/archive/<cycle-id>/<slug>.md`.
2. Append a `## Recently Completed (<cycle-id>)` section to
   `docs/BACKLOG.md` with PR list, one-line summaries, and follow-ups.
3. Reset the "Current cycle" section below to the empty stub.
4. Commit with message `docs: close <cycle-id>`.

The stub template under "Current cycle" is what the next cycle fills in.

## Current cycle: `cycle-2026-04-20-atmosphere-foundation` *(draft — confirm at kickoff)*

### Cycle ID

`cycle-2026-04-20-atmosphere-foundation`

### Why this cycle exists

The sky / sun / fog / ambient stack is a grab-bag of frozen lights, a static equirect skybox, and scalar-multiplier weather. It cannot support the fixed-wing aircraft shipped in B1 (they climb into the 500-unit dome), jungle-mood work (dawn patrols, golden-hour objectives), or the P2-roadmap "day/night cycle". This cycle establishes an `ISkyRuntime` fence + `AtmosphereSystem` with a Hosek-Wilkie sky backend, sky-tinted fog, sun/hemisphere lights driven from the atmosphere model, and a Bayer dither that kills gradient banding in the 24-level post-process. Design: `docs/ATMOSPHERE.md`. Parallel P0/P1 carries from the prior cycle run alongside.

### Tasks in this cycle

Atmosphere v1 foundation (Combo G architecture, Combo A first backend):

- **`atmosphere-interface-fence`** — add `ISkyRuntime` + `ICloudRuntime` to `SystemInterfaces.ts`; stand up empty `AtmosphereSystem` shell with `NullSkyBackend`. Brief: `docs/tasks/atmosphere-interface-fence.md`.
- **`atmosphere-hosek-wilkie-sky`** — first sky backend: analytic dome + CPU-side LUT + per-scenario TOD preset table. Brief: `docs/tasks/atmosphere-hosek-wilkie-sky.md`.
- **`atmosphere-fog-tinted-by-sky`** — fog color sampled from sky zenith/horizon each frame; horizon seam disappears. Brief: `docs/tasks/atmosphere-fog-tinted-by-sky.md`.
- **`atmosphere-sun-hemisphere-coupling`** — unfreeze moonLight; drive sun direction + color + hemisphere from atmosphere; rewire WaterSystem sun vector. Brief: `docs/tasks/atmosphere-sun-hemisphere-coupling.md`.
- **`post-bayer-dither`** — 4×4 Bayer dither before the 24-level quantize in `PostProcessingManager.ts`. Independent of atmosphere stack. Brief: `docs/tasks/post-bayer-dither.md`.

Parallel carries from prior cycle:

- **`perf-baseline-refresh`** (P0) — rebaseline all 4 scenarios against the aim-fixed player bot. Brief: `docs/tasks/perf-baseline-refresh.md`.
- **`harness-lifecycle-halt-on-match-end`** (P1) — halt perf harness at match end. Brief: `docs/tasks/harness-lifecycle-halt-on-match-end.md`.
- **`bot-pathing-pit-and-steep-uphill`** (P1) — fix over-path on uphill + pit entrapment. Brief: `docs/tasks/bot-pathing-pit-and-steep-uphill.md`.
- **`harness-stats-accuracy-damage-wiring`** (P2) — wire accuracy + damage into `summary.json`; fix bot-state histogram read. Brief: `docs/tasks/harness-stats-accuracy-damage-wiring.md`.

### Round schedule

- **Round 1 (5 parallel):** `atmosphere-interface-fence`, `post-bayer-dither`, `harness-lifecycle-halt-on-match-end`, `bot-pathing-pit-and-steep-uphill`, `harness-stats-accuracy-damage-wiring`. These are independent of each other.
- **Round 2 (1):** `atmosphere-hosek-wilkie-sky` (after Round 1's `atmosphere-interface-fence` merges).
- **Round 3 (2 parallel):** `atmosphere-fog-tinted-by-sky`, `atmosphere-sun-hemisphere-coupling` (both consume the Hosek-Wilkie backend).
- **Round 4 (1):** `perf-baseline-refresh` (after harness P1/P2 land — baselines should reflect the improved pathing + stats surfacing).

### Concurrency cap

Default 5. No override.

### Dependencies

```
atmosphere-interface-fence       (blocks: hosek-wilkie, fog-tinted, sun-hemisphere)
atmosphere-hosek-wilkie-sky      (blocked by: interface-fence; blocks: fog-tinted, sun-hemisphere)
atmosphere-fog-tinted-by-sky     (blocked by: hosek-wilkie)
atmosphere-sun-hemisphere-coupling (blocked by: hosek-wilkie)
post-bayer-dither                (independent)
perf-baseline-refresh            (softly blocked by harness P1/P2 — see brief)
harness-lifecycle-halt-on-match-end (independent)
bot-pathing-pit-and-steep-uphill (independent)
harness-stats-accuracy-damage-wiring (independent)
```

### Playtest policy

- `atmosphere-hosek-wilkie-sky`, `atmosphere-fog-tinted-by-sky`, `atmosphere-sun-hemisphere-coupling`, `post-bayer-dither`: **required** — visual observables.
- `atmosphere-interface-fence`: not required — shell only, no visible change.
- Harness + perf tasks: per existing briefs.

### Perf policy

- `combat120` smoke on every atmosphere PR before merge; must stay within current WARN bound.
- Full `npm run validate:full` (combat120 capture + perf:compare) on the final integration PR before `perf-baseline-refresh` dispatches.
- Bayer dither PR: no perf expectation change (3–5 shader ops within noise).

### Failure handling

- Fence-change escalation: if `atmosphere-interface-fence` becomes an EXISTING-interface modification, STOP and open for human approval per `docs/INTERFACE_FENCE.md`.
- Sky backend perf overrun (`World` group > 1.0ms): fall back to Three's Preetham `Sky` example as a temporary backend; do not break the budget.
- Shadow popping on sun-direction animation: fall back to static frustum follow for v1; ship sun animation without shadow-follow.
- If `atmosphere-fog-tinted-by-sky` requires changing `IGameRenderer.fog` from `THREE.FogExp2` to a subclass, STOP — that's `[interface-change]`.

### Visual checkpoints (orchestrator-gated)

This cycle ships visible-pixel changes. The orchestrator (main session) is the visual reviewer and gates merge of every visible-change PR on screenshot review.

Per-task gate: each visible-change task brief carries a "Screenshot evidence (required for merge)" section listing required PNGs under `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/<slug>/`. Executors commit the shots in the same PR; the orchestrator reads them via the Read tool (which renders PNG) before `gh pr merge`. If a shot looks wrong, post `gh pr comment` with the specific issue and let the executor iterate.

Tuning combos between rounds — orchestrator captures these directly (Playwright MCP or extending `scripts/perf-capture.ts`) into `docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/_orchestrator/<checkpoint>/`:

- **Pre-cycle (master baseline):** capture every per-task required shot from current `master` first, into `_master/`. Executors diff their shots against this baseline.
- **After Round 2 merges (`atmosphere-hosek-wilkie-sky`):** re-shoot all 5 scenarios at ground level. Expect a visibly bad horizon seam (fog still constant) — confirm the sky gradient itself reads right per scenario.
- **After Round 3a merges (whichever of `fog-tinted` / `sun-hemisphere` lands first):** capture the same 5 + the storm + underwater overrides. Confirm seam is gone (if fog landed) or sun direction matches shadows (if sun landed).
- **After Round 3 fully merged (combined ship gate):** final capture of all 5 scenarios + storm + underwater. This is the last visual check before the cycle closes.

Tuning is iterative: if a combo capture reveals a regression that the executors couldn't see in isolation (e.g. fog color blowout when sun goes near the horizon), open a follow-up task brief rather than blocking the round mid-flight.

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
   - If PR URL present but CI state unknown → poll
     `gh pr view <url> --json statusCheckRollup,mergeable` or stream via
     `Monitor` on `gh pr checks <url> --watch`.
5. On CI green:
   - Spawn `combat-reviewer` if the diff touches `src/systems/combat/**`.
   - Spawn `terrain-nav-reviewer` if the diff touches terrain/nav.
   - Merge via `gh pr merge <url> --rebase` (fast-forward preferred; fall
     back to `--merge` only if branch protection blocks rebase).
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
- The reviewer reads the diff, reports findings to the orchestrator, and does
  not block merge unless it flags a fence change or scope violation.

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
   `npm run build`.
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
