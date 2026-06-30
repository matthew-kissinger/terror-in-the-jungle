// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Source-file budget linter.
 *
 * Enforces the 2026-05-09 Phase 0 realignment rules:
 *   1. Max file size: 700 LOC for non-test source under `src/`.
 *   2. Max public methods per class: 50.
 *
 * Existing god modules are explicitly grandfathered with a Phase 3 round
 * note AND a measured snapshot. New files cannot be added to the
 * grandfather list without an orchestrator note in `docs/CARRY_OVERS.md`.
 *
 * Ratchet rule (budget-ratchet, 2026-06-09): each grandfathered entry
 * records the LOC / method-count snapshot at the moment it was admitted to
 * the list. A grandfathered file may shrink freely, but if it grows PAST
 * its snapshot the lint FAILs — the grandfather is a one-way ratchet, not a
 * blank cheque. To lock in a shrink, re-run with `--print`, read the
 * measured values, and lower the snapshot. The base 700 LOC / 50 method
 * limits are unchanged for non-grandfathered files.
 *
 * Method counting is a deliberately simple regex — it's not a TS AST
 * walker. False positives are rare in this codebase (no method-shape
 * fields in interfaces / object literals get matched because we anchor
 * on `\bclass\b` first).
 *
 * Usage:
 *   npx tsx scripts/lint-source-budget.ts            # default mode (fail on hard breaches + ratchet regressions)
 *   npx tsx scripts/lint-source-budget.ts --strict   # fail on warns too
 *   npx tsx scripts/lint-source-budget.ts --print    # print all offenders, no exit code change
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const SRC_ROOT = join(repoRoot, 'src');

export const MAX_LOC = 700;
export const MAX_METHODS = 50;

export interface GrandfatherEntry {
  round: string;
  reason: string;
  /**
   * Measured LOC snapshot. The ratchet ceiling for this file is
   * `max(MAX_LOC, loc)`: a file already over budget may shrink below its
   * snapshot freely but may not grow above it; a file under MAX_LOC simply
   * stays bound by the normal MAX_LOC limit.
   */
  loc: number;
  /** Measured first-class public-method snapshot — same `max(MAX_METHODS, methods)` rule. */
  methods: number;
}

