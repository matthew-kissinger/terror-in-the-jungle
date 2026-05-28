# Playtest: cycle-terrain-compositor

Last verified: 2026-05-28 (drift-correction link fix under `doc-consolidation-and-refs`; cycle brief moved to `docs/tasks/archive/`)

Cycle: `cycle-terrain-compositor` (single-cycle dispatch, 2026-05-27).
Task slug: `compositor-playtest-evidence` (R3.2, owner-walk evidence).
Branch: `task/compositor-playtest-evidence`.
Capture script (R3.1):
[`scripts/capture-of-water-airfield-shots.ts`](../../scripts/capture-of-water-airfield-shots.ts).
Design memo:
[docs/rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md](../rearch/TERRAIN_COMPOSITOR_SPIKE_2026-05-27.md).
Cycle brief:
[docs/tasks/cycle-terrain-compositor.md](../tasks/archive/cycle-terrain-compositor/cycle-terrain-compositor.md).

## Posture note (read this first)

This cycle ran under **`attended`** posture, not `autonomous-loop`.
A PLAYTEST_PENDING row is still added (see
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)) so the owner can
batch this walk with other deferred cycles, but the row is for
**owner convenience**, not a deferred merge gate. Per the cycle
brief's non-goals, owner sign-off on this walk does NOT block any
already-merged work; a regression here opens a follow-up cycle.

## What changed (one paragraph)

