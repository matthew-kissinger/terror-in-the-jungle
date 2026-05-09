# Stabilization Audit 2026-05

Last updated: 2026-05-02

This audit is the control record for the stable-ground cleanup branch
`codex/stabilize-solid-ground`. It records evidence gathered before docs and
release cleanup, not a feature plan. Runtime feature work, asset import work,
and broad architecture refactors are frozen during this pass.

## Audit-Start Truth

- TIJ branch at audit start: `master` and `origin/master` both pointed at
  `f99181a0bf8a6b2a8684fc1ae3796022c16aad22`.
- Stabilization branch: `codex/stabilize-solid-ground`, created from
  `origin/master`.
- Latest CI on `master`: GitHub Actions run `25036829545` passed for
  `f99181a0bf8a6b2a8684fc1ae3796022c16aad22`, including build, lint, test,
  perf, smoke, and mobile-ui jobs.
- Latest successful Deploy workflow at audit start: run `24972641184`, serving
  `5f585f7d4bf5ad2c0c85450235ac4c9950988d83`.
- Live Pages audit-start manifest:
  `https://terror-in-the-jungle.pages.dev/asset-manifest.json` reported
  `gitSha = 5f585f7d4bf5ad2c0c85450235ac4c9950988d83`, so production was
  functioning but stale relative to `master`.
- Live header spot-checks returned `200` for `/`, `/sw.js`,
  `/asset-manifest.json`, the A Shau R2 DEM URL, and the Recast WASM asset.
  Cache-control matched the deploy contract: stable app shell paths revalidate;
  immutable R2/build assets cache long-term.
- Live browser smoke reached the Zone Control deploy UI with no console, page,
  or failed request errors.

## Local Hygiene

The root review payload was moved out of the repo after copy and SHA-256
verification. Hash manifests now live alongside the archived files at:

`C:\Users\Mattm\X\games-3d\tij-local-review-artifacts\2026-05-02-stable-ground`

Relocated payload:

| Item | Files | Size |
| --- | ---: | ---: |
| `pixel-forge-tij-asset-handoff/` | 1014 | 365.20 MB |
| `60-free-plants.zip` | 1 | 49.23 MB |
| `foliage-pack.zip` | 1 | 2.13 MB |
| `survival-kit.zip` | 1 | 1.86 MB |
| `viewer-screenshot.png` | 1 | 0.10 MB |
| `viewer-typed.png` | 1 | 0.11 MB |

Merged local `worktree-agent-*` branches were pruned. No tracked TIJ source
files were changed by the relocation.

## Sibling Dependency Audit

TIJ currently consumes local `file:` dependencies from sibling workspace:

`C:\Users\Mattm\X\games-3d\game-field-kits`

Audit result:

- `game-field-kits` `master` and `origin/master` both pointed at
  `a7b71f1e9af61e2f89bb0adefae5121891896f62`.
- `npm ci` passed.
- `npm run check` passed, including workspace typecheck, lint, tests, builds,
  package-boundary checks, provenance checks, package-readiness checks, and
  dry-run packing.
- `npm run smoke:browser` passed for seven workspaces across desktop and
  mobile viewports.
- TIJ CI/deploy still requires the sibling checkout/build bootstrap in
  `.github/scripts/checkout-game-field-kits.sh` and
  `.github/scripts/build-game-field-kits.sh`. The deploy key secret remains a
  required repo-control dependency.

## Remote Hygiene

Closed stale PRs and deleted their head branches:

- `#153` `dependabot/npm_and_yarn/postcss-8.5.12`
- `#152` `dependabot/npm_and_yarn/vitest-4.1.5`
- `#151` `dependabot/npm_and_yarn/cross-env-10.1.0`
- `#150` `dependabot/npm_and_yarn/typescript-eslint/parser-8.59.0`
- `#149` `dependabot/npm_and_yarn/eslint-10.2.1`
- `#148` `dependabot/npm_and_yarn/recast-navigation/three-0.43.1`
- `#47` `claude/audit-vegetation-assets-wWNo0`

Open PR list is now empty.

Unmerged task and spike branches remain on the remote because they may contain
unique, unreconciled work. They are retained inventory, not active release
candidates:

- `spike/E1-ecs`
- `spike/E2-rendering-at-scale`
- `spike/E3-combat-ai-paradigm`
- `spike/E4-agent-player-api`
- `spike/E5-deterministic-sim`
- `spike/E6-vehicle-physics-rebuild`
- `task/a1-altitude-hold-elevator-clamp`
- `task/aircraft-a1-spawn-regression`
- `task/aircraft-building-collision`
- `task/aircraft-ground-physics-tuning`
- `task/aircraft-simulation-culling`
- `task/airfield-aircraft-orientation`
- `task/airfield-envelope-ramp-softening`
- `task/airfield-perimeter-inside-envelope`
- `task/airfield-prop-footprint-sampling`
- `task/airfield-taxiway-widening`
- `task/airfield-terrain-flattening`
- `task/airframe-altitude-hold-unification`
- `task/airframe-authority-scale-floor`
- `task/airframe-climb-rate-pitch-damper`
- `task/airframe-directional-fallback`
- `task/airframe-ground-rolling-model`
- `task/airframe-soft-alpha-protection`
- `task/atmosphere-day-night-cycle`
- `task/atmosphere-fog-tinted-by-sky`
- `task/atmosphere-hosek-wilkie-sky`
- `task/atmosphere-interface-fence`
- `task/atmosphere-sun-hemisphere-coupling`
- `task/bot-pathing-pit-and-steep-uphill`
- `task/cloud-audit-and-polish`
- `task/cloud-runtime-implementation`
- `task/continuous-contact-contract-memo`
- `task/debug-hud-registry`
- `task/engine-trajectory-memo`
- `task/F1-npc-hypersprint-fix`
- `task/fog-density-rebalance`
- `task/free-fly-camera-and-entity-inspector`
- `task/harness-ashau-objective-cycling-fix`
- `task/harness-lifecycle-halt-on-match-end`
- `task/harness-match-end-skip-ai-sandbox`
- `task/harness-stats-accuracy-damage-wiring`
- `task/heap-recovery-combat120-triage`
- `task/helicopter-interpolated-pose`
- `task/live-tuning-panel`
- `task/npc-and-player-leap-fix`
- `task/perf-baseline-refresh`
- `task/player-controller-interpolated-pose`
- `task/playtest-capture-overlay`
- `task/post-bayer-dither`
- `task/post-tone-mapping-aces`
- `task/preserve-drawing-buffer-dev-gate`
- `task/skybox-cutover-no-fallbacks`
- `task/terrain-param-sandbox`
- `task/time-control-overlay`
- `task/vegetation-alpha-edge-fix`
- `task/vegetation-fog-and-lighting-parity`
- `task/world-overlay-debugger`

## Local Validation On 2026-05-02

Local validation was run after the audit/docs cleanup, with no runtime source
changes on the stabilization branch.

| Gate | Result | Evidence |
| --- | --- | --- |
| `npm run doctor` | PASS | Node/dependency/browser bootstrap check passed. |
| `npm run validate:fast` | PASS | Pixel Forge cutover, typecheck, lint, and `test:quick` passed; Vitest reported 247 files / 3839 tests. |
| `npm run build` | PASS | Retail `dist/` build completed and wrote `dist/asset-manifest.json`; Vite emitted the existing large-chunk warning. |
| `npm run smoke:prod` | PASS | Local production smoke reached the menu and found `START GAME`. |
| `npm run check:mobile-ui` | PASS | Artifact: `artifacts/mobile-ui/2026-05-02T06-59-21-625Z/mobile-ui-check`. |
| `npm run probe:fixed-wing` | PASS | A-1, F-4, and AC-47 passed takeoff, climb, approach, bailout, and handoff; `build:perf` also passed as part of the probe. |
| `npm run evidence:atmosphere` | PASS/WARN | All five modes wrote ground/sky/aircraft evidence under `artifacts/architecture-recovery/cycle9-atmosphere/2026-05-02T07-24-17-735Z/`; warnings remain for known WebGL, preloaded-reticle, steep-airfield, and system-budget conditions. |
| `npm run validate:full` | WARN/FAIL | Unit/build stages passed, then `perf:capture:combat120` failed validation at `artifacts/perf/2026-05-02T07-29-13-476Z/validation.json`: avg frame 100.00ms, p99 100.00ms, 100% frames over 50ms, and Combat over budget in 100% of samples. Browser/page errors were `0`, heap end-growth passed, and harness shot/hit sanity passed. Treat as a current perf-confidence blocker candidate for a quiet-machine rerun, not as a code-change regression from this docs-only branch. |

## Accepted Blockers

1. **Production parity blocker:** live Pages was stale relative to `master`.
   The stabilization pass is not complete until the final accepted SHA is
   deployed and `/asset-manifest.json` reports that SHA.
2. **Repo-noise blocker:** root-level review assets made the worktree noisy for
   agents and humans. This was corrected by verified relocation.
3. **Remote-noise blocker:** stale dependency and audit PRs obscured the active
   release surface. This was corrected by closing the stale PR set and deleting
   only their head branches.
4. **Documentation drift blocker:** current-state docs predated the May 2
   stabilization audit and still mixed live truth, historical recovery notes,
   and deferred playtest/perf work. This branch updates those docs.
5. **Perf-confidence blocker candidate:** local `validate:full` did not produce
   a clean combat120 capture in this session. Since the stabilization branch is
   docs/ops-only and all unit/build/smoke/mobile/fixed-wing gates passed, the
   accepted action is to record the artifact and require a quiet-machine
   combat120 rerun before refreshing baselines or claiming perf sign-off.

## Release Acceptance

The stabilization branch is releasable only after:

- TIJ local gates pass: `npm run doctor`, `npm run validate:fast`,
  `npm run build`, `npm run smoke:prod`, `npm run check:mobile-ui`,
  `npm run probe:fixed-wing`.
- Release/perf gates are run or explicitly recorded as PASS/WARN:
  `npm run build:perf`, `npm run evidence:atmosphere`, and
  `npm run validate:full` on a quiet machine when available.
- GitHub CI is green for the stabilization branch after push.
- The branch is merged to `master`.
- `gh workflow run deploy.yml --ref master` succeeds.
- Live `/asset-manifest.json` reports the final `master` SHA.
- Live header checks and browser smoke pass against the deployed Pages URL.
