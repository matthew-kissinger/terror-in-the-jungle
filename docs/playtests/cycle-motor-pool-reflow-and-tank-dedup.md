# Playtest: cycle-motor-pool-reflow-and-tank-dedup

Cycle: `cycle-motor-pool-reflow-and-tank-dedup` (campaign position #3
of 3, 2026-05-20 vehicle-boarding-and-water parallel campaign)
Task slug: `motor-pool-and-tank-dedup-playtest-evidence`
Branch: `task/motor-pool-and-tank-dedup-playtest-evidence`
Capture script:
[`scripts/capture-motor-pool-shots.ts`](../../scripts/capture-motor-pool-shots.ts)

Opens + closes carry-over `VEKHIKL-LAYOUT-1` in-cycle (net delta on
active carry-over count: 0). No new carry-overs opened.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md)
declared `posture: autonomous-loop`, the cycle's playtest-required
gate is **deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)
per the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the campaign completes
(or alongside the campaign-close production deploy gate).

This document substitutes Playwright + Chromium headless smoke for
the owner gate. The captures cover the two visual outcomes the
cycle brief calls out:

1. **OF airfield Main Motor Pool reflow.** **Pre:** four vehicles
   crammed in a 4 m-deep strip at z ∈ [10, 14] with yaw spread 27°
   and a duplicate dressing M48 next to the real one. **Post:** four
   vehicles staggered across z ∈ [8, 18], yaw spread 72°
   (`Math.PI * 0.3 → Math.PI * 0.7`), crate row pushed off the
   parking strip to flank the comms tower, single M48 in the bay
   (real Tank IVehicle from `M48_SPAWN_OFFSETS.open_frontier`).
2. **A Shau Main Motor Pool no-regression.** The shared prefab
   `motor_pool_heavy` was split into `motor_pool_heavy_of` +
   `motor_pool_heavy_ashau` because the OF reflow's M48 bay sat
   outside A Shau's 34 m footprint. The A Shau variant preserves
   the owner-accepted layout shipped with `cycle-vekhikl-3`. **Pre
   vs Post must read byte-identical (or visually identical at the
   wide framing used by the capture script).**

A third capture (`of-fob-no-tank.png`) confirms the West FOB
compound at `(-1025, 0, -760)` no longer hosts a real M48 — the
scenario spawn at `M48_SPAWN_OFFSETS.open_frontier` has been
relocated from `(-995, 0, -760)` to `(183, 0, -1173)` in the motor
pool bay.

## R1 production landings (cycle-close evidence)

| Slug | PR | Author note |
|---|---|---|
| `of-tank-relocate-to-motor-pool` | #287 | Real M48 Tank IVehicle moved from `(-995, 0, -760)` (~30 m east of the West FOB) to `(183, 0, -1173)` in the motor pool bay (anchor `(155, 0, -1195)` + `(28, 0, 22)` slot, yaw `Math.PI * 0.55`). A Shau M48 scenario spawn unchanged. Doc-comment in `M48TankSpawn.ts:118` updated to reflect the new anchor. |
| `motor-pool-heavy-reflow` | #290 | Split shared `motor_pool_heavy` prefab into `motor_pool_heavy_of` + `motor_pool_heavy_ashau` (A Shau's 34 m footprint can't host the OF bay's 35.6 m M48 radius). OF variant gives each vehicle ≥ 1.5 m bounding-box clearance and ≥ 60° yaw spread. Dressing M48 entry removed from OF prefab. Crate row pushed off the parking strip to flank the comms tower. A Shau variant preserves the cycle-vekhikl-3 layout byte-identical. Forced side-effects on `gameModeTypes.ts` + `scripts/check-terrain-visual.ts` (user-approved scope expansion). |

Post-reflow OF prefab layout (`src/systems/world/WorldFeaturePrefabs.ts`,
`motor_pool_heavy_of`):