// Grandfather list — current god modules. Each gets a Phase 3 round target
// plus a measured snapshot the ratchet enforces. Snapshots measured against
// the current tree on 2026-06-09 (budget-ratchet): the old free-text `reason`
// carried stale counts (e.g. CombatantRenderer "219 methods" when it now has
// 78), which understated real progress and could not catch backsliding. The
// `loc` / `methods` fields are the live snapshot — a grandfathered file may
// drop below them but may not climb above them. (Values are the true measured
// counts, not rounded; dimensions already under the base limit keep the base
// limit as their effective ceiling.)
// Format: posix-style relative path (forward slashes).
const GRANDFATHER: Record<string, GrandfatherEntry> = {
  // Snapshot raised 2191 → 2459 LOC / 78 → 85 methods
  // (dropped-frame-perf-harness, 2026-06-15/16): materialization-tier,
  // close-model, and render-attribution telemetry for the stabilization branch.
  // Orchestrator re-base only; split target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/combat/CombatantRenderer.ts': { round: 'P3R1', reason: 'split into 5 files; +268 LOC/+7 methods for dropped-frame materialization/render telemetry', loc: 2459, methods: 85 },
  // Snapshot raised 1701 → 1825 LOC / 63 → 68 methods
  // (dropped-frame-perf-harness, 2026-06-15/16): terrain recovery and route
  // telemetry needed to correlate player-visible terrain glitches with combat
  // movement. Orchestrator re-base only; split target unchanged.
  'src/systems/combat/CombatantMovement.ts': { round: 'P3R2', reason: 'split into 4 files; +124 LOC/+5 methods for terrain recovery and route telemetry', loc: 1825, methods: 68 },
  // Snapshot raised 1217 → 1222 (door-gun-seat, cycle-2026-06-09-helicopter-craft):
  // +5 LOC for the `onHelicopterDoorGunToggle` input-callback wiring that routes
  // the in-flight F key to the door-gun seat swap. Within-cycle ratchet re-base;
  // R3 split target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/player/PlayerController.ts': { round: 'P3R3', reason: 'split into 5 files', loc: 1222, methods: 111 },
  // Snapshot raised 995 → 1073 LOC (dropped-frame-perf-harness,
  // 2026-06-15/16): frame/presentation/dropped-frame telemetry export surfaces.
  'src/systems/debug/PerformanceTelemetry.ts': { round: 'P3R5', reason: 'split into 4 files; +78 LOC for frame/presentation dropped-frame telemetry', loc: 1073, methods: 41 },
  // Snapshot raised 1155→1163 LOC / 48→51 methods (per-aircraft-ordnance,
  // cycle-2026-06-09-fixed-wing-craft): per-airframe armament wiring + the new
  // getWeaponName getter. The bulk weapon table was EXTRACTED to the sibling
  // FixedWingArmament.ts (net new-module, not in-file growth); the +8 LOC here
  // is the per-airframe config plumbing and the +3 method-regex matches are the
  // getWeaponName getter plus two multi-line call-expression false positives.
  // Within-cycle ratchet re-base; R4 split target unchanged. See docs/CARRY_OVERS.md.
  // Snapshot raised 1166 → 1191 / 51 → 52 (seat-and-fire-cues, 2026-06-28): the
  // airborne-gate feedback signal adds one consume-on-read getter
  // (`consumeGroundedFireBlocked`) + the grounded-trigger record branch and the
  // structural HUD-sink poll in the update loop, so the silent ground no-op
  // surfaces an "Airborne to fire" hint. In-cycle ratchet re-base; R4 split
  // target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/vehicle/FixedWingModel.ts': { round: 'P3R4', reason: 'split into 4 files; +3 LOC from dropped-frame stabilization branch wiring; +25 LOC/+1 method airborne-gate feedback signal (seat-and-fire-cues, 2026-06-28)', loc: 1191, methods: 52 },
  'src/systems/vehicle/airframe/Airframe.ts': { round: 'P3R4', reason: '0 tests → add tests + slim split', loc: 985, methods: 22 },
  'src/systems/combat/CombatantLODManager.ts': { round: 'P3R1', reason: 'ai-timing-gate; +5 LOC: sole body-despawn owner now reaps terminal DEAD stragglers (combat-death-body-persistence); +102 LOC dropped-frame materialization telemetry', loc: 1035, methods: 32 },
  'src/systems/world/WorldFeatureSystem.ts': { round: 'P3R4', reason: 'split into 3 files; +204 LOC dropped-frame world-static attribution and optimization hooks', loc: 1064, methods: 34 },
  // Snapshot raised 808 → 833 (ashau-load-freeze, 2026-06-10): pre-baked loads
  // now route through the time-sliced PrebakedTiledNavmeshImporter (fetch +
  // import live there) with per-phase startup marks and an onTileProgress
  // loading-bar hook threaded through generateNavmesh. Within-cycle ratchet
  // re-base; split target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/navigation/NavmeshSystem.ts': { round: 'P3R5', reason: 'split into 3 files; +19 LOC: worker-offload tiled generation past the anchor window (navmesh-coverage-ashau); +25 LOC: time-sliced prebaked import wiring + load telemetry (ashau-load-freeze, 2026-06-10)', loc: 833, methods: 24 },
  'src/systems/strategy/WarSimulator.ts': { round: 'P3R5', reason: 'split into 2 files; +181 LOC dropped-frame war-state telemetry and stabilization probes', loc: 969, methods: 36 },
  'src/systems/combat/ai/AIStateEngage.ts': { round: 'P3R2', reason: 'cover-search extraction P4F2', loc: 1005, methods: 30 },
  'src/systems/combat/CombatantAI.ts': { round: 'P3R2', reason: 'ai-timing-gate: hoist per-tick state callbacks + gate diagnostics off the hot path; +12 LOC: per-frame stepper hook for the shared NPC tank cannon, scaled-dt signature per combat-review (npc-tank-cannon-wiring, 2026-06-09)', loc: 1004, methods: 44 },
  // Admitted 2026-06-09 (npc-tank-cannon-wiring review fix): the prod
  // composition point absorbed seated-weapon lifecycle (tank cannon + M2HB),
  // HUD panel hosts (m2hb-gun-experience), and the NPC tank-gunner wire +
  // single-owner stepping gate in one cycle window. Orchestrator note in
  // docs/CARRY_OVERS.md (Parked). Factor into a composition split when it
  // next grows.
  // Snapshot raised 783 → 790 LOC (helipad-spawn-truth, 2026-06-28): +6 LOC to
  // wire the boardable-helicopter presence provider (HelicopterModel) into the
  // player respawn manager so helipad spawn labels match reality. This is the
  // prod composition point for player/vehicle wiring — exactly where this wire
  // belongs. In-cycle ratchet re-base, no CARRY_OVERS row (sanctioned by the
  // task brief); split target unchanged.
  'src/core/StartupPlayerRuntimeComposer.ts': { round: 'P3R5', reason: 'prod composition point for seated-weapon/NPC-gunner/HUD-host wiring; +9 LOC: tank gunner-panel host (tank-sight-prod-wiring, same cycle window); +35 LOC dropped-frame startup/materialization wiring; +6 LOC boardable-helicopter presence wire (helipad-spawn-truth, 2026-06-28); split queued when it next grows', loc: 790, methods: 50 },
  // Snapshot raised 757 → 761 / 83 → 84 (fixedwing-gunsight, 2026-06-10): the
  // fixed-wing reflector-gunsight task adds one HUD delegation method
  // (`updateFixedWingAmmo`) so the nose-gun ammo count reaches FixedWingHUD —
  // the mirror of the existing `setHelicopterWeaponStatus` delegation. Growth
  // is intentional and minimal; the R3 split target is unchanged. In-cycle
  // ratchet re-base, not a new carry-over (see docs/CARRY_OVERS.md).
  // Snapshot raised 788 → 809 / 85 → 86 (seat-and-fire-cues, 2026-06-28): the
  // seat/fire-cue task adds one HUD delegation method
  // (`flashFixedWingAirborneHint`, mirror of the existing ammo delegation) and
  // grows `setVehicleContext` to derive the seat hint + plane seat-fire cue from
  // the context the HUD already receives (derivation logic lives in
  // HudControlHints so only one method is added). In-cycle ratchet re-base; the
  // R3 split target is unchanged. See docs/CARRY_OVERS.md.
  // Snapshot raised 809 → 858 / 86 → 88 (situation-readout-hud, 2026-06-28): the
  // situation-readout task mounts the readout on the shared control-hint surface
  // and drives it on the existing 2Hz objective tick. Two methods are added —
  // `updateSituationReadout` (reads zone/ticket/player state into a snapshot) and
  // `setPlayerAlliance` (faction-relative ticket/objective split) — plus the
  // mount/dispose wiring. The read rule itself lives in HudSituationReadout, so
  // HUDSystem only forwards existing read paths. In-cycle ratchet re-base; the
  // R3 split target is unchanged. See docs/CARRY_OVERS.md.
  'src/ui/hud/HUDSystem.ts': { round: 'P3R3', reason: 'split into 4 files; +13 LOC/+1 method dropped-frame HUD timing/debug wiring; +14 LOC control-hints mount/dispose + per-actor context wiring (control-hints-hud); +21 LOC/+1 method seat/fire cue wiring (seat-and-fire-cues, 2026-06-28); +49 LOC/+2 methods situation-readout mount/update wiring (situation-readout-hud, 2026-06-28); +20 LOC/+1 method task-card mount/dispose + reward-dispatcher wiring + getTaskCard accessor (tasking-director-mvp, 2026-06-28). The card owns its own DOM/logic in HudTaskCard; HUDSystem only mounts it + forwards rewards to the existing score-popup surface. In-cycle ratchet re-base; R3 split target unchanged.', loc: 878, methods: 89 },
  'src/systems/combat/CombatantSystem.ts': { round: 'P3R2', reason: '0 direct tests → split + tests; +10 LOC: wire rifle-death squad bookkeeping hooks (combat-death-body-persistence); +28 LOC dropped-frame combat telemetry wiring', loc: 790, methods: 43 },
  // Admitted 2026-06-15/16 (dropped-frame-perf-harness): the main loop grew
  // with frame/presentation epoch recording and render-context attribution.
  // Orchestrator note in docs/CARRY_OVERS.md; split loop diagnostics out next.
  'src/core/GameEngineLoop.ts': { round: 'P3R5', reason: 'split frame diagnostics and presentation epoch recording out of the main loop', loc: 856, methods: 50 },
  // Admitted 2026-06-15/16 (dropped-frame-perf-harness): combat firing and
  // terrain LOS telemetry crossed the base LOC limit during stabilization.
  // Orchestrator note in docs/CARRY_OVERS.md; split firing diagnostics next.
  'src/systems/combat/CombatantCombat.ts': { round: 'P3R2', reason: 'split firing diagnostics and terrain LOS probes out of combat core', loc: 718, methods: 50 },
  // ZoneManager removed from grandfather list 2026-05-09 (Phase 2): fan-in
  // dropped from 52 → ≤20 via IZoneQuery seam (Batches A+B+C of
  // cycle-2026-05-10-zone-manager-decoupling). File is well under both LOC and
  // method limits; no further grandfathering needed.
  // Additional offenders surfaced at Phase 0 install. Not in original god-module top-15
  // but already over the new limit. Each gets a queued split target.
  // Snapshot raised 707 → 721 LOC / 47 → 51 methods (door-gun-seat,
  // cycle-2026-06-09-helicopter-craft): +14 LOC / +4 thin pass-throughs
  // (hasDoorGun, setPlayerDoorGunCrewing, getPlayerDoorGunStatus,
  // firePlayerDoorGun) so the player heli adapter can crew the door gun without
  // depending on HelicopterWeaponSystem directly (it only holds the fenced
  // IHelicopterModel). Within-cycle ratchet re-base; R4 split target unchanged.
  // See docs/CARRY_OVERS.md.
  // Snapshot raised 721 → 732 LOC / 51 → 52 methods (helipad-spawn-truth,
  // 2026-06-28): +1 read-only method `hasBoardableHelicopterForHelipad` so the
  // spawn selector can label a helipad honestly (promise a helicopter only when
  // one is actually boardable). No spawning rework. In-cycle ratchet re-base, no
  // CARRY_OVERS row (sanctioned by the task brief).
  'src/systems/helicopter/HelicopterModel.ts': { round: 'P3R4', reason: 'split during AVIATSIYA-3 helicopter parity work; +14 LOC for player door-gun seat pass-throughs (door-gun-seat, 2026-06-09); +1 read-only presence method (helipad-spawn-truth, 2026-06-28)', loc: 732, methods: 52 },
  // Snapshot raised 781 → 810 (ci-gate-consolidation, 2026-06-09): the sibling
  // Phase-1 task `real-mouse-input` (040337e7) added 29 LOC of real
  // held-mouse-button state to PlayerInput AFTER the budget-ratchet snapshot
  // (#339) was measured, so the gate was red on master before it could be made
  // blocking. Growth is intentional and already merged; the file's R3 split
  // target is unchanged. Within-cycle ratchet re-base, not a new carry-over.
  // Snapshot raised 810 → 819 (door-gun-seat, cycle-2026-06-09-helicopter-craft):
  // +9 LOC for the helicopter-mode F-key door-gun seat-swap binding +
  // `onHelicopterDoorGunToggle` callback decl. Within-cycle ratchet re-base; R3
  // split target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/player/PlayerInput.ts': { round: 'P3R3', reason: 'split alongside PlayerController in R3', loc: 819, methods: 44 },
  // Snapshot raised 752 → 757 LOC / 58 → 59 methods (helipad-spawn-truth,
  // 2026-06-28): +1 setter `setBoardableHelicopterPresence` that forwards the
  // boardable-helicopter presence provider to the spawn selector so helipad
  // spawn labels match reality. In-cycle ratchet re-base, no CARRY_OVERS row
  // (sanctioned by the task brief).
  // Snapshot raised 757 → 800 LOC / 59 → 60 methods (crew-vehicle-selectable,
  // 2026-06-28): selecting a crewable vehicle in the CREW-A-VEHICLE deploy panel
  // now adopts the vehicle anchor as a real selected spawn (enables Deploy, lands
  // the player at the vehicle) instead of being a logging no-op — adds the
  // buildVehicleSpawnPoint helper + the selection/hint wiring. In-cycle ratchet
  // re-base, no CARRY_OVERS row (sanctioned by the task brief).
  'src/systems/player/PlayerRespawnManager.ts': { round: 'P3R3', reason: 'use beginRejoiningSquad helper, see docs/CARRY_OVERS.md; +1 presence-provider setter (helipad-spawn-truth, 2026-06-28); +43 LOC/+1 method crew-a-vehicle selectable spawn (crew-vehicle-selectable, 2026-06-28)', loc: 800, methods: 60 },
  // Admitted 2026-06-28 (sks-rifle-wiring, cycle-2026-06-28-arsenal-expansion):
  // the runtime-weapon-type plumbing established by marksman-rifle-class left
  // this file at 699 LOC (1 under the base limit). Adding the SKS as its own
  // semi-auto OPFOR weapon type (spec + core + rig field + art entries + load +
  // rig prep + switch case + visibility + getter + HUD labels) crosses 700.
  // The growth is per-weapon plumbing, not god-module drift; the natural split
  // target is to extract the per-weapon spec/core registry out of the manager.
  // In-cycle ratchet admission, no CARRY_OVERS row (sanctioned by the brief).
  // Snapshot raised 735 → 740 (weapon-stats-panel, 2026-06-28): the per-weapon
  // spec literals moved out of the constructor into a module-level WEAPON_SPECS
  // table (single source of truth) plus a small static `getWeaponSpec` accessor
  // the deploy armory reads, so spec values are never duplicated into the UI.
  // Net +5 LOC. In-cycle ratchet re-base, no CARRY_OVERS row (sanctioned by the
  // brief). This is the registry-extraction the split target above called for.
  'src/systems/player/weapon/WeaponRigManager.ts': { round: 'P3R3', reason: 'extract the per-weapon spec/core/rig registry out of the manager; +36 LOC for the SKS semi-auto runtime weapon type (sks-rifle-wiring, 2026-06-28); +5 LOC module-level WEAPON_SPECS table + static getWeaponSpec accessor (weapon-stats-panel, 2026-06-28)', loc: 740, methods: 30 },
  'src/systems/terrain/TerrainFeatureCompiler.ts': { round: 'P3R5', reason: 'split into placement / compile policy; +3 LOC route-corridor-exclusion: merge route veg-exclusion corridors into vegetationExclusionZones', loc: 767, methods: 0 },
  'src/systems/terrain/TerrainMaterial.ts': { round: 'P3R5', reason: 'split shader uniforms / atlas / impostor sampling; +35 LOC cycle-2026-06-09-lighting-rig-spike (rig-prototype): flag-gated unified-rig terrain lighting branch (applyTerrainRigLighting + night-fill emissive gate); +27 LOC dropped-frame terrain visual isolation toggles; +10 LOC task/veg-glb-hero-scatter r185 WebGPU terrain-render restore', loc: 1192, methods: 0 },
  // Snapshot raised 898 → 904 / 69 → 75 (ashau-load-freeze, 2026-06-10): six
  // markStartup statements bracketing propagateTerrainSourceChanges phases —
  // the instrumentation that attributed the 47s A Shau load freeze to the
  // stamped-provider gameplay-grid bake. The methods delta is those statement
  // lines tripping the first-class-method heuristic, not new methods.
  // Within-cycle ratchet re-base; split target unchanged. See docs/CARRY_OVERS.md.
  'src/systems/terrain/TerrainSystem.ts': { round: 'P3R5', reason: 'split into TerrainCore + TerrainStreamingFacade; +22 LOC cycle-2026-06-09 gameplay-heightmap-resolution (DEM-faithful CPU query grid in syncCpuHeightsToGpu + rationale); +6 LOC: propagate-phase startup marks (ashau-load-freeze, 2026-06-10); +71 LOC dropped-frame vegetation/shadow isolation and terrain lighting controls; +10 LOC / +1 method cycle-2026-06-29-cinematic-foundations getBakedHeightmap() facade (non-fenced 1024 baked-grid accessor for orbital topo map)', loc: 985, methods: 81 },
  'src/ui/hud/CommandModeOverlay.ts': { round: 'P3R3', reason: 'split alongside HUDSystem in R3; +6 LOC radio-command-menu (FIRE SUPPORT + SQUAD section headers + per-order effect text; fire-support rows extracted to CommandRadioFireSupportPanel.ts to keep growth minimal)', loc: 867, methods: 24 },
  'src/ui/map/FullMapSystem.ts': { round: 'P3R3', reason: 'split alongside HUDSystem in R3', loc: 882, methods: 42 },
  'src/config/AShauValleyConfig.ts': { round: 'P3R4', reason: '0 tests → split into terrain config + biome config + spawn data; +5 LOC: prebaked navmesh asset wiring (navmesh-coverage-ashau)', loc: 761, methods: 0 },
  // Pre-existing budget debt surfaced by validate:fast (CI runs `lint` but not
  // `lint:budget`): grew during the 2026-06-03 deploy-loadout cycle (UX-3
  // faction-availability chips + the selectable-ammo 4th loadout slot).
  // Not relicense-related; queued for a presentation/loadout-panel split.
  // Snapshot raised 1038 → 1118 LOC / 68 → 75 methods (weapon-stats-panel,
  // 2026-06-28): the armory now surfaces a compact weapon-stats readout
  // (rpm / damage near→far / falloff / recoil / ADS) for the focused weapon,
  // built from the shared WeaponRigManager spec table and updated on cycle /
  // chip select. In-cycle ratchet re-base, no CARRY_OVERS row (sanctioned by
  // the brief). The loadout/presentation split target above is unchanged.
  // Snapshot raised 1118 → 1121 LOC (deploy-map-navigation, 2026-06-28): +3 LOC
  // to make the map container a positioning context for the map's self-mounted
  // navigation controls overlay (zoom / recenter / spawn-cycle). In-cycle
  // ratchet re-base sanctioned by the task brief; no CARRY_OVERS row.
  // Snapshot raised 1120 → 1142 LOC / 75 → 76 methods (crew-vehicle-selectable,
  // 2026-06-28): the CREW-A-VEHICLE selection surfaces a "Press F to board" hint
  // in the selected-spawn panel — one new hint element + the setBoardVehicleHint
  // method (also cleared on resetSelectedSpawn). In-cycle ratchet re-base, no
  // CARRY_OVERS row (sanctioned by the task brief).
  'src/ui/screens/DeployScreen.ts': { round: 'P4-deploy-loadout', reason: 'split the loadout panel out of the screen facade; +80 LOC/+7 methods weapon-stats readout (weapon-stats-panel, 2026-06-28); +3 LOC map-controls positioning context (deploy-map-navigation, 2026-06-28); armory declutter removed the redundant per-slot PREV/NEXT cycle buttons, net -1 LOC (armory-layout-reflow, 2026-06-28); +22 LOC/+1 method F-board hint (crew-vehicle-selectable, 2026-06-28)', loc: 1142, methods: 76 },
  'src/core/SystemManager.ts': { round: 'P2-P3', reason: 'decompose system wiring + lifecycle into helpers; +1 method dropped-frame diagnostics handoff; +1 taskingDirector registry getter (tasking-director-mvp, 2026-06-28). In-cycle ratchet re-base for the new opt-in system registration; decompose target unchanged.', loc: 355, methods: 63 },
  // Added 2026-05-12 at the exp/konveyer-webgpu-migration → master merge gate.
  // HosekWilkieSkyBackend grew through the KONVEYER campaign and is tracked as
  // split-debt in docs/CARRY_OVERS.md (konveyer-large-file-splits). The
  // WaterSystem half of that carry-over closes with the VODA-1 split
  // (water-system-file-split, 2026-05-16): WaterSystem.ts is now an
  // orchestrator that delegates to water/HydrologyRiverSurface,
  // water/WaterSurfaceSampler, and water/WaterSurfaceBinding.
  'src/systems/environment/atmosphere/HosekWilkieSkyBackend.ts': { round: 'P4-KONVEYER-followup', reason: 'split atmosphere LUT + sun model + cloud composition during the TSL fragment-shader sky port', loc: 1069, methods: 0 },
};

