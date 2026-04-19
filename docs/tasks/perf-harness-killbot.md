# perf-harness-killbot: aggressive open-field driver, no more muddling

**Slug:** `perf-harness-killbot`
**Cycle:** `cycle-2026-04-18-harness-flight-combat`
**Round:** 2b (hotfix; inserted between Round 2 and Round 3)
**Depends on:** `perf-harness-redesign` (already merged at `b850dc2`)
**Blocks (in this cycle):** `perf-baseline-refresh` (open_frontier and frontier30m can't rebaseline until the driver actually engages there)
**Playtest required:** yes — merge-gated on eyeball confirmation same as `perf-harness-redesign`
**Estimated risk:** low-to-medium — surgical changes to an existing driver's per-mode profiles + engagement logic
**Files touched:** `scripts/perf-active-driver.cjs` primarily, possibly `scripts/perf-capture.ts` only if a validator threshold needs matching tune

## Why this task exists

The redesigned harness driver (`perf-harness-redesign`, PR #90) is action-oriented on combat120/ai_sandbox. Post-merge evidence showed it works there: shots=211, hits=113 on a 90s combat120 capture at seed 2718. The terrain-aware 4-layer stack (navmesh waypoints → gradient probe → stuck teleport → per-mode profile) kept the player mobile and engaging.

But on open-field modes — open_frontier and a_shau_valley specifically, both with perception ranges of 900-1100m — the driver **muddles**. User observation: "mostly move back and forth and muddle" on big maps. Executor evidence from `perf-baseline-refresh` hard stop: on openfrontier:short (180s, 120 NPCs):
- 341 movement transitions, 339 gradient deflections, 1 zone captured, 0 stuck events
- **`shots_fired=0`, `hits=0` across all 119 samples**
- Every sample shows probe reason `target_out_of_range` or `target_out_of_effective_range`

The driver moves a lot; it doesn't shoot. The gradient probe is deflecting toward gentle slopes; the target-selection logic isn't committing to a specific enemy; the fire range gate is rejecting targets that the driver's perception range can see. The player wanders in a plausible-looking arc but never closes to engagement distance.

**The design directive from the user:** on open-field modes the driver must behave like a kill bot — fearless, committed, aggressive. Lock on the nearest opfor. Sprint toward them. Fire on first LOS. No juking, no contour-hugging, no re-probing for a "better" target mid-engagement. When the engagement ends (target down or lost), re-lock immediately. combat120 behavior stays as-is; only open-field modes change.

## Required reading first

- `scripts/perf-active-driver.cjs` — the imperative driver. Focus areas:
  - `modeProfiles` (lines ~32–88): per-mode tuning table (sprint/approach/retreat/maxFireDistance/holdChanceWhenVisible/preferredJuke). `open_frontier` and `a_shau_valley` profiles need aggressive revisions.
  - `perceptionRange` selection (lines ~90–96): 900m open_frontier, 1100m a_shau_valley.
  - Main decision loop (~line 1190 onward): target selection, movement state transitions, fire gate.
  - `findNearestOpfor`, `predictTargetPoint`, `syncCameraAim`, `mouseDown`/`mouseUp`.
  - The 4 new terrain layers added in PR #90 (navmesh waypoints, gradient probe, stuck teleport, terrain profile).
- `scripts/perf-capture.ts`:
  - `HARNESS_MODE_THRESHOLDS` (lines ~697–733) for per-mode critical-mode hit validation.
  - URL query builder (where seed is pinned).
- Artifacts from the baseline-refresh hard stop (local, gitignored): `artifacts/perf/2026-04-19T08-39-20-353Z/` (openfrontier:short failing evidence) and `artifacts/perf/2026-04-19T08-36-45-011Z/` (combat120 passing evidence). Compare the probe reason distribution between the two.
- `docs/TESTING.md` — if you add behavior tests.
- `docs/INTERFACE_FENCE.md` — no fence changes expected.

## Target state — aggressive open-field profile

### Per-mode profile additions

Extend the existing `modeProfiles[open_frontier]` and `modeProfiles[a_shau_valley]` with an **aggressive engagement mode**. Concrete proposal:

```js
open_frontier: {
  // existing fields — tuned, not replaced
  sprintDistance: 600,         // was 360 — sprint even at longer ranges
  approachDistance: 260,       // was 185 — close to fire-range, not past it
  retreatDistance: 10,         // was 16 — rarely retreat on open field
  maxFireDistance: 320,        // was 245 — shoot farther; long sightlines
  holdChanceWhenVisible: 0,    // was 0.02 — NEVER hold on visible contact
  transitionHoldMs: 400,       // was 900 — commit faster
  decisionIntervalMs: 280,     // was max(380, ...) — tick faster on open field
  preferredJuke: 'push',       // was 'strafe' — don't waste motion strafing
  objectiveBias: 'enemy_mass', // was 'zone' — chase bodies, not zones
  // new fields
  aggressiveMode: true,
  commitLockMs: 2000,          // once target picked, don't re-evaluate for 2s
  fireOnFirstLOS: true,        // fire immediately on LOS, not at approach-distance
  targetReselectionPolicy: 'on-kill-or-lost',  // not 'on-tick'
  terrainProfile: 'rolling',
  // existing terrain layer fields stay (maxGradient, stuckTimeoutSec, etc.)
},
a_shau_valley: {
  // same treatment; mountainous allows slightly more defensive posture but
  // still commit-to-target
  sprintDistance: 550,
  approachDistance: 240,
  retreatDistance: 12,
  maxFireDistance: 300,
  holdChanceWhenVisible: 0,
  transitionHoldMs: 500,
  decisionIntervalMs: 300,
  preferredJuke: 'push',
  objectiveBias: 'enemy_mass',
  aggressiveMode: true,
  commitLockMs: 1800,
  fireOnFirstLOS: true,
  targetReselectionPolicy: 'on-kill-or-lost',
  terrainProfile: 'mountainous',
},
```

`ai_sandbox`/`zone_control`/`team_deathmatch` keep their existing profiles — they work.

### Target-lock (new logic)

Current driver picks `nearestOpfor` every decision tick (~450ms) via `findNearestOpfor(systems, perceptionRange^2)`. On open fields with 120 NPCs in motion, the "nearest" flips frequently — this is the muddling source.

Add a target-lock state field:

```js
state.targetLock = {
  combatantId: null,
  lockedAtMs: 0,
  lastSeenMs: 0,
};
```

Logic per decision tick (when `aggressiveMode`):
- If no lock OR `now - lockedAtMs > commitLockMs` AND current target is lost/dead:
  - Pick new nearest opfor via `findNearestOpfor`
  - Set `targetLock = { combatantId: target.id, lockedAtMs: now, lastSeenMs: now }`
- Else if locked target still alive and in perception range:
  - Continue engaging locked target
  - Update `lastSeenMs`
- Else if locked target out of perception range for > 2s:
  - Clear lock, re-select next tick

### Fire gate (tuned)

Current brief rejects fire when `target_out_of_range` (compared against `maxFireDistance`). On open fields we want to fire on first LOS regardless of `maxFireDistance` when `fireOnFirstLOS: true`. Shots fired at 350m may miss more often, but **shots fired = 0** is the current problem, and validation is about signal quality, not kill efficiency.

If `aggressiveMode && fireOnFirstLOS`:
- Fire gate rejects only on `los_blocked` (terrain occlusion) — keep the LOS-aware gate from PR #90.
- Distance gate is removed for the fire decision (still used for pathing/movement-state).

### Movement simplification on open field

`aggressiveMode` short-circuits the gradient-deflection logic: straight-line sprint toward target over gentle-to-moderate gradients. Deflect only if gradient > mode.maxGradient × 1.5 (steep enough that the player physically can't climb). This prevents the driver from zig-zagging up a mild slope.

### Target reselection policy

Current: re-pick target every tick. Proposed with `targetReselectionPolicy: 'on-kill-or-lost'`:
- Re-pick only when current target is dead, out of perception, or lock has expired.
- This is the mental model of "kill bot locks on, attacks until target gone, repeats."

## Steps

1. Read files in "Required reading first". Identify the 4–6 edit points in `perf-active-driver.cjs`.
2. **Baseline gate.** On current master (`322e4bb`), run `npm run build:perf` + `npm run perf:capture:openfrontier:short`. Confirm it still fails with shots=0 — this is your pre-fix baseline.
3. Extend the two mode profiles with aggressive fields per the proposal above. Tune the numbers based on how engagements play out; the numbers above are starter values.
4. Implement target-lock state + logic. The existing state object is already large; add the new fields near `fireTimer`/`firingHeld`.
5. Implement the fire-gate change (`fireOnFirstLOS` respects LOS but not distance when aggressive).
6. Short-circuit the gradient deflection on `aggressiveMode`.
7. Smoke capture `openfrontier:short` and iterate until `validation.overall = 'pass'` with `shots_fired > 60`, `hits > 4`. If tuning bounces between over-fire-no-hits and muddling, split the difference toward over-fire — the validator wants signal, not marksmanship.
8. Smoke capture `a_shau_valley:short` and confirm it also engages. Tune independently.
9. Smoke capture `combat120` (on pinned seed 2718) — must still pass with shots > 50, hits > 5. If it regressed, the aggressive-profile logic leaked into ai_sandbox; fix the gate.
10. Smoke capture `frontier30m` at a short duration (5 min is fine for smoke) — confirm it starts engaging; executor doesn't need to run full 30min, that's for the baseline-refresh.
11. Add a behavior test: scripted `aggressiveMode=true` observation with locked target produces `actionFireStart` calls when LOS is clear. (L2 test against a mocked `playerController`.)
12. `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.
13. Live playtest: `npm run perf:capture:openfrontier:short --headed`. Watch the driver. It should sprint toward the nearest enemy group, fire on first LOS, keep firing until the target is down, then re-lock. No strafing, no back-and-forth, no pausing to "probe." Record 2–3 concrete observations in PR description.

## Exit criteria

- `openfrontier:short` passes `validation.overall = 'pass'` with `shots_fired > 60`, `hits > 4`, `max_stuck < 8s`.
- `a_shau_valley:short` passes with `shots_fired > 60`, `hits > 4`, `max_stuck < 8s` (note: brief's previous threshold was 30/2 — bumping here because open-field driver should produce more shots than the corridor-style ashau but we're tuning for signal either way; the exact number can match whatever the smoke capture produces at 180s).
- `combat120` regression guard: at least shots > 50, hits > 5 (no regression from the 169/92 the redesign delivered).
- `frontier30m` starts engaging (short smoke capture, not full duration).
- Behavior test proves aggressive-mode fire decision ignores distance gate and respects LOS gate.
- Live playtest evidence in PR description: sprint-to-target, fire-on-LOS, no muddling.
- `npm run lint`, `npm run test:run`, `npm run build`, `npm run build:perf` green.

## Non-goals

- Do NOT touch the terrain layer stack (navmesh / gradient / teleport / terrain profile). Those work for combat120; they're orthogonal to the engagement-commitment problem.
- Do NOT change combat120 (ai_sandbox) behavior. Keep the existing mode profile. The `aggressiveMode: true` gate makes the changes opt-in per-mode.
- Do NOT touch NPC combat AI, weapon systems, or player physics. This is a harness-driver-only change.
- Do NOT add a new declarative policy / scenario module. Stay in the imperative driver.
- Do NOT adjust validators to make the harness pass. Tune the DRIVER; let validators stay strict.
- Do NOT change `fireOnFirstLOS`-like logic in a way that fires at every frame — respect `transitionHoldMs` and the existing `firingUntil` logic so we don't spam `mousedown` events per tick.
- Do NOT rebaseline perf. That's `perf-baseline-refresh`; this task unblocks it.

## Hard stops

- Pre-fix baseline gate fails in an unexpected shape (e.g. shots > 0 on unedited master) → STOP and report; the premise of this task would be wrong.
- After aggressive tune, combat120 drops below shots=50 → STOP; fix the mode-gate leakage.
- `openfrontier:short` still records 0 shots after multiple tuning iterations → STOP. The muddling source may be deeper (target selection, LOS probe, or movement code); surface for deeper investigation.
- Player starts firing through terrain on open field (LOS gate bypassed) → STOP. The LOS gate from PR #90 must remain active.
- Diff exceeds ~400 LOC net → STOP. This is profile tuning + target-lock + fire-gate condition; shouldn't need more.
- Fence change → STOP.

## Rationale

The reverted declarative harness's failure mode was "policy emits intent but intent doesn't fire." The imperative redesign's failure mode (this task's target) is "driver moves plausibly but never commits to an engagement." Both are engagement-commitment failures. The fix shape is the same in spirit: the driver needs a state where it says "this target, now, until gone" instead of re-evaluating every tick. That's the target-lock. Everything else (profile tuning, fire-on-LOS, movement simplification) supports that state.

"Kill bot" is the right mental model. An efficient killing machine doesn't hedge. combat120 accidentally works because at 120 NPCs × 90 seconds in a ~100m engagement radius, the target-churn is low enough that re-picking every tick still produces mostly the same target. On open_frontier with ~900m perception and 120 NPCs, target churn is constant — the driver is always chasing a new "nearest," never closing on any of them. Target-lock fixes this by committing.
