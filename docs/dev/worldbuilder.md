# WorldBuilder Console

Last verified: 2026-05-09

The WorldBuilder is a dev-only browser console for testing the running game in
isolation. It consolidates god-mode, system on/off toggles, debug-viz routing,
and scenario-isolation controls into one Tweakpane panel that sits next to the
existing `LiveTuningPanel`.

It was added in `cycle-2026-05-09-phase-0-foundation` as part of the
realignment plan
(`C:/Users/Mattm/.claude/plans/can-we-make-a-lexical-mitten.md`).

## TL;DR

- **Hotkey**: `Shift+G`
- **Build gating**: only present when `import.meta.env.DEV`. Tweakpane is
  lazy-imported so retail bundles carry zero WorldBuilder bytes.
- **State persists** to `localStorage` under `worldBuilder.state.v1`.
- **State is published** on `window.__worldBuilder` so engine systems can
  consult it.
- **File**: [src/dev/worldBuilder/WorldBuilderConsole.ts](../../src/dev/worldBuilder/WorldBuilderConsole.ts)
- **Tests**: [src/dev/worldBuilder/WorldBuilderConsole.test.ts](../../src/dev/worldBuilder/WorldBuilderConsole.test.ts)

## Hotkey map

| Existing | New |
|----------|-----|
| `` ` `` (backtick) — master debug HUD toggle | (unchanged) |
| `\` — LiveTuningPanel (Tweakpane) | (unchanged) |
| `Shift+\` — six-overlay debugger | (unchanged) |
| V/B — free-fly camera + entity inspector | (unchanged) |
| F9 — playtest capture | (unchanged) |
| **`Shift+G` — WorldBuilder console** | **new** |

## Folders

### 1. God Mode

Per-flag toggles that publish to `window.__worldBuilder` so engine systems can
consult them. **Most flags are not yet wired into the engine** — see the
"Engine wiring status" table below.

| Toggle | Effective today? | Engine consumer to add (Phase 1 follow-up) |
|---|---|---|
| Invulnerable | no | `PlayerHealthSystem.takeDamage()` should early-return when active |
| Infinite ammo | no | `FirstPersonWeapon.tryFire()` / `AmmoManager.consume()` should skip decrement |
| No-clip | no | `PlayerMovement` should skip terrain collision and gravity |
| One-shot kills | no | `WeaponShotExecutor` damage application |
| **Heal & Refill** (button) | best-effort | calls `playerHealth.reset/revive`, `ammoManager.refillAll/setReserveFull`, `firstPersonWeapon.reload` if those methods exist on the system surfaces today |

These are intentionally not wired in Phase 0 — wiring is real game-code that
should ride through a normal cycle, not a foundation cycle. The flags exist
and persist so the next cycle's tasks can wire them up systematically.

### 2. System Toggles

| Toggle | Effective today? | How |
|---|---|---|
| Shadows | yes | `engine.renderer.renderer.shadowMap.enabled` |
| Post-process | flag-only | (Phase 1 wiring) PostProcessingManager.setEnabled |
| HUD visible | yes | toggles `[data-hud-root]` elements via DOM `display` |
| Ambient audio | flag-only | (Phase 1 wiring) AudioManager.setAmbientGain |

### 3. Debug Viz

Re-routes to existing overlays via the `DebugHudRegistry.togglePanel()` API.
No state of its own.

- Performance Overlay
- Frame Budget
- Combat State
- Vehicle State
- Entity Inspector
- Time Control

### 4. Isolation

| Control | Effective today? | How |
|---|---|---|
| NPC tick paused | yes (engine-wide) | `engine.timeScale.pause()` / `resume()` |
| Force time-of-day | flag-only | (Phase 1 wiring) AtmosphereSystem.setSimulationTime |
| **Pause All** button | yes | engine.timeScale.pause() |
| **Resume** button | yes | engine.timeScale.resume() |
| **Step One Frame** button | yes | engine.timeScale.stepOneFrame() |
| **Reset to defaults** button | yes | resets all toggles + clears localStorage |

## Engine wiring status

Phase 0 ships the WorldBuilder UI and the `window.__worldBuilder` global.
Phase 1 wires the per-system consumers. Each consumer is a 1-3 line check
guarded behind `import.meta.env.DEV` so retail builds carry no overhead.

The recommended consumer pattern:

```ts
import { isWorldBuilderFlagActive } from 'src/dev/worldBuilder/WorldBuilderConsole';

