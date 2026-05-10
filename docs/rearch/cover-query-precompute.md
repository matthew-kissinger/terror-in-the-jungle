# Cover Query Precompute First Slice

Last verified: 2026-05-10

## Scope

Perf stream first slice for DEFEKT-3. This pass did not implement the full
`CoverQueryService` / precomputed field design. It landed the smallest bounded
runtime change: `AICoverFinding` keeps quantized cover-search results alive for
750ms across adjacent frames instead of clearing the cache every frame.

## Code Change

- Cache entries now store `{ cover, expiresAtMs }`.
- `beginFrame()` prunes expired entries only when the cache reaches capacity.
- Terrain-system and sandbag-system rewires clear the cache.
- The cache still returns cloned vectors to callers.
- Regression coverage verifies adjacent-frame reuse and expiry.

## Validation

```powershell
npx vitest run src/systems/combat/ai/AICoverFinding.test.ts
npm run build:perf
npm run perf:capture:combat120
npm run perf:compare
```

`perf:compare` evidence:

- artifact: `artifacts/perf/2026-05-10T10-45-07-263Z`
- result: `5 pass, 0 warn, 3 fail`
- avg frame: `20.15ms` (`FAIL`)
- p95 frame: `36.20ms` (`PASS`)
- p99 frame: `47.10ms` (`FAIL`)
- max frame: `100.00ms` (`FAIL`)
- heap growth: `2.23MB` (`PASS`)

## Decision

Do not close STABILIZAT-1 or DEFEKT-3 from this slice. The behavior-level
cache reduction is real, but the production-shaped combat120 capture still
misses the avg, p99, and max-frame gates.

The next DEFEKT-3 step should not be another TTL tweak. Move to the intended
precomputed cover-query service with counters for cache hit rate, query count
per AI phase, and suppression-callsite attribution.

