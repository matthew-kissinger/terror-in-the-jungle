# cycle-framework-recovery-pass-2

Pass 2 of the framework recovery plan
([docs/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md](../FRAMEWORK_RECOVERY_PLAN_2026-05-20.md)).
Touches governance: status-source consolidation, brief template, campaign-layer
deletion, sandbox push fix. Owner-approved per AskUserQuestion on 2026-05-20
(Q1 = DIRECTIVES.md slimmed first; Q4 = Pass 2 as own cycle).

Posture: autonomous-loop, auto-advance: n/a (single cycle). Concurrency cap: 4.
Closes none of the active 6 carry-overs but reduces the **machinery** that
creates carry-over churn.

## Round 1 (4 parallel tasks)

### R1.1 — `directives-slim-refactor`

Refactor `docs/DIRECTIVES.md` to ≤200 lines, table-row-per-directive (open +
recently-closed only). Move verbose evidence prose to per-directive memo files
under `docs/directives/<id>.md` if the directive needs more than a row's worth
of detail. Acceptance: `wc -l docs/DIRECTIVES.md` ≤ 200; every open directive
has columns `id | title | status | owner | latest evidence | success criteria`;
sibling test `docs/DIRECTIVES.test.ts` confirms structure parses. **Blocks**
R2.1, R2.2.

### R1.2 — `brief-template-slim`

New file `docs/tasks/_TEMPLATE.md` cap 80 lines. Sections: `# <slug>` header,
1-paragraph context, `## Files touched` list, `## Scope` ≤5 bullets,
`## Non-goals` ≤5 bullets, `## Acceptance` checklist. Delete: `Required
Reading`, `Critical Process Notes`, `Open Questions`, `Carry-over Impact`,
`Hard Stops` (subsumed into Acceptance). Also add a line in
`scripts/cycle-validate.ts` that warns when a new brief exceeds 100 LOC.
Acceptance: template under 80 lines; validator warning fires on a synthetic
150-line brief.

### R1.3 — `ci-shared-setup-job`

Add a `setup` job to `.github/workflows/ci.yml` that does `npm ci` +
game-field-kits checkout + `npm run build` once and caches `node_modules/` +
`dist/` keyed on `package-lock.json` SHA. Refactor `lint`, `test`, `smoke`,
`mobile-ui`, `perf` to `needs: [setup]` and restore from cache instead of
re-installing. Acceptance: CI run on this PR shows downstream jobs starting
within ~30s of `setup` completing (vs ~3-5 min each today); per-job
wall-clock drops measurably.

### R1.4 — `sandbox-push-fix-or-document`

Investigate the ~30% sandbox-blocks-`git push`-from-worktree pattern flagged
in the campaign-2026-05-20 retro (PRs #291, #298, #299 needed
orchestrator-side push round-trips). Either fix the sandbox permissions in
`.claude/settings*.json` so worktree pushes go through, OR codify
orchestrator-side push as the standard step in `docs/AGENT_ORCHESTRATION.md`
§"Dispatch protocol" so executors stop being asked to push at all.
Acceptance: a 3-worktree dispatch dry-run shows zero sandbox-block incidents
OR the protocol doc explicitly says executors skip push.

## Round 2 (3 tasks, depend on R1)

### R2.1 — `status-mirror-consolidation` (depends: R1.1)

Refactor `CLAUDE.md` "Current focus", `docs/AGENT_ORCHESTRATION.md` "Current
cycle" + "Last closed cycle", `docs/BACKLOG.md` "Current Release Routing" +
"Active Directive Routing", `README.md` "Current Alignment" to **one-line
pointers** at `docs/DIRECTIVES.md`. Delete all `Last verified: YYYY-MM-DD`
headers except in `docs/DIRECTIVES.md`. Acceptance: every doc except
DIRECTIVES.md has at most 3 lines of "current state" prose; rest is structure
+ pointers.

### R2.2 — `carryovers-zero-cycle-ban` (depends: R1.1)

Stop opening zero-cycle IDs in `docs/CARRY_OVERS.md`. Add an explicit rule to
`docs/AGENT_ORCHESTRATION.md` §"Carry-over discipline": "Carry-overs track only
items spanning ≥2 cycles. Same-cycle gaps go in the PR description as
user-observable gap line." Update `scripts/cycle-validate.ts` to flag a new
carry-over ID that closes in the same cycle. Acceptance: validator flags a
synthetic zero-cycle ID; existing zero-cycle entries in CARRY_OVERS.md `Closed`
section stay as history.

### R2.3 — `campaign-layer-delete-or-shrink` (depends: R1.1)

For ≤3-cycle parallel campaigns, delete the separate campaign manifest file
pattern. The "Current cycle" section in `docs/AGENT_ORCHESTRATION.md` now
hosts a 1-line `## Active cycles` block with parallel cycle slugs. Move
hold-list to `docs/BACKLOG.md` "Owner-gated cycles" section. Keep the campaign
manifest pattern only for ≥4 sequenced cycles (rare). Update the orchestrator
playbook in `.claude/agents/orchestrator.md` to reflect the new shape.
Acceptance: orchestrator playbook documents the new shape; no breaking change
to the 3 archived campaign manifests.

## Files touched

`docs/DIRECTIVES.md`, `docs/tasks/_TEMPLATE.md` (new), `.github/workflows/ci.yml`,
`docs/AGENT_ORCHESTRATION.md`, `.claude/agents/orchestrator.md`,
`scripts/cycle-validate.ts`, `CLAUDE.md`, `docs/BACKLOG.md`, `README.md`,
`docs/CARRY_OVERS.md`, `.claude/settings.json` (maybe, R1.4).

## Non-goals

- No source-code changes (`src/**` untouched).
- No carry-over closes; this cycle reduces machinery, not active work.
- No promotion of hold-list cycles (those land as separate cycles after this).
- No DIRECTIVES.md content change in R1.1 — refactor only; same directives
  survive, just in a tighter shape.

## Acceptance (cycle-close gate)

- All R1 + R2 tasks merged on master.
- After this cycle: orchestrator prose per cycle drops from ~1,750 to ~250
  lines (measure on the next non-Pass-2 cycle).
- After this cycle: CI critical path per PR drops further (compound with
  Pass 1's path-filter wins).
- Plan file archives to `docs/archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md`
  (done as part of R2.3).
