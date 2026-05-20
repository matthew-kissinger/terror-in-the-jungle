# Cycle: Vehicle Wayfinding & Prompts (Press-F-to-board + minimap markers + world-map markers)

Last verified: 2026-05-19 (queued at insertion; pre-dispatch)

## Status

Queued at **position #3** in
[docs/CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md](../CAMPAIGN_2026-05-19-VISUAL-AND-WAYFINDING.md).
Independent of cycles #1 and #2 in the same campaign — runs in parallel.

Closes a new ID `VEKHIKL-UX-1` in CARRY_OVERS.md (introduced by this
cycle) and a backlog gap noted in cycles #4, #6, #8, #9, #10 — every
vehicle cycle from VEKHIKL-1 through VODA-3 closed with the vehicle
playable but with **no in-world affordance** to enter (no HUD prompt,
no minimap marker, no map marker). The owner reported 2026-05-19 not
knowing how to find or enter vehicles in-game.

## Skip-confirm: no

Owner playtest required: load each scenario, walk near each vehicle
type, confirm prompt appears + minimap marker is visible + world-map
marker is visible. Deferred to PLAYTEST_PENDING under autonomous-loop
posture; merge gated on CI green + Playwright capture set covering
the five vehicle types.

## Concurrency cap: 4

R1 ships four independent landings: HUD interact prompt + proximity
checker, minimap vehicle markers, full-map vehicle markers, compass
vehicle markers. R2 ships the playtest evidence.

## Objective

Add the missing wayfinding affordances so the player can find and
enter the five drivable vehicle types (M151 jeep, M48 tank, Sampan,
PBR, M2HB emplacement) that landed across cycles #4, #6, #8, #9, #10
but have no in-world signposting today.

Specifically:

1. **"Press F to board" HUD prompt** — show when player is within
   ~6 m of a drivable vehicle (configurable per vehicle category)
   and not already in a vehicle. Hide on entry, on exit-from-range,
   or on entering a vehicle. Use the existing
   `InteractionPromptPanel` (already mounted in HUD per
   `src/ui/hud/HUDElements.ts:46`) — don't add a new HUD component.
2. **Minimap markers** — drivable vehicles render as small icons
   on the minimap, color-coded by category (ground / watercraft /
   emplacement) and faction. Use the existing helipad-marker plugin
   pattern (`src/ui/minimap/MinimapSystem.ts:181–183`,
   `src/ui/minimap/MinimapRenderer.ts:398–435`) — no new pipeline.
3. **Full-map (M key) markers** — same vehicle icons on the world
   map. Use the same plugin pattern as helipads
   (`src/ui/map/FullMapSystem.ts:680–710`).
4. **Compass markers** — optional bonus: bearing markers on the
   compass rose for the nearest vehicle of each category, with
   distance label. Use the existing `CompassZoneMarkers` extension
   pattern. **Stretch goal — drop if R1 budget tight.**

Notes for follow-up cycle (not in scope here but documented for
queueing):

5. **Fleet expansion** — at least three more vehicle types worth
   adding under a future `cycle-vekhikl-5-fleet-expansion`:
   - **M113 APC** (US, ground): squad transport (6–11 seats);
     open-top gunner pod reuses M2HB; high gameplay value.
   - **M35 "Deuce-and-a-half" truck** (US, ground): cargo/supply
     role; simple mesh; distinct logistics doctrine.
   - **T-54/55 tank** (OPFOR, ground): faction parity with M48;
     enables tank duels; reuses M48 turret/cannon rig.
   - Stretch (optional): **ZU-23-2 twin AA** (OPFOR, emplacement)
     for air denial vs helicopters; **LCM-8 assault craft**
     (amphibious) for beach play.
   - These additions plug into the existing spawn-table contract
     (`src/systems/vehicle/M48TankSpawn.ts:77–157`,
     `src/systems/vehicle/SampanSpawn.ts:56–148`).

