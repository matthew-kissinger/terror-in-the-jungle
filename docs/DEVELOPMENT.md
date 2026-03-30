# Development Guide

## Prerequisites

- Node 22 (pinned in `.nvmrc`)
- Modern browser with WebGL2

## Quick Validation (< 30 seconds)

```bash
npm run test:quick       # All tests, dot reporter
npm run lint             # ESLint on src/
```

## Full Validation (~2-5 minutes)

```bash
npm run validate         # lint + test:run + build + smoke:prod
npm run deadcode         # knip dead code scan (advisory)
```

`validate` runs ESLint, the full Vitest suite, TypeScript + Vite production build, then `scripts/prod-smoke.ts` against the built app.

## Integration Tests

```bash
npm run test:integration   # src/integration/ tests only
npm run check:mobile-ui    # Built-app phone viewport flow gate
```

`check:mobile-ui` drives the real title -> mode select -> deploy -> gameplay flow and fails when controls are offscreen on the phone viewport matrix.

## Performance Validation

```bash
npm run perf:capture:combat120   # Primary regression capture
npm run perf:compare             # Compare against baselines
npm run validate:full            # test + build + combat120 + compare
```

See [PERFORMANCE.md](PERFORMANCE.md) for full profiling docs.

## Deployment

### CI Pipeline

`.github/workflows/ci.yml` deploys to Cloudflare Pages on push to `master`.

Required gates before deploy:
1. `lint`
2. `test`
3. `build` (includes `prebuild` which skips if pre-baked assets exist)
4. `smoke`

Live at: https://terror-in-the-jungle.pages.dev/

### Pre-Push Checklist

```bash
npm run validate         # lint + test + build + smoke
npm run deadcode         # should stay green
```

For performance-sensitive changes, also run:
```bash
npm run validate:full    # adds combat120 capture + baseline comparison
```

### Build Output

Current large chunks:
- `three`: ~691kB
- `index`: ~758kB
- `recast-navigation.wasm-compat`: ~710kB
- `ui`: ~425kB

### Manual Smoke Checks

After changes to `src/ui/controls/`, `src/ui/hud/`, or `src/systems/player/`:
1. menu -> play -> deploy works
2. Initial deploy enters live gameplay
3. Deploy cancel returns to menu
4. Respawn works
5. No fatal console errors

## Exit Codes

| Command | 0 | 1 |
|---------|---|---|
| `test:run` / `test:quick` | All pass | Failures |
| `build` | Success | TS/build error |
| `validate` | All pass | First failure |
| `perf:compare` | All PASS | Any WARN or FAIL |
