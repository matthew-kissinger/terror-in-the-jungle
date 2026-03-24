# Documentation Drift & Codebase Analysis

**Date:** March 22, 2026

This document contains an analysis of the current state of the project's documentation compared to the actual codebase, identifying areas of drift, redundancy, and high-signal content that should be preserved.

## 1. The Drift (Where Docs ≠ Code)

The most critical discrepancies between what the documentation claims and what the code actually does:

* **Tech Stack Versions:** `README.md`, `AGENTS.md`, and `CLAUDE.md` claim the project uses **Vite 7.3** and **Three.js r182**. However, `package.json` shows the project has upgraded to **Vite ^8.0.0** and **Three ^0.183.0**.
* **Boot Lifecycle & UI Components:** `docs/CODEBASE_BLOCKS.md` and inline comments in `src/core/GameEngine.ts` still reference a `StartScreen`. Furthermore, `docs/blocks/ui.md` lists a `LoadoutSelector`. **Neither of these exist in the codebase anymore.** The actual flow uses `GameUI`, `TitleScreen`, `ModeSelectScreen`, and `DeployScreen`.
* **Deployment & Base URLs:** The `README.md` points to a GitHub Pages URL, but `DEPLOYMENT_VALIDATION.md` and `CLAUDE.md` emphasize Cloudflare Pages. The `vite.config.js` is set to `base: '/'`, but `progress.md` documents a smoke test URL using `/terror-in-the-jungle/`, which is now broken/outdated.
* **System/Architecture Counts:** The documentation throws around conflicting numbers for game systems (e.g., "~23 subsystems", "~44 systems", "41 GameSystems"). The actual `SystemRegistry` and `SystemInitializer` have a much more nuanced initialization list that doesn't cleanly match any of these static numbers.
* **Project Metrics:** Test counts and file counts are drifting across files. `PLAN_STATE.md` claims 3,591 tests, while `NEXT_WORK.md` and `CLAUDE.md` claim 3,614+ or 3,621 tests.
* **Runtime Dependencies:** `AGENTS.md` refers to "signals", but the actual package is `@preact/signals-core`.

## 2. Redundancy & Structural Issues

The documentation has become poorly organized primarily due to overlapping responsibilities across multiple files:

* **`AGENTS.md` vs. `CLAUDE.md`:** There is massive overlap here regarding npm scripts, entry points, and the "documentation contract." `AGENTS.md` is frozen with older stats (dated March 10), while `CLAUDE.md` is more current (March 22) but duplicates a lot of the same baseline information.
* **Scattered "Current State":** If a developer wants to know "what are we working on right now?", they have to check four different places: `PLAN_STATE.md` (waves + health table), `NEXT_WORK.md` (tiered checklist), `CLAUDE.md` ("Current Focus"), and `progress.md` (session log).
* **Unclear Tiering:** Single-topic execution plans (like `EXECUTION_PLAN_2026_03_17.md`) sit at the root of `docs/` alongside active architecture docs. It is very difficult to tell what is a historical artifact vs. a living document without opening each one.
* **The Role of `progress.md`:** This file sits at the repo root and acts as a mix of a product design journal and release engineering notes. It collides heavily with the purpose of `PLAN_STATE.md` and `NEXT_WORK.md`.

## 3. High Signal / Usefulness (What to Keep)

Despite the drift, the documentation has excellent architectural bones. Here is the high-signal content that should be preserved as the "source of truth":

* **`docs/CODEBASE_BLOCKS.md` & `docs/blocks/*.md`:** This is incredibly valuable. The coupling heatmap, tick graph, and domain splits are great. It just needs a quick scrub to remove dead components (like `StartScreen` and `LoadoutSelector`) and a refresh from the `extract-block-map` script.
* **`docs/DEPLOYMENT_VALIDATION.md`:** Highly accurate and aligns perfectly with the current Vite/Smoke-test/CI setup.
* **`docs/UI_ICON_MANIFEST.md`:** A perfect, stable contract that matches `src/ui/icons/IconRegistry.ts` exactly (38 PNGs).
* **The Performance Trio:** `PROFILING_HARNESS.md`, `PERF_FRONTIER.md`, and `ARCHITECTURE_RECOVERY_PLAN.md` provide an excellent historical trail of architectural decisions and performance measurements.
* **`docs/README.md`:** The index/navigation hub is structurally sound and should remain the entry point for human developers.

## 4. Recommended Cleanup Steps

To resolve these issues without losing historical context, the following steps are recommended:

1. **Consolidate State:** Merge `NEXT_WORK.md`, `PLAN_STATE.md`, and the "Current Focus" of `CLAUDE.md` into a single, living backlog document.
2. **Archive Old Plans:** Move dated execution plans (like `EXECUTION_PLAN_2026_03_17.md` and `MOVEMENT_NAV_CHECKIN.md`) into `docs/archive/`.
3. **Fix the Drift:** Update the version numbers (Vite 8, Three 0.183), fix the deployment URL narrative, and scrub `StartScreen`/`LoadoutSelector` from the architecture docs and inline code comments.
4. **Clarify Agent Docs:** Strip `AGENTS.md` down to purely behavioral conventions and point it to `CLAUDE.md` or `docs/` for any volatile metrics or scripts.
5. **Repurpose `progress.md`:** Rename or scope this file strictly as a design/redesign journal, removing obsolete release engineering URLs.