Source authority for scope:
- This brief (owner request 2026-05-19; "make it more obvious
  where to go").
- Architectural research: existing minimap/map/HUD plumbing
  documented in this brief's required reading.
- Cycle close memos #4, #6, #8, #9, #10 — each noted that no
  "Press F to board" HUD prompt was wired even though the
  interaction infrastructure existed.

## Branch

- Per-task: `task/<slug>`.
- Orchestrator merges in dispatch order.

## Required Reading

1. `src/ui/hud/InteractionPromptPanel.ts` lines `1–42` (the HUD
   prompt component — `show(text)` / `hide()` API; already mounted).
   `src/ui/hud/HUDElements.ts:46` (instantiation site).
2. `src/ui/hud/HUDSystem.ts` — find the per-frame update loop
   (~`OBJECTIVE_INTERVAL = 0.5` for objectives; vehicles should run
   at a similar cadence — proximity check is cheap but not free).
3. `src/systems/vehicle/FixedWingInteraction.ts` lines `15–100` —
   the existing aircraft proximity-prompt pattern. Mirror this for
   ground / watercraft / emplacement vehicles.
4. `src/systems/vehicle/VehicleManager.ts` lines `31–96` — query
   API: `getVehiclesInRadius(center, radius)`,
   `getVehiclesByCategory(category)`. The proximity checker is a
   thin consumer of these.
5. `src/systems/vehicle/VehicleSessionController.ts` line `43` —
   `enterVehicle()` is the consumer of the F-key intent. The
   proximity prompt must hide when the session activates.
6. `src/ui/minimap/MinimapSystem.ts` lines `17–220` (state + setters)
   and `src/ui/minimap/MinimapRenderer.ts` lines `54–454` (render
   loop). Lines `27–30` define `HelipadMarker`; line `44` adds it to
   `MinimapRenderState`; lines `398–435` draw it. **This is the
   exact pattern to clone for vehicles.**
7. `src/ui/map/FullMapSystem.ts` lines `31–735` (full-map state +
   draw loop). Lines `680–710` are the helipad draw — the
   `north-up` flipped-axis transform at line `454–456` is the world
   map's projection; reuse for vehicles.
8. `src/ui/compass/CompassZoneMarkers.ts` (zone bearing markers on
   the compass rose) — the optional fourth landing's reference
   pattern.
9. `src/systems/vehicle/M48TankSpawn.ts` lines `77–157` and
   `src/systems/vehicle/SampanSpawn.ts` lines `56–148` — the spawn
   table contract. Reference only; no spawn-table changes in this
   cycle.

## Critical Process Notes

1. **No new HUD component.** Reuse `InteractionPromptPanel`. The
   prompt text is a string; pass per-vehicle copy ("Press F to
   board M151 Jeep", "Press F to crew M2HB").
2. **No new minimap or map pipeline.** Extend the existing helipad
   pattern. If the executor proposes a new render layer, halt.
3. **No fence change.** `IVehicle`, `VehicleManager`, and HUD
   interfaces stay as-is.
4. **Per-frame cost stays small.** Proximity check runs at ≤ 10 Hz
   (not per frame). The minimap and full-map updates already poll
   at low cadence; reuse their tick rate.
5. **Faction-aware coloring** — OPFOR vehicles (none yet, but the
   M113 APC + T-54 fleet expansion cycle will add some) show in
   red on minimap, blue for US. Build the API faction-aware now so
   the follow-up cycle doesn't re-cut the schema.
6. **No vehicle-spawn-table changes.** This cycle adds markers and
   prompts to existing vehicles; the fleet-expansion cycle adds
   new vehicles.
7. **No fleet expansion in this cycle.** That's an explicit
   follow-up cycle in the hold list — see "Carry-over impact"
   below and the campaign manifest "Hold list".

## Round Schedule

| Round | Tasks (parallel) | Cap | Notes |
|-------|------------------|-----|-------|
| 1 | `vehicle-proximity-prompt`, `minimap-vehicle-markers`, `fullmap-vehicle-markers`, `compass-vehicle-markers` | 4 | Four independent landings. Compass is the smallest (stretch); can drop if R1 budget tight. |
| 2 | `vehicle-wayfinding-playtest-evidence` | 1 | Single playtest PR. |

## Task Scope

### vehicle-proximity-prompt (R1)

Proximity-driven "Press F to board" HUD prompt.

**Files touched:**
- New: `src/systems/vehicle/GroundVehicleProximityChecker.ts`
  (mirror of `FixedWingInteraction.ts` shape, ~150 LOC).
- `src/core/GameEngineLoop.ts` or `src/core/SystemUpdater.ts` —
  register the proximity checker in the per-frame dispatch.
- `src/ui/hud/HUDSystem.ts` — expose the
  `interactionPromptPanel` on the HUDSystem surface if not already
  accessible.
- New sibling test
  `src/systems/vehicle/GroundVehicleProximityChecker.test.ts`.

**Method:**
1. Implement `GroundVehicleProximityChecker.update(dt)`:
   - At ~10 Hz, call
     `vehicleManager.getVehiclesInRadius(playerPos, PROMPT_RADIUS_M)`
     where `PROMPT_RADIUS_M = 6`.
   - Filter to drivable categories: `ground`, `watercraft`,
     `emplacement`. Skip aircraft (handled by
     `FixedWingInteraction`).
   - Skip if `vehicleSession.isPlayerInVehicle()`.
   - Pick the nearest candidate.
   - Call `hudSystem.interactionPromptPanel.show("Press F to board " + vehicleLabel)`.
   - Cache the last-shown vehicle ID to avoid re-flashing the panel.
   - When no candidate in range, call `hide()`.
2. Per-vehicle label resolver — map `vehicleId` prefix to a copy:
   - `m151_*` → "Press F to board M151 Jeep"
   - `m48_*` → "Press F to board M48 Patton tank"
   - `sampan_*` → "Press F to board Sampan"
   - `pbr_*` → "Press F to board PBR gunboat"
   - `m2hb_*` → "Press F to crew M2HB emplacement"
3. Verify entering a vehicle via F → the prompt hides on the
   same frame (the proximity tick on the next frame finds the
   player in-vehicle and skips).
4. Verify exiting a vehicle returns the prompt if still in range.
5. **Behavior test:** mock a vehicle at distance 5 m → prompt
   shows; move player to 8 m → prompt hides; enter vehicle →
   prompt hides; exit at 5 m → prompt shows.
6. Commit message: `feat(vehicle): proximity-driven press-F-to-board HUD prompt (vehicle-proximity-prompt)`.

**Acceptance:**
- Lint + tests + build green.
- Behavior tests pass for the four state transitions above.
- Playwright smoke confirms the prompt renders at the correct
  copy for each of the five vehicle types.
- No measurable perf impact (the 10 Hz proximity check costs
  µs-scale per tick).

### minimap-vehicle-markers (R1)

Render drivable vehicles as icons on the minimap.

**Files touched:**
- `src/ui/minimap/MinimapSystem.ts` — add `VehicleMarker` type
  (similar to `HelipadMarker` at lines `27–30`), add
  `setVehicleMarkers()` setter (mirror lines `181–183`), wire into
  `MinimapRenderState` (mirror line `44`).
- `src/ui/minimap/MinimapRenderer.ts` — add `drawVehicleMarkers()`
  using `worldToMinimap()` projection; place call in `renderMinimap()`
  loop (after line `71`).
- New: small icon assets if needed (`map-vehicle-jeep`,
  `map-vehicle-tank`, `map-vehicle-boat`, `map-vehicle-emplacement`)
  — reuse existing tank/jeep silhouettes from world-feature
  prefabs if available, otherwise simple 8×8 colored shapes.
- New sibling test.

**Method:**
1. Define `VehicleMarker { worldPos: THREE.Vector3; category: 'ground' | 'watercraft' | 'emplacement'; faction: Faction; vehicleType: string; }`.
2. Add `setVehicleMarkers(markers: VehicleMarker[])` to
   `MinimapSystem`.
3. In the per-frame minimap update (already exists), populate
   `vehicleMarkers` from
   `vehicleManager.getVehiclesByCategory('ground' | 'watercraft' | 'emplacement')`.
4. In `MinimapRenderer.drawVehicleMarkers()`:
   - For each marker, project via `worldToMinimap()`.
   - Pick icon by category (jeep / tank shape for ground; boat
     shape for watercraft; X-cross for emplacement).
   - Color by faction (US blue, OPFOR red — match the existing
     combatant dot palette).
   - Draw at z-order ABOVE combatant dots, BELOW zones and player
     marker.
5. Frustum or culling: draw all in-range markers (minimap shows a
   fixed radius around player — markers outside the radius are
   already clipped by `worldToMinimap`'s offscreen test).
6. Commit message: `feat(minimap): drivable vehicle markers (minimap-vehicle-markers)`.

**Acceptance:**
- Lint + tests + build green.
- Playwright capture shows minimap with vehicle icons at correct
  positions for Open Frontier and A Shau.
- No perf regression (one extra draw loop over ≤ 20 markers).
- No fence change.

### fullmap-vehicle-markers (R1)

Same as the minimap, but on the M-key full map.

**Files touched:**
- `src/ui/map/FullMapSystem.ts` — add `VehicleMarker` to the map
  render state, add `setVehicleMarkers()` (mirror lines `636–638`),
  add `drawVehicleMarkers()` in the render loop (after line `302`).
- Reuse the minimap's `VehicleMarker` type (move to a shared
  location if not already), or duplicate the structure if the two
  systems intentionally don't share types.

**Method:**
1. Same projection logic as the minimap, but using the full-map's
   north-up flipped-axis transform (`FullMapSystem.ts:454–456`).
2. Same icon set and color scheme as the minimap (visual consistency).
3. Optionally add label-on-hover (vehicle name) — defer to a
   follow-up if the existing `FullMapSystem` doesn't already have
   a hover mechanism.
4. Commit message: `feat(map): drivable vehicle markers on full map (fullmap-vehicle-markers)`.

**Acceptance:**
- Lint + tests + build green.
- Playwright capture of the full map (M key) shows vehicle
  markers at correct world positions.
- North-up orientation consistent with existing markers.
- No perf regression.

### compass-vehicle-markers (R1, stretch)

Bearing markers on the compass rose for the nearest vehicle of
each category. Stretch goal — drop if R1 budget exceeded.

**Files touched:**
- `src/ui/compass/CompassZoneMarkers.ts` or a new sibling
  `src/ui/compass/CompassVehicleMarkers.ts`.

**Method:**
1. Pick the nearest vehicle of each category (max 3 markers).
2. Place a small chevron at the corresponding bearing on the
   compass rose, with distance label.
3. Color by category (matches minimap palette).
4. Commit message: `feat(compass): nearest-vehicle bearing markers (compass-vehicle-markers)`.

**Acceptance:**
- Lint + tests + build green.
- Visible chevrons + distance labels on the compass rose for
  ≤ 3 vehicle categories.
- No perf regression.
- **If executor budget exhausted before R1 end, drop and move to
  follow-up cycle.**

### vehicle-wayfinding-playtest-evidence (R2, merge gate)

Playwright captures covering all five vehicle types.

**Files touched:**
- New: `docs/playtests/cycle-vehicle-wayfinding-and-prompts.md`.
- New: `scripts/capture-vehicle-wayfinding-shots.ts` — spawn the
  player near each vehicle type in turn, capture HUD prompt +
  minimap + full map + (if landed) compass markers.
- Append to `docs/PLAYTEST_PENDING.md`.

**Method:**
1. For each of {M151, M48, Sampan, PBR, M2HB}, on the scenario
   where it spawns (Open Frontier for M151+M48+Sampan+PBR;
   the M2HB scenario per cycle #6's spawns):
   - Capture HUD prompt visible.
   - Capture minimap with marker.
   - Capture full map with marker.
   - If `compass-vehicle-markers` landed, capture compass with
     bearing.
2. Capture "no prompt at distance" negative case for one vehicle
   (player 12 m away, prompt hidden).
3. Capture "prompt hides on entry" by scripting the F-press.
4. Commit message: `docs(vehicle): wayfinding playtest evidence (vehicle-wayfinding-playtest-evidence) (playtest-deferred)`.

**Acceptance:**
- Lint + tests + build green.
- 5 vehicle types × 3 surfaces = 15 captures (or 20 if compass
  landed), plus 2 negative-case captures.
- Playtest doc + PLAYTEST_PENDING row landed.

## Hard Stops

Standard:
- Fenced-interface change → halt.
- Worktree isolation failure → halt.
- Twice-rejected reviewer → halt.

Cycle-specific:
- Proximity check is implemented per-frame instead of capped at
  ≤ 10 Hz → halt; fix the cadence.
- HUD prompt does not hide on vehicle entry (visible while inside
  vehicle) → halt; fix the gating.
- Minimap or full-map marker draws at the wrong projection (player
  walks east, marker should appear east of player) → halt; fix
  the projection.
- Compass marker landed but ate > 25% of the R1 budget → drop
  compass, ship the other three landings, log compass deferral to
  the cycle close memo.

## Reviewer Policy

- **No mandatory `combat-reviewer`** — no `src/systems/combat/**`
  touches.
- **No mandatory `terrain-nav-reviewer`** — no terrain or nav
  touches.
- Orchestrator reviews for: surface integrity, no fence leak,
  proximity-check cadence sanity, no per-frame allocations in the
  HUD prompt show/hide path.

## Acceptance Criteria (cycle close)

**HUD prompt:**
- "Press F to board <vehicle>" shows within 6 m of each drivable
  vehicle.
- Hides on entry, on exit-from-range, on entering vehicle.
- Per-vehicle copy is correct (M151 / M48 / Sampan / PBR / M2HB).

**Minimap markers:**
- All drivable vehicles render as category-colored icons.
- Faction-aware (US blue, OPFOR red).
- Z-order: below zones + player, above combatant dots.

**Full-map markers:**
- Same set, projected via the world map's north-up transform.

**Compass markers (if landed):**
- Up to 3 bearing chevrons + distance labels for nearest vehicles
  by category.

**Playtest evidence:**
- 15+ Playwright captures committed under
  `artifacts/cycle-vehicle-wayfinding-and-prompts/playtest-evidence/`.

**Other:**
- All R1 + R2 task PRs merged.
- Owner playtest sign-off recorded (deferred under autonomous-loop).
- No fence change.
- `VEKHIKL-UX-1` opened + closed in CARRY_OVERS.md.
- Follow-up cycle `cycle-vekhikl-5-fleet-expansion` listed in the
  campaign manifest hold list with M113 / M35 / T-54 (+ optional
  ZU-23-2, LCM-8) as initial scope.

## Out of Scope

- **Adding new vehicle types** (M113, M35, T-54, etc.) — that's
  the `cycle-vekhikl-5-fleet-expansion` follow-up cycle.
- New HUD components (reuse `InteractionPromptPanel`).
- New minimap or map pipelines (reuse helipad-marker pattern).
- Per-vehicle audio cues for entry (separate small cycle).
- "Nearest objective" direction arrow / waypoint overlay (separate
  cycle if needed; the compass markers cover the vehicle case).
- Touching `src/systems/combat/**`, `src/systems/terrain/**`,
  `src/systems/navigation/**`.
- Fence touches.

## Open Questions (owner-default decisions pre-baked)

1. **Prompt radius: 6 m default?** **Default: 6 m.** Big enough
   that the player notices walking past; small enough that
   multiple vehicles parked near a base don't all flash the prompt
   at once. Configurable per category — emplacements may want 3 m,
   watercraft may want 8 m (player approaches on shore).
2. **OPFOR vehicle marker color: red dot, hostile chevron, or
   gray-until-in-LOS?** **Default: red dot, always visible on
   minimap.** Simplifies the fleet-expansion cycle. If owner wants
   intel-gating, queue a follow-up.
3. **Compass markers landed in R1 or deferred to next cycle?**
   **Default: attempt in R1, drop if budget tight.** The compass
   pattern is well-trod (existing zone markers) so the work is
   small; only drop if the other three R1 PRs eat the cap.
4. **Where do M113 / M35 / T-54 spawn in the follow-up cycle?**
   **Default: M113 + M35 at US FOB, T-54 at OPFOR positions in
   A Shau and Open Frontier.** Defer the exact coordinates to the
   `cycle-vekhikl-5-fleet-expansion` brief.

## Carry-over impact

- New ID: `VEKHIKL-UX-1`. Cycle-open ID — opens at cycle launch,
  closes at cycle close.
- Adds hold-list entry to the campaign manifest for
  `cycle-vekhikl-5-fleet-expansion` (M113 APC + M35 truck + T-54
  tank, optional ZU-23-2 + LCM-8). Trigger to promote: owner
  signs off on the wayfinding cycle's playtest evidence.

Net cycle delta on active carry-over count: 0.