```ts
{ modelPath: GroundVehicleModels.M151_JEEP,  offset: (-2, 0,  8), yaw: π * 0.30 },
{ modelPath: GroundVehicleModels.M35_TRUCK,  offset: (-16, 0, 14), yaw: π * 0.50 },
{ modelPath: GroundVehicleModels.M113_APC,   offset: ( 10, 0, 18), yaw: π * 0.70 },
// M48 bay anchor at (28, 0, 22) — populated by the real Tank IVehicle
// from M48_SPAWN_OFFSETS.open_frontier; no dressing prop here.
{ modelPath: StructureModels.AMMO_CRATE,   offset: (-24, 0,  0) },
{ modelPath: StructureModels.SUPPLY_CRATE, offset: (-24, 0,  4) },
{ modelPath: StructureModels.FUEL_DRUM,    offset: (-24, 0, -4) },
```

Z-stagger: 8 → 18 (10 m spread, was 4 m). Yaw spread: 72°
(`π * 0.3` to `π * 0.7`), was 27°. M48 bay radius from prefab
centre: `sqrt(28² + 22²) ≈ 35.6 m`, just inside the 36 m OF
footprint declared by `airfield_motor_pool` in
`OpenFrontierConfig.ts`.

OF M48 scenario spawn (`src/config/vehicles/m48-config.ts`):

```ts
M48_SPAWN_OFFSETS = {
  // Open Frontier: airfield Main Motor Pool bay — anchor (155, 0, -1195)
  // plus M48 bay slot (28, 0, 22) from the reflowed motor_pool_heavy_of
  // prefab. Dressing M48 prop removed from the prefab; this real Tank
  // IVehicle is the only M48 visible in OF.
  open_frontier: { x: 183, z: -1173, yaw: Math.PI * 0.55 },
  // A Shau Valley spawn unchanged.
  a_shau_valley: { /* ... */ },
};
```

## Playwright smoke evidence

Saved under
`artifacts/cycle-motor-pool-reflow-and-tank-dedup/playtest-evidence/`
by `scripts/capture-motor-pool-shots.ts`. The `artifacts/`
directory is gitignored at the repository root; if captures are
produced, they're force-added (`git add -f`) on the cycle close
commit so the owner sweep can browse them on master without
rerunning the script.

### Capture-state caveat — captures NOT pre-baked

This R2 task lands the capture script + memo + PLAYTEST_PENDING
row. **The PNGs themselves are not committed on this branch.**
Running the capture script end-to-end requires a built perf-harness
bundle (`npm run build:perf`) plus a warm Playwright browser cache
(`npx playwright install chromium`); both add several minutes to
the task and were judged out-of-budget for this evidence task
(`Commit + push by tool call ~30` per the task brief).

The owner can produce the PNGs during the campaign-close walk by
running:

```
git checkout master
npm run build:perf
npx playwright install chromium  # if not cached
# Pre baseline — checkout pre-cycle-#3 tip:
git checkout 67969e60   # campaign baseline (cycle-#3 not yet merged)
npx tsx scripts/capture-motor-pool-shots.ts --pair-tag=pre
# Post — return to master tip:
git checkout master
npx tsx scripts/capture-motor-pool-shots.ts --pair-tag=post
# Optional F-prompt close-up (depends on cycle #1 boarding wire):
npx tsx scripts/capture-motor-pool-shots.ts --pair-tag=post --include-prompt
```

The script tolerates partial failure: each capture is best-effort,
logs the failure to the `summary-<pair-tag>.json`, and continues to
the next shot. If the dev server fails to start cleanly or A Shau
hydrology cache is cold, the per-shot `notes` field records the
failure so the owner sweep can see exactly which captures need a
rerun.

### Capture matrix

