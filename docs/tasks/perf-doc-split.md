# Task: perf-doc-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1)

## Goal

Split `docs/PERFORMANCE.md` (2,332 LOC) into a `docs/perf/` subdirectory of
focused docs, each ≤500 LOC. Phase 0 lint-docs grandfathers it; Phase 1
closes the grandfather entry.

## Why

`docs/PERFORMANCE.md` is the perf-harness encyclopedia: profiling commands,
budgets, scenarios, baselines, captures, comparison, regression playbook,
build targets. Each of those is a discrete topic with its own audience.
Splitting them lets each doc carry a `Last verified` and stay under the
800-LOC soft limit.

## Required reading first

- `docs/PERFORMANCE.md` (skim — section headers + intro paragraphs of each section)
- `docs/AGENTS.md` (commands section, perf:* entries)
- `docs/TESTING.md`
- `scripts/lint-docs.ts`

## Files touched

### Created

- `docs/perf/README.md` — index, profiling commands, build targets, ≤300 LOC
- `docs/perf/baselines.md` — current baselines + rationale + how to refresh, ≤300 LOC
- `docs/perf/scenarios.md` — scenario definitions (combat120, frontier30m, etc.), ≤300 LOC
- `docs/perf/playbook.md` — how to investigate a regression, ≤500 LOC

### Modified

- `docs/PERFORMANCE.md` — replaced with a 30-line redirect stub pointing to `docs/perf/`
- `scripts/lint-docs.ts` — remove `docs/PERFORMANCE.md` from `GRANDFATHER_LOC`

### NOT touched

- `perf-baselines.json` — data file, not docs.
- Any `scripts/perf-*.ts` — covered by `script-triage` if at all.

## Steps

1. `npm ci --prefer-offline`.
2. Read `docs/PERFORMANCE.md` section by section. Note the natural splits:
   - Build targets (perf / retail / dev) → `docs/perf/README.md`
   - Profiling commands (perf:capture:*, perf:compare, etc.) → `docs/perf/README.md`
   - Baselines + how to refresh → `docs/perf/baselines.md`
   - Scenario definitions (combat120 description, frontier30m, etc.) → `docs/perf/scenarios.md`
   - Regression playbook (how to investigate, what to capture, common causes) → `docs/perf/playbook.md`
3. For each split, distill — not transcribe. The current doc has many
   redundant restatements; consolidate.
4. Add `Last verified: 2026-05-09` to each new file.
5. Replace `docs/PERFORMANCE.md` with a redirect stub:
   ```
   # Performance

   Last verified: 2026-05-09

   This file split into `docs/perf/` on cycle-2026-05-09-doc-decomposition-and-wiring.

   - [docs/perf/README.md](perf/README.md) — index, profiling commands, build targets
   - [docs/perf/baselines.md](perf/baselines.md) — baselines + refresh procedure
   - [docs/perf/scenarios.md](perf/scenarios.md) — scenario definitions
   - [docs/perf/playbook.md](perf/playbook.md) — regression investigation playbook

   Pre-Phase-1 content archived at `docs/archive/PERFORMANCE.md`.
   ```
6. Move original full file to `docs/archive/PERFORMANCE.md`.
7. Remove `docs/PERFORMANCE.md` from `GRANDFATHER_LOC` in `scripts/lint-docs.ts`.
8. Update any cross-doc reference that linked `docs/PERFORMANCE.md` to a specific section. Common references:
   - `docs/AGENTS.md` mentions `docs/PERFORMANCE.md` — update to point at the appropriate `docs/perf/<file>.md`
   - `README.md` may link it — update if so

## Verification

- `wc -l docs/perf/*.md` — each ≤500 LOC, target ≤300
- `wc -l docs/PERFORMANCE.md` — ≤30 LOC
- `npm run lint:docs` — 0 failures
- `grep -r "docs/PERFORMANCE.md#" docs/ --include="*.md"` — no broken anchor references
- `npm run lint` — eslint clean

## Non-goals

- Do NOT touch `docs/STATE_OF_REPO.md` — that's `state-doc-split`'s job.
- Do NOT modify `perf-baselines.json` or any baseline data.
- Do NOT update perf budgets, thresholds, or scenarios — pure doc split.

## Branch + PR

- Branch: `task/perf-doc-split`
- Commit: `docs: split PERFORMANCE.md into docs/perf/ (perf-doc-split)`
- PR title same.

## Playtest required: no

## Estimated diff size

~700 LOC new (consolidated from 2,332). Mostly deletes. Within budget.
