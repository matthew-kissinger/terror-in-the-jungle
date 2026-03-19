# Deployment Validation

Last updated: 2026-03-19

## Goal

Make push/deploy readiness explicit instead of assuming a green build is enough.

Current posture:

- The repo is validated and ready to push once the current commit is created.
- The current branch is a playable and shippable baseline for local playtests and preview deploys.
- Remaining work after push is product/perf polish, not release-blocking boot or deploy instability.

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

- Main runtime bundle is still heavy (`~710-734kB` chunks), so deploy stability is better than startup cost.
- Startup boot is lighter than before. Start-game path is partially deferred (`ModeStartupPreparer`, `InitialDeployStartup`). Inline boot splash eliminates blank-page period. Per-texture/audio progress reporting gives users visual feedback during the heaviest init phase.
- Perf captures are not part of the default deploy gate; use `npm run validate:full` when a change touches hot paths materially.

## Current Validated State

Latest local validation on 2026-03-19:

- `npm run build` passed
- `npm run test:quick` passed: `177` test files, `3,591` passing tests, `2` skipped
- `index.html` now includes an inline boot splash (CSS-only pulsing bar, visible <100ms before JS loads)
- Granular texture/audio loading progress wired through SystemInitializer
- Progress bar transition: 0.15s linear (was 0.5s ease)
- Navmesh slow-phase hint visible during mode startup
- current large chunks:
  - `three`: ~691kB
  - `index`: ~748kB
  - `recast-navigation.wasm-compat`: ~710kB
  - `ui`: ~404kB

## Recommended Pre-Push Sequence

```bash
npm run validate
npm run deadcode
npm run validate:full
git status --short
git diff --stat
```

If `validate:full` is skipped, note that explicitly in the commit handoff.
