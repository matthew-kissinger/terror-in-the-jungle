# Agent Testing Guide

Commands available for validating changes, from fastest to most thorough.

## Quick Validation (< 30 seconds)

```bash
npm run test:quick       # All unit tests, dot reporter (compact output)
npm run lint             # ESLint on src/
```

- `test:quick` runs all 3300+ vitest tests with minimal output.
- Exit code 0 = pass, 1 = test failures.
- Run after any code change. If tests fail, fix before proceeding.

## Standard Validation (< 2 minutes)

```bash
npm run validate         # test:run + build (sequential)
```

- Runs full test suite with verbose reporter, then TypeScript check + Vite production build.
- Catches type errors that tests alone miss (tests use jsdom, build uses full tsc).
- Exit code 0 = pass, non-zero = failure in either step.

## Integration Tests (< 30 seconds)

```bash
npm run test:integration # Only src/integration/ tests
```

- Smoke tests for mobile layout, cross-system wiring.
- Subset of the full suite; useful when changes only affect integration points.

## Performance Validation (5-30 minutes)

### Quick Performance Check

```bash
npm run perf:quick       # 30s headed capture, 60 NPCs
npm run perf:compare     # Compare latest capture against baselines
```

- `perf:quick` launches a headed browser, runs 30s of gameplay, writes artifacts to `artifacts/perf/<timestamp>/`.
- `perf:compare` reads the latest artifact and compares against `perf-baselines.json`.

### Scenario-Specific Captures

```bash
npm run perf:capture:combat120           # 120 NPCs, ai_sandbox, 90s
npm run perf:capture:openfrontier:short  # 120 NPCs, open_frontier, 180s
npm run perf:capture:ashau:short         # 60 NPCs, a_shau_valley, 180s
```

### Comparing Against Baselines

```bash
npm run perf:compare                           # Auto-detect scenario from latest artifact
npx tsx scripts/perf-compare.ts --scenario combat120  # Force scenario
npx tsx scripts/perf-compare.ts --dir 2026-02-21T16-35-52-406Z  # Specific artifact
```

### Updating Baselines After Improvements

```bash
npm run perf:update-baseline                          # Auto-detect scenario, update baseline
npx tsx scripts/perf-compare.ts --update-baseline combat120  # Explicit scenario
```

This writes current measurements into `perf-baselines.json` as the new `lastMeasured` values.

## Full Validation Pipeline

```bash
npm run validate:full    # test + build + perf:quick + perf:compare
```

- Runs everything sequentially. Takes 5-10 minutes.
- Use before committing performance-sensitive changes.

## Interpreting Exit Codes

| Command | 0 | 1 | 2 |
|---------|---|---|---|
| `test:run` / `test:quick` | All pass | Failures | - |
| `build` | Success | TS/build error | - |
| `perf:compare` | All PASS | Any WARN | Any FAIL |
| `perf:capture` | Capture OK | Validation fail | - |
| `validate` | All pass | First failure | - |

## Interpreting perf:compare Output

The comparison table shows each metric against pass/warn thresholds:

```
Metric            Value    Pass     Warn      Last    Status
avgFrameMs       11.54 ms     <16      <25     11.54    PASS
heapGrowthMb     13.17 MB     <20      <80     13.17    PASS
```

- **PASS**: Value is at or below the pass threshold.
- **WARN**: Value exceeds pass but is within warn threshold. Investigate but not blocking.
- **FAIL**: Value exceeds warn threshold. Regression likely; do not merge.
- **Last**: Previous baseline measurement for comparison.

## What to Do on Failure

1. **Test failure**: Read the failing test name and assertion. Fix the code or update the test.
2. **Build failure**: Usually a TypeScript error. Run `npx tsc --noEmit` for detailed diagnostics.
3. **Perf WARN**: Check if the change is expected to affect performance. If not, investigate. If intentional, update baseline with `npm run perf:update-baseline`.
4. **Perf FAIL**: Performance regression. Profile with `npm run perf:capture:combat120` and `npm run perf:analyze:latest` to identify the bottleneck.
