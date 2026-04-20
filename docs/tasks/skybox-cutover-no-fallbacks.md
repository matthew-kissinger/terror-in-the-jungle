# skybox-cutover-no-fallbacks: delete legacy Skybox.ts + PNG + NullSkyBackend

**Slug:** `skybox-cutover-no-fallbacks`
**Cycle:** `cycle-2026-04-21-atmosphere-polish-and-fixes`
**Priority:** P1 — explicit user preference: "we do not want any fallbacks if possible".
**Playtest required:** YES (visual smoke that all 5 scenarios still boot to a sky).
**Estimated risk:** medium — removes init-order safety net; need to confirm AtmosphereSystem applies a preset before any scene render.
**Budget:** ≤ 250 LOC (mostly deletion + small wiring change).
**Files touched:**

- Delete: `src/systems/environment/Skybox.ts`, `src/systems/environment/atmosphere/NullSkyBackend.ts`, `public/assets/skybox.png` (also the dist copies).
- Modified: `src/core/GameEngineInit.ts` (remove the `skybox` PNG asset entry); `src/systems/environment/AtmosphereSystem.ts` (constructor defaults to `HosekWilkieSkyBackend` with `combat120` preset; no NullSkyBackend fallback); any callers of `Skybox` or `NullSkyBackend` (search and remove).

Do NOT touch: `HosekWilkieSkyBackend.ts` itself (it's the new authority).

## Why this task exists

User direction at cycle-2026-04-20 close-out: "we do not want any fallbacks if possible." Currently the codebase has THREE atmosphere fallback layers:

1. `Skybox.ts` — legacy 500-unit equirect sphere with the dark stormy PNG. PR #102 added a deprecation `console.warn` but kept the file. It's still constructed; the PNG load is gated only when `AtmosphereSystem.ownsSkyDome()` returns true.
2. `NullSkyBackend.ts` — `AtmosphereSystem` constructs with this as default; only swaps to Hosek/Preetham when `applyScenarioPreset()` runs at scenario boot. So the very first frames render a constant-color sky.
3. The `Skybox.png` asset under `public/assets/` (and `dist/assets/`, `dist-perf/assets/`).

This task removes all three. `AtmosphereSystem` becomes single-authority, with the analytic Hosek/Preetham backend live from construction.

## Required reading first

- `src/systems/environment/Skybox.ts` (full file).
- `src/systems/environment/AtmosphereSystem.ts` constructor + `applyScenarioPreset` + `ownsSkyDome`.
- `src/systems/environment/atmosphere/NullSkyBackend.ts` — what constants does it return? They become the HosekWilkieSkyBackend's bootstrap defaults.
- `src/core/GameEngineInit.ts` — where the `skybox` PNG asset is referenced.
- Search: `Grep "Skybox" src/`, `Grep "NullSkyBackend" src/`. Confirm callers.

## Target state

1. `AtmosphereSystem` constructor instantiates `HosekWilkieSkyBackend` directly (no parameter overload that defaults to `NullSkyBackend`). Applies a sane default preset (combat120 noon) immediately, so the first rendered frame already has a real sky.
2. `Skybox.ts` deleted. All callers updated.
3. `NullSkyBackend.ts` deleted. Tests updated to use `HosekWilkieSkyBackend` directly with a noon preset.
4. `skybox.png` deleted from `public/assets/`. Dist copies cleaned.
5. `GameEngineInit.ts` no longer references the skybox asset.
6. The `applyScenarioPreset` call still runs at scenario boot to switch from the bootstrap preset to the real per-scenario one.

## Steps

1. Read all of "Required reading first."
2. Delete `Skybox.ts`. Compile; fix import errors at all caller sites.
3. Change `AtmosphereSystem` constructor to: `this.backend = new HosekWilkieSkyBackend(); this.applyScenarioPreset('combat120');` (or a dedicated default). Remove the `backend?: ISkyBackend` parameter.
4. Delete `NullSkyBackend.ts`. Update tests.
5. Delete `public/assets/skybox.png` and remove the asset entry in `GameEngineInit.ts`.
6. `npm run validate:fast` green; `npm run build` green.
7. Boot `npm run dev`, switch through all 5 scenarios. Confirm each shows a real analytic sky immediately on boot.

## Screenshot evidence (required for merge)

Commit PNGs to `docs/cycles/cycle-2026-04-21-atmosphere-polish-and-fixes/screenshots/skybox-cutover-no-fallbacks/`:

- One shot per scenario at scenario-load time (within ~1 s of boot). Confirms no transient flat-color sky exists during boot.

## Exit criteria

- `Skybox.ts`, `NullSkyBackend.ts`, `public/assets/skybox.png` all deleted.
- `AtmosphereSystem` always renders the analytic dome from construction onward.
- `applyScenarioPreset(<scenario>)` still runs at scenario boot and produces the per-scenario look.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- No console warning about deprecated `Skybox` (because the file is gone).

## Non-goals

- Do not fold `HosekWilkieSkyBackend` into `AtmosphereSystem` (they stay separate; backend swap remains a v2 affordance).
- Do not change the scenario-preset shape.
- Do not address tone-mapping or fog density (separate tasks).

## Hard stops

- Fence change → STOP.
- Removing `Skybox.ts` breaks any test mocking `Skybox` directly → fix the test, do not restore the file.
- A scenario shows a black or magenta sky during boot → STOP and add the bootstrap preset properly.
