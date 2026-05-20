# Framework Recovery + Rearchitecture Plan (2026-05-20)

Written mid-campaign-2026-05-20-vehicle-boarding-and-water as a punch list for
restructuring the agent orchestration framework. The framework was load-bearing
when cycles took 30 min; six weeks of accretion turned cycles into day-long
events. This plan extracts the signal, deletes the noise, and aligns docs.

## Status at write-time

- **Active campaign:** `campaign-2026-05-20-vehicle-boarding-and-water`.
- **Cycles #2 + #3:** fully closed on master.
- **Cycle #1:** 7 of 8 PRs merged (#293, #297, #298, #299 pending merge,
  #288, #289, #296). R2 task (`vekhikl-board-integration-test-and-playtest-evidence`)
  still in flight at write-time.
- **Pending campaign-close ritual** (do AFTER #299 + R2 land):
  1. Move 3 cycle briefs `docs/tasks/<slug>.md` → `docs/tasks/archive/campaign-2026-05-20-vehicle-boarding-and-water/<slug>.md`
  2. Move campaign manifest `docs/CAMPAIGN_*.md` → `docs/archive/CAMPAIGN_*.md`
  3. Append `## Recently Completed (campaign-2026-05-20-vehicle-boarding-and-water)` to `docs/BACKLOG.md`
  4. Update `CLAUDE.md` "Current focus" section
  5. Update `docs/CARRY_OVERS.md` with closed VEKHIKL-UX-2 / VODA-OF-1 / VEKHIKL-LAYOUT-1 + history log
  6. Trigger production deploy: `gh workflow run deploy.yml --ref master`, poll, record deployed SHA
  7. Reset "Current cycle" stub in `docs/AGENT_ORCHESTRATION.md`

This plan exists to execute AFTER the campaign closes — not to interrupt it.

## Arc (how we got here, six weeks)

| Date | Layer added | Original purpose | Net effect today |
|---|---|---|---|
| 2026-04-17 | Worktree-isolated executors + structured reports | Parallel safe dispatch | **Core** — keep |
| 2026-04-18 | Descriptive slugs (vs phase letters) | Alphabet didn't scale | **Core** — keep |
| 2026-05-09 | Phase 0 rules (file caps, sibling tests, fence) | Audit findings | Mostly keep; carry-over registry started growing |
| 2026-05-09 | Campaign manifest layer | Track 12-cycle WebGPU follow-up | Adds 3rd nesting; only pays off for ≥4 sequenced cycles |
| 2026-05-13 | WebGPU+TSL on master | Real rewrite | 5 new rearch memos; status duplication began |
| 2026-05-16 | Autonomous-loop posture | Overnight `/goal` runs | Useful for unattended; adds branching logic |
| 2026-05-19 | Parallel campaign | 3 cycles concurrent | Pays off here; adds posture + reviewer-per-cycle bookkeeping |
| Continuous | mobile-ui 4-shard matrix | KB-STARTUP-1 incident | Now blanket-gates every PR including docs+test-only ones |
| Continuous | 25-min perf job on every PR | STABILIZAT-1 baseline drift | Same — blanket gate |
| Continuous | "Last verified: YYYY-MM-DD" headers | Trust signal | Decay; nobody trusts them |
| Continuous | Status mirrors across CLAUDE.md / AGENT_ORCHESTRATION / campaign manifest / CARRY_OVERS / BACKLOG / DIRECTIVES | Pick one per audience | Same state in 6 places, every cycle edits 6 |

Each layer fixed a real problem. Cumulatively they turned a 30-min cycle into a day.

## Where the time actually went (this campaign, measured)

- **~1,750 lines of orchestrator prose** authored before any executor ran
  (245-line campaign manifest + 3 × ~500-line cycle briefs + CLAUDE.md /
  AGENT_ORCHESTRATION / CARRY_OVERS / PLAYTEST_PENDING edits)
- **3 of 5 original cycle-#1 executors died at 90k-200k tokens** mid-work;
  retry round with slimmed inline prompts succeeded on all 3
- **CI critical path per PR ≈ 15-20 min** (mobile-ui 4-shard matrix is the gate,
  18-min ceiling per device)
- **~20 cumulative compute minutes per PR wasted** on duplicated CI setup
  (5 separate runner jobs each doing `npm ci` + game-field-kits checkout + build)
- **3 of 13 PRs hit sandbox-blocks-commit/push** (#291, #298, #299), each
  needing orchestrator-side push round-trip

## Signal vs noise

**Load-bearing (KEEP, do not change):**
- Worktree isolation + structured executor reports
- Hard-stop rule `> 2 tasks blocked → halt` (caught cycle #1 this run)
- Behavior-test-only discipline
- Fenced interface in `src/types/SystemInterfaces.ts` (zero fence slippage all campaign)
- Reviewer subagent gates on combat / terrain-nav PRs
- Descriptive slug ↔ branch ↔ commit message identity
- Per-task brief file as executor prompt source

**Friction with no signal (DELETE / TRIM):**

| Item | Why it's noise | Action |
|---|---|---|
| CARRY_OVERS zero-cycle IDs (open + close same cycle) | Pure bookkeeping | Stop opening IDs that won't span cycles |
| Campaign manifest layer (≤3 cycles parallel) | 3rd nesting level above cycle | Replace with one-line `## Active cycles` block in AGENT_ORCHESTRATION |
| 500-line brief format | Triggers executor token-budget death; mostly re-reads source anyway | Slim to ≤80 lines: context (2¶), file list, 5 scope bullets, non-goals, acceptance |
| "Last verified: YYYY-MM-DD" headers | Decay; nobody trusts | Delete from all docs except DIRECTIVES.md |
| Status mirrors across 6 docs | Every cycle edits all 6 | Pick DIRECTIVES.md as source of truth; others become 1-line + link |
| mobile-ui 4-shard matrix on every PR | 48 min compute per PR even for non-UI changes | Path-filter to `src/ui/**`, `src/systems/player/PlayerInput*`, `index.html`. Label override `mobile-full` |
| 25-min perf job on every PR | Runs even on pure-test changes | Path-filter to `src/systems/combat/**`, `src/core/**`. Label override `perf-full` |
| 5× duplicated CI setup | ~20 cumulative compute min per PR | One `setup` job emits cache; downstream jobs `needs: setup` |
| Hold list inside campaign manifests | Just a queue | Move to BACKLOG.md "Owner-gated" section |
| Orchestrator-side push fallback | Sandbox blocks `git push` from ~30% of worktrees | Either fix sandbox permissions OR make orchestrator-push the documented default |
| Required Reading / Critical Process Notes / Open Questions / Carry-over Impact brief blocks | Signal in ≤5% of cases | Collapse into single "Context + scope + non-goals" section |

**Doc drift (FIX):**

- `README.md` cites `docs/STATE_OF_REPO.md` 3× — file doesn't exist
- `README.md` says "active campaign: 2026-05-13-POST-WEBGPU" — closed 2026-05-18
- `README.md` says "current task branch: task/mode-startup-terrain-spike" — parked since May 13
- `README.md` says "~4,100 tests across ~265 files" — actually ~4,910 / ~323
- `README.md` describes cycle archive as `docs/cycles/<id>/RESULT.md` — actual is `docs/tasks/archive/<id>/<slug>.md`
- `README.md` cites `check:projekt-143-completion-audit` — renamed to `check:cycle-close`
- Phase F references everywhere; phase letters retired 2026-04-18
- `package.json` description is just `"terror-in-the-jungle"`; tags array unset

## Three-pass plan

### Pass 1 — Trim CI (biggest immediate speedup, ~50% wall-clock cut per PR)

- [ ] `.github/workflows/ci.yml` — add `setup` job that does `npm ci` + game-field-kits checkout + `npm run build` once; caches `node_modules/` + `dist/`. Make `lint`, `test`, `smoke`, `mobile-ui`, `perf` all `needs: setup` and restore from cache.
- [ ] Path-filter `mobile-ui` job to `src/ui/**`, `src/systems/player/PlayerInput*`, `index.html`. Add PR label override `mobile-full`.
- [ ] Path-filter `perf` job to `src/systems/combat/**`, `src/core/**`, `src/systems/terrain/**`. Add PR label override `perf-full`.
- [ ] Reduce `mobile-ui` matrix to **1 device by default** (`android-390x844`); full 4-device matrix only on `mobile-full` label.
- [ ] Confirm path filters at top of `ci.yml` already exclude pure-docs PRs (PR #294 proved this works).

**Expected:** CI critical path per PR 15-20 min → 5-8 min.

### Pass 2 — Trim framework (recover orchestrator-side speed)

- [ ] Delete the campaign manifest abstraction for ≤3-cycle parallel runs.
      One-line `## Active cycles` block in `docs/AGENT_ORCHESTRATION.md` is enough.
      Keep the manifest pattern only for ≥4 sequenced cycles (rare).
- [ ] New brief template at `docs/tasks/_TEMPLATE.md`: cap 80 lines.
      Sections: Context (2¶), Files touched, Scope (5 bullets), Non-goals,
      Acceptance. Delete: Required Reading, Critical Process Notes, Open
      Questions, Carry-over Impact, Hard Stops (subsumed into Acceptance).
- [ ] Stop opening zero-cycle IDs in `docs/CARRY_OVERS.md`.
      Registry tracks only items spanning ≥2 cycles.
- [ ] Delete `Last verified: YYYY-MM-DD` headers from all docs except
      `docs/DIRECTIVES.md` (which the README treats as canonical).
- [ ] Pick **DIRECTIVES.md** as single status source.
      Refactor CLAUDE.md "Current focus" / AGENT_ORCHESTRATION "Current cycle" /
      CARRY_OVERS / BACKLOG / ROADMAP / README "Active areas" to one-line
      pointers ("see `docs/DIRECTIVES.md` for current state").
      _Confirm DIRECTIVES.md is actually fit for this role before committing —
      may need its own slim refactor first._
- [ ] Move campaign hold-list entries (`cycle-vekhikl-5-fleet-expansion`,
      `cycle-vekhikl-seat-swaps`, `cycle-sky-screen-space-quad`,
      `cycle-stabilizat-1-baselines-refresh`) to `docs/BACKLOG.md` "Owner-gated"
      section.
- [ ] Fix sandbox `git commit` + `git push` permissions on agent worktrees,
      OR document orchestrator-push as the standard step in
      `docs/AGENT_ORCHESTRATION.md` dispatch protocol.

**Expected:** Orchestrator prose per cycle ~1,750 → ~250 lines. Executor token
deaths near zero. Doc-state edits per cycle close 6 → 1.

### Pass 3 — Align README + tags + AGENTS/CLAUDE

- [ ] `README.md`:
  - Delete "Active campaign" + "Current task branch" sections; replace with
    `[docs/DIRECTIVES.md](docs/DIRECTIVES.md)` pointer.
  - Remove all `docs/STATE_OF_REPO.md` references (file doesn't exist).
  - Refresh tech stack: `~4,900 tests across ~320 files`.
  - Fix cycle archive path: `docs/tasks/archive/<cycle-id>/<slug>.md`.
  - Replace `check:projekt-143-completion-audit` → `check:cycle-close`.
  - Drop Phase F prose unless ROADMAP confirms current phase identity.
- [ ] `package.json`:
  - Description: one descriptive line (e.g.
    `"Browser-based combined-arms Vietnam-theater FPS/RTS sandbox in Three.js + WebGPU"`).
  - Keywords: `["threejs", "webgpu", "tsl", "vietnam", "rts", "fps", "browser-game"]` or similar.
- [ ] `AGENTS.md` vs `CLAUDE.md` boundary:
  - AGENTS.md = agent-agnostic daily loop, commands, hard rules.
  - CLAUDE.md = ONLY Claude-Code-specific harness (slash commands, subagents,
    skills, settings). Delete the "Current focus" section from CLAUDE.md —
    state belongs in DIRECTIVES.md.

## What to protect (do not change)

- Brief files in `docs/tasks/` as executor prompt source (just slim them)
- Worktree isolation
- Hard-stop rule
- Behavior-test discipline
- Fenced interface
- Reviewer subagents for combat / terrain-nav
- Structured executor report format
- The slash commands: `/orchestrate`, `/validate`, `/perf-capture`, `/playtest`
- The four agent role files in `.claude/agents/`

## Decisions needed from owner

1. **Confirm DIRECTIVES.md is the right single source of truth** for "what's open
   right now." If not, pick a different file or create one fresh.
2. **Approve `mobile-ui` reduction to 1 device default.** Risk: real mobile regression
   slips on a PR that doesn't carry `mobile-full` label.
3. **Approve `perf` job path-filter.** Risk: a non-combat/non-core change with
   perf side-effects slips. STABILIZAT-1 baselines remain at
   `measurement_trust=warn` so this risk is already partially accepted.
4. **Pick a recovery cadence:** Pass 1 + Pass 3 are small enough to ship as a
   single doctor PR. Pass 2 deserves its own focused cycle (it touches
   docs/AGENT_ORCHESTRATION.md which is fence-adjacent governance code).
5. **Hold-list cycles** (`cycle-vekhikl-seat-swaps`, `cycle-vekhikl-5-fleet-expansion`,
   `cycle-sky-screen-space-quad`, `cycle-stabilizat-1-baselines-refresh`): which
   if any should auto-promote post-2026-05-20-campaign? Currently all owner-gated.

## Estimated impact

| Metric | Now | After plan |
|---|---|---|
| CI critical path per PR | 15-20 min | 5-8 min |
| Orchestrator prose per cycle | ~1,750 lines | ~250 lines |
| Executor token-budget deaths | 3 of 5 (this campaign) | Near zero |
| Doc-state edits per cycle close | 6 files | 1 file |
| Cycle wall-clock for similar 3-parallel scope | ~day | 1-2 hours |
| Sandbox-blocks-commit incidents | ~30% of PRs | 0% (after Pass 2 fix) |

## When to execute this plan

1. **Now (after current campaign closes):** Pass 1 + Pass 3 as a single
   "doctor" PR. Small diff. No fence touch. Ship behind owner approval.
2. **Next focused cycle:** Pass 2. Touches governance docs
   (AGENT_ORCHESTRATION.md, CARRY_OVERS structure, brief template). Worth its
   own cycle so the framework change is itself reviewed.
3. **Continuous:** doc-drift gate (`npm run check:doc-drift` already exists)
   to catch future drift early.

After Pass 1 + Pass 3 ship, **archive this plan to
`docs/archive/FRAMEWORK_RECOVERY_PLAN_2026-05-20.md`** so it doesn't itself
become accreted noise.
