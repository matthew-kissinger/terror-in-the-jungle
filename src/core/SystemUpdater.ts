// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../types';
import type { SystemKeyToType } from './SystemRegistry';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { ShotCommandFactory } from '../systems/player/weapon/ShotCommand';
import { Logger } from '../utils/Logger';
import { isPerfUserTimingEnabled } from './PerfDiagnostics';
import { GameEventBus } from './GameEventBus';
import { SimulationScheduler } from './SimulationScheduler';
import { collectTrackedSystems, SYSTEM_UPDATE_BUDGET_MS } from './SystemUpdateSchedule';
import { GroundVehicleProximityChecker } from '../systems/vehicle/GroundVehicleProximityChecker';
import { createAtmosphereLightingSnapshot } from '../systems/environment/AtmosphereSystem';

interface SystemTimingEntry {
  name: string;
  budgetMs: number;
  lastMs: number;
  emaMs: number;
}

export interface SystemTimingSnapshot {
  name: string;
  timeMs: number;
  budgetMs: number;
  lastMs: number;
  emaMs: number;
}

function toSystemTimingSnapshot(entry: SystemTimingEntry): SystemTimingSnapshot {
  return {
    name: entry.name,
    timeMs: entry.emaMs,
    budgetMs: entry.budgetMs,
    lastMs: entry.lastMs,
    emaMs: entry.emaMs
  };
}

function toFiniteSystemTimingSnapshot(entry: SystemTimingEntry): SystemTimingSnapshot | null {
  const lastMs = Number.isFinite(entry.lastMs) ? entry.lastMs : entry.emaMs;
  if (!Number.isFinite(lastMs) || lastMs < 0) return null;
  const emaMs = Number.isFinite(entry.emaMs) ? entry.emaMs : lastMs;
  const budgetMs = Number.isFinite(entry.budgetMs) ? entry.budgetMs : 0;
  return {
    name: entry.name,
    timeMs: emaMs,
    budgetMs,
    lastMs,
    emaMs
  };
}

function insertTopSystemTiming(target: SystemTimingSnapshot[], timing: SystemTimingSnapshot, limit: number): void {
  let insertAt = 0;
  while (insertAt < target.length && target[insertAt].lastMs >= timing.lastMs) {
    insertAt++;
  }
  if (insertAt >= limit) return;
  const nextLength = Math.min(target.length + 1, limit);
  for (let index = nextLength - 1; index > insertAt; index--) {
    target[index] = target[index - 1];
  }
  target[insertAt] = timing;
  target.length = nextLength;
}

const WORLD_CHILD_BUDGET_MS = {
  Zone: 0.12,
  Tickets: 0.08,
  Weather: 0.12,
  Atmosphere: 0.38,
} as const;

const PLAYER_CHILD_BUDGET_MS = {
  Controller: 0.75,
  Weapon: 0.25,
} as const;

/**
 * Handles update loop orchestration and performance tracking
 */
export class SystemUpdater {
  private systemTimings: Map<string, SystemTimingEntry> = new Map();
  private readonly EMA_ALPHA = 0.1;
  private readonly BUDGET_WARN_THRESHOLD = 1.2; // Warn when EMA exceeds 120% of budget
  private readonly BUDGET_WARN_COOLDOWN_MS = 5_000;
  private budgetWarningLastMs: Map<string, number> = new Map();
  private readonly scheduler = new SimulationScheduler();
  private readonly perfUserTimingEnabled =
    (import.meta.env.DEV || import.meta.env.VITE_PERF_HARNESS === '1') && isPerfUserTimingEnabled();

  // Lazily-instantiated proximity checker for the "Press F to board"
  // ground-vehicle / watercraft / emplacement HUD prompt. Created on the
  // first Vehicles-phase tick where vehicleManager + playerController +
  // hudSystem are all present. Owns its own 10 Hz cadence internally so
  // we can call update() every frame here without measurable cost.
  private groundVehicleProximityChecker: GroundVehicleProximityChecker | null = null;

