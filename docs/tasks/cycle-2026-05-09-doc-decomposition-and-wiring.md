# Cycle: cycle-2026-05-09-doc-decomposition-and-wiring

Last verified: 2026-05-09

Status: queued (ready for `/orchestrate` overnight run)

This is **Phase 1** of the realignment plan at
`C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`. Phase 0 (the
rules + WorldBuilder substrate) lands first as a separate PR; this cycle
runs after Phase 0 hits master.

Phase 1's goal: restore doc-vs-code honesty without losing what
PROJEKT_OBJEKT_143 actually accomplished, and wire the six WorldBuilder
god-mode flags into their consumer systems.

## Skip-confirm

This cycle is **skip-confirm**. The orchestrator dispatches Round 1 without
waiting for "go". Reviewer-pre-merge still gates each merge. Hard-stops
(fence change, >2 CI red in a round, perf regression >5% p99) still
surface to the user.

## Concurrency cap

5 parallel executors per round.

## Round schedule

### Round 1 — 5 parallel doc + script tasks (no shared file edits)

| # | Slug | Reviewer | Playtest? |
|---|------|----------|-----------|
| 1 | `state-doc-split` | none | no |
| 2 | `perf-doc-split` | none | no |
| 3 | `codex-decomposition` | none | no |
| 4 | `script-triage` | none | no |
| 5 | `artifact-gc` | none | no |

These five tasks have **no overlapping files** (verified — each touches a
different doc dir or different scripts/ subset). They can land in any order;
no `addBlockedBy` edges between them.

### Round 2 — WorldBuilder engine wiring

| # | Slug | Reviewer | Playtest? |
|---|------|----------|-----------|
| 6 | `worldbuilder-wiring` | combat-reviewer (touches PlayerHealth, AmmoManager, weapons) | yes (player invuln + infinite-ammo + no-clip path) |

`worldbuilder-wiring` is a single PR that wires all 6 god-mode flags into
their consumer systems. It's gated to Round 2 because (a) it's the only
task touching `src/systems/**` and (b) reviewer-pre-merge requires
combat-reviewer to APPROVE before merge.

## Dependencies

```
state-doc-split    ─┐
perf-doc-split     ─┤
codex-decomposition ┼─→ (Round 1 complete) ─→ worldbuilder-wiring
script-triage      ─┤
artifact-gc        ─┘
```

The Round 2 → Round 1 edge is soft (worldbuilder-wiring doesn't actually
need any of Round 1's output). It's there to keep the orchestrator's
attention serial across the high-risk task.

## Tasks in this cycle

Each task brief lives in `docs/tasks/<slug>.md` on the same branch as this
cycle brief.

- [docs/tasks/state-doc-split.md](state-doc-split.md)
- [docs/tasks/perf-doc-split.md](perf-doc-split.md)
- [docs/tasks/codex-decomposition.md](codex-decomposition.md)
- [docs/tasks/script-triage.md](script-triage.md)
- [docs/tasks/artifact-gc.md](artifact-gc.md)
- [docs/tasks/worldbuilder-wiring.md](worldbuilder-wiring.md)

## Success criteria (cycle-level)

All of:

1. All 6 PRs merged to master.
2. `du -sh docs/` reduced by ≥40% from cycle-start baseline (Phase 0 close ≈ 4.8 MB; target <2.9 MB).
3. `du -sh artifacts/` <2 GB (Phase 0 dry-run reported 7.4 GB prunable; `--apply` should land us under 2 GB).
4. `grep -c '"check:projekt-143' package.json` returns 0.
5. `grep -r "Politburo\|Bureau\|Codex\|Article III" docs/ --exclude-dir=archive` returns 0.
6. `wc -l docs/STATE_OF_REPO.md docs/PERFORMANCE.md` returns "no such file" (split into subdirs).
7. WorldBuilder god-mode flags effective in dev preview: invulnerable blocks damage, infinite ammo, no-clip skips collision, postProcess toggles, forceTimeOfDay drives atmosphere, ambientAudio toggles audio gain.
8. 6 worldbuilder-wiring carry-overs in `docs/CARRY_OVERS.md` move to the Closed table.
9. `npm run validate:fast` clean (lint + lint:budget + lint:docs + typecheck + test:quick all green).
10. `npm run perf:capture:combat120` p99 within ±2% of pre-cycle baseline.

## Hard rules for this cycle

1. **No fence changes.** None of these tasks should touch `src/types/SystemInterfaces.ts`. If an executor proposes one, the orchestrator surfaces and stops that task.
2. **`docs/cycles/`, `docs/tasks/archive/`, `docs/archive/` are write-only for archival moves.** No rewrites.
3. **`scripts/audit-archive/` is the parking lot for retired scripts.** Renames to plain names (e.g. `check:culling-baseline`) in `package.json` come with the rename in `scripts/`.
4. **`worldbuilder-wiring` consumer pattern is `import { isWorldBuilderFlagActive }` from `src/dev/worldBuilder/WorldBuilderConsole`** — guarded behind `import.meta.env.DEV`. No new fenced interfaces.
5. **Each PR description names the closed carry-over by ID** per the Phase 0 ground rules.

## End-of-run summary format

Per `docs/AGENT_ORCHESTRATION.md` "End-of-run summary format". Replace the
template values with this cycle's actuals. Include:

- Round 1 / Round 2 merged / blocked / failed counts
- 6 PR URLs
- Cycle-specific acceptance results:
  - `du -sh docs/` before / after
  - `du -sh artifacts/` before / after
  - `grep -c '"check:projekt-143' package.json` before / after
  - WorldBuilder dev-preview probe (paste eval output)
- combat120 perf delta (p95, p99, avg)
- Playtest required: `worldbuilder-wiring`
- Next cycle recommendation

## End-of-cycle ritual

Per `docs/AGENT_ORCHESTRATION.md` "Cycle lifecycle":

1. `npx tsx scripts/cycle-validate.ts cycle-2026-05-09-doc-decomposition-and-wiring --close` — increments carry-over counters, refreshes `Last verified`.
2. Move task briefs (including this file) to `docs/tasks/archive/cycle-2026-05-09-doc-decomposition-and-wiring/`.
3. Append cycle entry to `docs/BACKLOG.md` "Recently Completed" — short.
4. Update `docs/AGENT_ORCHESTRATION.md` "Last closed cycle" + reset "Current cycle" stub.
5. Commit as `docs: close cycle-2026-05-09-doc-decomposition-and-wiring`.
6. The next cycle will be **Phase 2: ZoneManager decoupling** per the realignment plan (week 2–3).
