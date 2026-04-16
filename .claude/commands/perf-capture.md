---
description: Capture combat120 perf and compare against baseline
argument-hint: [combat120|openfrontier:short|ashau:short|frontier30m]
---

Run a perf capture and compare against the committed baseline.

Scenario from `$1` (default `combat120`). Map to npm script:
- `combat120` -> `npm run perf:capture:combat120`
- `openfrontier:short` -> `npm run perf:capture:openfrontier:short`
- `ashau:short` -> `npm run perf:capture:ashau:short`
- `frontier30m` -> `npm run perf:capture:frontier30m`

Then always: `npm run perf:compare`.

Report:
1. p50 / p95 / p99 frame time, min/max, heap growth
2. Delta vs baseline in `perf-baselines.json` (flag any regression >5% on p99)
3. Scenario-specific counters if relevant (cover search budget, spike count, etc.)
4. Recommendation: update baseline, investigate, or nothing needed

Do not run perf:update-baseline unless the user explicitly asks.
