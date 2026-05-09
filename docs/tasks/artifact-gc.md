# Task: artifact-gc

Last verified: 2026-05-09

Cycle: `cycle-2026-05-09-doc-decomposition-and-wiring` (Phase 1)

## Goal

Apply the artifact retention policy installed in Phase 0 — delete stale
perf captures (~7.4 GB at last dry-run) — and wire a CI-scheduled job to
keep it pruned weekly.

## Why

`artifacts/` is 28 GB. ~167 dirs are >30 days old. After Phase 1 codex
decomposition removes audit-JSON-as-prose from `STATE_OF_REPO.md`,
fewer dirs will be cited and more will become prunable.

## Required reading first

- `scripts/artifact-prune.ts` (the Phase 0 script)
- `package.json` `artifact:prune` and `artifact:prune:apply` entries
- `.github/workflows/` directory (existing CI workflow shapes)

## Files touched

### Created

- `.github/workflows/artifact-prune.yml` — weekly scheduled run, applies prune, commits the change as `chore(artifacts): weekly prune (artifact-gc)`. Use a deploy key or `GITHUB_TOKEN` with `contents: write` permission.

### Modified

- `docs/perf/README.md` (created by `perf-doc-split`) — add a 5-line note about the retention policy and the weekly job. If `perf-doc-split` lands first, append to that file. If artifact-gc lands first, this task creates a placeholder note in `docs/perf/playbook.md` and `perf-doc-split` reconciles.

### Run (not committed)

- `npm run artifact:prune:apply` — actually deletes the prunable dirs.

## Steps

1. `npm ci --prefer-offline`.
2. Run `npm run artifact:prune` (dry-run) and capture the report. Note the prunable count and total MB.
3. **Verify `perf-baselines.json` baseline pins are intact** in the dry-run output (the script reports them; should not be in the prunable list).
4. Run `npm run artifact:prune:apply` to delete prunable dirs.
5. **Commit the artifact deletions** — they're tracked in `artifacts/`. (If `artifacts/` is gitignored, skip — verify by checking `.gitignore`.) **Note for executor:** if `artifacts/` IS gitignored, this task's actual on-master deliverable is just the workflow + doc note. The deletion is local-only but still useful for disk space.
6. Author `.github/workflows/artifact-prune.yml`:
   ```yaml
   name: artifact-prune
   on:
     schedule:
       - cron: '0 4 * * 0'  # Sunday 04:00 UTC
     workflow_dispatch: {}
   permissions:
     contents: write
   jobs:
     prune:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v5
         - uses: actions/setup-node@v5
           with: { node-version: '24' }
         - run: npm ci --prefer-offline
         - run: npm run artifact:prune:apply
         - name: Commit pruned state
           run: |
             git config user.name "artifact-prune-bot"
             git config user.email "artifact-prune-bot@users.noreply.github.com"
             git add -A artifacts/
             git diff --cached --quiet || git commit -m "chore(artifacts): weekly prune (artifact-gc)"
             git push
   ```
7. Add a 5-line note to `docs/perf/playbook.md` (or `docs/perf/README.md` if `perf-doc-split` landed first) describing the weekly prune job and how to inspect what was deleted (`gh run list --workflow=artifact-prune.yml`).

## Verification

- `du -sh artifacts/` shows reduction (target <2 GB if artifacts/ tracked, otherwise just confirm dry-run drop)
- `cat .github/workflows/artifact-prune.yml` matches the spec above
- `npm run artifact:prune` reports near-zero prunable dirs immediately after `--apply` ran
- `npm run lint` — passes

## Non-goals

- Do NOT modify `scripts/artifact-prune.ts` itself unless a bug surfaces during use. Its retention rules (30 days + cited + baseline-pinned) are correct.
- Do NOT delete `artifacts/perf/projekt-143-*` packets that are still cited in `docs/DIRECTIVES.md` (after `codex-decomposition`). The script's "cited in docs" rule handles this — do not bypass.
- Do NOT touch `perf-baselines.json`.

## Branch + PR

- Branch: `task/artifact-gc`
- Commit: `chore(artifacts): apply retention prune + add weekly CI job (artifact-gc)`

## Playtest required: no

## Estimated diff size

- ~30 lines `.github/workflows/artifact-prune.yml`
- ~5 lines `docs/perf/playbook.md` note
- ~370 dir deletions if artifacts/ is tracked (large, but pure deletes — fine for review)

## Coordination note

If `artifacts/` is gitignored: the deletion happens locally, the PR adds
only the workflow + doc note. State that explicitly in the PR description.
