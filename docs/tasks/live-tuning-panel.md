# live-tuning-panel: Tweakpane-backed live parameter tweaker for flight / atmosphere / combat

**Slug:** `live-tuning-panel`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P0 — biggest playtest-leverage single task.
**Playtest required:** NO (behavior-testable via simulated value change + assertion on target state).
**Estimated risk:** low-medium — first non-Three runtime lib add; wrong knob wiring silently binds the wrong value. Dev-only gating contains blast radius.
**Budget:** ≤400 LOC.
**Files touched:**

- Modify: `package.json` — add `tweakpane` to `dependencies` (or `devDependencies` — both work since Vite tree-shakes; `dependencies` is conventional for runtime-imported libs that are DCE-gated). Version pin the latest stable at cycle open.
- Create: `src/ui/debug/LiveTuningPanel.ts` — the Tweakpane mount + binding layer.
- Create: `src/ui/debug/tuning/` directory with per-domain binding files:
  - `tuneAirframe.ts` — per-aircraft clamps + PD gain exposure.
  - `tuneCloud.ts` — per-scenario coverage + scale.
  - `tuneAtmosphere.ts` — fog density, TOD hour.
  - `tuneCombat.ts` — combat-mute toggle, NPC faction counts if live-settable.
  - `tuneWeather.ts` — weather state dropdown.
- Create: `src/ui/debug/LiveTuningPanel.test.ts` — behavior tests.
- Modify: `src/core/GameEngine.ts` — instantiate `LiveTuningPanel` when `import.meta.env.DEV` (gate).

## Required reading first