const SKIP = (rel: string): boolean =>
  rel.endsWith('.test.ts') ||
  rel.endsWith('.spec.ts') ||
  rel.includes('/__tests__/') ||
  rel.includes('\\__tests__\\') ||
  rel.includes('/test-utils/') ||
  rel.includes('\\test-utils\\') ||
  rel.endsWith('.d.ts');

export interface Finding {
  level: 'warn' | 'fail';
  rel: string;
  rule: 'loc' | 'methods';
  value: number;
  /**
   * The ceiling the value was compared against. For non-grandfathered files
   * this is the base limit (MAX_LOC / MAX_METHODS). For grandfathered files
   * it is the ratchet ceiling `max(base, snapshot)`.
   */
  limit: number;
  grandfathered: boolean;
  /**
   * `true` when this finding is a ratchet regression — a grandfathered file
   * grew past its recorded snapshot. These are FAILs, not WARNs.
   */
  ratchetRegression: boolean;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walk(abs));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(abs);
  }
  return out;
}

function countMethodsInFirstClass(source: string): number {
  // Find first `class ... {` declaration.
  const classMatch = /\bclass\s+\w+[^{]*\{/.exec(source);
  if (!classMatch) return 0;
  const classBodyStart = classMatch.index + classMatch[0].length;

  // Walk braces to find the matching close.
  let depth = 1;
  let i = classBodyStart;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  const body = source.slice(classBodyStart, Math.max(classBodyStart, i - 1));

  // Count method-like declarations: `name(...) {` or `private/protected/public/static/async name(...) {`
  // Skip getters/setters since they're property-shaped; still count as one method.
  // This intentionally undercounts in some shapes (overloads, decorators), which is fine — we're after god-class signal, not perfect AST.
  const methodRe = /^[\s]*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|override\s+|get\s+|set\s+)*[\w$]+\s*(?:<[^>]*>)?\s*\(/gm;
  const matches = body.match(methodRe);
  if (!matches) return 0;

  // Filter out lines that are clearly not methods: `if (`, `for (`, `while (`, `return foo(`, etc.
  const reserved = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'return', 'throw',
    'new', 'await', 'typeof', 'super', 'this', 'void', 'in', 'of',
    'else', 'do', 'try', 'finally', 'function',
  ]);
  let count = 0;
  for (const m of matches) {
    const name = /^[\s]*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|override\s+|get\s+|set\s+)*([\w$]+)/.exec(m);
    if (!name) continue;
    if (reserved.has(name[1])) continue;
    if (name[1] === 'constructor') continue;
    count += 1;
  }
  return count;
}

