# Three Effect Pool

Reusable pooling primitives for Three.js visual effects.

## Provenance

Generalized from Terror in the Jungle `src/systems/effects/EffectPool.ts`.
The package keeps the abstract subclass pattern for easy backports and also
adds a factory API for new projects.

## API

- `EffectPool<T>`: abstract base compatible with TIJ-style tracer/impact pools.
- `createEffectPool<T>()`: factory API for starter kits and new projects.

## Non-Goals

- No tracer, smoke, explosion, or weapon-specific visuals.
- No global pool registry.
- No ownership of scene lifecycle beyond caller-provided create/dispose hooks.

