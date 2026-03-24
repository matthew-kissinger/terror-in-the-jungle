# Codebase State And Documentation Drift Report

Prepared: 2026-03-22

Scope:
- Static audit of code, config, and documentation.
- No runtime validation was executed for this report.

## Executive Summary

The codebase is in better shape than the documentation set.

The docs still contain strong signal, but canonical truth is fragmented across too many files, several active docs still describe deleted or renamed UI/runtime concepts, and a number of operational facts have drifted from current code and config. The best parts of the current documentation are the index/runbook style docs and the block-map concept. The weakest parts are the overlapping "current state" narratives and any doc that embeds volatile counts, bundle sizes, or implementation milestones directly in prose.

The biggest issues are:
- UI/deploy architecture drift (`StartScreen` / `RespawnUI` vs `GameUI` / `DeployScreen`)
- feature-completeness drift around `AnimalSystem`
- tooling and test-environment drift
- deployment target/base-path drift
- active backlog docs still pointing at archived docs
- too many quasi-canonical status documents

## Audit Method

Code/config inspected:
- `package.json`
- `vite.config.js`
- `vitest.config.ts`
- `index.html`
- `src/core/*`
- `src/config/*`
- selected files in `src/ui/*`, `src/systems/*`

Docs inspected:
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/README.md`
- `docs/CODEBASE_BLOCKS.md`
- `docs/blocks/*.md`
- `docs/NEXT_WORK.md`
- `docs/PLAN_STATE.md`
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- `docs/PROFILING_HARNESS.md`
- `docs/DEPLOYMENT_VALIDATION.md`
- `docs/ROADMAP.md`
- `docs/archive/README.md`
- `progress.md`

## Current Codebase State From Code

### Architecture

- Browser game built with TypeScript, Vite, and Three.js.
- Entry path is `index.html` -> `src/main.ts` -> `src/core/bootstrap.ts`.
- `GameEngine` owns the top-level runtime shell: `GameUI`, `GameRenderer`, `SystemManager`, overlays, and startup flow orchestration.
- Runtime composition is system-based, with grouped composer layers for startup/player/deploy, gameplay/world, and operational/vehicle/air-support wiring.
- Terrain and navigation use workers, pre-baked assets, and `@recast-navigation`.
- Production build runs a navmesh prebuild step before `vite build`.
- Service worker registration is live in `index.html`.

### Major Live Systems

- Five game modes exist in code: `zone_control`, `open_frontier`, `tdm`, `ai_sandbox`, `a_shau_valley`.
- Terrain, vegetation, weather, water, and world-feature systems are live.
- Combat, tickets, zone capture, player movement, loadouts, helicopters, touch/gamepad controls, minimap/full map, and match-end flow are live.
- UI is DOM/CSS based with a small component model in `src/ui/engine/`; it is not a React app.
- `GameUI`, `TitleScreen`, `ModeSelectScreen`, and `DeployScreen` are the current screen flow.
- `CrosshairSystem` is the current crosshair implementation.
- `DeployScreen` is the current deploy/respawn surface used by `PlayerRespawnManager`.

### Tooling And Validation

- `package.json` uses `vite`, `tsc`, `vitest`, `eslint`, `playwright`, and `knip`.
- `vitest.config.ts` runs tests in `node`, not `jsdom`.
- `vite.config.js` uses `base: '/'`.
- `docs/DEPLOYMENT_VALIDATION.md` and config align around Cloudflare Pages deployment.
- The repo currently contains 180 test files under `src/`.

### Active Caveats Visible In Code

- `src/systems/combat/CombatantMovement.ts` still contains a TODO indicating navmesh route guidance is intentionally disabled pending WASM navmesh validation.
- `src/core/SystemInitializer.ts` explicitly notes that the old GPU terrain path is disabled in favor of the worker-based terrain path.
- The build still has large runtime chunks, which is also reflected in deploy docs.

## Documentation Landscape

### Primary Active Layers

- `README.md`: human-facing quickstart and project pitch
- `docs/README.md`: docs index and doc-maintenance rules
- `docs/CODEBASE_BLOCKS.md` and `docs/blocks/*.md`: architecture map
- `docs/NEXT_WORK.md`: ordered execution checklist
- `docs/PLAN_STATE.md`: persistent backlog and debt board
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`: architecture/perf decision log
- `docs/PROFILING_HARNESS.md`: perf runbook
- `docs/DEPLOYMENT_VALIDATION.md`: release/deploy runbook

### Secondary Or Specialized Layers

- `docs/ROADMAP.md`: aspirational product/architecture direction
- `docs/PERF_FRONTIER.md`: performance analysis framing
- `docs/ASSET_MANIFEST.md`: asset backlog / generation registry
- `docs/UI_ICON_MANIFEST.md`: icon registry
- `deploy-3d-assets/README.md`: asset catalog

### Historical Or Narrative Layers

- `CLAUDE.md`: changelog-like running project notes
- `progress.md`: session narrative
- `docs/archive/*`: retired docs by policy

## High-Confidence Drift Findings

### 1. UI And Deploy Architecture Drift

Severity: High

What docs say:
- `docs/blocks/player.md` still documents `RespawnUI` as a current module.
- `docs/CODEBASE_BLOCKS.md` still describes the menu as `StartScreen`.
- `docs/ARCHITECTURE_RECOVERY_PLAN.md` still contains lines such as "GameEngine uses StartScreen directly."
- `docs/blocks/ui.md` still mentions `LoadoutSelector` as a retained live component.

What code says:
- `src/ui/screens/GameUI.ts` is the current screen state machine and explicitly says it is a drop-in replacement for `StartScreen`.
- `src/ui/screens/DeployScreen.ts` explicitly says it replaces old `RespawnUI`.
- `src/systems/player/PlayerRespawnManager.ts` instantiates `DeployScreen`, not `RespawnUI`.
- `src/ui/loadout/LoadoutSelector.ts` does not exist.

Why it matters:
- These docs teach the wrong mental model for the most user-visible runtime path.
- A future maintainer following the docs would search for deleted abstractions first.

Key references:
- `docs/blocks/player.md`
- `docs/CODEBASE_BLOCKS.md`
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- `docs/blocks/ui.md`
- `src/ui/screens/GameUI.ts`
- `src/ui/screens/DeployScreen.ts`
- `src/systems/player/PlayerRespawnManager.ts`

### 2. Feature Completeness Drift Around `AnimalSystem`

Severity: High

What docs say:
- `docs/blocks/world.md` documents `AnimalSystem` as a live world module.
- `docs/PLAN_STATE.md`, `AGENTS.md`, and `CLAUDE.md` describe ambient wildlife as implemented and live.
- `docs/blocks/core.md` includes `AnimalSystem` in its boot sequence narrative.

What code says:
- No `AnimalSystem` symbol or source file was found under `src` during this audit.
- No exact `class AnimalSystem` or `export class AnimalSystem` match was found.

Why it matters:
- This is not a naming difference. It appears to overstate shipped functionality or preserve stale implementation history as if it were current.
- This should be reconciled before using the docs as a feature-completeness reference.

Important note:
- This report does not prove wildlife behavior is absent at runtime. It does show that the named implementation the docs point to does not exist in current source under `src`.

Key references:
- `docs/blocks/world.md`
- `docs/PLAN_STATE.md`
- `docs/blocks/core.md`
- `AGENTS.md`
- `CLAUDE.md`

### 3. Toolchain And Test-Environment Drift

Severity: Medium

What docs say:
- `README.md` and `AGENTS.md` still say Three.js r182 and Vite 7.3.
- `AGENTS.md` says Vitest uses `jsdom`.

What code says:
- `package.json` declares `three` `^0.183.0`.
- `package.json` declares `vite` `^8.0.0`.
- `vitest.config.ts` uses `environment: 'node'`.

Why it matters:
- Wrong toolchain facts create setup confusion and bad assumptions for test behavior.
- The Vitest environment mismatch is especially important for anyone adding UI tests.

Key references:
- `README.md`
- `AGENTS.md`
- `package.json`
- `vitest.config.ts`

### 4. Deployment Target And Base-Path Drift

Severity: Medium

What docs say:
- `README.md` points to GitHub Pages as the live play URL.

What code/config/runbooks say:
- `vite.config.js` uses `base: '/'`.
- `docs/DEPLOYMENT_VALIDATION.md` says deployment is to Cloudflare Pages at `terror-in-the-jungle.pages.dev`.
- `docs/DEPLOYMENT_VALIDATION.md` explicitly notes the base changed from `/terror-in-the-jungle/` to `/`.

Why it matters:
- This is an operational truth mismatch, not just wording drift.
- It affects smoke tests, deployment assumptions, and player-facing links.

Key references:
- `README.md`
- `vite.config.js`
- `docs/DEPLOYMENT_VALIDATION.md`

### 5. Active Docs Still Point At Archived Docs

Severity: Medium

What docs say:
- `docs/NEXT_WORK.md` still instructs the reader to update `ACTIVE_GAME_MODES_HANDOFF.md` and `GAME_MODES_EXECUTION_PLAN.md`.

What archive policy says:
- `docs/archive/README.md` explicitly says both docs were archived and superseded.

Why it matters:
- The current operational checklist still points to retired material.
- This undermines confidence in `NEXT_WORK.md` as the active queue.

Key references:
- `docs/NEXT_WORK.md`
- `docs/archive/README.md`

### 6. Volatile Metrics Are Duplicated Across Too Many Docs

Severity: Medium

Observed pattern:
- Test counts, file counts, bundle sizes, system counts, and milestone numbers are embedded in `AGENTS.md`, `PLAN_STATE.md`, `CLAUDE.md`, `DEPLOYMENT_VALIDATION.md`, and `CODEBASE_BLOCKS.md`.

Why it matters:
- These values decay immediately.
- They already disagree across docs.
- This creates maintenance work without adding durable architectural value.

Examples:
- test totals vary across `CLAUDE.md`, `PLAN_STATE.md`, and `DEPLOYMENT_VALIDATION.md`
- system/file/widget counts vary across `AGENTS.md`, `CODEBASE_BLOCKS.md`, and block docs
- bundle-size snapshots appear in multiple places

### 7. Backward-Compatible Naming In Code Is A Drift Amplifier

Severity: Medium

Observed pattern:
- `GameUI` calls itself a drop-in replacement for `StartScreen`.
- `DeployScreen` exposes the same API as old `RespawnUI`.
- `CrosshairSystem` still exposes a backward-compatible surface for `CrosshairUI`.
- `GameEngine` still uses the field name `loadingScreen` for `GameUI`.

Why it matters:
- The compatibility layer is useful in code, but it encourages docs to preserve old names as if they are current entities.
- This is a root-cause multiplier for future drift.

Key references:
- `src/ui/screens/GameUI.ts`
- `src/ui/screens/DeployScreen.ts`
- `src/ui/hud/CrosshairSystem.ts`
- `src/core/GameEngine.ts`

## Nuances And Non-Issues

Not every apparent mismatch is real drift.

Examples:
- `docs/README.md` says the HUD has 30 widgets while some docs mention an 18-region HUD grid. These can both be true: one describes widget/module count, the other describes layout slots.
- Human-readable "TDM" vs internal/script-facing `team_deathmatch` vs game-mode id `tdm` is mostly a naming-layer issue, not necessarily a documentation error.

These should still be clarified for readability, but they are not the same class of problem as deleted-file references or wrong deployment facts.

## Redundancy Clusters

### Cluster 1: Project Orientation

Files:
- `README.md`
- `AGENTS.md`
- `CLAUDE.md`

Assessment:
- Too much overlap in commands, project pitch, and current-state prose.
- `README.md` should be the only general quickstart.
- `AGENTS.md` should be agent-specific and minimal if kept.
- `CLAUDE.md` reads more like a dated changelog than a canonical reference.

### Cluster 2: Architecture Overview

Files:
- `AGENTS.md`
- `CLAUDE.md`
- `docs/CODEBASE_BLOCKS.md`
- `docs/blocks/*.md`

Assessment:
- The block-map family is the best long-term architecture shape.
- `AGENTS.md` and `CLAUDE.md` duplicate high-level architecture summaries with more drift risk and less structure.

### Cluster 3: Current State / What To Work On

Files:
- `docs/NEXT_WORK.md`
- `docs/PLAN_STATE.md`
- `CLAUDE.md`

Assessment:
- These should have clearly different roles but currently bleed into each other.
- `NEXT_WORK.md` should be the ordered queue only.
- `PLAN_STATE.md` should be debt/backlog only.
- `CLAUDE.md` should be changelog/history only if retained.

### Cluster 4: Performance Story

Files:
- `docs/ARCHITECTURE_RECOVERY_PLAN.md`
- `docs/PERF_FRONTIER.md`
- `docs/PROFILING_HARNESS.md`
- perf-heavy sections in `CLAUDE.md` and `NEXT_WORK.md`

Assessment:
- `PROFILING_HARNESS.md` is operationally high-signal.
- `ARCHITECTURE_RECOVERY_PLAN.md` is useful as a decision log.
- `PERF_FRONTIER.md` is less authoritative than the first two.
- Perf narratives repeated in `CLAUDE.md` and `NEXT_WORK.md` create churn.

### Cluster 5: Asset Catalogs

Files:
- `docs/ASSET_MANIFEST.md`
- `deploy-3d-assets/README.md`
- `public/assets/ui/icons/MANIFEST.md`
- `docs/UI_ICON_MANIFEST.md`

Assessment:
- Specialized manifests are fine, but they should not double as general codebase-state docs.
- `docs/UI_ICON_MANIFEST.md` already behaves like a canonical manifest.
- `public/assets/ui/icons/MANIFEST.md` is appropriately just a pointer.

## Signal Assessment

### High-Signal Docs To Keep

| File | Current Value | Recommendation |
|---|---|---|
| `docs/README.md` | Strong docs index and maintenance rules | Keep as entry point |
| `docs/CODEBASE_BLOCKS.md` | Best architecture hub shape | Keep and refresh |
| `docs/blocks/*.md` | Best domain-by-domain structure | Keep, but refresh `core`, `ui`, `player`, `world` first |
| `docs/PROFILING_HARNESS.md` | Strong operational runbook | Keep as canonical perf commands doc |
| `docs/DEPLOYMENT_VALIDATION.md` | Strong operational release runbook | Keep as canonical deploy gate doc |
| `docs/ARCHITECTURE_RECOVERY_PLAN.md` | Useful decision/risk log | Keep, but trim stale historical assertions over time |
| `docs/NEXT_WORK.md` | Clear ordered checklist shape | Keep after removing archived refs |
| `docs/PLAN_STATE.md` | Useful backlog/debt board | Keep after trimming volatile metrics |
| `docs/UI_ICON_MANIFEST.md` | Good specialized manifest | Keep |
| `deploy-3d-assets/README.md` | Good specialized asset catalog | Keep |

### Medium-Signal Docs To Narrow

| File | Current Value | Recommendation |
|---|---|---|
| `README.md` | Useful quickstart, currently stale in places | Keep, but slim and refresh facts |
| `docs/ROADMAP.md` | Useful as aspirational direction | Keep clearly aspirational |
| `docs/PERF_FRONTIER.md` | Historical analysis value | Keep as analysis, not source of truth |
| `docs/ASSET_MANIFEST.md` | Specialized backlog value | Keep specialized; do not use as architecture truth |

### Low-Signal Or Historical Docs

| File | Current Value | Recommendation |
|---|---|---|
| `AGENTS.md` | Mixed agent guidance plus stale architecture/state summary | Shrink drastically or archive |
| `CLAUDE.md` | High historical signal, low reference reliability | Recast as changelog or archive |
| `progress.md` | Session narrative | Archive or ignore for active reference |
| `docs/archive/*` | Historical by design | Keep archived |

## Root Causes Of Drift

- Too many documents attempt to be canonical at once.
- Backward-compatible naming in code makes old concepts easy to re-document.
- Volatile numbers are embedded manually in too many places.
- Active work docs are not aggressively pruning superseded references.
- There is no strict one-doc-per-concern ownership model.

## Recommended Target Documentation Model

### Canonical Docs By Concern

1. `README.md`
   - Purpose: project pitch, prerequisites, quickstart, top-level commands, live URL

2. `docs/README.md`
   - Purpose: docs index and maintenance rules

3. `docs/CODEBASE_BLOCKS.md` plus `docs/blocks/*.md`
   - Purpose: architecture source of truth

4. `docs/NEXT_WORK.md`
   - Purpose: ordered active work queue only

5. `docs/PLAN_STATE.md`
   - Purpose: longer-horizon debt and backlog only

6. `docs/ARCHITECTURE_RECOVERY_PLAN.md`
   - Purpose: accepted architecture/perf decisions and open risks

7. `docs/PROFILING_HARNESS.md`
   - Purpose: perf commands and artifact contract

8. `docs/DEPLOYMENT_VALIDATION.md`
   - Purpose: release/deploy runbook

9. Specialized manifests
   - Purpose: assets/icons/data references only

10. Historical logs
   - Purpose: `CLAUDE.md`, `progress.md`, and archive docs if retained

### Rule Of Thumb

If a fact changes often, it should either:
- live in one place only, or
- be generated, or
- be removed from prose entirely.

## Prioritized Cleanup Plan

### Phase 1: Fix Factual Drift

- Refresh `README.md` to align toolchain facts, deployment URL, and current platform assumptions.
- Refresh `docs/blocks/core.md`, `docs/blocks/ui.md`, `docs/blocks/player.md`, and `docs/blocks/world.md`.
- Remove or reconcile all `AnimalSystem` claims.
- Remove archived-doc references from `docs/NEXT_WORK.md`.
- Remove dead `LoadoutSelector` references from docs.

### Phase 2: Collapse Redundant "Current State" Narratives

- Slim `AGENTS.md` down to agent-only guidance plus links out.
- Recast `CLAUDE.md` as a changelog/history file instead of a reference file.
- Remove duplicated counts, totals, and bundle-size snapshots from docs unless they are the main purpose of the doc.

### Phase 3: Establish Maintenance Discipline

- Treat `docs/README.md` as the single source for docs navigation.
- Require that any system rename or UI architecture change update the relevant `blocks/*.md` docs immediately.
- Keep only one "active work" document and one "decision log" document.
- Move volatile counts into generated artifacts or remove them from docs.

## Suggested Refresh Order

Fastest path to a trustworthy docs set:

1. `README.md`
2. `docs/NEXT_WORK.md`
3. `docs/blocks/ui.md`
4. `docs/blocks/player.md`
5. `docs/blocks/core.md`
6. `docs/blocks/world.md`
7. `AGENTS.md`
8. `CLAUDE.md`

## Appendix A: Code-Derived Ground Truth Statements

- The app is a browser game built with Vite, TypeScript, and Three.js.
- The runtime entry path is `index.html` -> `src/main.ts` -> `src/core/bootstrap.ts`.
- `GameEngine` owns `GameUI`, `GameRenderer`, and `SystemManager`.
- `GameUI` is the current screen state machine.
- `DeployScreen` is the current deploy/respawn surface used by `PlayerRespawnManager`.
- `CrosshairSystem` is the current crosshair implementation.
- The five current mode ids are `zone_control`, `open_frontier`, `tdm`, `ai_sandbox`, and `a_shau_valley`.
- `vite.config.js` uses `base: '/'`.
- `vitest.config.ts` uses the `node` environment.
- Navmesh route guidance in NPC movement is still intentionally disabled pending validation.

## Appendix B: Confidence Notes

High confidence:
- UI/deploy architecture drift
- toolchain/test-environment drift
- deployment/base-path drift
- archived-doc references in active docs

Medium confidence pending explicit product-owner confirmation:
- `AnimalSystem` documentation drift as a shipped-feature overstatement

Reason for the caveat:
- The docs name a concrete system that does not exist in current `src`, but this report did not run the game to prove the feature is absent in all forms.