function locOf(source: string): number {
  const lines = source.split(/\r?\n/);
  // Exclude the leading SPDX / copyright license header (added repo-wide by the
  // AGPL-3.0 relicense) so license boilerplate is not counted against each
  // file's code budget.
  let start = 0;
  while (
    start < lines.length &&
    /^\s*\/\/\s*(SPDX-License-Identifier:|Copyright \(c\))/.test(lines[start])
  ) {
    start += 1;
  }
  if (start > 0 && start < lines.length && lines[start].trim() === '') start += 1;
  const body = lines.slice(start);
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop();
  return body.length;
}

/**
 * Classify one measured dimension against the budget rules. Pure: takes the
 * grandfather entry (or null) directly so it can be unit-tested without any
 * filesystem access.
 *
 * Rules:
 *   - Not grandfathered: FAIL when value > baseLimit (the original hard rule).
 *   - Grandfathered, value > snapshot:     FAIL (ratchet regression — the file
 *     grew past the floor it was admitted at).
 *   - Grandfathered, baseLimit < value ≤ snapshot: WARN (known debt, no
 *     regression — shrinking is encouraged).
 *   - value ≤ baseLimit: no finding (a grandfathered file that has shrunk
 *     under the base limit is simply healthy on this dimension).
 */
export function classifyDimension(
  rel: string,
  rule: 'loc' | 'methods',
  value: number,
  baseLimit: number,
  entry: GrandfatherEntry | null,
): Finding | null {
  const grandfathered = entry !== null;
  if (value <= baseLimit) {
    // Within the base budget. No finding even if grandfathered — a grandfather
    // entry whose dimension dropped under the limit no longer needs flagging.
    return null;
  }
  if (!grandfathered) {
    return { level: 'fail', rel, rule, value, limit: baseLimit, grandfathered: false, ratchetRegression: false };
  }
  const snapshot = rule === 'loc' ? entry.loc : entry.methods;
  const ceiling = Math.max(baseLimit, snapshot);
  if (value > ceiling) {
    // Grew past the recorded snapshot — the ratchet only goes one way.
    return { level: 'fail', rel, rule, value, limit: ceiling, grandfathered: true, ratchetRegression: true };
  }
  // Over base limit but at or under snapshot: known, accepted debt.
  return { level: 'warn', rel, rule, value, limit: baseLimit, grandfathered: true, ratchetRegression: false };
}

