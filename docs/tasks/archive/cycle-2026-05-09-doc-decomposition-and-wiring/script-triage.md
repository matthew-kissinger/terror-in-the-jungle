# Task: script-triage

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1)

## Goal

Triage 89 `check:projekt-143-*` scripts in `package.json` down to ≤12
plain-named retained checks. Move the rest to `scripts/audit-archive/`.
Rename retained scripts to drop the `projekt-143-` prefix.

## Why

Most `check:projekt-143-*` scripts are 1-cycle one-offs (cycle1-bundle,
cycle2-proof, cycle3-kickoff, etc.). They were valuable when they ran
but are now graveyard. Per the realignment plan: keep what's still
functional, archive the rest.

## Required reading first

- `package.json` (the 89 `check:projekt-143-*` entries)
- `scripts/projekt-143-*.ts` (one-line skim of file headers — what does each one do?)
- `C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md` Phase 1 §5 (the rename map)

## Files touched

### Renamed / kept (12 retained — script + package.json entry rename)

| Old script name | New script name |
|---|---|
| `scripts/projekt-143-current-completion-audit.ts` | `scripts/check-cycle-close.ts` (`check:cycle-close`) |
| `scripts/projekt-143-live-release-proof.ts` | `scripts/check-live-release.ts` (`check:live-release`) |
| `scripts/projekt-143-culling-owner-baseline.ts` | `scripts/check-culling-baseline.ts` (`check:culling-baseline`) |
| `scripts/projekt-143-culling-proof.ts` | `scripts/check-culling-proof.ts` (`check:culling-proof`) |
| `scripts/projekt-143-terrain-horizon-baseline.ts` | `scripts/check-terrain-baseline.ts` (`check:terrain-baseline`) |
| `scripts/projekt-143-terrain-visual-review.ts` | `scripts/check-terrain-visual.ts` (`check:terrain-visual`) |
| `scripts/projekt-143-water-system-audit.ts` | `scripts/check-water-system.ts` (`check:water-system`) |
| `scripts/projekt-143-water-runtime-proof.ts` | `scripts/check-water-runtime.ts` (`check:water-runtime`) |
| `scripts/projekt-143-visual-integrity-audit.ts` | `scripts/check-visual-integrity.ts` (`check:visual-integrity`) |
| `scripts/projekt-143-defekt-route-quality-audit.ts` | `scripts/check-route-quality.ts` (`check:route-quality`) |
| `scripts/projekt-143-aviatsiya-helicopter-parity-audit.ts` | `scripts/check-helicopter-parity.ts` (`check:helicopter-parity`) |
| `scripts/projekt-143-platform-capability-probe.ts` | `scripts/check-platform-capabilities.ts` (`check:platform-capabilities`) |

### Archived (moved to `scripts/audit-archive/`, removed from `package.json`)

All other `scripts/projekt-143-*.ts` files (~77 of them). Use `git mv` for
history preservation.

### Modified

- `package.json` — remove ~77 stale `check:projekt-143-*` entries; rename the 12 retained entries; if any `validate:fast` references a removed script, swap to the new name.

## Steps

1. `npm ci --prefer-offline`.
2. List every `scripts/projekt-143-*.ts`. Cross-reference with `package.json`.
3. Verify the 12 retained scripts above still parse + run (smoke check, not full execution): `npx tsx <script> --help` or read the file head to confirm it's not been broken in earlier cycles.
4. **Rename the 12 retained scripts.** Each rename:
   - `git mv scripts/projekt-143-foo.ts scripts/check-bar.ts`
   - Update top-of-file JSDoc comments that reference the old name
   - Update the `package.json` entry
5. **Archive the rest:**
   - `mkdir -p scripts/audit-archive`
   - `git mv scripts/projekt-143-<each>.ts scripts/audit-archive/<each>.ts` (drop the `projekt-143-` prefix in the archive too — these are auditable history)
   - Remove their `check:projekt-143-*` entries from `package.json`
6. **Verify nothing in source/tests references the old script paths:**
   - `grep -r "projekt-143" src/ scripts/check-*.ts package.json` — should only show:
     - `scripts/audit-archive/` paths (intentional)
     - Comments / log strings inside archived scripts (intentional)
     - 0 hits in `package.json`, `src/`, or the new `scripts/check-*.ts` files
7. **Verify `validate:fast` and `validate:full` still resolve all script names** — fix any stale references.
8. Run `npm run lint` to confirm nothing broke.

## Verification

- `grep -c '"check:projekt-143' package.json` returns 0
- `ls scripts/projekt-143-*.ts 2>&1 | grep -v "No such"` returns nothing
- `ls scripts/check-*.ts | wc -l` ≥ 12 retained
- `ls scripts/audit-archive/*.ts | wc -l` ≥ 77 archived
- `npm run lint` — passes
- `npm run typecheck` — passes
- For each of the 12 retained scripts: `npx tsx scripts/check-<name>.ts --help` exits 0 (or expected non-zero with usage printed)

## Non-goals

- Do NOT delete any archived script — they're evidence-trail.
- Do NOT add new `check:*` scripts — that's a future cycle's work.
- Do NOT modify the script logic — pure rename + archive.
- Do NOT touch `docs/DIRECTIVES.md` references to evidence paths — `codex-decomposition` owns those.

## Branch + PR

- Branch: `task/script-triage`
- Commit: `chore(scripts): triage projekt-143 scripts (89 → 12 retained, rest archived) (script-triage)`

## Playtest required: no

## Estimated diff size

Mostly renames (low net LOC). `package.json` shrinks by ~77 lines.
Within budget.