  // Reused per-frame color buffers for forwarding AtmosphereSystem output
  // into the billboard lighting snapshot. Allocating once here avoids
  // per-frame GC churn in the Billboards update block.
  private readonly billboardSunColor = new THREE.Color(1, 1, 1);
  private readonly billboardSkyColor = new THREE.Color(0.7, 0.8, 1.0);
  private readonly billboardGroundColor = new THREE.Color(0.3, 0.3, 0.25);
  private readonly billboardLighting = {
    sunColor: this.billboardSunColor,
    skyColor: this.billboardSkyColor,
    groundColor: this.billboardGroundColor,
  };
  private readonly billboardAtmosphereLighting = createAtmosphereLightingSnapshot();

  updateSystems(
    refs: SystemKeyToType,
    systems: GameSystem[],
    scene: THREE.Scene | undefined,
    deltaTime: number,
    gameStarted: boolean = true
  ): void {
    // Begin frame telemetry
    performanceTelemetry.beginFrame();
    refs.spatialGridManager.resetFrameTelemetry();
    ShotCommandFactory.resetPool();

    // Update player position in squad controller
    if (refs.playerSquadController && refs.playerController) {
      refs.playerSquadController.updatePlayerPosition(refs.playerController.getPosition());

      // Update command position on minimap
      const commandPos = refs.playerSquadController.getCommandPosition();
      refs.minimapSystem.setCommandPosition(commandPos);
      refs.fullMapSystem.setCommandPosition(commandPos);

    }

    // Track timing for key systems (both local tracking and performance telemetry)
    this.trackSystemUpdate('Combat', SYSTEM_UPDATE_BUDGET_MS.Combat, () => {
      performanceTelemetry.beginSystem('Combat');
      if (refs.combatantSystem) refs.combatantSystem.update(deltaTime);
      if (refs.m2hbEmplacementSystem) refs.m2hbEmplacementSystem.update(deltaTime);
      performanceTelemetry.endSystem('Combat');
    });

    this.trackSystemUpdate('Terrain', SYSTEM_UPDATE_BUDGET_MS.Terrain, () => {
      performanceTelemetry.beginSystem('Terrain');
      if (refs.terrainSystem && gameStarted) refs.terrainSystem.update(deltaTime);
      performanceTelemetry.endSystem('Terrain');
    });

    this.trackSystemUpdate('Navigation', SYSTEM_UPDATE_BUDGET_MS.Navigation, () => {
      performanceTelemetry.beginSystem('Navigation');
      if (refs.navmeshSystem) {
        const pos = refs.playerController?.getPosition();
        refs.navmeshSystem.update(deltaTime, pos);
      }
      performanceTelemetry.endSystem('Navigation');
    });

    this.trackSystemUpdate('Billboards', SYSTEM_UPDATE_BUDGET_MS.Billboards, () => {
      performanceTelemetry.beginSystem('Billboards');
      let atmosphereLighting: typeof this.billboardAtmosphereLighting | undefined;
      if (refs.atmosphereSystem) {
        atmosphereLighting = refs.atmosphereSystem.getLightingSnapshot(
          this.billboardAtmosphereLighting,
        );
        refs.terrainSystem?.setAtmosphereLighting(atmosphereLighting);
      }
      if (refs.globalBillboardSystem) {
        const fog = scene?.fog as THREE.FogExp2 | undefined;
        // Snapshot the atmosphere's current lighting authority into the
        // reusable billboard struct. Terrain picks this up through renderer
        // lights; vegetation owns a custom billboard material, so it receives
        // the same effective direct/sky/ground colors as uniforms.
        let lighting: typeof this.billboardLighting | undefined;
        if (atmosphereLighting) {
          this.billboardSunColor.copy(atmosphereLighting.directLightColor);
          this.billboardSkyColor.copy(atmosphereLighting.skyColor);
          this.billboardGroundColor.copy(atmosphereLighting.groundColor);
          lighting = this.billboardLighting;
        }
        const playerPos = refs.playerController?.getPosition();
        refs.globalBillboardSystem.update(deltaTime, fog, lighting, playerPos);
      }
      performanceTelemetry.endSystem('Billboards');
    });

    // Vehicles MUST update before Player. Piloted-vehicle physics run on a
    // fixed step and publish an INTERPOLATED visual pose (helicopter
    // position/quaternion, fixed-wing, ground chassis) during this block.
    // The chase cameras in PlayerCamera sample that pose by reference and
    // hard-copy it (no follow lerp for heli/ground), so the camera must read
    // it AFTER physics writes it, in the same frame. Running Player first
    // makes the camera copy last frame's pose while the model renders at this
    // frame's -> a one-frame desync that aliases the 60Hz fixed step against
    // high-refresh (120/144Hz) displays and makes the model visibly
    // shake/snap. Weapon suppression while seated is event-driven and does
    // NOT depend on this order. Do not reorder these two blocks.
    this.trackSystemUpdate('Vehicles', SYSTEM_UPDATE_BUDGET_MS.Vehicles, () => {
      performanceTelemetry.beginSystem('Vehicles');
      if (refs.helicopterModel) refs.helicopterModel.update(deltaTime);
      if (refs.fixedWingModel) refs.fixedWingModel.update(deltaTime);
      if (refs.vehicleManager) refs.vehicleManager.update(deltaTime);
      this.ensureGroundVehicleProximityChecker(refs);
      this.groundVehicleProximityChecker?.update(deltaTime);
      performanceTelemetry.endSystem('Vehicles');
    });

    this.trackSystemUpdate('Player', SYSTEM_UPDATE_BUDGET_MS.Player, () => {
      performanceTelemetry.beginSystem('Player');
      if (refs.playerController) {
        this.trackInstrumentedSystemUpdate('Player.Controller', PLAYER_CHILD_BUDGET_MS.Controller, () => {
          refs.playerController.update(deltaTime);
        });
      }
      if (refs.firstPersonWeapon) {
        this.trackInstrumentedSystemUpdate('Player.Weapon', PLAYER_CHILD_BUDGET_MS.Weapon, () => {
          refs.firstPersonWeapon.update(deltaTime);
        });
      }
      performanceTelemetry.endSystem('Player');
    });

    this.trackSystemUpdate('Weapons', SYSTEM_UPDATE_BUDGET_MS.Weapons, () => {
      performanceTelemetry.beginSystem('Weapons');
      if (refs.grenadeSystem) refs.grenadeSystem.update(deltaTime);
      if (refs.mortarSystem) refs.mortarSystem.update(deltaTime);
      if (refs.sandbagSystem) refs.sandbagSystem.update(deltaTime);
      if (refs.ammoSupplySystem) refs.ammoSupplySystem.update(deltaTime);
      performanceTelemetry.endSystem('Weapons');
    });

    // Gate UI systems - skip if game hasn't started or full map is visible
    const fullMapVisible = refs.fullMapSystem?.getIsVisible() || false;
    const shouldUpdateUI = gameStarted && !fullMapVisible;
    const tacticalDelta = this.scheduler.consume('tactical_ui', deltaTime);
    const warSimDelta = this.scheduler.consume('war_sim', deltaTime);
    const airSupportDelta = this.scheduler.consume('air_support', deltaTime);
    const worldDelta = this.scheduler.consume('world_state', deltaTime);
    const modeRuntimeDelta = this.scheduler.consume('mode_runtime', deltaTime);

    this.trackSystemUpdate('HUD', SYSTEM_UPDATE_BUDGET_MS.HUD, () => {
      performanceTelemetry.beginSystem('HUD');
      if (refs.hudSystem) refs.hudSystem.update(deltaTime);
      performanceTelemetry.endSystem('HUD');
    });

    this.trackSystemUpdate('TacticalUI', SYSTEM_UPDATE_BUDGET_MS.TacticalUI, () => {
      performanceTelemetry.beginSystem('TacticalUI');

      // Minimap/compass/full-map updates are throttled to reduce DOM/canvas churn.
      if (tacticalDelta !== null && shouldUpdateUI) {
        if (refs.minimapSystem) refs.minimapSystem.update(tacticalDelta);
        if (refs.compassSystem) refs.compassSystem.update(tacticalDelta);
      }

      if (tacticalDelta !== null && refs.fullMapSystem && fullMapVisible) {
        refs.fullMapSystem.update(tacticalDelta);
      }

      performanceTelemetry.endSystem('TacticalUI');
    });

    // War Simulator (only active for A Shau Valley mode)
    this.trackSystemUpdate('WarSim', SYSTEM_UPDATE_BUDGET_MS.WarSim, () => {
      performanceTelemetry.beginSystem('WarSim');
      if (warSimDelta !== null && refs.warSimulator && refs.playerController) {
        const pos = refs.playerController.getPosition();
        refs.warSimulator.setPlayerPosition(pos.x, pos.y, pos.z);
        refs.warSimulator.update(warSimDelta);
        refs.strategicFeedback.setPlayerPosition(pos.x, pos.z);
      }
      performanceTelemetry.endSystem('WarSim');
    });

    this.trackSystemUpdate('AirSupport', SYSTEM_UPDATE_BUDGET_MS.AirSupport, () => {
      performanceTelemetry.beginSystem('AirSupport');
      if (airSupportDelta !== null) {
        if (refs.airSupportManager) refs.airSupportManager.update(airSupportDelta);
        if (refs.aaEmplacementSystem) refs.aaEmplacementSystem.update(airSupportDelta);
        if (refs.npcVehicleController) refs.npcVehicleController.update(airSupportDelta);
      }
      performanceTelemetry.endSystem('AirSupport');
    });

    // Mode-specific runtime hooks are scheduled outside generic system logic.
    this.trackSystemUpdate('ModeRuntime', SYSTEM_UPDATE_BUDGET_MS.ModeRuntime, () => {
      performanceTelemetry.beginSystem('ModeRuntime');
      if (modeRuntimeDelta !== null && refs.gameModeManager) {
        refs.gameModeManager.updateRuntime(modeRuntimeDelta, gameStarted);
      }
      performanceTelemetry.endSystem('ModeRuntime');
    });

    // Gate World systems - skip weather and tickets during menu/loading
    this.trackSystemUpdate('World', SYSTEM_UPDATE_BUDGET_MS.World, () => {
      performanceTelemetry.beginSystem('World');
      if (worldDelta !== null) {
        if (refs.zoneManager) {
          this.trackInstrumentedSystemUpdate('World.Zone', WORLD_CHILD_BUDGET_MS.Zone, () => {
            refs.zoneManager.update(worldDelta);
          });
        }

        // Gate ticket and weather systems before game starts
        if (gameStarted) {
          if (refs.ticketSystem) {
            this.trackInstrumentedSystemUpdate('World.Tickets', WORLD_CHILD_BUDGET_MS.Tickets, () => {
              refs.ticketSystem.update(worldDelta);
            });
          }
          if (refs.weatherSystem) {
            this.trackInstrumentedSystemUpdate('World.Weather', WORLD_CHILD_BUDGET_MS.Weather, () => {
              refs.weatherSystem.update(worldDelta);
            });
          }
        }

        // Atmosphere shares the World budget; runs every frame so backends
        // (Hosek-Wilkie, prebaked cubemap) can drive sun/sky state pre-render.
        if (refs.atmosphereSystem) {
          this.trackInstrumentedSystemUpdate('World.Atmosphere', WORLD_CHILD_BUDGET_MS.Atmosphere, () => {
            refs.atmosphereSystem.update(worldDelta);
          });
        }
      }
      performanceTelemetry.endSystem('World');
    });

    // Update remaining systems without tracking (lightweight systems)
    const trackedSystems = collectTrackedSystems(refs);
    this.withUserTiming('Other', () => {
      performanceTelemetry.beginSystem('Other');
      for (const system of systems) {
        if (!trackedSystems.has(system)) {
          try {
            system.update(deltaTime);
          } catch (error) {
            Logger.error('SystemUpdater', 'Untracked system threw error:', error);
          }
        }
      }
      performanceTelemetry.endSystem('Other');
    });

    // Deliver queued game events for this frame
    GameEventBus.flush();

    // End frame telemetry
    performanceTelemetry.endFrame();
  }

