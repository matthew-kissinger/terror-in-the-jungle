# Campaign: Field Readiness

> **Date:** 2026-06-28
> **Shape:** large (6 sequenced phases / cycles)
> **Auto-advance:** yes
> **Posture:** autonomous-loop (overnight unattended — owner explicitly chose
> this over attended despite hot-path touches; the perf hard-stop, reviewer
> gates, and PLAYTEST_PENDING deferral are the safety net)
> **Concurrency cap:** 5
> **Status:** **SCAFFOLDED — ready to dispatch. Phase 1 briefs authored; Phases
> 2-6 briefs authored at each phase's open per the tables below.**
>
> **Progress:**
> ✅ 1 control-discoverability (#425-#428, playtest-deferred) ·
> ✅ 2 combat-vehicle-feel (#429-#433, perf A/B PASS, playtest-deferred) ·
> 🔄 3 terrain-vegetation-asset-defects ·
> ⬜ 4 arsenal-expansion ·
> ⬜ 5 deploy-armory-faction-select ·
> ⬜ 6 ashau-purpose-and-missions

Source: the 2026-06-28 owner playtest (voice transcript + a 5-agent codebase
triage). The dominant finding: **~40% of the owner's complaints are
discoverability, not missing features** — planes fire, the radio is fully
wired, squad commands work, smoke/flashbang/mortar/sandbag all work, the
scoreboard tracks. So Phase 1 surfaces what already exists before later phases
build anything new. Each phase is one cycle. **Phase barriers are hard:** a
phase's exit gate (CI green + reviewer APPROVE on all merged tasks + the named
acceptance) must pass before the next phase's R1 dispatch.

## Kickoff (paste this to the overnight agent)

```
/orchestrate

You are the orchestrator for CAMPAIGN_2026-06-28-field-readiness (6 phases,
posture: autonomous-loop, auto-advance: yes). Confirm effort is xhigh. Read
docs/CAMPAIGN_2026-06-28-field-readiness.md and docs/AGENT_ORCHESTRATION.md
fully, then run the campaign end-to-end unattended:

- Start at Phase 1 (cycle-2026-06-28-control-discoverability), already seeded in
  AGENT_ORCHESTRATION.md "Current cycle" with Phase-1 briefs in docs/tasks/.
- At each phase open, author that phase's task briefs (≤80 LOC, _TEMPLATE.md)
  from the manifest table, validate every slug with
  `npx tsx scripts/cycle-validate.ts <slug>`, populate the "Current cycle" DAG,
  then dispatch.
- Honor the phase barriers, the campaign hard-stops, and the autonomous-loop
  overrides (owner-playtest tasks -> Playwright smoke + screenshots +
  PLAYTEST_PENDING row). Run perf-analyst after every round in Phases 2/3/4/6.
- Read the "Re-check before fixing" section FIRST — do not spend tasks
  "fixing" things that already work.
- Deploy is MANUAL. Do NOT deploy. End by printing the end-of-run summary and
  listing every PLAYTEST_PENDING row for the owner's morning walk.
```

## Owner decisions locked (2026-06-28)

- **Faction/side picker:** build it, but **A Shau + (future) premiere ONLY** —
  not the standard modes. Engine plumbing already exists (Phase 5).
- **Premiere Battle Royale (battalion + ~25 NPC teams + closing storm):**
  **design doc only this campaign; defer the build** (Phase 6).
- **A Shau "purpose":** **both** — surface the existing war/zone systems AND
  build an opt-in tasking director (Phase 6).
- **Ammo-load (mag) tradeoff:** owner did not pick a final direction. Default in
  Phase 4 = add a real downside so EXTENDED/HEAVY is a tradeoff, not strictly
  better; flag the collapse-to-one alternative for the owner walk.

## Re-check before fixing (these already work — do NOT burn tasks "fixing" them)

- **Scoreboard tracks correctly** (kills->stats->display, unit-tested). It is
  hold-**Tab**, not a toggle. Phase 1 only adds a discoverability hint + a live
  verify — it is NOT a tracking-bug fix.
- **Zone Control already has 3 capture zones** (Alpha/Bravo/Charlie). The lever
  for "too quick" is `matchDuration`/`maxTickets` (Phase 2 candidate), not a
  4th zone.
- **Smoke / flashbang / mortar / sandbag all work.** Smoke breaks AI LOS,
  flashbang whites the screen + blinds AI, mortar fires (B deploy / arrows aim /
  F fire), sandbag is collidable cover. The gap is discoverability (Phase 1),
  not wiring. (Mortar fails *silently* only if its GLB fails to load — verify,
  don't rewrite.)
- **Aircraft fire** on LMB once **airborne** (A-1/F-4/AC-47). The gap is the
  missing fire cue + airborne gate feedback (Phase 1), not dead weapons.

## Campaign hard-stops (halt + surface to owner)

- Any `fence_change: yes` in an executor report (`src/types/SystemInterfaces.ts`).
- >2 CI-red tasks in one round.
- `combat120` p99 regression >5% after any round (perf-analyst gates Phases 2/3/4/6).
- Worktree-isolation failure.
- `combat-reviewer` or `terrain-nav-reviewer` CHANGES-REQUESTED twice on one task.

## Cross-phase DAG

```
Phase 1 control-discoverability ───────────────► Phase 6 situation-readout-hud
   (control-hints-hud is the shared HUD legend surface the readout extends)

Phase 2 weapon-ads-per-weapon-offset ──────────► Phase 4 marksman/sks
   (shared WeaponAnimations / WeaponRigManager — serialize the merges)

Phase 5 faction-side-picker ····(informs)······► Phase 6 premiere-battle-royale-design

Phases run in sequence (1→2→3→4→5→6) with hard barriers. Within a phase, the
task DAG below says what parallelizes vs serializes.
```

---

## Phase 1 — `cycle-2026-06-28-control-discoverability`

**Why first:** lowest risk (additive HUD, no hot path), highest perceived value.
Resolves the campaign's dominant finding — the game does more than it shows. The
shared control-hint surface built here is reused by Phase 6's situation readout.

**Task DAG:**

```
control-hints-hud ──► seat-and-fire-cues        (shared HUD legend surface)
radio-command-menu        (root; combat-reviewer — CommandInputManager)
hud-overlap-and-scoreboard (root)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| control-hints-hud | Persistent context-sensitive control legend (on-foot / in-seat / aircraft), reading vehicle-session state. Today hints are console-only (`PlayerInput.ts:737-768`) + the pre-game Settings modal. | new `src/ui/hud/HudControlHints.ts`, `HUDSystem.ts`, `VehicleSessionController` read | — | M |
| seat-and-fire-cues | Show current seat + "F: swap seat" when multi-crew (tank/door-gun heli); "LMB: fire" cue for armed seats; ground fixed-wing shows "airborne to fire" instead of a silent no-op (`FixedWingModel.ts:836`). | `FixedWingHUD.ts`, vehicle HUD, `TankPlayerAdapter.ts`/`HelicopterPlayerAdapter.ts` seat state | — | M |
| radio-command-menu | Make `T` radio + `Z` squad discoverable and unified into one compact "radio" menu listing fire-support assets (already wired) + squad commands (Shift+1-6) with labels — the owner's "radio as an item" feel. | `CommandInputManager.ts`, `CommandModeOverlay.ts`, `SquadCommandPresentation.ts` | combat | M |
| hud-overlap-and-scoreboard | Fix attribution-over-health overlap (`AttributionNotice.ts` `left:6/bottom:4` vs the bottom-left health slot); add a hold-Tab scoreboard hint; live-verify kill/score tracking. | `AttributionNotice.ts`, `HUDLayoutStyles.ts`, `ScoreboardPanel.ts` | — | S |

**Exit gate:** smoke screenshots show the control legend on foot + in a vehicle
seat + in an aircraft; the radio menu opens on `T` and lists fire-support assets
+ squad commands; attribution no longer overlaps the health pill. PLAYTEST_PENDING
row appended.

---

## Phase 2 — `cycle-2026-06-28-combat-vehicle-feel`

**Why second:** the true vehicle bugs + the feel-tuning the owner called out.
Mostly disjoint files → high parallelism. Perf-analyst after each round (p99 gate).

**Task DAG:** all roots — fully parallel (disjoint files).

```
tank-exit-and-seatswap            (root; vehicle input routing)
tank-turret-traverse              (root; tuning)
tank-hill-authority               (root; tracked physics)
ground-vehicle-speed-and-camera   (root; wheeled physics + follow cam)
weapon-ads-per-weapon-offset      (root; weapon viewmodel) ── unblocks Phase 4
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| tank-exit-and-seatswap | Real bug: can't dismount a tank. `E` has no ground branch (`PlayerVehicleController.ts`); `F` is consumed by seat-swap so exit is never reached (only Escape works). Add a clear exit + keep F seat-swap + a HUD cue. | `PlayerInput.ts:532`, `PlayerVehicleController.ts`, `TankPlayerAdapter.ts:399` | — | M |
| tank-turret-traverse | Raise `DEFAULT_TANK_TURRET_CONFIG` `yawSlewRate` (30°/s) and especially `barrelPitchSlewRate` (8°/s — far too slow) for responsive aim. | `TankTurret.ts:71-82` | — | S |
| tank-hill-authority | More climb power: raise `maxClimbSlope` (0.6) + `slopeDriveFloor` (0.5), lower `slopeGravityScale` (0.28); optionally lower `maxTrackSpeed` for "slower but stronger". M48 + T-54. | `m48-config.ts:27`, `t54-config.ts:24`, `TrackedVehiclePhysics.ts:91` | — | S |
| ground-vehicle-speed-and-camera | Faster jeep (raise `velocityDamping` 0.88→~0.95 + `engineTorque`) + per-vehicle follow-cam distance so the 6.7m M35 truck isn't framed inside its own bed (shared 12m cam from chassis center). | `GroundVehicle.ts:30`, `GroundVehiclePlayerAdapter.ts:96` | — | M |
| weapon-ads-per-weapon-offset | Per-weapon ADS offset so the bulky M60 stops occluding the sight line (single global `adsPosition` `y:-0.44` was hand-tuned for the M16). | `WeaponAnimations.ts:46`, `WeaponModel.ts`, `WeaponRigManager.ts` | — | M |

**Exit gate:** combat120 p99 flat/within +5% vs campaign start (perf-analyst);
tank exits cleanly with a visible cue; jeep noticeably faster; M60 ADS sight
clear in a screenshot. PLAYTEST_PENDING row.

---

## Phase 3 — `cycle-2026-06-28-terrain-vegetation-asset-defects`

**Why third:** terrain/vegetation/asset defects; terrain tasks gate on
terrain-nav-reviewer. Independent of Phases 1-2.

**Task DAG:**

```
veg-poi-exclusion ──► route-corridor-exclusion   (shared exclusion plumbing)
vegetation-density-retune        (root; config)
coconut-card-crossfade           (root; ground-card LOD tier)
structure-import-corruption-fix  (root; importer + re-import)
sun-disc-banding-fix             (root; atmosphere)
asset-reroll-requests            (root; doc only)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| veg-poi-exclusion | Confirmed bug: hero trees grow on the airfield runway. Wire `glbHeroScatterer` into `setExclusionZones` (`TerrainVegetationRuntime.ts:273` omits it) + add the `isExcluded` gate to `GLBHeroScatterer.placeHeroSpecies` (mirror `GroundCardScatterer.ts:517`). | `TerrainVegetationRuntime.ts:273`, `GLBHeroScatterer.ts` | terrain-nav | M |
| route-corridor-exclusion | Emit veg-exclusion along strategic routes so trees stop growing down the centerline of the gray "trail" patches (`TerrainFlowCompiler` routes only repaint + flatten, no exclusion). | `TerrainFlowCompiler.ts`, `TerrainVegetationRuntime.ts` | terrain-nav | M |
| vegetation-density-retune | Thin the too-dense biomes: bamboo-thicket 2.8 (highest in file) + riverbank coconut 1.25. Config-only. | `src/config/biomes.ts:156,217` | terrain-nav | S |
| coconut-card-crossfade | Port the `transitionFadeMeters` opacity blend (already on the hero octa path) into `GroundCardNearMeshTier` so the coconut palm stops hard-popping mesh↔card. | `GroundCardNearMeshTier.ts` | terrain-nav | M |
| structure-import-corruption-fix | Re-import the corrupted legacy structure GLBs — prime suspects `barracks-tent.glb` (jumbled mesh, double importer transform) + `aid-station.glb` (missing left-roof submesh); confirm via `/gallery`. | `scripts/import-war-catalog.ts`, `public/models/structures/*` | — | M |
| sun-disc-banding-fix | Band-limit/replace the 3 stacked high-frequency sine terms (plasma/filament/granule, freq up to ×317) that read as an LED-dot lattice; keep a warm body. Touches TSL + GLSL + CPU mirrors. | `SunDiscMesh.ts:88` | — | M |
| asset-reroll-requests | **UH-1 Huey + A-1 Skyraider re-rolls already DONE** — owner re-rolled in Kiln, imported + wired + gallery-verified 2026-06-28 (see `REROLL_PROMPTS_2026-06-28.md`). This task only files any NEW re-roll specs surfaced during the walk; coconut-palm re-center is covered by `coconut-card-crossfade`. **No art generation.** | `docs/asset-provenance/repaint-2026-06/REROLL_REQUESTS.md` | — | S |

**Exit gate:** terrain-nav-reviewer APPROVE; no hero trees on the airfield in a
smoke shot; coconut swap has no hard pop; sun reads as a body not dots; Huey +
Skyraider re-rolls already landed + verified (2026-06-28), any remaining re-roll
specs filed. PLAYTEST_PENDING row.

---

## Phase 4 — `cycle-2026-06-28-arsenal-expansion`

**Why fourth:** adds the missing NVA marksman/SKS the owner wanted. The
already-cataloged `sks` + `dragunov-svd` GLBs are unused — this is wiring, not
new art. **Cross-phase dep:** shares `WeaponAnimations`/`WeaponRigManager` with
Phase 2's `weapon-ads-per-weapon-offset` — serialize the merges (second rebases).

**Task DAG:**

```
marksman-rifle-class ──► sks-rifle-wiring   (shared LoadoutWeapon/rig registry; serialize)
ammo-load-tradeoff       (root; owner-decision default)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| marksman-rifle-class | New `LoadoutWeapon` (DMR/marksman) + `GunplayCore` spec + rig slot using the cataloged `dragunov-svd` GLB; OPFOR (NVA) availability; higher damage + optical zoom, slower RPM. | `LoadoutTypes.ts`, `WeaponRigManager.ts`, `GunplayCore.ts`, `warAssetCatalog.ts` (sks/dragunov already present) | combat if it touches `combat/**` | M |
| sks-rifle-wiring | Wire the cataloged `sks` GLB as a semi-auto OPFOR rifle option (or as the marksman base if simpler). | `LoadoutTypes.ts`, `WeaponRigManager.ts` | combat if `combat/**` | M |
| ammo-load-tradeoff | Resolve the strictly-better EXTENDED/HEAVY ammo load (only scales reserve, zero downside). Default: add a real tradeoff (move/ADS/reload penalty scaling with reserve). **OWNER-CONFIRM** default vs collapse-to-one at the walk. | `LoadoutTypes.ts:319`, `LoadoutService.ts:526`, `firstPersonWeapon` | combat if `combat/**` | M |

**Exit gate:** NVA can deploy a marksman/SKS; reviewer APPROVE (if combat-path);
ammo-load is a tradeoff or collapsed per default. PLAYTEST_PENDING (owner picks
the final mag direction).

---

## Phase 5 — `cycle-2026-06-28-deploy-armory-faction-select`

**Why fifth:** the UI builds — the bigger surfaces. Faction picker is cheap
(plumbing exists). The 3D map is a SPIKE (doc) this campaign; the committed code
is a 2D-map navigation overhaul (high value, lower risk for an unattended run).

**Task DAG:**

```
weapon-stats-panel ──► armory-layout-reflow                 (shared DeployScreen armory column)
faction-side-picker     (root; launch wiring)
deploy-map-navigation ──► helipad-spawn-truth ──► crew-vehicle-selectable  (shared spawn/map)
deploy-map-3d-spike     (root; doc only)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| weapon-stats-panel | Surface the existing `WeaponSpec` stats (rpm/damage/falloff/recoil/adsTime) in the armory as the player cycles weapons — data exists, no UI reads it today. | `DeployScreen.ts` armory, `WeaponRigManager.ts` table, `GunplayCore.ts:16` | — | M |
| armory-layout-reflow | Reduce the redundant PREV/NEXT + chip-strip duplication, fix spacing, and let the insertion map + kit read together (today `setActiveView` `display:none` hides one). | `DeployScreen.ts`, `DeployScreen.module.css` | — | M |
| faction-side-picker | Add the side/faction selector (BLUFOR US/ARVN vs OPFOR NVA/VC), **A Shau + future premiere ONLY**. Plumbing exists: `resolveLaunchSelection` accepts `preferredFaction`; `applyLaunchSelection` wires it into every system. | `ModeSelectScreen.ts` (or a new step), `GameUI.ts:186`, `gameModeDefinitions.ts` | — | M |
| deploy-map-navigation | Fix the "atrocious / impossible to navigate" map: clamp pan bounds, add recenter + zoom controls, raise the zoom ceiling + hit-target size, add spawn cycling (A Shau's 21km canvas especially). | `OpenFrontierRespawnMap.ts`, `OpenFrontierRespawnMapRenderer.ts`, `DeployScreen.ts` | — | M |
| helipad-spawn-truth | Fix the misleading "Helipad: UH1 HUEY" label + guarantee a boardable helicopter on arrival (or relabel as an on-foot pad). | `SpawnPointSelector.ts:150`, `PlayerRespawnManager.ts`, `HelicopterModel.ts:242` | — | M |
| crew-vehicle-selectable | Make the CREW-A-VEHICLE panel selectable: adopt the vehicle position as the selected spawn + map marker + F-board hint (today it's a logging no-op that never enables Deploy). | `PlayerRespawnManager.ts:410`, `DeployScreen.ts:515` | — | S |
| deploy-map-3d-spike | Design/feasibility doc for the owner's "fast 3D map" (approach, perf budget, reuse of terrain/minimap render). **Design only, no build.** | new `docs/rearch/DEPLOY_MAP_3D_SPIKE_2026-06-28.md` | — | S |

**Exit gate:** faction picker visible on A Shau; stats panel + reflowed armory in
a screenshot; map navigable (bounded pan + recenter + larger targets); helipad +
crew options honest; 3D-map spike filed. PLAYTEST_PENDING row.

---

## Phase 6 — `cycle-2026-06-28-ashau-purpose-and-missions`

**Why last:** the biggest open-ended ask (A Shau purpose) + the design docs (pure
writing, safe to end on). **Cross-phase dep:** `situation-readout-hud` builds on
Phase 1's `control-hints-hud`; `premiere-battle-royale-design` is informed by
Phase 5's faction picker.

**Task DAG:**

```
situation-readout-hud (root; dep Phase 1 control-hints-hud)
tasking-director-spike ──► tasking-director-mvp   (design then conservative MVP)
premiere-battle-royale-design (root; doc only)
healing-and-looting-scope     (root; doc only)
```

| slug | intent | files | reviewer | size |
|---|---|---|---|---|
| situation-readout-hud | Surface the existing `WarSimulator`/zone/front-line state as a readable "what's happening + where to go" readout + objective nudges, so A Shau isn't a blank exploration. | `WarSimulator`, zone displays, HUD (extends `control-hints-hud`) | combat if `combat/**` | M |
| tasking-director-spike | Design doc for an opt-in dynamic tasking director: mission types derived from live zones/war state, roles, opt-in UX, perf budget. | new `docs/rearch/TASKING_DIRECTOR_SPIKE_2026-06-28.md` | — | S |
| tasking-director-mvp | Conservative MVP: 2-3 opt-in task types (capture/defend/destroy) read from live zones/war state, surfaced as a HUD task card with explicit opt-in; reward = score/impact. Scope per the spike; **split if >400 net**. | new `src/systems/missions/*` (+ tests), HUD card | combat if `combat/**` | L (stretch) |
| premiere-battle-royale-design | Design/feasibility doc for the A Shau "premiere" BR (player battalion + ~25 NPC teams + closing storm + squad command + faction choice + materialization-tier budget for the 3,000-unit engine). **Design only.** | new `docs/rearch/PREMIERE_BATTLE_ROYALE_DESIGN_2026-06-28.md` | — | M |
| healing-and-looting-scope | Design/scope doc: bandages/healing (passive-regen only today) + activating the dormant `WeaponPickupSystem` (fully written, never instantiated) into a looting loop. **Design only — greenfield.** | new `docs/rearch/HEALING_AND_LOOTING_SCOPE_2026-06-28.md` | — | S |

**Exit gate:** situation readout live on A Shau; director spike filed + MVP merged
(or a documented deferral if the MVP exceeds the conservative scope); BR +
healing/looting design docs filed. PLAYTEST_PENDING row.

---

## When a phase opens (per `AGENT_ORCHESTRATION.md`)

Phases 2-6 briefs are authored at each phase's open, NOT up front. At each open:
write the task brief(s) in `docs/tasks/<slug>.md` (≤80 LOC, `_TEMPLATE.md` —
fill `## Acceptance` with a repro-first L3 test where a bug is fixed per
`docs/TESTING.md`, and `## Non-goals` from this manifest), populate the DAG in
`AGENT_ORCHESTRATION.md` "Current cycle", and validate the slug with
`npx tsx scripts/cycle-validate.ts <slug>`. All six phase slugs are
banned-keyword-clean (pre-checked 2026-06-28).

## Fence watch

- `tank-exit-and-seatswap` (Phase 2) may touch `IPlayerController` routing — if
  it needs `src/types/SystemInterfaces.ts`, that's an `[interface-change]` PR and
  the fence hard-stop fires by design.
- `tasking-director-mvp` (Phase 6) introduces a new system — keep it behind its
  own module surface; do NOT widen the fenced `SystemInterfaces.ts` to reach
  combat/zone state, reuse existing read paths.

## Non-goals (whole campaign)

- Deploying to prod (deploy is MANUAL — the owner ships after the morning walk).
- Building the premiere BR mode, the healing system, or the looting loop — those
  are design docs only this campaign (Phase 6).
- A full 3D deploy map build — spike/doc only this campaign (Phase 5); the 2D
  navigation overhaul is the committed code.
- Kiln art regeneration — Phase 3 files precise re-roll requests; the art itself
  is a separate Kiln/human step.
- Water/hydrology (still scorched per 2026-06-09; future terrain/world-gen cycle).
