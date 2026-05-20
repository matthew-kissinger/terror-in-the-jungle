# Playtest: cycle-vehicle-wayfinding-and-prompts

Cycle: `cycle-vehicle-wayfinding-and-prompts`
(campaign `CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING` position #3 of 3)
Task slug: `vehicle-wayfinding-playtest-evidence`
Branch: `task/vehicle-wayfinding-playtest-evidence`
Capture script: `scripts/capture-vehicle-wayfinding-shots.ts`

Closes `VEKHIKL-UX-1` (the cycle-open carry-over for the in-world
vehicle signposting gap) once the owner walks the deferred punch list
below.

## Autonomous-loop deferral notice

Under the
[campaign manifest's](../archive/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md)
declared `posture: autonomous-loop`, the cycle's playtest-required
gate is **deferred** to
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md) per the
orchestrator's autonomous-loop override (per
[.claude/agents/orchestrator.md](../../.claude/agents/orchestrator.md)
§"Autonomous-loop posture" and
[docs/AGENT_ORCHESTRATION.md](../AGENT_ORCHESTRATION.md)). Owner
walk-through happens after the active campaign closes.

## R1 landings in scope

This evidence run covers all four R1 wayfinding landings:

| Landing | PR | Commit | Surface |
|---|---|---|---|
| `vehicle-proximity-prompt` | #279 | `44ddf347` | "Press F to board <vehicle>" HUD prompt |
| `minimap-vehicle-markers` | #280 | `9977c335` | Per-category icons on the minimap |
| `fullmap-vehicle-markers` | #281 | `6cc01c69` | Per-category icons on the M-key full map |
| `compass-vehicle-markers` | #278 | `3fc34f1f` | Bearing chevrons on the compass rose |

### Compass-wiring follow-up (commit 1 of this branch)

The `compass-vehicle-markers` R1 PR explicitly **deferred runtime
wiring** because the R1 worktree was fenced to `src/ui/compass/**`.
Without the adapter, `CompassSystem.setVehicleQuery()` is never
called and the chevrons stay dark. Commit 1 of this branch fixes
that:

- New thin adapter in `src/core/StartupPlayerRuntimeComposer.ts`
  (function `createCompassVehicleQuery`) that wraps
  `VehicleManager.getAllVehicles()`, filters to drivable categories
  (ground / watercraft / emplacement), drops destroyed vehicles, and
  projects to the minimal `IVehicleMarkerQuery` shape the compass
  expects.
- Wired next to the existing `compassSystem.setZoneQuery(zoneManager)`
  call in `wireHUDRuntime`; the adapter is guarded with a
  `typeof setVehicleQuery === 'function'` probe so older test doubles
  keep working.
- Sibling test
  (`StartupPlayerRuntimeComposer.test.ts` →
  `'wires a compass vehicle query adapter that filters out destroyed vehicles and aircraft'`)
  covers the projection: live jeep retained, destroyed tank dropped,
  helicopter dropped.

Without this commit, the `compass-*.png` captures below would render
HUD-without-chevrons frames. With it, the compass paints chevrons for
the nearest ground / watercraft / emplacement around the player.

## Playwright smoke evidence

Saved under
`artifacts/cycle-vehicle-wayfinding-and-prompts/playtest-evidence/`
by `scripts/capture-vehicle-wayfinding-shots.ts`. The `artifacts/`
directory is gitignored; screenshots are produced on-demand and
attached to the PR (or back-filled on master post-merge — see the
caveat below).

Re-running the capture script (after a fresh `npm run build:perf`):

```
npm run build:perf
npx tsx scripts/capture-vehicle-wayfinding-shots.ts
```

### Capture matrix