  /**
   * Lazily construct the ground-vehicle proximity checker once both the
   * VehicleManager and PlayerController are registered. The checker only
   * needs read-only refs (player position, in-vehicle flag, HUD signaller)
   * so we capture them by closure rather than threading them through every
   * subsequent tick. Returns silently when prerequisites are missing — the
   * Vehicles phase can run before the runtime composer wires the HUD.
   */
  private ensureGroundVehicleProximityChecker(refs: SystemKeyToType): void {
    if (this.groundVehicleProximityChecker) return;
    const vehicleManager = refs.vehicleManager;
    const playerController = refs.playerController;
    const hudSystem = refs.hudSystem;
    const loadoutService = (refs as Partial<SystemKeyToType>).loadoutService;
    if (!vehicleManager || !playerController || !hudSystem) return;

    // `isInAnyVehicle()` covers helicopter, fixed-wing, ground vehicles
    // (jeep/tank), watercraft (sampan/PBR), and emplacements — all five
    // session states the prompt must suppress against. We fall back to
    // the fenced predicates when the concrete method is absent (e.g. a
    // test double providing only `IPlayerController` surface).
    const isInVehicle = typeof (playerController as { isInAnyVehicle?: () => boolean }).isInAnyVehicle === 'function'
      ? () => (playerController as { isInAnyVehicle: () => boolean }).isInAnyVehicle()
      : () => playerController.isInHelicopter() || playerController.isInFixedWing();

    this.groundVehicleProximityChecker = new GroundVehicleProximityChecker(
      vehicleManager,
      () => playerController.getPosition(),
      isInVehicle,
      {
        getPlayerFaction: () => loadoutService?.getContext().faction ?? null,
      },
    );
    this.groundVehicleProximityChecker.setHUDSystem(hudSystem);

    // Inject the checker into the PlayerController so the boarding-adapter
    // factory's `tryBoardNearest()` can read `getLastShownVehicleId()` when
    // the player presses F. Without this wire the F-router falls through to
    // the mortar fallback and no vehicle is ever boardable.
    (playerController as { setBoardingProximityChecker?: (checker: GroundVehicleProximityChecker) => void })
      .setBoardingProximityChecker?.(this.groundVehicleProximityChecker);
  }

