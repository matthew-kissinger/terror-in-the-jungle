# Task A4: Agent/player API unification — typed action + observation layer

**Phase:** A (foundation)
**Depends on:** nothing
**Blocks:** future NPC pilots, agent-driven playtesting, deterministic replay
**Playtest required:** no (library-level; `perf-active-driver.js` rewrite
verifies behavior)
**Estimated risk:** medium — adds a new boundary; replaces the active driver's
internals
**Files touched:** new `src/systems/agent/` module (AgentController,
ActionCommand, Observation types), rewritten `scripts/perf-active-driver.js`
to drive via the new API, tests.

## Goal

Land the typed action/observation interface designed in the E4 spike memo, and
use it to replace the keystroke-emulation internals of
`scripts/perf-active-driver.js`. The driver's external behavior stays the same
(roams, shoots, enters vehicles); its internals go from a keyboard-event fiction
to a structured `AgentController.apply(action)` path.

## Background

From `docs/BACKLOG.md` and the E4 spike memo on
`origin/spike/E4-agent-player-api`:

> 1755-LOC driver potentially rewritable to ~150 LOC. Status: prototype-more.

The E4 memo defines the action space (move-to, face-bearing, fire-at, take-cover,
enter-vehicle, exit-vehicle, call-support) and observation space (visible
entities within cone/radius, own-state snapshot, mission objectives). This task
turns that design into production code.

## Required reading first

- `docs/INTERFACE_FENCE.md` — if the action/observation types need access
  through `IPlayerController`, stop and surface. Prefer a parallel interface
  rather than fence-changing.
- `docs/TESTING.md`.
- **On branch `origin/spike/E4-agent-player-api`:**
  - `docs/rearch/E4-agent-player-api.md` — the full design.
  - Any prototype code under `src/systems/agent/` or similar that the spike
    produced — lift what's clean, redo what isn't.
- `scripts/perf-active-driver.js` — the current 1755-LOC driver.
- `src/systems/player/PlayerController.ts` — caller currently targeted by the
  keystroke-emulation path.

## Steps

1. Fetch the E4 spike branch; read the memo and lift the action/observation
   type design verbatim where it's solid.
2. Scaffold `src/systems/agent/`. Export `AgentController`, `AgentAction`
   (discriminated union), `AgentObservation`.
3. Wire `AgentController` to the same underlying systems the human input path
   uses (movement, weapons, vehicle enter/exit), but via direct method calls —
   NOT by synthesizing keyboard events.
4. Rewrite `scripts/perf-active-driver.js` to call `AgentController` directly.
   External behavior unchanged; internals reduced. Target ≤ 300 LOC.
5. Unit tests for each action and observation shape. Behavior tests: given an
   observation with an enemy within fire arc, `fire-at` produces a shot;
   `enter-vehicle` toggles to vehicle control; etc.
6. Perf check: the active driver should now cause LESS frame-time noise than
   the keyboard-event path. Capture `combat120` with the driver active and
   compare to pre-change driver-active capture.

## Exit criteria

- `src/systems/agent/` module landed with typed API.
- `perf-active-driver.js` rewritten to use the new API; external behavior
  unchanged (can still drive a perf capture end to end).
- Active driver LOC reduced by ≥ 50% (1755 → ≤ 900; stretch ≤ 300).
- `combat120` with active-driver shows no regression > 5% p99.
- `npm run lint`, `npm run test:run`, `npm run build` green.

## Non-goals

- No network/RPC layer — local in-process only.
- No pixel-observation / full RL hooks — structured data only.
- No NPC pilot integration yet — the API exists for it but wiring is a later
  task.

## Hard stops

- Fence change required to `IPlayerController`: stop and surface. Prefer a
  parallel interface.
- E4 memo is missing from the spike branch or is clearly stale: stop, surface,
  and request a fresh decision before implementing.
