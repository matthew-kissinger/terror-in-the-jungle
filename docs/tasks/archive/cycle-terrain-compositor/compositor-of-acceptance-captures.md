<!-- 80 LOC cap per framework recovery Pass 2 R1.2. Briefs over 100 LOC trigger cycle-validate warning. -->
# compositor-of-acceptance-captures

R3.1 of `cycle-terrain-compositor`. Ships
`scripts/capture-of-water-airfield-shots.ts` — the Playwright capture that
proves the cycle's two user-observable acceptance lines: (1) OF rivers sit
on actual ground at airfield + motor-pool overlaps (no water-on-walls);
(2) OF airfield reads as flat with smooth padding (no random-mountain).
Design memo: [docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).

## Files touched

- `scripts/capture-of-water-airfield-shots.ts` (new)
- `artifacts/cycle-terrain-compositor/playtest-evidence/` (new directory; populated by the script)

## Scope

1. Pre/post screenshot pairs at three OF locations:
   - **OF Main Airfield interior** at `(365, 0, -1335)` — third-person
     overhead, 80 m altitude. Pre captures show airfield random-mountain /
     padding-gap; post shows flat interior + smooth grade ramp.
   - **OF Main Airfield south envelope edge** at `(365, 0, -1100)` —
     ground-level looking toward the runway, framing the grade ramp where
     the padding gap previously visible.
   - **OF water-on-walls** at a known hydrology ∩ airfield overlap point —
     pick by reading the post-merge `composeTerrain` conflicts list
     (script logs candidates), or default to OF coord `(280, 0, -1280)` if
     no overlap is detected at runtime.
2. **Runtime probe** alongside each capture: sample
   `TerrainSystem.getHeightAt(x, z) + 0.85` and
   `WaterSystem.getWaterSurfaceY(x, z)`; assert `|diff| <= 0.5 m` at the
   water-on-walls locations. Write deterministic JSON summary alongside
   the screenshots (`summary-of-water-airfield.json`).
3. **Airfield-flatness probe**: sample `TerrainSystem.getHeightAt(x, z)`
   on a 20m half-extent grid centered at the airfield interior point;
   assert `max - min <= 0.5 m` (regression test for the random-mountain
   bug). Write to summary JSON.
4. Modeled on `scripts/capture-of-river-surface-shots.ts` and
   `scripts/capture-ashau-edge-and-flow-shots.ts` for arg shape +
   artifact path conventions.
5. Best-effort capture (matches prior cycle's pattern): if a probe fails
   to load (e.g. perf-harness bundle stale), log + continue. Owner
   walk-through is the load-bearing check; this script gates the post-
   merge automated check.

## Non-goals

- Owner playtest replacement (R3.2 ships the PLAYTEST_PENDING row).
- A Shau capture (A Shau is the cycle's regression sentinel; covered by
  existing `capture-ashau-edge-and-flow-shots.ts`).
- WebGPU vs WebGL parity capture (out of cycle).

## Acceptance

- [ ] Script runs end-to-end with `--pair-tag=post` on a cycle-head build
      and produces all 3 PNGs + summary JSON in
      `artifacts/cycle-terrain-compositor/playtest-evidence/`.
- [ ] `summary-of-water-airfield.json` asserts zero water-on-walls
      violations (`hoverAboveTerrainMeters <= 0.5`) and airfield interior
      flatness (`max-min <= 0.5 m`).
- [ ] `npm run lint && npm run test:run && npm run build` all pass.
- [ ] PR opened against `master` with link to this brief.

## Round 2 / Dependencies

- Depends on: R2.1 (resolver), R2.2 (Pass C), R2.3 (debug overlay). All
  merged.
- Blocks: R3.2 (PLAYTEST_PENDING row references the capture artifacts).