  private trackInstrumentedSystemUpdate(name: string, budgetMs: number, updateFn: () => void): void {
    this.trackSystemUpdate(name, budgetMs, () => {
      performanceTelemetry.beginSystem(name);
      try {
        updateFn();
      } finally {
        performanceTelemetry.endSystem(name);
      }
    });
  }

  private trackSystemUpdate(name: string, budgetMs: number, updateFn: () => void): void {
    const start = performance.now();
    try {
      this.withUserTiming(name, updateFn);
    } catch (error) {
      Logger.error('SystemUpdater', `System "${name}" threw error:`, error);
    }
    const duration = performance.now() - start;

    let entry = this.systemTimings.get(name);
    if (!entry) {
      entry = { name, budgetMs, lastMs: duration, emaMs: duration };
      this.systemTimings.set(name, entry);
    } else {
      entry.lastMs = duration;
      entry.emaMs = entry.emaMs * (1 - this.EMA_ALPHA) + duration * this.EMA_ALPHA;
    }

    // Warn when a system consistently exceeds its budget
    if (entry.emaMs > entry.budgetMs * this.BUDGET_WARN_THRESHOLD) {
      const now = performance.now();
      const lastWarn = this.budgetWarningLastMs.get(name) ?? 0;
      if (now - lastWarn > this.BUDGET_WARN_COOLDOWN_MS) {
        this.budgetWarningLastMs.set(name, now);
        Logger.warn('SystemUpdater', `"${name}" over budget: ${entry.emaMs.toFixed(2)}ms EMA vs ${entry.budgetMs}ms budget`);
      }
    }
  }

  private withUserTiming(name: string, fn: () => void): void {
    if (!this.perfUserTimingEnabled) {
      fn();
      return;
    }

    const measureName = `SystemUpdater.${name}`;
    const startMark = `${measureName}.start`;
    const endMark = `${measureName}.end`;

    performance.mark(startMark);
    try {
      fn();
    } finally {
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
    }
  }

  getSystemTimings(): SystemTimingSnapshot[] {
    return Array.from(this.systemTimings.values()).map(toSystemTimingSnapshot);
  }

  getTopSystemTimingsByLast(limit: number): SystemTimingSnapshot[] {
    if (!Number.isFinite(limit) || limit <= 0) return [];
    const boundedLimit = Math.floor(limit);
    const snapshot: SystemTimingSnapshot[] = [];
    for (const entry of this.systemTimings.values()) {
      const timing = toFiniteSystemTimingSnapshot(entry);
      if (!timing) continue;
      insertTopSystemTiming(snapshot, timing, boundedLimit);
    }
    return snapshot;
  }
}
