# Task C1: Migrate perf capture to build-mode

**Phase:** C (parallel)
**Depends on:** Foundation
**Blocks:** nothing
**Playtest required:** no
**Estimated risk:** low
**Files touched:** `scripts/perf-capture.ts`, `scripts/fixed-wing-runtime-probe.ts` (same dev-server pattern), `package.json` scripts, possibly `vite.config.ts`

## Problem

Perf captures currently run against Vite **dev mode** (`npm run dev --`). Dev mode ships with HMR (hot module reload), source maps, and no minification. Under sustained headless load (multiple captures back-to-back), the Vite dev server enters a bad state — we have observed "send was called before connect" errors and dynamic-import failures mid-capture.

More fundamentally: **dev-mode perf numbers are not representative of what users see.** Users get the built bundle (minified, chunked, tree-shaken). Measuring perf against dev is measuring the wrong thing.

## Goal

Perf captures run against a production build served from `vite preview` (or a static file server). Numbers reflect shipped-bundle reality. Dev-server HMR flakiness is eliminated from the capture path.

## Required reading first

- `scripts/perf-capture.ts` — current dev-server startup/teardown logic.
- `scripts/fixed-wing-runtime-probe.ts` — same pattern (share the migration).
- `package.json` — perf capture script definitions.
- `vite.config.ts` — preview port, base path.

## Suggested approach

1. Add a helper in scripts/ that runs `npm run build` (or checks if `dist/` is fresh), then `npm run preview -- --host 127.0.0.1 --port <port>` in a subprocess.
2. Replace the current `npm run dev` subprocess startup in `scripts/perf-capture.ts` and `scripts/fixed-wing-runtime-probe.ts` with the build + preview flow.
3. Keep a `--mode=dev` flag for debugging, but default to build.
4. Ensure the CI perf job uses build mode.
5. Update the preview port in documentation if it differs from dev.

## Verification

- `npm run perf:capture:combat120` produces a capture against the built bundle.
- `npm run perf:capture:openfrontier:short` same.
- Perf numbers should be comparable or better than dev-mode numbers (minified code is typically faster, but could expose rendering-path bugs that dev hid — report both).
- No "send was called before connect" errors in the log.
- `npx tsx scripts/fixed-wing-runtime-probe.ts` still runs all three aircraft airborne.

## Non-goals

- Don't change what the perf capture measures. Only change the server it runs against.
- Don't remove the dev-mode option entirely. `--mode=dev` still useful for debugging.
- Don't touch the Playwright driver logic (that's B2).
- Don't change CI workflow files beyond what's needed to swap build+preview for dev.

## Exit criteria

- Perf captures run against prod build by default.
- Dev-server state rot under repeated captures is eliminated.
- PR titled `chore(perf-harness): run captures against vite preview instead of dev (C1)`.
- PR body includes before/after perf numbers for combat120 or openfrontier:short, and confirms the probe still works.