function classify(rel: string, loc: number, methods: number): Finding[] {
  const findings: Finding[] = [];
  const entry = GRANDFATHER[rel.replace(/\\/g, '/')] ?? null;
  const locFinding = classifyDimension(rel, 'loc', loc, MAX_LOC, entry);
  if (locFinding) findings.push(locFinding);
  const methodsFinding = classifyDimension(rel, 'methods', methods, MAX_METHODS, entry);
  if (methodsFinding) findings.push(methodsFinding);
  return findings;
}

function main(): void {
  const strict = process.argv.includes('--strict');
  const printOnly = process.argv.includes('--print');

  const files = walk(SRC_ROOT);
  const all: Finding[] = [];
  let inspected = 0;

  for (const abs of files) {
    const rel = relative(repoRoot, abs).replace(/\\/g, '/');
    if (SKIP(rel)) continue;
    inspected += 1;
    const source = readFileSync(abs, 'utf8');
    const loc = locOf(source);
    const methods = countMethodsInFirstClass(source);
    all.push(...classify(rel, loc, methods));
  }

  const fails = all.filter((f) => f.level === 'fail');
  const warns = all.filter((f) => f.level === 'warn');

  if (printOnly || all.length > 0) {
    for (const f of all) {
      const tag = f.level.toUpperCase();
      const gf = f.ratchetRegression
        ? ' [grandfathered: GREW PAST SNAPSHOT]'
        : f.grandfathered
          ? ' [grandfathered]'
          : '';
      const ruleLabel = f.rule === 'loc' ? 'LOC' : 'methods';
      console.log(`[${tag}] ${f.rel} (${ruleLabel}): ${f.value} > ${f.limit}${gf}`);
    }
  }

  const ratchetRegressions = fails.filter((f) => f.ratchetRegression);
  if (ratchetRegressions.length > 0) {
    console.error(
      `\n[lint-source-budget] ${ratchetRegressions.length} grandfathered file(s) grew past their snapshot. ` +
        `Grandfather is a one-way ratchet: shrink the file, or — if the growth is intentional and approved — ` +
        `raise its snapshot in scripts/lint-source-budget.ts with an orchestrator note in docs/CARRY_OVERS.md.`,
    );
  }

  console.log(
    `\n[lint-source-budget] ${inspected} files inspected, ${warns.length} warnings, ${fails.length} failures.`,
  );
  console.log(`[lint-source-budget] grandfather list size: ${Object.keys(GRANDFATHER).length}`);

  if (printOnly) return;
  if (fails.length > 0) process.exit(1);
  if (strict && warns.length > 0) process.exit(1);
}

// Run CLI behavior only when invoked directly, not when imported by tests.
// `process.argv[1]` is the script path under tsx; compare normalized basenames.
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /lint-source-budget\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  main();
}
