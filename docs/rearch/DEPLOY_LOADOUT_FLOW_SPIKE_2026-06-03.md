# Deploy / Spawn / Loadout Flow Spike (UX-2 / UX-3 / UX-4)

Date: 2026-06-03
Status: SPIKE (investigation + design memo). No code changed by this pass.
Scope: directives UX-2 (map spawn/respawn flow), UX-3 (loadout selection), UX-4 (deploy flow polish) from `docs/DIRECTIVES.md`.

Important framing: the Field Journal (FJ) visual redesign of the deploy screen already shipped (FJ cycle 3 — "Insertion Map + Loadout Sheet", responsive/mobile re-solved). **This memo is about FLOW and FUNCTION, not restyling.** Every proposal below stays in the UI/presentation + flow-logic layer. No gameplay/sim/combat changes are proposed.

---

## Current state (what already works, with file:line)

### Deploy screen shell + lifecycle
- `src/ui/screens/DeployScreen.ts` is a thin facade over `deploy/DeployDomFactory.ts` (pure DOM factories) and `deploy/DeploySpawnList.ts` (spawn + vehicle option buttons). It builds: header meta (mode/flow/loadout/alliance), hero map panel, a selected-spawn panel, an "AVAILABLE SPAWNS" list, a "CREW A VEHICLE" panel, a deployment checklist, a LOADOUT sheet (preset + 3 slots), a map legend, and a pinned controls panel (timer + DEPLOY + optional secondary). Build at `DeployScreen.ts:99-166`.
- It has two `kind`s driven by `DeploySessionModel`: `initial` (full sidebar) and `respawn` (same DOM, copy differs). Session copy/labels are generated in `src/systems/world/runtime/DeployFlowSession.ts:364-408` (flow- and mode-specific headlines, map titles, action labels, sequence steps).
- Orchestration lives in `src/systems/player/PlayerRespawnManager.ts`. `showDeployUI()` at `PlayerRespawnManager.ts:446-493` wires session → UI, builds spawn points, releases pointer lock, sets `InputContextManager` to `'menu'`, shows the map, preselects a spawn for `initial`. `confirmRespawn()` at `:506-523` records decision time, computes a jittered position, and either resolves the initial-deploy promise (`initial`) or directly respawns (`respawn`). `hideRespawnUI()` at `:526-538` restores gameplay context and re-locks the pointer (desktop only).
- Death → respawn entry: `onPlayerDeath()` at `:326-358` disables controls/weapon, sets the timer, and calls `showDeployUI('respawn')`.