// In PlayerHealthSystem.takeDamage:
takeDamage(amount: number, ...): boolean {
  if (import.meta.env.DEV && isWorldBuilderFlagActive('invulnerable')) {
    return false;
  }
  // existing damage flow…
}
```

This pattern keeps the WorldBuilder a one-way dependency: the dev tool
reads engine state, the engine optionally reads dev-tool state. The fence
interfaces in `src/types/SystemInterfaces.ts` are not affected.

## Why a separate panel from LiveTuningPanel?

`LiveTuningPanel` is bound to runtime tuning **knobs**: dimensionless numeric
values that map to atmosphere/weather/combat-tuning constants. Its callers
expect persistence as part of a tuning preset, named save/load, JSON export.

The WorldBuilder is bound to **state flags + commands**: invulnerable yes/no,
HUD on/off, "step one frame" button. Mixing them would muddy both surfaces.
They share the same `DebugHudRegistry` and Tweakpane runtime; that's the right
amount of reuse.

## Programmatic API

Two helpers exposed for engine consumers:

```ts
// Returns the currently-published state, or undefined if not registered.
getWorldBuilderState(): WorldBuilderState | undefined;

// Cheap boolean check for the four god-mode flags.
isWorldBuilderFlagActive(flag): boolean;
```

In tests / scripts, the panel itself can be instantiated against a mock engine
and driven via `panel.applyState({...})`. See
[WorldBuilderConsole.test.ts](../../src/dev/worldBuilder/WorldBuilderConsole.test.ts)
for the mock pattern.

## What this is NOT

- **Not for retail.** Lazy import + DEV gate. Verify with
  `npm run build && grep -r 'WorldBuilder' dist/` — should return zero hits.
- **Not a save-state tool.** Use the existing F9 playtest capture for that.
- **Not a replacement for the playtest checklist.** Manual playtesting per
  `docs/PLAYTEST_CHECKLIST.md` is still the gate for game-feel.
- **Not a way to bypass perf gates.** `combat120` perf compare is unaffected.

## Verifying it loads

```bash
npm run dev
# Open http://localhost:5173, start any game mode, press Shift+G.
# The panel should appear at top-right, to the left of LiveTuningPanel.
# Open DevTools console:
> window.__worldBuilder
< { invulnerable: false, infiniteAmmo: false, ..., active: true }
```

## Phase 1 follow-ups (next cycle)

Each lives in its own task brief / PR; do not bundle into Phase 0.

- `worldbuilder-invulnerable-wiring` — `PlayerHealthSystem.takeDamage` skip when flag active.
- `worldbuilder-infinite-ammo-wiring` — `AmmoManager` / weapon-fire path skip decrement.
- `worldbuilder-noclip-wiring` — `PlayerMovement` collision + gravity skip.
- `worldbuilder-postprocess-wiring` — `PostProcessingManager.setEnabled`.
- `worldbuilder-tod-wiring` — atmosphere force time-of-day.
- `worldbuilder-ambient-audio-wiring` — `AudioManager.setAmbientGain`.

These are tracked in [docs/CARRY_OVERS.md](../CARRY_OVERS.md) under the
`worldbuilder-wiring` family. The carry-over count grows by 6 to capture
this — that's allowed during Phase 0 because the Phase 0 cycle is the
foundation cycle and carry-over discipline starts in Phase 1.