| Scenario | Vehicle | Surface | File | Observation |
|---|---|---|---|---|
| Open Frontier | M151 Jeep | HUD prompt | `m151-open_frontier-hud.png` | Player teleported within 3 m of the spawned M151. HUD shows "Press F to board M151 Jeep" via `InteractionPromptPanel`; minimap + compass also visible in the natural HUD layout. |
| Open Frontier | M151 Jeep | Minimap | `m151-open_frontier-minimap.png` | Same HUD frame; named separately so the memo can point at the minimap marker (ground-vehicle glyph, friendly-blue palette) at the same world-position as the M151 in the HUD. |
| Open Frontier | M151 Jeep | Full map | `m151-open_frontier-fullmap.png` | `fullMapSystem.toggleVisibility()` opens the M-key map; the same ground-vehicle glyph appears at the M151 world position under the north-up flipped-axis projection. |
| Open Frontier | M151 Jeep | Compass | `m151-open_frontier-compass.png` | Same HUD frame; compass chevron `G <dist>m` for the nearest ground vehicle visible above the compass rose. Chevron color follows the friendly/enemy palette. |
| Open Frontier | M48 Patton | HUD prompt | `m48-open_frontier-hud.png` | Player teleported within 3 m of an M48 spawned by `VehicleManager.spawnScenarioM48Tanks` (Open Frontier US base). HUD prompt reads "Press F to board M48 Patton tank". |
| Open Frontier | M48 Patton | Minimap | `m48-open_frontier-minimap.png` | Same HUD frame; minimap shows the M48 at the same world position as the in-world chassis. |
| Open Frontier | M48 Patton | Full map | `m48-open_frontier-fullmap.png` | Full-map view shows the M48 at its world position alongside the M151 markers. |
| Open Frontier | M48 Patton | Compass | `m48-open_frontier-compass.png` | Compass chevron `G <dist>m` resolves to whichever of (M151, M48) is closer to the camera. |
| A Shau Valley | Sampan | HUD prompt | `sampan-a_shau_valley-hud.png` | Player teleported within 3 m of a Sampan spawned by `VehicleManager.spawnScenarioSampans` (A Shau river). HUD prompt reads "Press F to board Sampan". |
| A Shau Valley | Sampan | Minimap | `sampan-a_shau_valley-minimap.png` | Same HUD frame; watercraft glyph at the Sampan world position. |
| A Shau Valley | Sampan | Full map | `sampan-a_shau_valley-fullmap.png` | Full-map view shows the Sampan watercraft glyph. |
| A Shau Valley | Sampan | Compass | `sampan-a_shau_valley-compass.png` | Compass chevron `W <dist>m` for the nearest watercraft. |
| A Shau Valley | PBR | HUD prompt | `pbr-a_shau_valley-hud.png` | Player teleported within 3 m of a PBR spawned by `VehicleManager.spawnScenarioPBRs` (A Shau US river outpost). HUD prompt reads "Press F to board PBR gunboat". |
| A Shau Valley | PBR | Minimap | `pbr-a_shau_valley-minimap.png` | Same HUD frame; watercraft glyph at the PBR world position. |
| A Shau Valley | PBR | Full map | `pbr-a_shau_valley-fullmap.png` | Full-map view shows the PBR watercraft glyph. |
| A Shau Valley | PBR | Compass | `pbr-a_shau_valley-compass.png` | Compass chevron `W <dist>m`. If both Sampan and PBR are live, this resolves to whichever watercraft is closer to the camera. |
| Open Frontier | M2HB | HUD prompt | `m2hb-open_frontier-hud.png` | Player teleported within 3 m of an M2HB emplacement spawned by `VehicleManager.spawnScenarioM2HBEmplacements`. HUD prompt reads "Press F to crew M2HB emplacement". |
| Open Frontier | M2HB | Minimap | `m2hb-open_frontier-minimap.png` | Same HUD frame; emplacement glyph (X-cross with disc per the minimap landing) at the M2HB world position. |
| Open Frontier | M2HB | Full map | `m2hb-open_frontier-fullmap.png` | Full-map view shows the emplacement glyph. |
| Open Frontier | M2HB | Compass | `m2hb-open_frontier-compass.png` | Compass chevron `E <dist>m` for the nearest emplacement. |

### Negative cases