### Spawn-point selection (the data behind the map + list)
- `src/systems/player/SpawnPointSelector.ts:105-207` builds the available spawn points: alliance-filtered home bases + controlled zones, BLUFOR helipads (runtime or config fallback), and an `air_assault` "Tactical Insertion" point on initial deploy. Sorted by priority at `:279-295`.
- `getPreferredDeploySpawnPoint()` at `:213-255` picks a sensible default per flow (helipad in frontier, direct insertion in air assault, else nearest to the mode's initial spawn).

### Map interaction (click + tap)
- `src/ui/map/OpenFrontierRespawnMap.ts` owns the canvas. Mouse: down/move/up with a 5px `DRAG_THRESHOLD` so a short click selects and a drag pans (`:56-115`). Wheel zoom (`:117-123`). **Touch is already implemented**: single-finger tap → select, single-finger drag → pan, two-finger pinch → zoom (`:130-218`); a tap is distinguished from a pan by the same 5px threshold (`:204-213`). Hit-testing uses a fixed 20-map-unit radius (`:410-423`). All listeners registered `{ passive: false }` (`:229-242`).
- The list buttons (`DeploySpawnList.ts:60-122`) wire selection on `pointerdown`, which covers both mouse and touch uniformly. Selecting in the list and selecting on the map both funnel through `PlayerRespawnManager.selectSpawnPointOnMap()` (`:495-504`) → both stay in sync.
- The map renderer (`src/ui/map/OpenFrontierRespawnMapRenderer.ts`) draws zones (FJ manila/topo), spawn pins, vehicle markers, a selection pulse, a minimap inset, and a controls hint that reads "Scroll: Zoom / Drag: Pan / Click: Select spawn" (`:481-491`).

### Loadout (the data model is real and complete)
- `src/ui/loadout/LoadoutTypes.ts` defines weapons, equipment, and **per-faction availability pools + 3 preset templates each** for US / ARVN / NVA / VC (`:75-262`). Faction restriction is real: e.g. NVA has no shotgun/LMG/launcher and no flashbang/sandbag (`:174-217`); US has the full set (`:79-127`).
- `src/systems/player/LoadoutService.ts` is a full service: per-(alliance:faction) context state, 3 editable+persisted preset slots (`localStorage` key `titj.player-loadout.v2`), cycle field / cycle preset / save preset, runtime application, primary≠secondary enforcement, legacy migration. Presentation model at `:314-329` exposes `availableWeapons` / `availableEquipment` — **but see the UX-3 gap, nothing consumes them.**
- DeployScreen loadout UI: preset prev/next/save (`DeployScreen.ts:466-492`), three PREV/NEXT rows for primary/secondary/equipment (`:494-514`), faction pill (`:476-478`). Editing is gated by `session.allowLoadoutEditing` (true on initial/respawn for current modes, `gameModeDefinitions.ts:41`).

### Vehicle catalogue — phase5 wiring (built, live, but INFORMATIONAL ONLY)
- The "CREW A VEHICLE" panel is built hidden (`DeployScreen.ts:432-440`, `display:none`) and shown only when the mode has crewable options (`updateVehicleDeployOptions()` at `:324-338`).
- `PlayerRespawnManager.updateVehicleDeployOptions()` (`:375-380`) pulls `getVehicleDeployOptionsForMode()` (`LoadoutTypes.ts:393-396`; M48 for `open_frontier` + `a_shau_valley` only, `:363-386`), pushes them to the panel AND drops markers on the deploy map (`buildVehicleMarkers()` `:383-390`, rendered by `OpenFrontierRespawnMapRenderer.drawVehicleMarker()` `:276-325`).
- **Selecting a vehicle does NOT crew/teleport the player.** `selectVehicleDeployOption()` (`:397-404`) only logs the focus. The doc-comment at `:392-396` states the deferral explicitly. There is no `crewIntoVehicle`-style hook from the deploy screen (confirmed: no such call in `PlayerRespawnManager`). It carries `position` + `controlsHint` for discoverability only.

### Menu → first-frame path
- `ModeSelectScreen.ts` emits a mode only (tap/click card → `onModeSelect`, `:135-142`). **No alliance/faction choice exists in the menu** — `resolveLaunchSelection()` (`gameModeDefinitions.ts:96-110`) auto-picks the first playable alliance (BLUFOR) + default faction (US for BLUFOR, `getFactionOptionsForAlliance()` `:75-87`).
- `src/core/InitialDeployStartup.ts:38-57`: `prepareInitialDeploy()` runs `enterDeploySelect()` → `beginInitialDeploy()` (shows the deploy screen, resolves when the player confirms) → `enterSpawnWarming()` → `preGenerateSpawnArea(spawnPos)` → apply loadout. Startup telemetry markers bracket the deploy-select and pre-generate phases (`:45-53`).
- For A Shau, a `MissionBriefing` modal is shown BEFORE the deploy screen (`PlayerRespawnManager.beginInitialDeploy()` `:299-309`).

---

## Gaps per directive

### UX-2 — Map spawn / respawn flow ("spawn options; tap- and click-to-spawn; mobile touch targets sized correctly")
Most of this is already built. Real remaining gaps:

1. **Map hit-target is not touch-sized.** Hit radius is a fixed 20 map-units regardless of zoom or input type (`OpenFrontierRespawnMap.ts:417`). On a phone where the canvas is shrunk to `clamp(150px..240px)` (CSS `DeployScreen.module.css:481-489`) and zoomed out, 20 map-units is well under the ~44px finger target. Adjacent zones on A Shau become hard to tap. Files: `OpenFrontierRespawnMap.ts` (`getSpawnPointAtPosition`), `OpenFrontierRespawnMapUtils.ts` (transforms).
2. **Desktop-only affordance copy.** The map helper reads "Click a zone on the map…" (`DeployScreen.ts:140`) and the on-canvas hint says "Click: Select spawn" (`OpenFrontierRespawnMapRenderer.ts:490`). On touch this is wrong/confusing. The list panel is the reliable touch path but is below the map and not signposted as "or tap a spawn here." Files: `DeployScreen.ts`, `OpenFrontierRespawnMapRenderer.ts`.
3. **No nearest-spawn fallback on an empty tap.** `handleMapClick()` (`OpenFrontierRespawnMap.ts:244-256`) only selects on a direct hit; a near-miss does nothing. A "snap to nearest within N px" rule would make coarse taps reliable. (Logic-only; no sim change.) File: `OpenFrontierRespawnMap.ts`.

Already satisfied (do NOT rebuild): tap-to-spawn and click-to-spawn are both wired (`OpenFrontierRespawnMap.ts:95-115` + `:194-218`); list buttons fire on `pointerdown` for both input types; `.spawnOption` touch targets are 48-52px (`DeployScreen.module.css:224,539`).

### UX-3 — Loadout selection ("categories + ammo loads + faction availability + PC/mobile parity")
The data model is complete; the SCREEN under-exposes it.

1. **Faction availability is invisible.** `LoadoutPresentationModel.availableWeapons/availableEquipment` are computed (`LoadoutService.ts:326-327`) but **consumed by nothing in `src/ui`** (confirmed by grep — zero references). The player sees PREV/NEXT cycle through a faction-filtered pool with no indication of what's available or why ARVN/NVA/VC have fewer options. Files: `DeployScreen.ts` (loadout rows), `LoadoutService.ts` (model already provides it).
2. **No "categories" surface.** The directive says "loadout categories." Today there are exactly 3 fixed slots (primary/secondary/equipment) cycled blindly; there's no category/option-list view (e.g. show the N options for a slot, highlight the current). Decision needed: is "categories" satisfied by labeling the slot pool, or does it want an option-picker? Recommend the lighter labeled-pool interpretation. File: `DeployScreen.ts`.
3. **"Ammo loads" is unaddressed.** There is no ammo-load concept in the loadout model at all (`LoadoutTypes.ts` has weapons/equipment/presets only; `InventoryManager.setLoadout` consumes the 3-field loadout). This is the one UX-3 sub-item with NO existing substrate. Decision needed: is "ammo loads" (a) a presentation of each weapon's magazine/reserve counts pulled from existing weapon configs (presentation-only, in scope), or (b) selectable ammo quantity/type (a gameplay/sim feature, OUT of scope for this UI spike)? Recommend (a): surface read-only ammo counts per selected weapon. Files: `DeployScreen.ts` + a read of existing weapon/ammo config (read-only).
4. **PC/mobile parity is structurally OK but cramped.** The loadout sheet renders identically PC + mobile, and at `≤600px` coarse the loadout/preset rows collapse to single-column (`DeployScreen.module.css:560-566`). But the PREV/NEXT (`.smallButton`) shrink to 34px then 30px high (`:393-398`, `:610-613`) — under the 44px touch target. Files: `DeployScreen.module.css`.

### UX-4 — Deploy flow polish ("menu-to-first-frame fast + clear; immediate danger readable in first frame")
1. **"Immediate danger readable in first frame" is NOT addressed anywhere.** The deploy screen shows per-spawn safety as a static `CLEAR`/`HOT` text token from `spawnPoint.safe` (`DeploySpawnList.ts:86-87`), but `safe` is hard-coded `true` for every zone/home-base and `false` only for the air-assault insertion point (`SpawnPointSelector.ts:133,166,186`). There is no readout of nearby enemy pressure at a candidate spawn, and nothing carries a "you are spawning hot" signal into the first gameplay frame. (Note: `SpawnPointSelector.countNearbyAgents()` exists at `:361-372` and is already used for insertion suggestions — a presentation layer could reuse it read-only to color spawns by threat, no sim change.) Files: `SpawnPointSelector.ts` (read-only threat query already present), `DeployScreen.ts`/`DeploySpawnList.ts` (render), optional first-frame HUD cue.
2. **No explicit menu→first-frame timing signal to the player.** Telemetry markers exist (`InitialDeployStartup.ts:45-53`) and the screen tracks an internal "Decision time" metric (`DeployScreen.ts:380-399`) but there's no user-facing "deploying…" continuity between confirm and first frame — on slower terrain warm (`preGenerateSpawnArea`) the screen just hides. A loading/continuity beat is owned by `startupFlow.enterSpawnWarming()` + the spawn-loading overlay (referenced in `mobile-ui-check.ts:529`), so verify that overlay actually covers the gap rather than adding a new one. Mostly a verification + small-copy task, not a rebuild.
3. **Auto-confirm only in perf/dev.** `shouldAutoConfirmInitialDeploy()` (`PlayerRespawnManager.ts:704-710`) fast-paths deploy only under perf harness/dev. Fine — no change; noted so a future "quick deploy" option isn't assumed to exist.

---

## Proposed approach (UI/presentation + flow only)

### UX-2
- Make map hit-testing input- and zoom-aware: convert a fixed pixel target (~22px) back into map-units using the live `zoomLevel` + canvas rect, and on a miss snap to the nearest spawn within that radius. Keep mouse behavior identical above the existing drag threshold.
- Replace input-specific copy with neutral wording ("Tap or click a sector to select your insertion") in `DeployScreen.ts:140` and the canvas hint (`OpenFrontierRespawnMapRenderer.ts:481-491`), or detect coarse pointer and swap the verb. Add a one-line "or pick from the list below" affordance tying the map to the AVAILABLE SPAWNS panel.

### UX-3
- Render faction availability: in each loadout row, show the current option's position within the faction pool (e.g. "AR 1/6") and/or render the pool as labeled chips with the active one highlighted, driven by `availableWeapons`/`availableEquipment` already on the presentation model. Pure read of existing data into existing DOM.
- Ammo loads (recommended scope = read-only): for the selected primary/secondary, display magazine + reserve counts sourced from the existing weapon config (read-only import), as a sub-line under the slot. No new selectable state, no `InventoryManager`/ammo-system changes.
- Touch parity: raise `.smallButton` min-height to 44px in coarse-pointer breakpoints (`DeployScreen.module.css:610-613` and the `:393-398` base under coarse media), keeping the desktop size. Confirm single-column collapse still fits the pinned DEPLOY without scroll-to-see.

### UX-4
- Threat-aware spawn readout (presentation-only): in `DeploySpawnList` meta, replace the static `CLEAR/HOT` with a value derived from a read-only `countNearbyAgents(spawnPos, R, enemyAlliance)` call (the method already exists and is already used elsewhere), e.g. CLEAR / WARM / HOT bands, colored with FJ green→red. This makes "immediate danger readable" on the deploy screen itself. Optionally pass a single boolean "spawned hot" into the first-frame HUD as a brief stamp (reuse existing HUD warning surface; no new system).
- Menu→first-frame continuity: verify the spawn-loading overlay (already asserted in `mobile-ui-check.ts:529`) fully bridges confirm→first frame; if there's a visible gap, add a short "INSERTING…" beat in the existing overlay rather than a new element. Keep telemetry markers untouched.

---

## Task breakdown (descriptive kebab-case slugs)

R1 (parallel — independent files/areas):
- **`map-spawn-tap-target-sizing`** (UX-2): zoom/input-aware hit radius + nearest-on-miss snap in `OpenFrontierRespawnMap.ts` (+ `OpenFrontierRespawnMapUtils.ts` if a transform helper is needed). Self-contained to the map widget.
- **`deploy-spawn-affordance-copy`** (UX-2): neutralize click-only copy in `DeployScreen.ts` + `OpenFrontierRespawnMapRenderer.ts`; add map↔list "or pick from the list" tie-in. Copy/markup only.
- **`loadout-faction-availability-readout`** (UX-3): consume `availableWeapons`/`availableEquipment` in `DeployScreen.ts` loadout rows (pool position + highlight). No service change.
- **`loadout-mobile-touch-parity`** (UX-3): bump `.smallButton`/preset/loadout controls to 44px in coarse breakpoints; verify no off-canvas/scroll regressions. CSS-only (`DeployScreen.module.css`).

R2 (depend on / overlap with R1):
- **`deploy-spawn-threat-readout`** (UX-4): threat-banded spawn meta via read-only `countNearbyAgents`; touches `DeploySpawnList.ts` + `SpawnPointSelector.ts` (expose a read-only per-spawn threat count) + `PlayerRespawnManager` plumbing. **Depends on `deploy-spawn-affordance-copy`** (same meta string / list rendering) — sequence after it to avoid churn.
- **`deploy-first-frame-continuity`** (UX-4): verify/extend the spawn-loading overlay to bridge confirm→first frame and (optional) carry a "spawned hot" first-frame cue. **Depends on `deploy-spawn-threat-readout`** for the hot signal; can otherwise land independently.

(5 firm tasks + 1 optional first-frame cue folded into the last. "Ammo loads" is intentionally left as a scoped decision below rather than a committed task, because its scope hinges on the read-only-vs-selectable question.)

---

## Fence implications (`src/types/SystemInterfaces.ts`)
- **No fenced-interface change is required for the recommended scope.** All proposed work is UI DOM/CSS, deploy-flow orchestration inside `PlayerRespawnManager`, and read-only additions to `SpawnPointSelector` (not a fenced type). `IPlayerController`, `IHUDSystem`, etc. are untouched.
- FLAG: **IF** UX-4's "spawned hot" cue is implemented by adding a method to `IHUDSystem` (e.g. a new "show spawn-threat stamp" call) that would be a fenced change requiring `[interface-change]` + human approval. Mitigation: drive it through an existing HUD entry point or a non-fenced concrete HUD class to stay fence-safe.
- FLAG: **IF** "ammo loads" is taken as selectable (out-of-scope gameplay), it would touch `InventoryManager`/ammo systems and possibly `IAmmoManager` (fenced). Keep ammo read-only to stay fence-safe.

---

## Mobile + viewport (per task)
Campaign Principle 6 (nothing off-canvas, no scroll-to-see) and the gates `check:mobile-ui` (`scripts/mobile-ui-check.ts`) + `check:hud` (`scripts/hud-layout-validator.ts`) apply to every task that changes deploy DOM/CSS.
- `map-spawn-tap-target-sizing`: the whole point is the mobile case; validate selection on the shrunk-canvas breakpoints. `mobile-ui-check.ts` already drives deploy on Pixel 5 / iPhone 12 / short-landscape and taps `#respawn-button` (`:652-667`) — extend coverage to a spawn tap if feasible, else rely on manual playtest.
- `deploy-spawn-affordance-copy`: ensure new copy doesn't overflow the header/map panels at `≤480px` (`DeployScreen.module.css:569-614`).
- `loadout-faction-availability-readout`: chips/pool text must wrap, not push the pinned DEPLOY off-canvas; the side panel's only scroll owner is `#respawn-side-scroll` (asserted at `mobile-ui-check.ts:657`) — keep it that way (`check:mobile-ui` asserts a single scroll owner).
- `loadout-mobile-touch-parity`: directly targets the 44px rule; the loadout/preset panels are hidden by `display:none` in some coarse breakpoints? No — only `.sequencePanel`/`.legend` are hidden (`:530-536`); loadout stays visible, so its controls must meet the target.
- `deploy-spawn-threat-readout`: meta line length grows; verify `.spawnOptionMeta` ellipsis/wrap on narrow screens (`:256-264`).
- `deploy-first-frame-continuity`: the spawn-loading overlay is already part of the `waitForGameplay` gate (`mobile-ui-check.ts:529-534`); any new beat must clear within that wait or the gate hangs.

`check:hud` (`hud-layout-validator.ts`) is a first-frame HUD concern — relevant only if the "spawned hot" cue lands in the HUD; run it for `deploy-first-frame-continuity`.

---

## Test strategy (per `docs/TESTING.md` four-layer contract)
- **L1 (pure):**
  - Hit-radius math: pixel→map-unit conversion + nearest-on-miss selection given zoom/pan (pure function extracted into `OpenFrontierRespawnMapUtils`). Threat-band bucketing (count → CLEAR/WARM/HOT) as a pure mapper.
  - Faction-availability presentation: assert the loadout-row model derives correct pool position/labels from `LoadoutPresentationModel` for each faction (US full, NVA reduced, etc.). Extends existing `LoadoutTypes`/`LoadoutService` unit coverage.
- **L2 (single-system):**
  - `DeployScreen`: feed `updateLoadoutPresentation` + `updateSpawnOptions` and assert DOM (pool chips, threat meta, neutral copy, 44px classes present). Mirrors existing `DeployScreenVehicleCatalogue.test.ts` / `DeployScreenVehicleOptions.test.ts` style.
  - `OpenFrontierRespawnMap`: simulate `touchend` tap near (not on) a spawn and assert nearest selection fires `onZoneSelected`; assert a drag past threshold does NOT select. (Existing map tests: `OpenFrontierRespawnMapVehicleMarkers.test.ts`.)
- **L3 (small scenario):**
  - `PlayerRespawnManager` deploy flow: open `initial` + `respawn`, select via list and via map callback, confirm threat readout is populated from a stubbed `SpawnPointSelector.countNearbyAgents`, and DEPLOY gating still respects timer + selection. Extends `PlayerRespawnManager.test.ts` / `RespawnUI.test.ts`.
- **L4 (full engine / harness):**
  - `check:mobile-ui` must stay green across the four deploy device cases (and ideally gain a spawn-tap assertion). `check:hud` green if the first-frame cue touches the HUD. Manual playtest per `docs/playtest` rule: deploy + redeploy on a phone profile, confirm tap reliability on A Shau's dense zones.
- Determinism rule: any test asserting an exact spawn position must stub/seed the `Math.random` jitter (see Risks) — assert the *selection/threat presentation*, not the jittered world coordinate.

---

## Risks & open questions
1. **`Math.random` non-determinism in spawn selection.** `PlayerRespawnManager.createDeployPosition()` (`:615-622`) adds a ±5m random jitter to every confirmed deploy. This is the deploy-path non-determinism most relevant here — any L3 test that confirms a deploy gets a non-reproducible world position. Separately, `ZoneTerrainAdapter.findSuitableZonePosition()` (`ZoneTerrainAdapter.ts:38`, used by `ZoneInitializer`) is the spiral-search non-determinism called out in project follow-ups; it's upstream of zone placement, not the deploy click, so it affects WHERE spawn pins land but is out of scope for a UI flow spike. Recommendation: inject a seedable RNG (or accept an override) into `createDeployPosition` so tests are deterministic; do NOT touch `findSuitableZonePosition` in these tasks.
2. **Deploy-into-vehicle scope (phase5 carry).** The "CREW A VEHICLE" panel + map markers are live but informational only (`selectVehicleDeployOption` logs, `PlayerRespawnManager.ts:397-404`). Open question: should UX-3/UX-4 make vehicle selection actually deploy the player into/next to the tank? That crosses from UI into vehicle-crewing systems (`PlayerVehicleAdapterFactory`, `Tank`/`GroundVehicle`) and is a gameplay change — recommend keeping it OUT of this UI spike and tracking it as its own gameplay directive. If a lighter step is wanted, "deploy adjacent to the vehicle's anchor" reuses the existing `position` and the normal respawn path (UI-flow-only) without crewing — flag for a scope decision.
3. **"Ammo loads" interpretation (UX-3).** No ammo-load substrate exists in the loadout model. Read-only display of existing weapon mag/reserve counts is in-scope and fence-safe; selectable ammo is a gameplay feature (and likely `IAmmoManager`-fenced). Needs an explicit product call before committing the task.
4. **"Categories" interpretation (UX-3).** Whether the directive wants labeled pools (light) or a full option-picker view (heavier DOM rework). Recommend light; confirm.
5. **Threat readout truthfulness.** `countNearbyAgents` only returns non-zero when `WarSimulator` is enabled (`SpawnPointSelector.ts:362`). On non-war modes (ZC/TDM) the readout would always read CLEAR — acceptable, but the copy should not over-promise threat intel on those modes.
6. **Map-widget reuse.** `OpenFrontierRespawnMap` is shared by the deploy map; changing hit-testing must not regress the desktop pan/zoom feel (5px drag threshold). Keep the threshold; only the *selection* radius becomes zoom-aware.
