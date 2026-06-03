# Air-Support Call-In Radio — Spike (SVYAZ-3)

Spike date: 2026-06-03. Investigation + design memo, NOT implementation.
Directive: **SVYAZ-3 — Air-support call-in radio** (`docs/DIRECTIVES.md:22`).
Success criteria: *Radio menu + target marking + asset selection + per-asset cooldown + NPC-pilot fulfillment.*
First slice landed: `665b0c5` (radio shell + asset list).

> Headline finding: the four success-criteria pieces are **mostly already built, but as two disconnected halves**. A full NPC-pilot air-support **runtime** (`AirSupportManager` + 4 mission types + a physics-driven `NPCFlightController`) ships today and is reachable from a *legacy orphaned* code path. A styled radio **UI** (`AirSupportRadioMenu`) ships today wired to a keybind. **They do not talk to each other.** SVYAZ-3 is ~80% a wiring + reconciliation cycle, not a from-scratch build.

---

## Current state

### A. The radio shell (UI side) — built, wired to input, but its selection is a STUB

- **Component:** `src/ui/hud/AirSupportRadioMenu.ts` (+ `.module.css`). Implements `LayoutComponent`. Field-Journal palette already applied (ink `rgba(43,38,32,…)`, green `rgba(79,107,58,…)`, amber `rgba(168,116,42,…)`).
- **What the shell exposes today:**
  - Modal overlay w/ backdrop-dismiss, `role="dialog"`/`aria-modal`, close button (`AirSupportRadioMenu.ts:54-100`).
  - **Target-marking buttons** — three options from `AIR_SUPPORT_TARGET_MARKINGS` (`smoke` / `willie_pete` / `position_only`), rendered as a toggle group; clicking sets `selectedMarking` + status text only (`AirSupportRadioMenu.ts:113-130`).
  - **Asset list** — six buttons from `AIR_SUPPORT_RADIO_ASSETS` (`a1_napalm`, `a1_rockets`, `f4_bombs`, `ac47_orbit`, `cobra_rocket_run`, `huey_gunship_strafe`), each w/ label/aircraft/payload/mission text + a per-asset status span + a cooldown **track/fill** bar (`AirSupportRadioMenu.ts:135-139, 211-250`).
  - **Summary row** — Mark / Cooldowns (`N/6 ready`) / Selected (`AirSupportRadioMenu.ts:106-108, 280-283`).
  - **Cooldown rendering** — `setCooldowns()` drives per-asset disable + `Ns/Nm` label + fill-bar width keyed to `asset.cooldownSeconds` (`AirSupportRadioMenu.ts:166-172, 291-302`). Selecting a cooling asset is blocked with a status message (`AirSupportRadioMenu.ts:252-261`).
  - **Callback out:** `onAssetSelected({ assetId, targetMarking })` (`AirSupportRadioMenu.ts:152-158, 268-271`).
- **Catalog (pure data):** `src/systems/airsupport/AirSupportRadioCatalog.ts` — the 6 asset definitions, 3 marking options, plus `getCooldownRemaining` / `countReadyAssets` helpers. This is a **separate** type universe from the runtime (`AirSupportRadioAssetId` ≠ runtime `AirSupportType`).
- **Instantiation + input wiring:** `src/systems/combat/CommandInputManager.ts` owns the menu (`:51`), mounts it to `document.body` (`:139`), and toggles it. Opened via **`T` key** → `PlayerInput.onAirSupportMenu` (`PlayerInput.ts:516-517`) → `PlayerController.handleAirSupportRequest()` (`:475-476`) → `commandInputManager.toggleRadioMenu()` (`CommandInputManager.ts:232-238`). Also openable from the squad command overlay's **RADIO** button (`CommandModeOverlay.ts:111-115` → `onRadioRequested` → `openRadioMenu`).
- **THE STUB:** `CommandInputManager.handleRadioSelection()` (`:360-367`) is the entire back-end of asset selection — it only echoes `"<MARK> target mark selected"` into the menu's status text. **It never calls `airSupportManager.requestSupport()`.** No mission is ever dispatched from the radio. `CommandInputManager` does not even hold an `AirSupportManager` reference.
- **Cooldown feed is dead:** `CommandInputManager.setRadioCooldowns()` (`:240-242`) exists but is **called by nothing outside tests** (grep: only def site in non-test code). So the cooldown bars never reflect real mission cooldowns.