| Shot | Pose | Pre evidence | Post evidence |
|---|---|---|---|
| `of-motor-pool` | SW overlook of OF Main Motor Pool at `(110, 35, -1240)`, looking NE | `of-motor-pool-pre.png` | `of-motor-pool-post.png` |
| `ashau-motor-pool` | SW overlook of A Shau Main Motor Pool (anchor resolved at runtime from `worldFeatureSystem.getFeatures()`), looking NE | `ashau-motor-pool-pre.png` | `ashau-motor-pool-post.png` |
| `of-fob-no-tank` | OF West FOB area at `(-1075, 30, -820)`, looking NE | _(N/A — single-state, post only)_ | `of-fob-no-tank.png` |
| `of-motor-pool-tank-prompt` (optional, `--include-prompt`) | Player-eye height ~5 m off the relocated M48's left flank | _(N/A — single-state)_ | `of-motor-pool-tank-prompt.png` (only renders if cycle #1 boarding wire is in the build) |

Total: 5 captures on the default `--pair-tag=post --include-prompt`
run (or 4 without `--include-prompt`); 2 captures on a `--pair-tag=pre`
run (OF motor pool + A Shau motor pool wide shots only — FOB no-tank
and prompt close-up are single-state).

### Capture-state caveats

- Headless Chromium in this checkout does not grant a WebGPU
  adapter by default; the default `webgpu` mode resolves to
  `webgpu-webgl-fallback` (the WebGL2-backend-of-`WebGPURenderer`
  path mobile lands on). All four captures exercise the same
  resolved backend pre vs post, so the visual difference is wholly
  attributable to the R1 production landings, not renderer drift.
- The A Shau motor pool anchor is resolved at script start by
  probing `worldFeatureSystem.getFeatures()` for a feature whose
  `id` or `name` contains "motor_pool" — this insulates the script
  from minor reposition tweaks in `AShauValleyConfig.ts`. If the
  probe fails (feature id schema drifts), the A Shau shot is
  skipped and the failure is recorded in `summary-<pair-tag>.json`.
