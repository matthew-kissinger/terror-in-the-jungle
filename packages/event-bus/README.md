# Event Bus

Typed queue-and-flush event bus for frame-based apps.

## Provenance

Generalized from Terror in the Jungle `src/core/GameEventBus.ts`. The package
removes the TIJ singleton and event map; callers create one bus per runtime.

## API

Use `createEventBus<EventMap>()`, then `emit`, `subscribe`, and `flush`.
Events emitted during a flush are queued for the next flush, keeping delivery
order stable.

## Non-Goals

- No process-global singleton.
- No TIJ event names or faction types.
- No renderer, DOM, or Three.js dependency.

