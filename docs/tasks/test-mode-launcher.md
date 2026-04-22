# test-mode-launcher: URL + menu launcher for test/sandbox scenarios

**Slug:** `test-mode-launcher`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P1 — pairs with `airfield-sandbox-mode`; this brief adds the launcher, that one adds the first concrete mode.
**Playtest required:** NO (URL-dispatch + menu-click behavior-verified).
**Estimated risk:** low — additive enum/config + conditional dev-menu entry.
**Budget:** ≤250 LOC.
**Files touched:**

- Modify: `src/config/gameModeTypes.ts` (add a `TestMode` enum OR extend `GameMode` enum with `AIRFIELD_SANDBOX` + `COMBAT_SANDBOX` stub; pick whichever is cleaner — document the choice in the PR body).
- Modify: `src/config/gameModeDefinitions.ts` (add stub `AIRFIELD_SANDBOX` definition that the sibling task `airfield-sandbox-mode` fills in; add stub `COMBAT_SANDBOX` with a TODO marker).
- Modify: `src/core/ModeStartupPreparer.ts` (accept the new mode values in `normalizeLaunchSelection`).
- Modify: `src/ui/screens/<main-menu-screen>` — add a dev-only "Test Modes" sub-menu. Gate visibility on a query param (`?dev=1`) or environment flag so it doesn't appear in production builds. Investigate the actual screen file via grep — likely `src/ui/screens/MainMenuScreen.ts` or similar.
- Add: behavior test asserting `?mode=airfield-sandbox` routes to the new definition.

## Required reading first

- `src/config/gameModeTypes.ts` — the `GameMode` enum + `GameLaunchSelection` type + `GameModeConfig` shape.
- `src/config/gameModeDefinitions.ts` — how current modes (combat120, ashau, etc.) define zones, terrainSeed, factionMix, respawnRules.
- `src/core/ModeStartupPreparer.ts` — `normalizeLaunchSelection()` and `prepareModeStartup()` call chain.
- `src/dev/flightTestMode.ts` — existing `?mode=flight-test` URL bypass (stays, do not touch).
- `src/dev/flightTestScene.ts` — the isolated-physics scene (stays, do not touch).
- The screen file that handles mode selection in the main menu — grep `GameMode.AI_SANDBOX` or `combat120` under `src/ui/screens/` to locate.

## Diagnosis

The `?mode=flight-test` path is an isolated-physics bypass — it does NOT use the normal `GameEngine → ModeStartupPreparer` path. For "full-engine test modes" (real terrain + real atmosphere + suppressed combat/objectives), we need mode entries that go through the normal launch flow but swap specific config (spawn location, director settings, objective-timer, etc.). Adding such a mode today means: new enum value + new `GameModeDefinition` + `normalizeLaunchSelection` case + main-menu entry. This task does the first three infrastructurally so that future test modes are single-file additions.

## Fix

### 1. Mode classification

Add an `isTestMode: boolean` field (default false) to `GameModeDefinition`. The sibling task will set `true` for `AIRFIELD_SANDBOX`. Consumers check this to know "skip the ticket-bleed timer", "skip tutorial prompts", etc.

### 2. URL routing

`main.ts` / `bootstrap.ts` already parse `?mode=<value>`. Confirm the full allowed set includes the new test-mode keys via mapping in the preparer. `?mode=flight-test` remains routed to `src/dev/flightTestScene.ts`; the new keys are routed to the normal boot with `GameMode.AIRFIELD_SANDBOX` etc.

### 3. Main-menu entry

A dev-only "Test Modes" section in the main menu. Gate: only visible if `?dev=1` query param is present OR `import.meta.env.MODE !== 'production'` (pick whichever is already conventional in the code — grep `import.meta.env` to see). Two entries:
- **Airfield Sandbox** — launches `AIRFIELD_SANDBOX`.
- **Combat Sandbox** _(coming soon)_ — disabled/greyed out until its content ships.

### 4. Stubs

`AIRFIELD_SANDBOX` definition: minimal viable stub. The sibling task fills in real zone config, faction mix, spawn point, etc. This task lands the enum + routing + greyed-out menu entry; sibling task fills in content.

`COMBAT_SANDBOX` definition: `// TODO(cycle-2026-04-23): fill in combat sandbox content in a follow-up cycle.` Definition exists but throws a clear "not yet implemented" message if launched.

## Steps

1. Read "Required reading first."
2. Grep for the current mode selector UI (e.g., `GameMode.AI_SANDBOX` references under `src/ui/`).
3. Add enum entries + stub definitions.
4. Extend `normalizeLaunchSelection()` + add URL routing.
5. Add the dev-gated main-menu section.
6. Behavior test: navigate to the game with `?mode=airfield-sandbox` and assert the `GameLaunchSelection` ends up with `mode === AIRFIELD_SANDBOX`. Navigate with `?mode=combat-sandbox` and assert the "not implemented" notice surfaces cleanly.
7. `npm run lint`, `npm run test:run`, `npm run build`.

## Exit criteria

- `?mode=airfield-sandbox` URL routes through the normal engine boot with the new mode.
- Dev-gated "Test Modes" submenu visible in dev mode only.
- `?mode=flight-test` UNCHANGED (still routes to the isolated scene).
- `?mode=combat-sandbox` routes cleanly to a "not yet implemented" notice (no crash).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Behavior test confirms URL routing for both new keys.

## Non-goals

- Do not implement the airfield-sandbox content — that's the sibling task.
- Do not implement the combat-sandbox content — that's a future cycle.
- Do not refactor `ModeStartupPreparer` beyond adding cases for the new enums.
- Do not add telemetry for test-mode launches. Not needed.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Mode selection turns out to flow through a channel I didn't anticipate (e.g., a lobby system) → STOP, file a finding, reduce scope to URL-only.

## Pairs with

- `airfield-sandbox-mode` (fills in the `AIRFIELD_SANDBOX` definition this brief stubs out).
- `playtest-capture-overlay` (independent R2 sibling).
