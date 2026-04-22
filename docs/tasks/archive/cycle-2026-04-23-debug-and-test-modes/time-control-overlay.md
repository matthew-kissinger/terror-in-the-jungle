# time-control-overlay: pause / step-frame / slow-mo / fast-forward on the simulation loop

**Slug:** `time-control-overlay`
**Cycle:** `cycle-2026-04-23-debug-and-test-modes`
**Round:** 2
**Priority:** P1 — essential for observing micro-behavior (tick back-and-forth, AI state flips, physics transitions).
**Playtest required:** NO (behavior-verified by asserting `deltaTime` multiplier propagates).
**Estimated risk:** medium — touches the main loop's `deltaTime` path; wrong hook point can desync render vs physics.
**Budget:** ≤250 LOC.
**Files touched:**

- Create: `src/core/TimeScale.ts` — the time-scale state + public API.
- Create: `src/ui/debug/TimeControlPanel.ts` — the UI surface (pause/step/speed buttons + speed indicator).
- Modify: `src/core/GameEngineLoop.ts` — multiply `deltaTime` by `timeScale.get()` at the single loop-dispatch site.
- Modify: `src/core/GameEngineInput.ts` — key handlers for `Space` (pause), `.` (step-one-frame), `,`/`;` (slower/faster).
- Add: `src/core/TimeScale.test.ts` — behavior tests.

## Required reading first

- `src/core/GameEngineLoop.ts` end-to-end (it's short; grep for `deltaTime`).
- `src/core/SystemUpdater.ts` — confirms `deltaTime` is threaded through as a scalar multiplier; the scale here works ONLY if every system reads its delta from this path. Any system that reads `performance.now()` directly will desync under time scaling. Flag any such systems in the PR body.
- Note from CLAUDE.md: `SystemUpdater.ts` handles per-frame dispatch with telemetry markers + budget overrun warnings. Budget warnings are likely scale-aware or not; executor verifies.

## Fix

### 1. TimeScale module

```ts
// src/core/TimeScale.ts
export type TimeScaleValue = 0 | 0.1 | 0.25 | 0.5 | 1 | 2 | 4;

export class TimeScale {
  private scale: TimeScaleValue = 1;
  private paused = false;
  private stepRequested = false;

  get(): number {
    if (this.paused && !this.stepRequested) return 0;
    return this.scale;
  }

  set(value: TimeScaleValue) { this.scale = value; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  togglePause() { this.paused = !this.paused; }
  stepOneFrame() { this.stepRequested = true; }

  /** Called by the loop after dispatch; consumes the one-frame step. */
  postDispatch() {
    if (this.paused && this.stepRequested) {
      this.stepRequested = false;
    }
  }

  isPaused(): boolean { return this.paused; }
  isScaled(): boolean { return this.scale !== 1; }
}
```

### 2. Loop integration

Single hook point in `GameEngineLoop.ts`:

```ts
const rawDelta = clockDeltaMs / 1000;
const effectiveDelta = rawDelta * this.timeScale.get();
this.systemUpdater.dispatch(effectiveDelta);
this.timeScale.postDispatch();
```

If the loop currently threads `deltaTime` through multiple places, centralize to one scaled value and flag any outliers (e.g., animation mixer that reads clock directly).

### 3. Key handlers

- `Space` — toggle pause. Do NOT conflict with an existing `Space` use (grep first; if conflict, use `P`).
- `.` (period) — step one frame. No-op if not paused.
- `,` (comma) — decrease speed by one tier.
- `;` (semicolon) — increase speed by one tier.
- Tiers in order: `0.1 / 0.25 / 0.5 / 1 / 2 / 4`.

### 4. TimeControlPanel

Small fixed-position panel (top-right, 200px). Shows:
- Current speed indicator (`1.0x` / `⏸ PAUSED` / `0.25x SLOW` / `2.0x FAST`)
- Buttons: Pause/Resume, Step, -, +, Reset (1.0x).

Registers with `DebugHudRegistry` if present; else self-mount.

### 5. Guard rails

- When pausing, emit a single Log line via `LogOverlay` (e.g., `[time] paused at t=123.45s`) so the debug session has a breadcrumb.
- When stepping one frame, log the achieved delta too.
- Cap step requests — if user spams `.` too fast, only one step per real-time frame.

## Steps

1. Read "Required reading first" — particularly GameEngineLoop + SystemUpdater.
2. Build `TimeScale` with tests.
3. Grep all existing callsites of `deltaTime` in core loop path; confirm the single hook point.
4. Wire `TimeScale` into the loop.
5. Add key handlers.
6. Build `TimeControlPanel`.
7. Behavior tests: simulate `Space` → assert next dispatch called with `deltaTime === 0`; simulate `.` while paused → assert exactly one dispatch with non-zero delta.
8. `npm run lint`, `npm run test:run`, `npm run build`.
9. Manual smoke: pause, watch NPCs freeze; step, watch one tick; slow-mo, watch helicopter rotor spin slowly.
10. Flag any system that reads `performance.now()` directly in the PR body (those won't scale).

## Exit criteria

- `Space` pause / resume works. `.` steps one frame. `,`/`;` change speed tiers.
- `TimeControlPanel` shows current speed.
- `npm run lint`, `npm run test:run`, `npm run build` green.
- Flagged systems (if any) that bypass the scaled delta, recorded in PR body.
- Evidence video or screenshot showing 0.25x slow-mo combat120 in `docs/cycles/cycle-2026-04-23-debug-and-test-modes/evidence/time-control-overlay/`.

## Non-goals

- No replay / rewind. Scale only goes forward in time.
- No per-system scale (e.g., "slow the physics but not the UI"). All-or-nothing.
- Do not add a seek-bar / timeline. That belongs to a replay subsystem cycle.
- Do not persist pause state across reload.

## Hard stops

- Fence change (`src/types/SystemInterfaces.ts`) → STOP.
- Scaling `deltaTime` causes a desync between render and physics (e.g., camera jitters at 0.25x) → STOP, root-cause (likely a `performance.now()`-based system bypassing the multiplier); either fix by piping through scaled delta, or file a finding and restrict scale to `0 / 1` (pause-only, no slow-mo).
- `Space` conflicts with an existing handler (e.g., player jump) → rebind to `P`; note in PR body.

## Pairs with

- `debug-hud-registry` (soft dep: registers as panel).
- `free-fly-camera-and-entity-inspector` (complementary: pause time + inspect frozen state).
- `world-overlay-debugger` (complementary: freeze + visualize squad decisions).
