# cycle-2026-06-14-branch-shepherding-and-tank-salvage

Status: in progress on `codex/branch-shepherding-tank-cannon`. This cycle is
branch hygiene plus salvage audit, not a gameplay merge train.

## Goal Statement

Clean up branch confusion, confirm which local/remote branches represent real
unmerged work, prune stale remote branches only after owner confirmation, and
salvage only current-`master`-safe gameplay work from `task/tank-cannon-wiring`.
Keep the Fable-derived world-system lanes as explicit gated spikes, not hidden
branch merge candidates.

## Current Findings

- The main checkout is on `codex/vehicle-ac47-collision-polish` with unrelated
  dirty files, so cycle work moved to a clean `origin/master` worktree.
- Open PR check returned no open PRs: `gh pr list --state open ...` -> `[]`.
- Remote inventory against `origin/master`, before this cycle branch was
  pushed, found 69 non-master remote branches, 0 with unique patch content, 6
  direct ancestors, and 63 patch-equivalent non-ancestors. The only expected
  post-push exception is this active audit branch.
- A post-PR refresh found only PR #398 open and recorded the exact 68 stale
  remote candidates in
  `docs/tasks/cycle-2026-06-14-stale-remote-prune-candidates.txt`.
- `origin/codex/vehicle-ac47-collision-polish` is an ancestor of `master`; do
  not merge it. Its branch diff only looks scary because the branch is older
  than current `master`.
- Local inventory found 123 non-current local branches. Only
  `task/tank-cannon-wiring` has unique patch content by `git cherry`.
- `task/tank-cannon-wiring` unique commit `894980b1` is an older variant of
  already-merged commit `095a78e2`. Its only remaining unique delta would
  remove the current seat-binder lifecycle path in
  `PlayerVehicleAdapterFactory.ts` and reintroduce manual seat release in
  `tryExit()`. That is not safe to port.
- Current `master` already contains the useful seated-fire work:
  `seated-weapon-fire.test.ts`, tank gunner cannon launch, M2HB player adapter
  attach/detach, tank sight wiring, M2HB HUD, and NPC tank-cannon routing.

## Scope

1. Record branch truth with patch-equivalence, not `--no-merged` alone.
2. Keep remote branch deletion blocked until owner confirms the prune list.
3. Do not port `894980b1` over current `master`; it would regress seat release.
4. Keep Fable heightfield, hydrology, sky/post, species, forest LOD, and
   Nanite-lite as gated spike lanes from
   `cycle-2026-06-14-fable-gated-systems-readout.md`.

## Non-goals

- No wholesale branch merges from old `task/*` or `codex/*` branches.
- No deletion of local worktrees or checked-out branches in this pass.
- No production deploy for docs-only branch hygiene.
- No Fable runtime promotion as part of vehicle/tank branch cleanup.

## Acceptance

- [x] Clean worktree branch created from `origin/master`.
- [x] Remote branch inventory proves no remote branch has unique patch content.
- [x] Local branch inventory identifies `task/tank-cannon-wiring` as the only
  unique local patch candidate.
- [x] Tank-cannon salvage audit proves no safe code should be ported from
  `894980b1`.
- [ ] Owner confirms remote branch prune list.
- [ ] Confirmed stale remotes are deleted from `origin`.
- [x] Focused vehicle tests pass:
  `npx vitest run src/integration/vehicle/seated-weapon-fire.test.ts src/systems/vehicle/TankPlayerAdapter.test.ts src/systems/vehicle/SeatedMouseFire.test.ts src/systems/vehicle/PlayerVehicleAdapterFactory.test.ts src/integration/vehicle/m2hb-board.test.ts src/integration/vehicle/npc-tank-cannon.test.ts`
  -> 6 files / 74 tests.
- [x] Docs gates pass: `npm run lint:docs`; `npm run check:doc-drift`
  reports WARN only with `failing=0`.
- [x] Exact stale remote prune candidate list recorded after PR #398 existed.

## Remote Prune Rule

After owner confirmation, prune remote branches only by explicit branch name and
only after re-running:

```bash
git fetch origin --prune
gh pr list --state open --json number,title,headRefName,baseRefName,url,isDraft --limit 100
git cherry origin/master <branch>
git merge-base --is-ancestor <branch> origin/master
```

If `git cherry` reports any `+` commits or an open PR uses the branch, do not
delete it. Otherwise the branch is stale history already represented on
`master`.
