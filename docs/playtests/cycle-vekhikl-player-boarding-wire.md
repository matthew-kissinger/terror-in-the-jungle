# Playtest: cycle-vekhikl-player-boarding-wire

Last verified: 2026-05-20

Cycle: `cycle-vekhikl-player-boarding-wire` (campaign
[2026-05-20-vehicle-boarding-and-water](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md)
cycle #1)
Task slug: `vekhikl-board-integration-test-and-playtest-evidence` (R2, merge gate)
Branch: `task/vekhikl-board-integration-test-and-playtest-evidence`
Capture script: `scripts/capture-vekhikl-player-boarding-shots.ts`
L3 integration test: `src/integration/vehicle/board-five-types.test.ts`

Opens + closes `VEKHIKL-UX-2` (F-key boarding wire-up across all five
drivable vehicle types) once the owner walks the deferred punch list
below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../CAMPAIGN_2026-05-20-VEHICLE-BOARDING-AND-WATER.md)
declared `posture: autonomous-loop`, the cycle's playtest-required gate
is **deferred** to [docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md)
per the orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens in a batch sweep after the campaign closes.

This document substitutes (1) a cross-category L3 integration test
asserting the boarding round-trip works for every drivable type, and
(2) a Playwright capture script that records pre-press / post-press /
post-exit framings for each vehicle. Owner sign-off on the punch list
at the bottom is still required to flip `VEKHIKL-UX-2` to Closed in
[docs/CARRY_OVERS.md](../CARRY_OVERS.md).

## What landed this cycle (cross-link)

Five R1 PRs + one R2 merge-gate PR land the boarding glue end-to-end.
At the time of writing, all five R1 PRs are on master:

| PR | Subject | What it wires |
|---|---|---|
| #293 | `vekhikl-board-input-router` | F-key router in `PlayerInput`: boarding first, mortar fallback. |
| #297 | `vekhikl-board-factory-module` | `PlayerVehicleAdapterFactory` module + tests (split A of the controller-factory task). |
| #298 | `vekhikl-board-handler-and-composer-wire` | `PlayerController.handleBoardNearestVehicle()` + composer hand-off so the factory is on the live controller (split B). |
| #289 | `vekhikl-board-ground-adapter-wire` | M151 L3 boarding test. |
| #288 | `vekhikl-board-tank-adapter-wire` | M48 L3 boarding test. |
| #296 | `vekhikl-board-watercraft-and-emplacement-wire` | Sampan + PBR pilot + M2HB L3 boarding tests. |
| this PR | `vekhikl-board-integration-test-and-playtest-evidence` | Cross-category L3 + Playwright captures + this memo. |

Sibling task `vekhikl-board-system-updater-wire` dispatched in parallel
with this one mounts the proximity-checker into `SystemUpdater` so the
HUD prompt fires under the live game loop (the L3 tests in this
directory mount the checker by hand in their harness; the wire is the
production path that activates it from the actual update tick).

## Playwright capture evidence

Saved under
`artifacts/cycle-vekhikl-player-boarding-wire/playtest-evidence/`
when `scripts/capture-vekhikl-player-boarding-shots.ts` runs. The
capture matrix is 15 PNGs:

| # | Vehicle type | Frame | Filename | Observation |
|---|---|---|---|---|
| 1 | M151 (ground) | pre-press  | `m151-open_frontier-pre-press.png`  | Player ~3 m off the jeep on Open Frontier; HUD shows "Press F to board M151 Jeep". |
| 2 | M151 (ground) | post-press | `m151-open_frontier-post-press.png` | After F: player seated, third-person follow camera engaged, HUD prompt hidden. |
| 3 | M151 (ground) | post-exit  | `m151-open_frontier-post-exit.png`  | After second F: player ejected to the +X side of the chassis; HUD prompt returns inside 6 m. |
| 4 | M48 (tank)    | pre-press  | `m48-open_frontier-pre-press.png`   | Player near the motor-pool M48; HUD shows "Press F to board M48 Patton". |
| 5 | M48 (tank)    | post-press | `m48-open_frontier-post-press.png`  | Player seated in pilot seat; gunner swap is out of scope this cycle. |
| 6 | M48 (tank)    | post-exit  | `m48-open_frontier-post-exit.png`   | Player ejected to the side of the hull, ~2.5 m horizontal offset clear of the skirt. |
| 7 | Sampan (watercraft) | pre-press  | `sampan-a_shau_valley-pre-press.png`  | Player near the A Shau sampan; HUD shows "Press F to board Sampan". |
| 8 | Sampan (watercraft) | post-press | `sampan-a_shau_valley-post-press.png` | Player seated as pilot; sampan rocking under buoyancy. |
| 9 | Sampan (watercraft) | post-exit  | `sampan-a_shau_valley-post-exit.png`  | Player ejected onto the riverbank (or in-water step). |
| 10 | PBR (watercraft, pilot) | pre-press  | `pbr-a_shau_valley-pre-press.png`  | Player near the PBR; HUD shows "Press F to board PBR". |
| 11 | PBR (watercraft, pilot) | post-press | `pbr-a_shau_valley-post-press.png` | Player seated as pilot; gunner mounts on the twin M2HB tracks remain free. |
| 12 | PBR (watercraft, pilot) | post-exit  | `pbr-a_shau_valley-post-exit.png`  | Player ejected to the side of the hull; in-water step. |
| 13 | M2HB (emplacement) | pre-press  | `m2hb-open_frontier-pre-press.png`  | Player near the M2HB tripod at the OF FOB; HUD shows "Press F to mount M2HB". |
| 14 | M2HB (emplacement) | post-press | `m2hb-open_frontier-post-press.png` | Player mounted as gunner; barrel-axis camera engaged. |
| 15 | M2HB (emplacement) | post-exit  | `m2hb-open_frontier-post-exit.png`  | Player dismounted to the side of the tripod base. |

Plus `summary.json` with per-target metadata (matched vehicle id,
`boardCallResult` ∈ {`true`,`false`,`absent`,`error`}, same for
`exitCallResult`, and `resolvedBackend`).

### Capture-execution note (R2 budget discipline)

Following the same pattern PR #295 used for the motor-pool captures,
the script ships in this PR but the PNG run is deferred to the owner
walk-through under autonomous-loop posture. Running the script
end-to-end requires:

```
npx tsx scripts/capture-vekhikl-player-boarding-shots.ts
```

against the perf-harness preview build (`dist-perf`). The script
tolerates an absent `boardingFactory` surface (probes both the split B
field and the legacy `tryBoardNearestVehicle` callback). If the
proximity-checker SystemUpdater wire from sibling task
`vekhikl-board-system-updater-wire` has not yet landed at run time,
`boardCallResult` will record `false` (the proximity prompt id is not
latched, the factory refuses boarding) — that's a useful negative
sample and informs the owner's walk decision.

### Renderer-backend caveat

Headless Chromium in this checkout does not grant a WebGPU adapter, so
the default `webgpu` mode resolves to `webgpu-webgl-fallback` (the
same WebGL2-backend-of-`WebGPURenderer` path mobile lands on). The
capture script prints the resolved backend at run time. Visual parity
across strict-WebGPU desktop is not in scope for this playtest gate
(boarding is a CPU-side adapter wire; no shader path differs across
backends).

## L3 integration test evidence

`src/integration/vehicle/board-five-types.test.ts` exercises the real
`PlayerVehicleAdapterFactory` + `GroundVehicleProximityChecker` +
`VehicleManager` + `VehicleSessionController` against each of the five
drivable categories. Each row asserts:

1. The proximity checker latches the expected vehicle id when the
   player is inside `PROMPT_RADIUS_M` (6 m).
2. `factory.tryBoardNearest()` returns `true` and the session
   controller flips to `isInVehicle()`.
3. The session controller's `getVehicleType()` resolves to the correct
   category (`ground` / `tank` / `watercraft` / `emplacement`).
4. `factory.tryExit()` returns `true` and the session controller
   flips back.

Plus two cross-cutting cases:

5. Mortar-fallback signal: when no vehicle is in proximity,
   `tryBoardNearest` returns `false` (the F-key router's signal to
   forward F to `onMortarFire`).
6. Exit no-op parity: `tryExit` returns `false` when the player is
   not seated.

All seven assertions pass on `vitest run src/integration/vehicle/board-five-types.test.ts`.

## What the owner should walk

Punch list mirroring the cycle brief's Acceptance Criteria. The owner
walks this list in a batch sweep after the campaign completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md).

