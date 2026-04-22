# debug-hud-registry: unify F1-F4 debug overlays under a registry with a master toggle

**Slug:** `debug-hud-registry`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 1
**Priority:** P0 — foundation for the cycle's remaining work and future debug panels.
**Playtest required:** NO (behavior tests + manual confirmation in dev server).
**Estimated risk:** low — additive wrapper around existing overlays; F1-F4 behavior preserved.
**Budget:** ≤400 LOC.
**Files touched:**

- Create: `src/ui/debug/DebugHudRegistry.ts` (registry + master toggle container).
- Create: `src/ui/debug/panels/VehicleStatePanel.ts` (current vehicle type, id, position, velocity, altitude AGL).
- Create: `src/ui/debug/panels/CombatStatePanel.ts` (active combatant count per faction, AI budget per tick, stall-backtrack count).
- Create: `src/ui/debug/panels/CurrentModePanel.ts` (GameMode enum, scenario name, weather state, TOD).
- Create: `src/ui/debug/panels/FrameBudgetPanel.ts` (per-system deltaMs breakdown — sourced from SystemUpdater's per-system telemetry markers).
- Modify: `src/core/GameEngine.ts` (instantiate registry instead of three independent overlays).
- Modify: `src/core/GameEngineInput.ts` (add backtick toggle; preserve F1-F4 routes to registry-addressed panels).
- Modify: `src/ui/debug/PerformanceOverlay.ts` + `TimeIndicator.ts` + `LogOverlay.ts` (adopt a shared `DebugPanel` interface — add one `register()` call, remove the self-mount-to-body step).
- Add: `src/ui/debug/DebugHudRegistry.test.ts` (registry register/unregister/toggle behavior).

## Required reading first

- `src/ui/debug/PerformanceOverlay.ts` — largest existing overlay, template for the `DebugPanel` interface.
- `src/ui/debug/TimeIndicator.ts` — smallest existing overlay.
- `src/ui/debug/LogOverlay.ts` — streaming overlay.
- `src/core/GameEngineInput.ts:28-45` — F1-F4 handler chain; the backtick toggle goes here.
- `src/core/GameEngine.ts` — where the three overlays are instantiated today (grep for `PerformanceOverlay`).

## Diagnosis

Three `HTMLDivElement`-backed overlays mount directly to `document.body` in the `GameEngine` constructor. Each has its own `toggle()` method, independent position in the DOM, and independent keybind. Adding a fourth overlay today means: (1) write the overlay class, (2) mount it in `GameEngine`, (3) add a keybind in `GameEngineInput`, (4) memorize a new key. This friction is real — the combat system has no panel, the vehicle/airframe has no panel, the current GameMode has no panel. All three exist as data already; none have a UI surface.

## Fix

### 1. Define a `DebugPanel` interface

```ts
export interface DebugPanel {
  id: string;             // stable ID, e.g., 'performance', 'time', 'log', 'vehicle-state'
  label: string;          // human-readable label for the master-toggle menu
  defaultVisible: boolean;
  defaultHotkey?: string; // e.g., 'F1'; optional
  mount(container: HTMLElement): void;
  unmount(): void;
  update?(dt: number): void;
  setVisible(visible: boolean): void;
}
```

### 2. Build `DebugHudRegistry`

- Single `<div id="debug-hud">` container mounted once on `document.body`.
- `register(panel: DebugPanel)` → panel's `mount()` receives its own sub-container inside the master.
- `toggleAll()` shows/hides all registered panels in one go (bound to backtick `` ` ``).
- `togglePanel(id)` shows/hides a single panel (used by F1-F4 handlers).
- `update(dt)` dispatches to each panel's optional `update(dt)` each frame.

### 3. Adapt existing overlays

Each of the three existing overlays gets a one-time conversion:
- Implement `DebugPanel`.
- Remove their current `document.body.appendChild` — the registry handles mounting.
- Keep their visual layout and position via CSS on the sub-container.

### 4. New panels

Four thin panels seeded so the registry has non-trivial use. **Accessors verified against master (HEAD `40ddfac`):**

- **VehicleStatePanel** — read vehicle state via:
  - `engine.systemManager.playerController.vehicleStateManager.getVehicleType()` (returns `'fixed_wing' | 'helicopter' | null`; see `src/systems/vehicle/VehicleStateManager.ts:36`)
  - `engine.systemManager.playerController.vehicleStateManager.getVehicleId()` (`src/systems/vehicle/VehicleStateManager.ts:40`)
  - Full vehicle via `engine.systemManager.vehicleManager.getVehicle(vehicleId)` → `IVehicle` (position + velocity + heading on the interface; see `src/systems/vehicle/VehicleManager.ts:28`)
  - If type is null, show "on-foot" and read player pose from `playerController.getPosition()`.
  - Update at 10Hz (every ~6 frames) to save DOM writes.
- **CombatStatePanel** — preferred accessor path:
  - BLUFOR/OPFOR counts via `engine.systemManager.combatantSystem.getCombatantCount(faction)` if such an accessor exists — grep `combatantSystem\.get` and `class CombatantSystem` to confirm. If missing, a ≤20-line read-only helper on `CombatantSystem` is acceptable scope (does NOT count as editing `src/systems/combat/**` in a non-trivial way — it's an additive read surface).
  - If no plausible accessor exists even with the helper, render `—` placeholders and leave a `TODO(cycle-2026-04-24)` comment. Do NOT block the cycle.
  - AI budget starvation counter: `engine.systemManager.combatantSystem.getAIBudgetStarvationPerSecond?.()` or equivalent — grep the symbol and wire if present.
- **CurrentModePanel** — read via `engine.systemManager.gameModeManager.getCurrentMode()` (returns `GameMode` enum; confirmed used at `bootstrap.ts:144` and `GameEngineInit.ts:95`). Human-readable label via `getGameModeDefinition(mode).name` (see `src/config/gameModeDefinitions.ts`). Weather via `engine.systemManager.weatherSystem.getCurrentState()`; TOD via `engine.systemManager.atmosphereSystem.getCurrentTimeOfDay()` (grep to confirm exact names if different).
- **FrameBudgetPanel** — per-system `deltaMs` breakdown. Source: `src/core/SystemUpdater.ts` already emits per-system telemetry markers (grep `markSystemBegin`, `markSystemEnd`). Surface them on a read-only accessor and render a sortable list of `<systemName>: <deltaMs>` with a color-coded bar. Updates at 5Hz. If SystemUpdater does not expose a read accessor today, add a ≤20-LOC additive getter.

### 5. Master toggle

Backtick (`` ` ``) toggles the master container. F1-F4 still toggle their specific panels (registry.togglePanel('performance')). New panels added later have no default keybind — they're visible when the master is on; hidden otherwise.

## Steps

1. Read all of "Required reading first."
2. Sketch the `DebugPanel` interface; validate against what each existing overlay needs.
3. Build `DebugHudRegistry` with tests (register/unregister/toggle/master-toggle).
4. Adapt the three existing overlays to `DebugPanel`. Verify F1-F4 still work manually (dev server).
5. Add `VehicleStatePanel`, `CombatStatePanel`, `CurrentModePanel`. Each ≤100 LOC.
6. Wire backtick toggle in `GameEngineInput.ts`.
7. Verify `npm run lint`, `npm run test:run`, `npm run build`.
8. Run `npm run dev`, confirm: F1 toggles perf, F2 toggles runtime-stats, F3 toggles log, F4 toggles time, backtick toggles all. New panels visible when master is on.

## Exit criteria

- `DebugHudRegistry` + `DebugPanel` interface exist and are unit-tested.
- Three existing overlays migrated to the interface; F1-F4 behavior unchanged.
- Four new panels (`VehicleStatePanel`, `CombatStatePanel`, `CurrentModePanel`, `FrameBudgetPanel`) register and display real data.
- Backtick master toggle shows/hides the whole debug surface.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- At least one screenshot of the new panels visible in `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/debug-hud-registry/` showing the combined HUD at runtime.

## Non-goals

- Do not change the visual layout of `PerformanceOverlay` / `TimeIndicator` / `LogOverlay` — adopt the interface but preserve the current look.
- Do not add per-panel persistence (open/closed state saved across sessions). That's a polish follow-up.
- Do not add a hamburger menu or panel reorder UI. The backtick master toggle is the only UX surface this cycle.
- Do not touch `src/systems/combat/**` for anything other than a narrow additive read-only accessor (≤20 LOC) on an existing class. If a non-trivial refactor is needed, STOP and file a finding; CombatStatePanel renders `—` placeholders and a dedicated combat-reviewer-approved follow-up adds proper surface.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Combat read-only accessors require touching `src/systems/combat/**` in a non-trivial way → STOP, leave `CombatStatePanel` with a "TODO: wire once accessors land" placeholder that renders "—" for the unavailable fields.
- F1-F4 behavior regresses (any of the four no longer toggles its original overlay) → STOP, root-cause before pushing.

## Pairs with

None directly. R2 tasks can develop independently but can register panels against the registry as a fast-follow if they ship new dev surface.