`TerrainCompositor` becomes the canonical owner of stamp composition,
spatial conflict detection, and hydrology feedback. Three independent
compilers (TerrainFeatureCompiler, TerrainFlowCompiler,
HydrologyTerrainFeatures) now annotate every stamp with
`obstructionPolicy` + `targetHeightStrategy`; the new resolver lets
airfields win height fights while hydrology preserves bed depth
anchored to the airfield's datum; Pass C re-samples river elevations
against the composed provider so the water surface mesh sits on the
actual ground (closes the OF "water on walls" report); the diagnostic
overlay (`Shift+\` -> `J` chord) renders stamp AABBs + conflict edges
on demand. A Shau remains a regression sentinel - its DEM contains
real river valleys + its airfields ship `validateTerrain: false`, so
the compositor is a NO-OP there by intent.

## What to walk (Open Frontier)

1. **OF airfield flat-interior + grade-ramp flyover.** Spawn into Open
   Frontier as the OF helicopter (UH-1, motor-pool helipad). Climb to
   altitude ~80 m and fly over the main airfield. Confirm:
   - The flat interior reads as **flat** - no random mountain peaks
     punching through the airfield footprint inner radius.
   - The padding ring reads as a **smooth grade ramp** from the flat
     datum down to the surrounding terrain - no abrupt step, no
     "padding hump".
   - (Side check) the rest of the OF terrain still has procedural
     noise variation; the compositor only flattens inside the
     declared airfield envelope.

2. **OF Sampan spawn-on-water close-up.** Drop in at the OF Sampan
   spawn at world coord `(-324, 0, 384)` (use the dev-console
   `__engine.player.teleport(-324, 5, 384)` surface or the
   WorldBuilder free-fly `Shift+G`). Confirm:
   - The Sampan hull sits **on** the visible hydrology river surface -
     no float-above-terrain gap visible from any angle.
   - No z-fight shimmer at the hull/water seam.
   - The acceptance assertion is `surfaceY` within 0.5 m of
     `TerrainSystem.getHeightAt(x, z) + 0.85` at this spawn (the
     `OperationalRuntimeComposer.bindSpawnedWatercraftRuntime` check
     the cycle brief calls out).

3. **OF PBR spawn-on-water close-up.** Drop in at the OF PBR spawn at
   world coord `(396, 0, 876)`. Same checks as the Sampan: hull on
   water surface, no float-above gap, no z-fight at the hull seam.

4. **OF airfield-hydrology overlap watercraft pass.** Drive an OF
   watercraft (Sampan or PBR) over a known airfield-hydrology overlap.
   Default overlap pose: `(280, 0, -1280)` (the runway approach is
   crossed by a hydrology channel). Confirm:
   - The water surface **follows the composed terrain through the
     overlap** - no "water on a wall" effect where the river ribbon
     rises off the flattened airfield datum.
   - No visible discontinuity between the river surface inside vs
     outside the airfield envelope.

5. **Compositor debug overlay smoke (R2.3).** From any OF pose,
   trigger the dev-only diagnostic overlay via the `Shift+\` -> `J`
   chord (per the R2.3 reviewer-amended hotkey landing,
   commit `58f95c34`). Confirm:
   - Airfield envelope renders as a **white** AABB outline.
   - Hydrology river capsules render as **blue** capsule outlines.
   - At least **one red conflict edge** is visible somewhere on OF
     (the airfield-hydrology overlap from item 4 is the load-bearing
     case; the compositor logs this conflict and the resolver routes
     it via `consult` policy).

## A Shau regression check (sentinel)

Repeat the flight pattern on A Shau Valley:

1. Fly the OF helicopter (or A Shau equivalent) over a known A Shau
   airfield position (north helipad / valley landing zones at the
   cycle-vekhikl-3 baseline poses). Confirm:
   - Airfield flat interior + grade ramp **identical to pre-cycle**
     master baseline. A Shau airfields ship `validateTerrain: false`
     per [AShauValleyConfig.ts:647,660](../../src/config/AShauValleyConfig.ts),
     so the compositor exits early for A Shau airfields by intent.

2. Fly over the A Shau river valley at ~80 m. Confirm:
   - Hydrology river surfaces still render correctly along the valley
     floor; no "water on walls" regression at A Shau-specific channel
     bends or confluence points.

3. Drop in at the A Shau Sampan spawn at `(-6895, 0, 4835)` (from
   cycle-ashau-edge-and-flow-tuning). Confirm:
   - Boat sits on the hydrology river channel identically to the
     2026-05-19 cycle close baseline; if visually different at all,
     that is a Pass C regression and opens a follow-up cycle.

## What I look for (visual cues, no probes / no JSON to read)

The five OF items + three A Shau sentinel items are all judged by
**eye** during the walk. No JSON, no probe surface, no console
output is load-bearing for the sign-off. Reasons:

- The acceptance assertions (`surfaceY` within 0.5 m of
  `getHeightAt + 0.85`, zero `hoverAboveTerrainMeters > 0.5` frames,
  zero random-mountain peaks in the airfield envelope) are already
  exercised by the R3.1 capture script's automated smoke and recorded
  in `summary.json` under
  `artifacts/cycle-terrain-compositor/playtest-evidence/`. Owner walk
  is a **visual-quality sanity check** on top of that automated
  smoke, not a re-run of the same numeric assertions.
- The cycle's posture is `attended`, so the owner is **looking at
  the screen** during the walk; the visual cues above (flat interior,
  smooth grade ramp, no float-above, no z-fight, debug overlay
  contents) are what reads "right" or "wrong" by eye.

If anything reads "wrong" by eye that the automated smoke marked
"pass", that is exactly the case where a follow-up cycle gets opened -
the smoke and the eye disagree, and the eye wins.

## Screenshots

Generated by `scripts/capture-of-water-airfield-shots.ts` (the R3.1
sibling task ships the capture script + the post-merge artifacts).

Path: `artifacts/cycle-terrain-compositor/playtest-evidence/`.

The R3.1 brief calls for these named captures (subject to the
final capture-script implementation when R3.1 lands):

- `of-airfield-flyover-post.png` - the OF airfield flat-interior +
  grade-ramp flyover (item 1).
- `of-sampan-spawn-post.png` - the OF Sampan spawn close-up
  (item 2).
- `of-pbr-spawn-post.png` - the OF PBR spawn close-up (item 3).
- `of-airfield-hydrology-overlap-post.png` - the watercraft pass
  over the airfield/hydrology overlap (item 4).
- `of-compositor-debug-overlay-post.png` - the `Shift+\` -> `J`
  diagnostic overlay frame (item 5).
- `ashau-airfield-flyover-post.png` + `ashau-river-flyover-post.png`
  + `ashau-sampan-spawn-post.png` - the A Shau regression sentinel
  frames.
- `summary.json` - per-capture metadata + the cycle-brief
  acceptance probes (`hoverAboveTerrainMeters`, `surfaceY` vs
  `getHeightAt + 0.85`, `randomMountainCount` inside airfield
  envelope inner radius).

The `artifacts/` directory is gitignored at the repository root;
R3.1 force-adds (`git add -f`) the PNGs + `summary.json` on its
cycle close commit so the owner sweep can browse them on master
without rerunning the script.

If the R3.1 capture script is not yet on master when the owner walks
this list, the visual checks above stand on their own - the
capture-pair is a convenience reference, not a load-bearing gate.

## Owner sign-off

_(Empty as of 2026-05-27 - PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **OF airfield reads flat** with smooth grade ramp - no random
      mountains, no padding hump.
- [ ] **OF Sampan sits on water** at spawn `(-324, 0, 384)`; no
      float-above-terrain, no z-fight at the hull.
- [ ] **OF PBR sits on water** at spawn `(396, 0, 876)`; same checks.
- [ ] **OF water surface follows terrain through airfield-hydrology
      overlap** at `(280, 0, -1280)`; no water-on-walls.
- [ ] **Compositor debug overlay reads correctly** on `Shift+\` ->
      `J`: white airfield envelope, blue river capsules, >= 1 red
      conflict edge.
- [ ] **A Shau airfield + river + Sampan spawn unchanged** vs the
      2026-05-19 cycle-ashau-edge-and-flow-tuning baseline.
- [ ] **No new carry-overs** opened against this cycle (any visual
      regression becomes a follow-up `cycle-terrain-compositor-fix`
      cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass - append the date + one-line summary
  to the "Owner sign-off" section above; mark the
  PLAYTEST_PENDING row as "Walked & accepted".
- If any item reads **needs work [X]** - move the
  PLAYTEST_PENDING row to "Walked & rejected" and open a follow-up
  cycle brief at `docs/tasks/cycle-terrain-compositor-fix.md`. The
  merged R1 + R2 + R3.1 commits are not reverted; the follow-up
  cycle scopes the visual fix only.

## Acceptance (for this task)

- `npm run lint`: PASS (docs-only, no-op).
- `npm run test:run`: PASS (docs-only, no test changes).
- `npm run build`: PASS (docs-only, no-op).
- This memo committed at `docs/playtests/cycle-terrain-compositor.md`.
- PLAYTEST_PENDING row appended under "Active deferrals" in
  `docs/PLAYTEST_PENDING.md`.

## Posture

This task is docs-only owner-walk evidence under the cycle's
**`attended`** posture. The PLAYTEST_PENDING row is added for owner
batching convenience, NOT as a deferred merge gate (the cycle brief's
R3.2 scope explicitly calls this out: "cycle posture is `attended`
(not autonomous-loop), so this is owner-walk-through evidence, not a
deferred merge gate"). Per the cycle brief's non-goals, any visual
regression the owner finds at sweep time opens a follow-up cycle -
the already-merged R1 + R2 + R3.1 commits are not reverted.