### B. The air-support runtime (NPC-pilot side) — fully built and self-contained

- **Manager:** `src/systems/airsupport/AirSupportManager.ts` (a registered `GameSystem`, ticked at `SystemUpdater.ts:208`, `cadenced-update` in `SystemUpdateSchedule.ts:128`). Public API:
  - `requestSupport(request: AirSupportRequest): boolean` (`:109-131`) — checks its **own** cooldown map, queues the request, fires `air_support_inbound`, shows a HUD message, returns false if cooling.
  - `getCooldownRemaining(type)` (`:145-148`), `getSupportTypes()` (`:154-156`), `cancelSupport(missionId)` (`:133-143`).
  - Internally: delay → `spawnMission` loads the GLB, spins up an `NPCFlightController` for supported types, runs the per-type mission, transitions `active`→`outbound`, then sets a real cooldown (`:160-302`).
- **Request shape:** `AirSupportRequest = { type: AirSupportType; targetPosition: THREE.Vector3; approachDirection?: THREE.Vector3 }` where `AirSupportType = 'spooky' | 'napalm' | 'rocket_run' | 'recon'` (`AirSupportTypes.ts:3-9`). Per-type config (delay/duration/cooldown/model/altitude/speed) in `AIR_SUPPORT_CONFIGS` (`AirSupportTypes.ts:39-72`).
- **NPC-pilot fulfillment EXISTS:** `spawnMission` builds an `NPCFlightController` (`AirSupportManager.ts:262-285`) that drives a real `NPCFixedWingPilot` + `Airframe` physics against an orbit/attack_run/flyover mission (`NPCFlightController.ts:31-117, 203-234`). The pilot already has the AVIATSIYA-6 state machine (ATTACK_SETUP/RUN/BREAKAWAY/ORBIT/RTB).
- **Weapon-on-target EXISTS for two missions:**
  - `SpookyMission.updateSpooky` (`SpookyMission.ts:31-115`) — orbits + fires minigun bursts, tracers, and `applyExplosionDamage` near the target each tick.
  - `NapalmMission.updateNapalm` (`NapalmMission.ts:26-134`) — runs the line, drops at the target, applies a burst + persistent fire-zone damage.
  - `RocketRunMission` / `ReconMission` exist too (rocket lobbing via `GrenadeSystem`; recon spotting).
- **So "the aircraft flies the sortie and engages the marked target" is already a solved behavior** — for the runtime's 4 types. The missing link is feeding it a *player-chosen* target + asset from the radio.

### C. The orphaned legacy call-in path (to be deleted/retired)

`PlayerVehicleController.handleAirSupportRequest(playerPosition, camera)` (`PlayerVehicleController.ts:57-76`) is the *old* call-in: cycle through `getSupportTypes()` round-robin, target = player-forward × 100m, no marking, no UI. **It is fully orphaned** — `PlayerController.handleAirSupportRequest()` (`:475`) takes no args and only opens the radio menu; nothing calls the 2-arg vehicle-controller version (confirmed by grep — `airSupportCycleIndex` is its only other reference). This is the behavior the radio is meant to replace.

---

## The gap (the four success-criteria pieces)

| Piece | Status | What's missing | What it reuses |
|---|---|---|---|
| **(a) Target marking** | **Shell-only.** Marking *type* picker works; there is **no way to choose a ground point**, and nothing renders a marker in-world. | A world-position picker + a marked-target world marker (smoke/WP visual optional). | `CommandTacticalMap` already does click→`THREE.Vector3` ground-point selection (`CommandTacticalMap.ts:69-87, 214-228`) with gamepad cursor support — the radio just has no map. Either embed a `CommandTacticalMap` in the radio, or reuse the squad overlay's "place a point" flow. Player-forward raycast is the cheap fallback. |
| **(b) Asset selection → real pool** | **Stub.** `onAssetSelected` fires but routes to a text-only stub. The 6 radio asset IDs don't map to the 4 runtime types. | A `radioAssetId → AirSupportType (+ approach/payload)` mapping, and an `AirSupportManager` reference inside `CommandInputManager`. | `AirSupportManager.requestSupport()` is the ready sink. Mapping is pure data next to `AirSupportRadioCatalog`. |
| **(c) Per-asset cooldown** | **Two cooldown systems, disconnected.** UI has its own cooldown DOM; runtime has its own authoritative cooldown map (`AirSupportManager.cooldowns`, keyed by `AirSupportType`). | Make the runtime the source of truth and push remaining cooldown into the menu each tick (`setRadioCooldowns`). Decide cooldown granularity: per-`AirSupportType` (4 buckets, shared by assets that map to the same type) vs per-radio-asset (6 buckets). | `AirSupportManager.getCooldownRemaining(type)` + the already-built `setRadioCooldowns` → `menu.setCooldowns` plumbing. Just needs a per-tick pump + the asset→type key. |
| **(d) NPC-pilot fulfillment** | **Built, just unreached from the radio.** | Only the wire from (b) into `requestSupport`. Optionally: confirm rocket_run/recon read as "engages target" for the assets that map to them. | `AirSupportManager` + `NPCFlightController` + mission files — no new pilot/sortie code required for the MVP. |

