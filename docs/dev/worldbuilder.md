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
consult them. **All 6 named flags wired in Phase 1** ([PR #172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172)) behind
`import.meta.env.DEV` so retail builds dead-code-eliminate the wires.

| Toggle | Effective today? | Engine consumer |
|---|---|---|
| Invulnerable | yes | `PlayerHealthSystem.takeDamage()` early-returns when active |
| Infinite ammo | yes | `AmmoManager.consumeRound()` returns true without decrement when active |
| No-clip | yes | `PlayerMovement` skips terrain collision + gravity + boundary clamps when active |
| One-shot kills | not wired | open carry-over `worldbuilder-oneshotkills-wiring` (out-of-scope for Phase 1 brief) |
| **Heal & Refill** (button) | best-effort | calls `playerHealth.reset/revive`, `ammoManager.refillAll/setReserveFull`, `firstPersonWeapon.reload` if those methods exist on the system surfaces today |

### 2. System Toggles

| Toggle | Effective today? | How |
|---|---|---|
| Shadows | yes | `engine.renderer.renderer.shadowMap.enabled` |
| Post-process | yes | `PostProcessingManager.beginFrame/endFrame` consults `getWorldBuilderState()` (wired Phase 1) |
| HUD visible | yes | toggles `[data-hud-root]` elements via DOM `display` |
| Ambient audio | yes | `AudioManager.update` scales ambient gain to 0/1 on flag flip (wired Phase 1) |

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
| Force time-of-day | yes | `AtmosphereSystem.update` snaps `simulationTimeSeconds` to `forceTimeOfDay * dayLengthSeconds` when in [0,1] (wired Phase 1) |
| **Pause All** button | yes | engine.timeScale.pause() |
| **Resume** button | yes | engine.timeScale.resume() |
| **Step One Frame** button | yes | engine.timeScale.stepOneFrame() |
| **Reset to defaults** button | yes | resets all toggles + clears localStorage |

## Engine wiring status

Phase 0 shipped the WorldBuilder UI and the `window.__worldBuilder` global.
**Phase 1 wired all 6 named flags into their consumers** ([PR #172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172)). Each consumer is a 1-3 line
check guarded behind `import.meta.env.DEV` so retail builds carry no
overhead (`grep -r isWorldBuilderFlagActive dist/` returns zero hits — Vite
DCE confirmed).

| Flag | Consumer file | Method |
|---|---|---|
| `invulnerable` | `src/systems/player/PlayerHealthSystem.ts` | `takeDamage()` |
| `infiniteAmmo` | `src/systems/weapons/AmmoManager.ts` | `consumeRound()` |
| `noClip` | `src/systems/player/PlayerMovement.ts` | `simulateMovementStep()` |
| `postProcessEnabled` | `src/systems/effects/PostProcessingManager.ts` | `beginFrame/endFrame` |
| `forceTimeOfDay` | `src/systems/environment/AtmosphereSystem.ts` | `update()` |
| `ambientAudioEnabled` | `src/systems/audio/AudioManager.ts` | `update()` |

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

## Phase 1 wiring outcome

All 6 carry-overs from the `worldbuilder-wiring` family closed in
[PR #172](https://github.com/matthew-kissinger/terror-in-the-jungle/pull/172) (cycle `cycle-2026-05-09-doc-decomposition-and-wiring`):
`worldbuilder-invulnerable-wiring`, `-infinite-ammo-wiring`,
`-noclip-wiring`, `-postprocess-wiring`, `-tod-wiring`,
`-ambient-audio-wiring`. Combat-reviewer APPROVE-WITH-NOTES.

One open follow-up carry-over: `worldbuilder-oneshotkills-wiring` — the
7th flag is still published but unwired (out-of-scope for the Phase 1
brief which named only 6). See [docs/CARRY_OVERS.md](../CARRY_OVERS.md).