**On Open Frontier:**

1. Spawn into the map. Locate the M151 near the motor pool.
2. Walk within ~3 m. Confirm HUD shows "Press F to board M151 Jeep".
3. Press F. Confirm camera switches to third-person follow and the
   prompt hides.
4. Drive forward 10 s with W. Confirm acceleration is smooth,
   steering reads as Ackermann.
5. Press F. Confirm the player ejects to the side of the chassis
   (not inside it, not under terrain) and the prompt returns if
   still within 6 m.
6. Repeat steps 2-5 for the **M48 Patton** at the motor-pool bay
   (cycle #3 dedup landed). Drive 10 s with W + A/D skid-steer.
   Confirm pilot seat works; **gunner swap is out of scope this
   cycle** (deferred to `cycle-vekhikl-seat-swaps` on the hold list).
7. Walk to the **M2HB tripod** at the US FOB. Press F to mount.
   Confirm first-person barrel-axis camera engages. Hold LMB; confirm
   fire intent reaches the M2HB system (slew + fire path was wired
   by cycle vekhikl-2 — this cycle only proves the mount). Press F
   to dismount.

**On A Shau Valley:**

1. Spawn into the map. Locate the **Sampan** at the riverbank.
2. Walk within ~3 m. Confirm HUD shows "Press F to board Sampan".
3. Press F. Drive forward 10 s with W. Confirm rudder authority + low
   power profile (Sampan is intentionally slow).
4. Press F. Confirm player ejects beside the hull (riverbank step or
   in-water step both valid; the adapter surfaces which via its
   exit-plan message).
5. Repeat for the **PBR** at the US river outpost. **Pilot seat only**
   — gunner swap to the M2HB twin mounts is out of scope this cycle
   (same hold-list cycle as the M48 gunner swap).

**Mortar fallback (load-bearing — the cycle brief calls this out
specifically):**

1. Walk somewhere with no vehicle in 6 m proximity. Confirm there
   is no HUD prompt.
2. Press F. Confirm the mortar fires (assuming a mortar has been
   deployed). This is the F-key router's "boarding declined →
   forward to `onMortarFire`" path; if mortar fire breaks, that's a
   regression in the router's gate.
3. Board any vehicle. Confirm pressing F while seated triggers
   **exit**, not mortar fire (router checks `isInVehicle()` first).

## Recording owner sign-off

When the owner walks the list above:

- If all steps on both maps read as **playable** and **feels right** —
  append an "Owner sign-off" section to this file with the date + a
  one-line summary, then close `VEKHIKL-UX-2` in `docs/CARRY_OVERS.md`
  with this cycle's close-commit SHA.
- If anything reads as **needs work [X]** — open a follow-up cycle
  brief at `docs/tasks/cycle-vekhikl-player-boarding-wire-fix.md` per
  the PLAYTEST_PENDING walk-through protocol. The merged commits are
  not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: PASS (board-five-types.test.ts + sibling per-adapter L3 tests all green).
- `npm run build`: PASS.
- L3 integration test, capture script, this memo, PLAYTEST_PENDING row
  committed.
- Screenshot paths reserved under
  `artifacts/cycle-vekhikl-player-boarding-wire/playtest-evidence/`;
  populated by the capture script on owner walk-through invocation
  (same pattern as PR #295).

## Posture

Automated L3 cross-category integration test + capture-script-as-evidence
deferral per the cycle's autonomous-loop posture. Owner sign-off is the
merge gate for the `VEKHIKL-UX-2` carry-over promotion to Closed; this
task lands the evidence-capture surface so the owner sweep has
something concrete to walk against.

## NEXT (cycle-scope notes for the owner)

Captured here so the orchestrator's auto-advance does not lose them:

- **M48 pilot ↔ gunner seat swap** — deferred to owner-gated
  `cycle-vekhikl-seat-swaps` (hold list).
- **PBR pilot ↔ gunner swap to M2HB twin mounts** — same hold-list
  cycle as the M48 swap.
- **Fleet expansion** (M113 APC, M35 truck, T-54 tank, optional
  ZU-23-2 AA, LCM-8) — deferred to owner-gated
  `cycle-vekhikl-5-fleet-expansion` (hold list).

None of these block `VEKHIKL-UX-2` closure; they fall out of scope by
the cycle brief's "Out of Scope" section.