**Net:** the only genuinely new gameplay surface is **(a) ground-point marking inside the radio flow**. (b)/(c)/(d) are wiring + a small mapping/reconciliation layer over code that already exists.

---

## Proposed approach

**Compose, don't rebuild.** Route the existing radio UI into the existing runtime:

1. **Asset→type mapping (data).** Add a `radio asset → { type: AirSupportType; payloadHint }` table beside `AirSupportRadioCatalog`. Suggested MVP mapping: `a1_napalm/f4_bombs → 'napalm'`, `a1_rockets/cobra_rocket_run → 'rocket_run'`, `ac47_orbit → 'spooky'`, `huey_gunship_strafe → 'rocket_run'` (or `'spooky'`). (Recon stays NPC/utility-AI-only; it isn't an offensive radio asset.) This keeps the 6 player-facing choices while reusing the 4 runtime sorties. A later cycle can split runtime types to 6 if desired — out of scope here.

2. **Marking flow (reuse `CommandTacticalMap`).** Give the radio a "MARK TARGET" affordance that arms a ground-point pick. Cleanest: the radio collects `assetId + markingType`, then hands off to the same tactical-map placement the squad overlay uses, OR embeds a `CommandTacticalMap` instance. On confirm we have a world `THREE.Vector3`. Compute `approachDirection` from player→target (or a fixed bearing). Fallback for a first slice: camera-forward raycast to ground (mirrors the orphaned path's target math, but driven by the menu).

3. **Dispatch (wire the stub).** Give `CommandInputManager` an `AirSupportManager` reference (plain setter; it already gets `CombatantSystem`/`GameModeManager`/`PlayerController` via setters). On confirmed selection: map asset→type, build `AirSupportRequest { type, targetPosition, approachDirection }`, call `requestSupport`. Reflect the boolean (cooling/queued) into the menu status text.

4. **Cooldown pump (single source of truth).** Each radio-relevant tick (or on open + on an interval), read `AirSupportManager.getCooldownRemaining(type)` for each asset's mapped type and push a `AirSupportRadioCooldowns` map via `setRadioCooldowns`. **Retire the UI's independent cooldown notion** — the runtime owns it.

5. **Retire the orphan.** Delete `PlayerVehicleController.handleAirSupportRequest` + `airSupportCycleIndex` (dead code superseded by the radio). (Flagged as a follow-up spin-off, not load-bearing for the cycle.)

### Boundary vs AVIATSIYA-6 / SVYAZ-4 (draw the line here)

- **AVIATSIYA-6 deferred-item D** (`PHASE5_FEATURE_SCOPE_2026-05-31.md:85-91`) explicitly calls out the overlap: *"the NPC-fires-during-attack-run piece overlaps SVYAZ-3 / air-support ownership (`SpookyMission`). Coordinate scope before implementing — do not duplicate gunship-fire wiring across the maneuver library and the air-support subsystem."*
  - **This cycle owns:** the call-in path (UI → request → existing sortie). It uses the firing **already inside the mission files** (`SpookyMission`/`NapalmMission`).
  - **This cycle does NOT own:** adding weapon-fire to the *generic* `NPCFlightController` ATTACK_RUN positioning (that aircraft "positions but never fires" — `NPCFlightController.ts:96-117`), nor named maneuver routes (pylon-turn/dive/strafe), nor player nose-cannon aids. Those stay AVIATSIYA-6. If a radio asset maps to a sortie type whose mission file already fires (spooky/napalm/rocket_run), fulfillment works **without** touching the maneuver library.
- **SVYAZ-4** (RTS command discipline) is the *composition* story — squad orders + air-support reading as a hybrid FPS/RTS. SVYAZ-3 should make the radio call-in **feel consistent** with the squad command overlay (same map/placement idiom, same modal discipline) so SVYAZ-4 is a smaller follow-up. SVYAZ-3 does **not** need to build a unified command queue; just don't diverge the interaction model.

---

## Task breakdown

Slugs are action-descriptive (no banned keywords).

### R1 (parallel — independent)

- **`radio-asset-type-mapping`** — Add the pure-data `radioAssetId → AirSupportType (+ payload/approach hints)` table beside `AirSupportRadioCatalog`; export a resolver. No UI/runtime coupling yet. (L1-testable in isolation.)
- **`radio-target-marking`** — Add the ground-point marking flow to the radio (reuse `CommandTacticalMap` placement or camera-forward raycast fallback) so a confirmed selection yields `{ assetId, markingType, targetWorldPos }`. UI-only; emits an enriched selection callback. Depends only on the menu DOM.
- **`air-support-cooldown-feed`** — Pump `AirSupportManager.getCooldownRemaining` into `setRadioCooldowns` and make the runtime the single cooldown source; remove the UI's independent cooldown assumption. Needs a manager reference in `CommandInputManager` (setter) but no marking/dispatch logic.

### R2 (after R1 — integration)

- **`radio-call-in-dispatch`** — Wire `handleRadioSelection` to map asset→type (`radio-asset-type-mapping`), build `AirSupportRequest` with the marked position (`radio-target-marking`), and call `airSupportManager.requestSupport`; reflect queued/cooling status. **Depends on `radio-asset-type-mapping` + `radio-target-marking`.**
- **`air-support-npc-fulfillment-test`** — Deterministic L3/L4 proving "called sortie tasks an aircraft that engages the marked target" (see test strategy). **Depends on `radio-call-in-dispatch`.**
- **`retire-legacy-air-support-call`** *(small, optional)* — Delete the orphaned `PlayerVehicleController.handleAirSupportRequest` + `airSupportCycleIndex`. Independent of the above but do last to avoid churn. Could be a spin-off task instead of in-cycle.

---

## Fence implications

**Likely NO fenced-interface change required.** Reasoning, grounded in `src/types/SystemInterfaces.ts`:

- `AirSupportManager` is a **concrete class**, not a fenced export. `CommandInputManager` would hold it by class reference and call `requestSupport` / `getCooldownRemaining` — plain methods, no `SystemInterfaces.ts` edit. (Mirrors how `AirSupportManager` itself already receives `CombatantSystem`/`GrenadeSystem` concretely via setters in `OperationalRuntimeComposer.ts:559-563`.)
- `IHUDSystem` (fenced, `SystemInterfaces.ts:46`) is already consumed by `AirSupportManager` for `showMessage` — no new method needed for the MVP.
- **FLAG (watch, not certain):** if the cooldown feed wants to live on a fenced wiring path rather than a direct manager handle, or if a designer wants the radio's marked target to render through `IGameRenderer` (`SystemInterfaces.ts:356`) as a world marker, **that** could touch a fenced interface. Plain-English description if it arises: *"add a method to expose air-support cooldowns / register a called-target world marker through a fenced system interface."* Treat any such need as requiring an `[interface-change]` PR title + human approval. **Default plan avoids it** by using a concrete `AirSupportManager` setter on `CommandInputManager` and (if a marker is wanted) reusing the existing minimap/tactical-map marker rendering rather than a new renderer method.

---

## Test strategy (per `docs/TESTING.md` L1-L4)

- **L1 (pure):** `radio-asset-type-mapping` — every `AirSupportRadioAssetId` resolves to a valid `AirSupportType`; resolver is total (no `undefined`); mapping is stable. Pure function, no DOM.
- **L2 (single-system, jsdom):** extend `AirSupportRadioMenu.test.ts` — after `radio-target-marking`, confirming a mark + asset emits a selection carrying a `THREE.Vector3` target (not just text), and a cooling asset still blocks (existing behavior preserved). Also L2 for `CommandInputManager`: a confirmed radio selection calls a mocked `airSupportManager.requestSupport` exactly once with the mapped `type` + the marked `targetPosition`; a cooling request reflects the `false` return into status text.
- **L3 (small scenario) — the fulfillment assertion (behavioral, deterministic, NOT visual):**
  - Build a real `AirSupportManager` with a stub terrain probe (flat height), a fake `CombatantSystem` exposing `applyExplosionDamage(center, radius, dmg, …)`, and a fixed RNG seed (spooky/napalm use `Math.random` for scatter — inject or stub it for determinism).
  - Place a target combatant at a known ground point. Issue a radio call-in mapped to a firing sortie (e.g. `ac47_orbit → spooky`). Advance `update(dt)` past `config.delay + on-station` in fixed steps.
  - **Assert:** `applyExplosionDamage` was invoked with a `center` within the mission's scatter radius of the marked target (and/or the target combatant took damage) — i.e. *the called aircraft engaged the marked point*. Then assert the per-type cooldown is non-zero after `outbound`. This is the "engages the marked target" success criterion as a measurable behavior. (See `src/test-utils/airSupportMission.ts` for an existing mission-shape harness to build on.)
- **L4 (full engine, smoke):** through the live path — `T` opens the radio, a scripted selection + mark dispatches a mission, `AirSupportManager.getActiveMissions()` becomes non-empty, and no exception is thrown during a few seconds of stepping. Keep it a smoke-level existence check (full-engine tests stay coarse).

**Determinism note:** `SpookyMission`/`NapalmMission` and `buildAirSupportMission` use `Math.random` for orbit phase / ground scatter; the L3 test must seed/stub RNG (or assert on a radius rather than an exact point) to stay deterministic.

---

## Risks & open questions

1. **Friendly-fire / IFF — REAL GAP, must decide.** Called sorties are currently **faction-blind**: `SpookyMission.ts:99-107` and `NapalmMission.ts:84-118` call `applyExplosionDamage(center, radius, dmg, undefined, 'napalm'/'spooky_minigun')` — they pass `attackerId = undefined` and **omit `shooterFaction` entirely**, while the signature supports it (`CombatantSystem.ts:504-512`). So a player-marked strike will damage friendlies in the blast. Decision needed: (a) thread the requester's `Faction` through `AirSupportRequest` → mission → `applyExplosionDamage(shooterFaction)` so IFF/score attribution is correct, or (b) accept area-effect friendly fire as a design choice (and surface a "danger close" warning). Recommend (a) as a small, bounded add inside this cycle since the plumbing arg already exists. *(This was historically tolerable because the only caller was the orphaned dead path; making the radio live makes it player-visible.)*
2. **Cooldown granularity (4 vs 6).** Runtime cooldowns are per-`AirSupportType` (4). If two radio assets map to the same type, they share a cooldown — may surprise players (calling "F-4 Bombs" greys out "A-1 Napalm" if both map to `napalm`). Options: accept shared cooldowns (simplest, honest to the runtime), or split runtime types to 6 (bigger, defer). Flag for the designer.
3. **What "fulfillment" minimally means.** MVP = the mapped sortie spawns, flies to the marked point, and its existing mission logic applies effect there (true today for spooky/napalm/rocket_run). It does **not** mean new per-asset weapons (AVIATSIYA-5 deferred-item B) nor NPC-fires-during-generic-attack-run (AVIATSIYA-6 deferred-item D). Keep the bar at "existing sortie engages the marked target."
4. **Marking UX surface.** Embedding a second `CommandTacticalMap` in the radio vs. handing the radio's choice off to the squad overlay's existing placement flow vs. a camera-forward raycast — three viable routes with different feel. This is the one feel-bearing decision; recommend the tactical-map reuse for SVYAZ-4 consistency, raycast as the first-slice fallback. **Needs a quick playtest call.**
5. **Scope creep into AVIATSIYA-6.** Tempting to add firing to the generic `NPCFlightController` attack-run so *any* asset engages. Resist — that's AVIATSIYA-6's named-maneuver/fire work and is single-owned there. Map radio assets onto sortie types whose mission files already fire.
6. **Approach direction / map bounds.** `requestSupport` defaults approach to south→north (`AirSupportManager.ts:36`). A marked target near map edge with a long 500m ingress (`NPCFlightController.ts:212-213`) could start the aircraft out of bounds; verify against `setWorldHalfExtent`. Minor, but test on A Shau's 21km map.
