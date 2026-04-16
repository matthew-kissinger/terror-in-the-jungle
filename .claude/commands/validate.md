---
description: Run full validation suite (typecheck, lint, tests, build, smoke, perf compare)
argument-hint: [quick|full]
---

Run the project's validation suite and summarize results concisely.

Mode from `$1` (default `quick`):
- `quick` -> `npm run validate` (lint + test:run + build + smoke:prod)
- `full` -> `npm run validate:full` (adds combat120 capture + perf:compare)

After running, report:
1. Pass/fail per stage
2. For failures: the first failing test or lint rule with file:line
3. For perf runs: p95/p99 delta vs baseline
4. Clear one-line verdict (ship/hold)

Do not invent results. If a command times out, say so.
