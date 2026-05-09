# Task: codex-decomposition

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1)

## Goal

Decompose PROJEKT_OBJEKT_143 — extract the substantive directives
(Article III) into a plain-English `docs/DIRECTIVES.md`, archive the
codex prose, and remove Politburo/Bureau/Codex/Article naming from the
non-archive doc surface.

## Why

The codex was load-bearing for the agent-stabilization loop — it provided
directive structure with success criteria and evidence paths. The substance
survives. The cosplay (Politburo seal, Article III, "Codex revision 1.3")
adds no information; replace with plain English.

The realignment plan
(`C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`) details
the signal-vs-cosplay decomposition.

## Required reading first

- `docs/PROJEKT_OBJEKT_143.md` — main codex (skim Article III in detail)
- `docs/PROJEKT_OBJEKT_143_HANDOFF.md` (skim)
- `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md`
- `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md`
- `docs/dizayn/vision-charter.md`
- `docs/dizayn/art-direction-gate.md`
- `docs/CARRY_OVERS.md` (existing carry-overs already migrated)
- `C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md` (Phase 1 codex-decomposition section)

## Files touched

### Created

- `docs/DIRECTIVES.md` — plain-English active directive list, ≤200 LOC. Format:
  ```
  ## <ID> — <one-line title>

  Status: open | done
  Owning subsystem: <combat | terrain | ...>
  Opened: <cycle-id>
  Latest evidence: artifacts/perf/<...>/foo.json (link only, no prose)
  Success criteria: <bulleted list, plain English>
  ```
  IDs to migrate (from Article III): VODA-1 through VODA-3, VEKHIKL-1 / VEKHIKL-2,
  AVIATSIYA-1 through AVIATSIYA-7, SVYAZ-1 through SVYAZ-4, UX-1 through UX-4,
  STABILIZAT-1 through STABILIZAT-3, DEFEKT-1 through DEFEKT-5,
  DIZAYN-1 through DIZAYN-3.
- `docs/archive/PROJEKT_OBJEKT_143/README.md` — 30-line preface explaining what's in the archive, when it ran, why it's preserved. NO Politburo prose.

### Moved (renamed, content preserved)

- `docs/PROJEKT_OBJEKT_143.md` → `docs/archive/PROJEKT_OBJEKT_143/CODEX.md`
- `docs/PROJEKT_OBJEKT_143_HANDOFF.md` → `docs/archive/PROJEKT_OBJEKT_143/HANDOFF.md`
- `docs/PROJEKT_OBJEKT_143_HYDROLOGY.md` → `docs/archive/PROJEKT_OBJEKT_143/HYDROLOGY.md`
- `docs/PROJEKT_OBJEKT_143_VEGETATION_SOURCE_PIPELINE.md` → `docs/archive/PROJEKT_OBJEKT_143/VEGETATION_SOURCE_PIPELINE.md`
- `docs/STABILIZATION_AUDIT_2026-05.md` → `docs/archive/STABILIZATION_AUDIT_2026-05.md` (codex-derivative)
- `docs/dizayn/` → `docs/archive/dizayn/` (Phase 0 grandfathered art-direction-gate.md; archive the whole dir)

### Modified

- `README.md` — drop the `[Codex (operating doc)](docs/PROJEKT_OBJEKT_143.md)` link from the top header anchor row; replace with `[Directives](docs/DIRECTIVES.md)`.
- `docs/BACKLOG.md` — replace `docs/PROJEKT_OBJEKT_143.md Article III` references with `docs/DIRECTIVES.md`. Keep the Strategic Reserve section as-is.
- `docs/AGENT_ORCHESTRATION.md` — the "Next cycle" section currently references `docs/PROJEKT_OBJEKT_143.md` Article III. Update to `docs/DIRECTIVES.md`.
- `CLAUDE.md` — remove residual codex references if any (Phase 0 already pruned the "Current focus" section; double-check and clean).
- `scripts/lint-docs.ts` — remove `docs/PROJEKT_OBJEKT_143.md` and the `docs/dizayn/*` entries from `GRANDFATHER_DATE`. Also remove `docs/PROJEKT_OBJEKT_143_HANDOFF.md` from `GRANDFATHER_LOC`. (Files are archived, no longer in the lint scope.)

