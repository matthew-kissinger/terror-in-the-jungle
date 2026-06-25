# Frame Scheduler

Generic cadence scheduler for frame-based systems.

## Provenance

Generalized from Terror in the Jungle `src/core/SimulationScheduler.ts`. The
package keeps the accumulator behavior but removes TIJ phase names.

## API

Use `createFrameScheduler<GroupId>(groups)` and call `consume(groupId, dt)`.
Per-frame groups use `intervalSeconds: 0` and return the input delta every call.

## Non-Goals

- No app-specific phase table.
- No timing source.
- No renderer or game-system lifecycle.