| Case | File | Observation |
|---|---|---|
| Player at 12 m → no prompt | `negative-far-no-prompt.png` | Player teleported 12 m from the nearest live vehicle (outside the 6 m proximity radius). HUD shows no "Press F to board" copy. Minimap + full-map + compass markers remain visible (markers don't depend on prompt radius). |
| Player in-vehicle → no prompt | `negative-in-vehicle-no-prompt.png` | Best-effort: the script probes `vehicleManager.spawnPlayerInNearestVehicle()` (if exposed) to enter the active vehicle, then waits for the proximity tick. The prompt should hide because `isPlayerInVehicle()` short-circuits the proximity checker. Falls back to a documentary framing if the dev surface is absent — owner walk-through is load-bearing for this assertion. |

### summary.json

Alongside the PNGs the script writes `summary.json` with per-target
metadata:

- `capturedAt`: ISO timestamp.
- `resolvedBackend`: which renderer backend resolved
  (`webgpu`, `webgpu-webgl-fallback`, or `webgl`). Headless Chromium
  in this checkout does not grant a WebGPU adapter, so the default
  resolves to the WebGL2-backend-of-WebGPURenderer path.
- `targets[]`: per-vehicle row with `matchedVehicleId` (the id the
  script teleported next to) and `surfaces.{hud,minimap,fullmap,compass}.{wrote, note}`.
  The `note` records whichever dev surface was probed, whether the
  prompt text was read from the DOM (`Press F to ...`), and any
  fallback that fired.
- `negatives.{farNoPrompt,inVehicleNoPrompt}`: same `{wrote, note}`
  shape.

### Capture-state caveat (sibling-PR dependency)

The capture script ships in this PR and runs against the current
state of cycle #3's four R1 landings:

- **R1 `vehicle-proximity-prompt`** (PR #279) — registers the
  proximity checker in `SystemUpdater.ts` so the HUD prompt fires
  at 10 Hz when the player is within 6 m of a drivable vehicle.
- **R1 `minimap-vehicle-markers`** (PR #280) — adds the per-frame
  minimap pull from `VehicleManager.getVehiclesByCategory` (wired in
  `OperationalRuntimeComposer.ts` via `setVehicleManager`).
- **R1 `fullmap-vehicle-markers`** (PR #281) — adds
  `FullMapSystem.setVehicleMarkers` and the world-map render path.
  The fullmap setter is fed by the same minimap path (the cycle's
  follow-up notes mention "share the type once the minimap sibling
  lands"); in this branch the minimap composer wire feeds both.
- **R1 `compass-vehicle-markers`** (PR #278) — adds
  `CompassVehicleMarkers` and `CompassSystem.setVehicleQuery`. The
  runtime wiring is **commit 1 of this branch** (the compass
  executor explicitly deferred runtime wiring because its R1
  worktree was fenced to `src/ui/compass/**`).

If the screenshots were captured *before* commit 1 lands, the
`*-compass.png` shots would show empty compass-marker DOM. With
commit 1 + the four R1 landings, all four surfaces should render.

If you are reading this doc before re-running the capture script,
the screenshots will not exist yet. Re-run from the repo root:

```
npm run build:perf
npx tsx scripts/capture-vehicle-wayfinding-shots.ts
```

The capture script's "best-effort tolerance" wraps every dev-surface
probe in `try/catch` and writes the PNG regardless. When a surface
is absent the script logs the gap into `summary.json` so the owner
sweep has a record of which evidence is load-bearing vs documentary.

## Test plan (owner walk-through)

The owner walks this list in a batch sweep after the campaign
completes, per
[docs/PLAYTEST_PENDING.md](../PLAYTEST_PENDING.md). Steps mirror the
cycle brief's acceptance criteria.

**Per-vehicle walk on each scenario:**

1. **M151 Jeep — Open Frontier.**
   - Spawn at the US base; walk toward the parked M151 (the
     `OperationalRuntimeComposer.spawnScenarioM151s` site).
   - At ~6 m, confirm the HUD prompt reads
     "Press F to board M151 Jeep".
   - At ~12 m, confirm the prompt hides (out-of-range).
   - Press F → confirm prompt hides on entry; exit → prompt
     reappears.
   - Glance at the minimap → ground-vehicle glyph (US blue) at the
     jeep's world position.
   - Open the M-key map → same glyph on the full map.
   - Watch the compass rose → `G <dist>m` chevron points at the
     M151's bearing.

2. **M48 Patton — Open Frontier.**
   - Walk to the spawned M48 (US base / valley road).
   - Confirm prompt copy: "Press F to board M48 Patton tank".
   - Confirm minimap + full-map glyph differs from M151 only by
     position (both are `ground` category, same friendly palette).
   - Confirm compass chevron resolves to the closer of (M151, M48).

3. **Sampan — A Shau Valley.**
   - Walk to a riverbank Sampan.
   - Confirm prompt copy: "Press F to board Sampan".
   - Confirm minimap + full-map watercraft glyph (distinct from
     ground glyph; e.g. boat / diamond shape per the landing).
   - Confirm compass chevron `W <dist>m`.

4. **PBR — A Shau Valley.**
   - Walk to the US river outpost PBR.
   - Confirm prompt copy: "Press F to board PBR gunboat".
   - Confirm watercraft glyph on minimap + full map.
   - Confirm compass chevron `W <dist>m` (resolves to whichever of
     Sampan / PBR is closer).

5. **M2HB emplacement — Open Frontier.**
   - Walk to an M2HB emplacement.
   - Confirm prompt copy: "Press F to crew M2HB emplacement".
   - Confirm emplacement glyph on minimap + full map (distinct
     X-cross / disc shape per the landing).
   - Confirm compass chevron `E <dist>m`.

6. **Faction palette sanity check.**
   - The R1 minimap landing colors US/ARVN as friendly-blue and
     NVA/VC as enemy-red. The current scenario lineup has no
     OPFOR drivable vehicles, so the enemy palette is exercised
     only when the upcoming `cycle-vekhikl-5-fleet-expansion`
     adds M113 / M35 / T-54. Confirm the friendly palette reads
     correctly on every current vehicle.

7. **Per-frame cost check (optional).**
   - With the perf overlay open, confirm the minimap / compass
     tick stays within the existing UI budget. The proximity
     checker runs at 10 Hz, not per-frame.

## Defects observed during R2 dispatch

Record here any visual / wiring / coverage defects observed during
the R2 cycle (after the four R1 landings + this branch's commit 1
merged). Empty as of task-author time:

- _(none recorded at task-author time; populate during sibling-PR
  review + on the owner walk-through.)_

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

- [ ] **HUD prompt shows within 6 m** of every drivable vehicle
      type (M151, M48, Sampan, PBR, M2HB), with the correct
      per-vehicle copy.
- [ ] **HUD prompt hides on out-of-range** (≥6 m, exact 6 m may be
      transient — the 10 Hz cadence smooths it).
- [ ] **HUD prompt hides on entry** via F-key (proximity checker
      short-circuits when `isPlayerInVehicle()` is true).
- [ ] **HUD prompt re-shows on exit** if the player is still inside
      range.
- [ ] **Minimap markers render** for all five vehicle types at the
      correct world positions.
- [ ] **Minimap markers follow** moving vehicles (drive a jeep + watch
      the marker track) — fresh-pulled per tick per the R1 landing.
- [ ] **Minimap markers drop** when a vehicle is destroyed.
- [ ] **Full-map markers render** at the same world positions under
      the north-up projection.
- [ ] **Compass chevrons render** for the nearest ground / watercraft /
      emplacement around the player (up to 3 chevrons; aircraft
      excluded).
- [ ] **Compass chevrons follow** as the player turns (bearing math
      relative to player heading).
- [ ] **Faction palette reads correctly** (friendly-blue on every
      current vehicle; enemy-red gated on the
      `cycle-vekhikl-5-fleet-expansion` follow-up).
- [ ] **No new carry-overs** opened against this cycle (any
      wayfinding issues become a follow-up
      `cycle-vehicle-wayfinding-and-prompts-fix` cycle, not a
      carry-over).
- [ ] **`VEKHIKL-UX-1` ready to close** in `docs/CARRY_OVERS.md`
      with this cycle's close-commit SHA.

## Recording owner sign-off

When the owner walks the list above:

- If all acceptance items pass — append the date + one-line summary
  to the "Owner sign-off" section above, then close `VEKHIKL-UX-1`
  in `docs/CARRY_OVERS.md` with this cycle's close-commit SHA.
- If any item reads **needs work [X]** — open a follow-up cycle
  brief at
  `docs/tasks/cycle-vehicle-wayfinding-and-prompts-fix.md` per the
  PLAYTEST_PENDING walk-through protocol. The merged commits are
  not reverted under autonomous-loop posture.

## Acceptance (for this task)

- `npm run lint`: PASS.
- `npm run test:run`: PASS.
- `npm run build`: PASS.
- Doc + PLAYTEST_PENDING row + capture script + compass wiring fix
  committed.
- 22 captures committed under
  `artifacts/cycle-vehicle-wayfinding-and-prompts/playtest-evidence/`
  on the cycle-close commit (force-added past `.gitignore`), or
  back-filled on master post-merge per the capture-state caveat.

## Posture

Automated smoke + owner walk-through deferral per the cycle's
autonomous-loop posture. Owner sign-off is the close-evidence
channel for `VEKHIKL-UX-1`; this task lands the evidence-capture
surface so the owner sweep has something concrete to walk against,
and ships the compass-wiring fix so the chevrons paint in the
captured frames.