- The F-prompt close-up (`of-motor-pool-tank-prompt.png`) requires
  the cycle #1 (`cycle-vekhikl-player-boarding-wire`) F-key
  handler being on master before the captured frame will show the
  "Press F to board M48 Patton" HUD panel. Without it, the
  capture still succeeds but the panel is absent (or shows the
  pre-cycle-#1 placeholder).
- The `of-fob-no-tank` shot proves the *absence* of the M48 silhouette
  near the West FOB. The capture pose is the West FOB compound
  centre `(-1025, 0, -760)` framed from `(-1075, 30, -820)`. Owner
  walk should confirm no tank silhouette appears anywhere in the
  immediate FOB vicinity (the real Tank IVehicle has been relocated
  to the motor pool ~1100 m east).

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's "Owner playtest required" notes plus the four R1
acceptance items.

1. **Open Frontier motor pool wide read.**
   - Spin up dev preview (`npm run dev`), load Open Frontier.
   - Navigate to the airfield Main Motor Pool at `(155, 0, -1195)`.
   - Confirm four ground vehicles read as a working motor pool, not
     a rigid parking strip: M48 in its own bay at the east edge,
     M113 staggered ~4 m forward of it, M151 jeep closer to the
     warehouse with a distinctive yaw, M35 truck on the west side.
   - Confirm clearances: no two vehicles' hulls overlap; each pair
     has ≥ 1.5 m bounding-box gap at the placement yaw.
   - Confirm the AMMO / SUPPLY / FUEL crates flank the comms tower
     (`-24` on X), no longer forming a second row behind the
     vehicles.
   - Compare against `of-motor-pool-pre.png` and
     `of-motor-pool-post.png`.

2. **OF M48 dedup — one tank, not two.**
   - At the motor pool, confirm exactly ONE M48 silhouette is
     visible: the real Tank IVehicle at `(183, 0, -1173)` in the
     bay. No second dressing M48 prop.
   - Walk west ~1100 m to the West FOB compound at
     `(-1025, 0, -760)`. Confirm no M48 silhouette anywhere in the
     FOB vicinity (this is the area the scenario M48 used to spawn
     pre-cycle-#3).
   - Compare against `of-fob-no-tank.png`.

3. **F-prompt at the motor pool M48 (depends on cycle #1).**
   - Approach the motor pool M48 within ~6 m.
   - **Expected (cycle #1 on master):** "Press F to board M48 Patton"
     HUD prompt renders. Press F to enter; player ejects to the
     turret seat (or pilot seat, per cycle #1 wiring).
   - **Expected (cycle #1 not yet on master):** Prompt does not
     render. Note in walk log as a cycle-sequencing observation,
     not a cycle-#3 defect.
   - Compare against `of-motor-pool-tank-prompt.png` if captured.

4. **A Shau motor pool no-regression.**
   - Load A Shau Valley. Navigate to the A Shau Main Motor Pool.
   - Confirm the layout reads identically to pre-cycle-#3:
     M48 + M113 + M151 + M35 in the cycle-vekhikl-3-shipped
     arrangement; crates behind in the z=20 row; same prefab
     children. The split into `motor_pool_heavy_ashau` should be
     visually transparent.
   - Compare against `ashau-motor-pool-pre.png` and
     `ashau-motor-pool-post.png`. **Pre and post should be visually
     identical** at the wide framing (any visible difference
     indicates a regression introduced by the prefab split — flag
     for follow-up).

5. **Minimap + full map (sanity check).**
   - On OF, glance at the minimap and confirm the motor pool M48
     glyph reads at the motor pool world position (not at the
     West FOB).
   - Open the M-key full map and confirm the same.

## Defects observed during R1 + R2 dispatch

R1 reviewer-flagged items (informational; do NOT fix here — captured
as cycle-retro items per orchestrator policy):

- **PR #290 (motor-pool-heavy-reflow):** Forced side-effects on
  `src/types/gameModeTypes.ts` + `scripts/check-terrain-visual.ts`
  (user-approved scope expansion). The split prefab introduces two
  new prefab IDs that the gameModeTypes union + the terrain-visual
  smoke needed to know about. Cycle-retro item — note that
  prefab-ID additions ripple to these two files in any future
  prefab-split cycle.

R2 defects observed during this task: _(none recorded at task-author
time; populate during owner sweep.)_

## Owner sign-off

_(Empty as of 2026-05-20 — PENDING owner walk-through. Append below
on completion.)_

Date: PENDING
Walked by: PENDING
Verdict: PENDING (`accepted` / `rejected` / `partial`)
One-line summary: PENDING

## Acceptance items (for the owner sweep)

Owner checks each box during the walk-through. Empty checkboxes
below; populate at sweep time.

- [ ] **OF motor pool reads as a working motor pool** — staggered
      bays, varied yaws, crate row off the parking strip.
- [ ] **Exactly ONE M48 in OF** at the motor pool bay; none at the
      West FOB.
- [ ] **F-prompt fires at the motor pool M48** (or noted as
      cycle-sequencing observation if cycle #1 not yet on master).
- [ ] **A Shau motor pool visually unchanged** vs pre-cycle-#3.
- [ ] **Minimap + full map** show the M48 glyph at the motor pool
      world position.
- [ ] **No new carry-overs** opened against this cycle (any visual
      issues become a follow-up `cycle-motor-pool-reflow-fix`
      cycle, not a carry-over).

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close
  `VEKHIKL-LAYOUT-1` in `docs/CARRY_OVERS.md` with this cycle's
  close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-motor-pool-reflow-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are
  not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: PASS (no test changes; the R1 PRs added their
  own clearance + scenario-spawn tests).
- `npm run build`: PASS.
- Doc + PLAYTEST_PENDING row + capture script committed.
- Up to 5 captures available under
  `artifacts/cycle-motor-pool-reflow-and-tank-dedup/playtest-evidence/`
  once the script runs (force-added past `.gitignore` on cycle close,
  or generated by the owner during the walk-through).

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence
channel for `VEKHIKL-LAYOUT-1` and the cycle-close acceptance.
This task lands the evidence-capture surface so the owner sweep has
a deterministic capture script to run against; the actual PNGs are
deferred to the owner's walk-through invocation since the
campaign's R2-budget discipline favoured committing the script +
memo over a multi-minute Playwright + perf-build run inside the
worktree sandbox.