### NOT touched

- `docs/cycles/<cycle-id>/RESULT.md` — historical evidence trail. Codex references in cycle retros stay as-is (audit trail).
- `docs/tasks/archive/<cycle-id>/<slug>.md` — archived task briefs from prior cycles. Same reason.
- `artifacts/perf/projekt-143-*/...` — evidence packets stay where they are. `artifact-gc` task handles retention.

## Steps

1. `npm ci --prefer-offline`.
2. Read all required files.
3. Create `docs/archive/PROJEKT_OBJEKT_143/` directory. Move the codex files in (use `git mv` to preserve history).
4. Write `docs/archive/PROJEKT_OBJEKT_143/README.md` — 30-line preface. Plain English. Mention: ran from when to when, what it accomplished, where the substantive directives moved (`docs/DIRECTIVES.md`).
5. Move `docs/STABILIZATION_AUDIT_2026-05.md` and `docs/dizayn/` into archive.
6. Author `docs/DIRECTIVES.md`. Iterate every directive ID listed above. For each, distill the codex's success criteria into 3–5 plain-English bullet points. Replace "evidence path" prose with a single link. **Drop** Politburo / Bureau / Codex / Article terminology entirely. **Drop** the `owner_review_only` / `evidence-in-progress` / `needs_human_decision` decision-states — replace with binary `open` / `done`.
7. Update non-archive doc cross-references (`README.md`, `docs/BACKLOG.md`, `docs/AGENT_ORCHESTRATION.md`, `CLAUDE.md`).
8. Update `scripts/lint-docs.ts` `GRANDFATHER_DATE` and `GRANDFATHER_LOC` to drop archived entries.
9. Verify: `grep -r "Politburo\|Bureau\|Codex\|Article III" docs/ --exclude-dir=archive --exclude-dir=cycles --exclude-dir=tasks/archive` returns 0 hits.

## Verification

- `wc -l docs/DIRECTIVES.md` ≤ 200
- `ls docs/PROJEKT_OBJEKT_143*.md docs/dizayn 2>&1 | grep -v "No such"` returns nothing (all moved)
- `ls docs/archive/PROJEKT_OBJEKT_143/` shows the moved files + README.md
- `grep -r "Politburo\|Bureau\|Codex\|Article III" docs/ --exclude-dir=archive --exclude-dir=cycles --exclude-dir=tasks` — 0 hits
- `grep -r "docs/PROJEKT_OBJEKT_143" docs/ README.md AGENTS.md CLAUDE.md --exclude-dir=archive --exclude-dir=cycles --exclude-dir=tasks` — 0 hits (no broken cross-doc refs)
- `npm run lint:docs` — 0 failures
- `npm run lint` — eslint clean (no source touched)

## Non-goals

- Do NOT change directive content beyond the prose-to-plain-English distillation. Each directive's intent is preserved.
- Do NOT touch `scripts/projekt-143-*.ts` — that's `script-triage`'s job.
- Do NOT touch `artifacts/perf/projekt-143-*/` — that's `artifact-gc`'s job.
- Do NOT delete the archive — it's evidence-trail and stays forever.

## Branch + PR

- Branch: `task/codex-decomposition`
- Commit: `docs: decompose PROJEKT_OBJEKT_143 — extract DIRECTIVES.md, archive codex prose (codex-decomposition)`

## Playtest required: no

## Estimated diff size

~600 LOC additions (DIRECTIVES.md + archive README), ~3,500 LOC moves
(archive renames don't count toward size budget). Some references in
README/BACKLOG/AGENT_ORCHESTRATION/CLAUDE update. Within budget.