- [Tweakpane docs](https://tweakpane.github.io/docs/) (executor: skim "Getting Started" + "Inputs" + "Folders"; this is ~15 min reading).
- `src/systems/vehicle/airframe/Airframe.ts:345-349` — altitude-hold elevator clamp read site.
- `src/systems/vehicle/FixedWingConfigs.ts` — per-aircraft `altitudeHoldElevatorClamp` field (landed in cycle-2026-04-22-heap-and-polish).
- `src/systems/environment/atmosphere/CloudLayer.ts` + `atmosphere/ScenarioAtmospherePresets.ts` — cloud coverage + scale APIs.
- `src/systems/strategy/WarSimulator.ts:195 (isEnabled)` + `.setEnabled()` if present; if not, add a setter.
- `src/ui/debug/DebugHudRegistry.ts` (if shipped by `debug-hud-registry` sibling) — register as a `DebugPanel`; fallback to self-mount.

## Fix

### 1. Dev-only mount

```ts
// src/core/GameEngine.ts (roughly)
if (import.meta.env.DEV) {
  const { LiveTuningPanel } = await import('../ui/debug/LiveTuningPanel');
  this.liveTuningPanel = new LiveTuningPanel(this);
  this.liveTuningPanel.register(this.debugHudRegistry); // or self-mount fallback
}
```

Vite eliminates this in retail builds.

### 2. Curated first-pass knob set

Grouped folders in the panel. Each knob is `pane.addBinding(target, 'key', { min, max, step })`. Use Tweakpane's "bladeApi" pattern to hide the knob if the target is not available (e.g., no vehicle is active).

**Folder: Flight**
- A-1 Skyraider `altitudeHoldElevatorClamp` — 0.10 to 0.40, step 0.01
- F-4 Phantom `altitudeHoldElevatorClamp` — 0.10 to 0.30, step 0.01
- AC-47 Spooky `altitudeHoldElevatorClamp` — 0.10 to 0.30, step 0.01
- All three: expose `altitudeHoldPGain`, `altitudeHoldDGain`, `pitchDamperGain` if present on the config (grep `FixedWingConfigs.ts` for the relevant fields).

**Folder: Clouds**
- Per-scenario coverage (openfrontier / combat120 / ashau / zc / tdm) — 0.0 to 1.0, step 0.01
- Per-scenario `cloudScaleMetersPerFeature` — 400 to 2000, step 50
- Wind speed — 0 to 30 m/s, step 1
- Wind direction (degrees) — 0 to 359

**Folder: Atmosphere**
- Fog density multiplier — 0.0 to 3.0, step 0.05 (writes into `atmosphereSystem.setFogDensityMultiplier()` or similar)
- TOD hour — 0 to 24, step 0.25 (writes into `atmosphereSystem.setTimeOfDay()` or similar; check exact API)

**Folder: Combat**
- Combat mute toggle — writes `warSimulator.setEnabled(!muted)`. If `setEnabled` does not exist, add it as a ≤10 LOC additive setter on `WarSimulator`.
- BLUFOR faction count (live-settable?) — 0 to 200, step 1 (may not be live-settable; if not, render as read-only display of current count)
- OPFOR faction count — same.

**Folder: Weather**
- Weather state — dropdown (CLEAR / LIGHT_RAIN / HEAVY_RAIN / STORM). Writes `weatherSystem.forceState(state)`.

### 3. State persistence

- On every knob change, debounce (500ms) and write all current values to `localStorage.liveTuningPanel.state` as JSON.
- On boot, hydrate from localStorage if present.
- Expose `getState(): Record<string, any>` public method — this is what `playtest-capture-overlay` reads to bundle snapshot JSON.

### 4. Preset save/load

- "Save preset" button → prompts for preset name → writes `localStorage.liveTuningPanel.presets.<name>` = current state.
- "Load preset" dropdown → replays state into knobs.
- "Reset to defaults" button → reads defaults from config source files, not from localStorage.
- Presets export button: downloads JSON of all named presets for sharing.

### 5. Keybind

Bound to `\` (backslash, next to backtick). Toggles visibility. Do NOT bind to `Backquote` — that's the `debug-hud-registry` master toggle.

## Steps

1. Read "Required reading first" — especially Tweakpane docs.
2. `npm install tweakpane` (R0 prep may have done this already; verify).
3. Build `LiveTuningPanel` skeleton with ONE knob (A-1 clamp) wired end-to-end to prove the pattern.
4. Add all folder contents per the spec.
5. Implement persistence + presets.
6. Add behavior tests: simulate a knob change, assert target state (e.g., `FixedWingConfigs['A1_SKYRAIDER'].altitudeHoldElevatorClamp`) updated.
7. `npm run lint`, `npm run test:run`, `npm run build`.
8. Manual smoke: `npm run dev`, press `\`, drag A-1 clamp, fly A-1, confirm recapture behavior matches the knob.
9. Screenshot committed to `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/live-tuning-panel/` showing the panel open with values.

## Exit criteria

- Panel renders in dev mode via `\` toggle.
- All five folders populated with working knobs.
- localStorage persistence + preset save/load work across page reload.
- `getState()` exposes current values as a JSON-serializable dictionary (for `playtest-capture-overlay`).
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Retail build (`npm run build` output) contains zero Tweakpane code (verify via `grep tweakpane dist/assets/*.js` → empty).
- Evidence screenshot committed.

## Non-goals

- Do not wire knobs for everything — just the curated first-pass list. Further knobs added in future cycles as specific playtests reveal need.
- Do not build a fully generic "bind any config field" system. Manual per-domain bindings are clearer and safer.
- Do not persist presets server-side. localStorage + manual export/import is sufficient.
- Do not replace `SettingsModal` or any existing UI. This is an ADDITIVE dev surface.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- A required knob target turns out to be read-only at runtime (e.g., `FixedWingConfigs` is a frozen literal) → mark that knob as read-only display only, record in PR body, continue.
- Combat-mute toggle requires touching combat subsystem beyond a ≤20 LOC additive setter on `WarSimulator` → STOP, render combat-mute as read-only, file a finding for a combat-reviewer-gated follow-up.
- Tweakpane bundle size exceeds ~20KB gzipped in dev mode → unexpected; investigate before merging.

## Pairs with

- `debug-hud-registry` (soft dependency: this task registers its panel with the registry if it shipped; fallback is self-mount).
- `playtest-capture-overlay` (this task's `getState()` is read by the capture bundle).
