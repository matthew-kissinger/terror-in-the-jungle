<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# <slug>

One paragraph: what user-observable gap this closes and why now. Name the
faction / scenario / system the user will see change. If this is a Round 2
follow-on, link the Round 1 task here in one line.

## Files touched

- `src/path/to/file.ts`
- `src/path/to/other.ts`
- `src/path/to/test.test.ts` (new)

## Scope

1. One bullet, ≤2 lines. Concrete change, not a research goal.
2. Repeat. Keep to 5 or fewer. If you need more, the task is too big — split it.
3. ...
4. ...
5. ...

## Non-goals

- What this task explicitly does NOT do (so the executor does not drift).
- Adjacent refactors that are tempting but out of scope.
- Reviewer hot-takes that should be filed as follow-ups instead.

## Acceptance

- [ ] Concrete, measurable criterion (file diff size, command output, screenshot, perf delta).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.
- [ ] Reviewer (if listed) signs off pre-merge.

## Round 2 / Dependencies (optional)

- Depends on: `<other-task-slug>` (one line per dep).
- Blocks: `<downstream-task-slug>`.
- Round 2 follow-on tasks live in their own brief files; link them here if
  the split is already known.
