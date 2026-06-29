<!-- 80 LOC cap. Campaign: docs/CAMPAIGN_2026-06-28-field-readiness.md (Phase 3) -->
# sun-disc-banding-fix

From the 2026-06-28 owner playtest: the sun disc reads as an "LED-dot lattice."
`SunDiscMesh` (~line 88) stacks three high-frequency sine terms (plasma /
filament / granule, frequencies up to ~×317) whose interference aliases into a
visible dot grid. Band-limit or replace those terms so the disc reads as a warm
solar BODY, not a screen of dots — while keeping a hot, warm core.

## Files touched

- `src/systems/environment/atmosphere/SunDiscMesh.ts` (~line 88 — the 3 sine terms; TSL + GLSL + CPU mirrors)
- `*.test.ts` (assert the band-limit on the CPU mirror)

## Scope

1. Reduce the spatial frequency of (or replace) the plasma/filament/granule sine
   terms so they no longer alias into a lattice at render resolution — cap the
   max frequency well below the ~×317 that produces the dot grid.
2. Preserve a warm, hot-core appearance (keep the body + warm shell; do not flatten
   the disc to a plain circle).
3. Keep the TSL (WebGPU), GLSL (WebGL), and CPU-mirror implementations in sync —
   all three must apply the same band-limit so WebGPU/WebGL stay comparable.

## Non-goals

- Reworking the aureole/glow, sky color, or exposure.
- Changing the disc size/position or the day/night sun direction.
- A full procedural-sun rewrite — band-limit the existing terms, keep it cheap.

## Acceptance

- [ ] A test on the CPU mirror asserts the max sine frequency is band-limited
      (below the lattice threshold) and the core stays warm/bright.
- [ ] `npm run lint && npm run test:run && npm run build` green.
- [ ] PR linking this brief; owner walk → PLAYTEST_PENDING (sun reads as a body, not dots).

## Dependencies

- Root (no blockers). No reviewer (atmosphere, not combat/terrain/nav).
