# Deployment Validation

Last updated: 2026-03-10

## Goal

Make push/deploy readiness explicit instead of assuming a green build is enough.

Current posture:

- The repo is in a clean pushable state.
- Use this branch as the playtest baseline for terrain grading, spawn/nav reliability, and startup/runtime cleanup validation.
- Do not mistake that for final polish: heavy chunk sizes and combat perf work still remain after deploy.

## Required Local Gate

Run this before commit/push:

```bash
npm run validate
npm run deadcode
```

Current gate:

- `npm run lint`
- `npm run test:run`
- `npm run build`
- `npm run smoke:prod`
- `npm run deadcode` should also stay green before push, even though it is not part of `validate`

## Required Manual Checks

Run these against the local built app or a preview deployment:

1. `menu -> play -> deploy` works under the deployed base path.
2. Initial deploy confirm enters live gameplay.
3. Initial deploy cancel returns cleanly to the menu.
4. Respawn deploy confirm returns cleanly to live gameplay.
5. No fatal console/runtime errors appear during menu/start/deploy flow.

## GitHub Pages / CI Expectations

The current deploy pipeline in `.github/workflows/ci.yml` requires:

- `lint`
- `test`
- `build`
- `smoke`

Deploy only runs on `push` to `master` after those jobs pass.

## Current Known Risks Before Push

- Main runtime bundle is still heavy (`~710-727kB` chunks), so deploy stability is better than startup cost.
- Startup boot is lighter than before, but only part of the start-game path is deferred today (`ModeStartupPreparer` 8.53kB, `InitialDeployStartup` 1.02kB).
- Perf captures are not part of the default deploy gate; use `npm run validate:full` when a change touches hot paths materially.

## Current Validated State

Latest local validation on 2026-03-10:

- `npm run validate` passed
- `npm run deadcode` passed
- `167` test files, `3,470` passing tests, `2` skipped
- built-app smoke passed under `http://127.0.0.1:4173/terror-in-the-jungle/`
- menu button text during smoke: `CONTINUE TO DEPLOY US -- ZONE CONTROL`
- current large chunks:
  - `three`: `710.48kB`
  - `index`: `726.43kB`
  - `recast-navigation.wasm-compat`: `727.30kB`

## Recommended Pre-Push Sequence

```bash
npm run validate
npm run deadcode
npm run validate:full
git status --short
git diff --stat
```

If `validate:full` is skipped, note that explicitly in the commit handoff.
