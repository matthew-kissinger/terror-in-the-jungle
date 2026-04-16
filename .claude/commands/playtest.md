---
description: Walk the human playtest checklist and capture results
argument-hint: [focus-area?]
---

Game feel cannot be verified by tests. Walk the user through `docs/PLAYTEST_CHECKLIST.md`.

Steps:
1. Read `docs/PLAYTEST_CHECKLIST.md`.
2. If `$1` is set, filter to items matching that focus (flight, combat, driving, UI).
3. Make sure dev server is running (`npm run dev`). If not, start it.
4. For each checklist item, ask the user the question, wait for their verdict (ok / regressed / unsure), and record.
5. After the walkthrough, write results to `playtest-results/YYYY-MM-DD-HHmm.md` with verdict + notes per item.
6. Summarize pass/fail and flag any items marked `regressed`.

This is interactive. Do not skip user input.
