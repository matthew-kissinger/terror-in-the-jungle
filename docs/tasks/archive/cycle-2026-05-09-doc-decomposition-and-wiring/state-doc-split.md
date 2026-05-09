# Task: state-doc-split

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1)

## Goal

Split `docs/STATE_OF_REPO.md` (2,708 LOC) into a `docs/state/` subdirectory of
focused docs, each ≤300 LOC. The current file is 80% audit-JSON-as-prose and
exceeds the new doc rules' hard 1,500-LOC limit.

## Why

Phase 0 lint-docs grandfathers `docs/STATE_OF_REPO.md`. Phase 1 closes that
grandfather entry by splitting and dropping the original.

## Required reading first

- `docs/STATE_OF_REPO.md` (skim — top 200 lines for current shape; rest is audit-JSON prose)
- `docs/CARRY_OVERS.md` (the new carry-over registry — replaces a section of STATE_OF_REPO)
- `docs/ROADMAP.md` (canonical vision sentence)
- `docs/TESTING.md` (rule: behavior tests, not implementation-mirror)
- `scripts/lint-docs.ts` (the gate this task closes)

## Files touched

### Created

- `docs/state/CURRENT.md` — top-level current truth, ≤300 LOC
- `docs/state/perf-trust.md` — measurement-chain status, ≤300 LOC
- `docs/state/recent-cycles.md` — last 3 cycle outcomes summarized, ≤200 LOC

### Modified

- `docs/STATE_OF_REPO.md` — replaced with a 30-line redirect stub pointing to `docs/state/`
- `scripts/lint-docs.ts` — remove `docs/STATE_OF_REPO.md` from `GRANDFATHER_LOC` (the entry's no longer needed because the file is now ≤30 LOC)

### NOT touched

- `docs/CARRY_OVERS.md` — already created in Phase 0; do not duplicate its content into `docs/state/`. `docs/state/CURRENT.md` links to it.

## Steps

1. `npm ci --prefer-offline` (worktree fresh).
2. Read `docs/STATE_OF_REPO.md` end-to-end.
3. Identify the substantive sections worth preserving:
   - Latest cycle posture (current direction)
   - Hotfix narrative (Z-flip)
   - Perf measurement-chain trust status
   - Live-release SHA + Cloudflare verification
4. **For each substantive section, choose the right destination:**
   - Short evergreen current truth → `docs/state/CURRENT.md`
   - Perf measurement-trust prose → `docs/state/perf-trust.md`
   - Recent cycle posture → `docs/state/recent-cycles.md` (last 3 cycles only)
5. **Drop the audit-JSON-as-prose sections.** Replace with a one-line link to the artifact path. Future audit summaries link, do not paraphrase.
6. Keep each new file ≤300 LOC; aim ≤200.
7. Add `Last verified: 2026-05-09` to each new file.
8. Replace `docs/STATE_OF_REPO.md` content with a 30-line redirect stub:
   ```
   # State Of Repo

   Last verified: 2026-05-09

   This file split into `docs/state/` on cycle-2026-05-09-doc-decomposition-and-wiring.

   - [docs/state/CURRENT.md](state/CURRENT.md) — current truth
   - [docs/state/perf-trust.md](state/perf-trust.md) — measurement-chain status
   - [docs/state/recent-cycles.md](state/recent-cycles.md) — last 3 cycle outcomes
   - [docs/CARRY_OVERS.md](CARRY_OVERS.md) — active carry-over registry

   Pre-Phase-1 content archived at `docs/archive/STATE_OF_REPO.md`.
   ```
9. Move the original full file to `docs/archive/STATE_OF_REPO.md` (keep for evidence-trail).
10. Remove the `docs/STATE_OF_REPO.md` entry from `GRANDFATHER_LOC` in `scripts/lint-source-budget.ts` — wait, that's the wrong file. Remove from `GRANDFATHER_LOC` in `scripts/lint-docs.ts`.

## Verification

- `wc -l docs/state/*.md` — each file ≤300 LOC
- `wc -l docs/STATE_OF_REPO.md` — ≤30 LOC
- `npm run lint:docs` — 0 failures, fewer warnings than baseline (the old grandfather entry is gone)
- `npm run lint` — eslint clean
- `grep -r "docs/STATE_OF_REPO.md" docs/ --include="*.md"` — only finds intra-archive references and the redirect stub itself

## Non-goals

- Do NOT touch `docs/PERFORMANCE.md` — that's `perf-doc-split`'s job.
- Do NOT touch `docs/PROJEKT_OBJEKT_143*.md` — that's `codex-decomposition`'s job.
- Do NOT add new carry-overs to `docs/CARRY_OVERS.md` — it's the authoritative registry, owned by the orchestrator.
- Do NOT rewrite cycle retrospectives in `docs/cycles/` — leave the historical evidence trail intact.

## Branch + PR

- Branch: `task/state-doc-split`
- Commit: `docs: split STATE_OF_REPO.md into docs/state/ (state-doc-split)`
- PR title: `docs: split STATE_OF_REPO.md into docs/state/ (state-doc-split)`
- PR description references Phase 1 cycle brief.

## Playtest required: no

## Estimated diff size

- ~30 lines new docs/STATE_OF_REPO.md
- ~600 lines new across docs/state/*.md (heavily condensed from 2,708)
- ~5 lines change to scripts/lint-docs.ts

Net under 800 lines, mostly deletes — within executor budget.
