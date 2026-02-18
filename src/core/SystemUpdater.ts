import * as THREE from 'three';
import { GameSystem } from '../types';
import { SystemReferences } from './SystemInitializer';
import { performanceTelemetry } from '../systems/debug/PerformanceTelemetry';
import { spatialGridManager } from '../systems/combat/SpatialGridManager';
import { ShotCommandFactory } from '../systems/player/weapon/ShotCommand';
import { Logger } from '../utils/Logger';

interface SystemTimingEntry {
  name: string;
  budgetMs: number;
  lastMs: number;
  emaMs: number;
}

/**
 * Handles update loop orchestration and performance tracking
 */
export class SystemUpdater {
  private systemTimings: Map<string, SystemTimingEntry> = new Map();
  private readonly EMA_ALPHA = 0.1;
  private tacticalUiAccumulator = 0;
  private readonly TACTICAL_UI_INTERVAL = 1 / 20; // 20 Hz is enough for map/compass updates

  updateSystems(
    refs: SystemReferences,
    systems: GameSystem[],
    scene: THREE.Scene | undefined,
    deltaTime: number,
    gameStarted: boolean = true
  ): void {
    // Begin frame telemetry
    performanceTelemetry.beginFrame();
    spatialGridManager.resetFrameTelemetry();
    ShotCommandFactory.resetPool();

    // Update player position in squad controller
    if (refs.playerSquadController && refs.playerController) {
      refs.playerSquadController.updatePlayerPosition(refs.playerController.getPosition());

      // Update command position on minimap
      const commandPos = refs.playerSquadController.getCommandPosition();
      refs.minimapSystem.setCommandPosition(commandPos);

      if (refs.voiceCalloutSystem) {
        refs.voiceCalloutSystem.setPlayerPosition(refs.playerController.getPosition());
      }
    }

    // Track timing for key systems (both local tracking and performance telemetry)
    this.trackSystemUpdate('Combat', 5.0, () => {
      performanceTelemetry.beginSystem('Combat');
      if (refs.combatantSystem) refs.combatantSystem.update(deltaTime);
      performanceTelemetry.endSystem('Combat');
    });

    this.trackSystemUpdate('Terrain', 2.0, () => {
      performanceTelemetry.beginSystem('Terrain');
      if (refs.chunkManager) refs.chunkManager.update(deltaTime);
      performanceTelemetry.endSystem('Terrain');
    });

    this.trackSystemUpdate('Billboards', 2.0, () => {
      performanceTelemetry.beginSystem('Billboards');
      if (refs.globalBillboardSystem) {
        const fog = scene?.fog as THREE.FogExp2 | undefined;
        refs.globalBillboardSystem.update(deltaTime, fog);
      }
      performanceTelemetry.endSystem('Billboards');
    });

    this.trackSystemUpdate('Player', 1.0, () => {
      performanceTelemetry.beginSystem('Player');
      if (refs.playerController) refs.playerController.update(deltaTime);
      if (refs.firstPersonWeapon) refs.firstPersonWeapon.update(deltaTime);
      performanceTelemetry.endSystem('Player');
    });

    this.trackSystemUpdate('Weapons', 1.0, () => {
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
    this.tacticalUiAccumulator += deltaTime;

    this.trackSystemUpdate('HUD', 1.0, () => {
      performanceTelemetry.beginSystem('HUD');
      if (refs.hudSystem) refs.hudSystem.update(deltaTime);
      performanceTelemetry.endSystem('HUD');
    });

    this.trackSystemUpdate('TacticalUI', 0.5, () => {
      performanceTelemetry.beginSystem('TacticalUI');

      // Minimap/compass/full-map updates are throttled to reduce DOM/canvas churn.
      if (shouldUpdateUI && this.tacticalUiAccumulator >= this.TACTICAL_UI_INTERVAL) {
        const tacticalDelta = this.tacticalUiAccumulator;
        this.tacticalUiAccumulator = 0;
        if (refs.minimapSystem) refs.minimapSystem.update(tacticalDelta);
        if (refs.compassSystem) refs.compassSystem.update(tacticalDelta);
      }

      // Full map updates when visible, on same tactical cadence.
      if (refs.fullMapSystem && fullMapVisible && this.tacticalUiAccumulator >= this.TACTICAL_UI_INTERVAL) {
        const tacticalDelta = this.tacticalUiAccumulator;
        this.tacticalUiAccumulator = 0;
        refs.fullMapSystem.update(tacticalDelta);
      }

      performanceTelemetry.endSystem('TacticalUI');
    });

    // War Simulator (only active for A Shau Valley mode)
    this.trackSystemUpdate('WarSim', 2.0, () => {
      performanceTelemetry.beginSystem('WarSim');
      if (refs.warSimulator && refs.playerController) {
        const pos = refs.playerController.getPosition();
        refs.warSimulator.setPlayerPosition(pos.x, pos.y, pos.z);
        refs.warSimulator.update(deltaTime);
        refs.strategicFeedback.setPlayerPosition(pos.x, pos.z);
      }
      performanceTelemetry.endSystem('WarSim');
    });

    // Gate World systems - skip weather and tickets during menu/loading
    this.trackSystemUpdate('World', 1.0, () => {
      performanceTelemetry.beginSystem('World');
      if (refs.zoneManager) refs.zoneManager.update(deltaTime);

      // Gate ticket and weather systems before game starts
      if (gameStarted) {
        if (refs.ticketSystem) refs.ticketSystem.update(deltaTime);
        if (refs.weatherSystem) refs.weatherSystem.update(deltaTime);
      }

      if (refs.waterSystem) refs.waterSystem.update(deltaTime);
      performanceTelemetry.endSystem('World');
    });

    // Update remaining systems without tracking (lightweight systems)
    performanceTelemetry.beginSystem('Other');
    for (const system of systems) {
      if (!this.isTrackedSystem(system, refs)) {
        try {
          system.update(deltaTime);
        } catch (error) {
          Logger.error('SystemUpdater', 'Untracked system threw error:', error);
        }
      }
    }
    performanceTelemetry.endSystem('Other');

    // End frame telemetry
    performanceTelemetry.endFrame();
  }

  private isTrackedSystem(system: GameSystem, refs: SystemReferences): boolean {
    return system === refs.combatantSystem
      || system === refs.chunkManager
      || system === refs.globalBillboardSystem
      || system === refs.playerController
      || system === refs.firstPersonWeapon
      || system === refs.grenadeSystem
      || system === refs.mortarSystem
      || system === refs.sandbagSystem
      || system === refs.ammoSupplySystem
      || system === refs.hudSystem
      || system === refs.minimapSystem
      || system === refs.fullMapSystem
      || system === refs.compassSystem
      || system === refs.zoneManager
      || system === refs.ticketSystem
      || system === refs.waterSystem
      || system === refs.weatherSystem
      || system === refs.warSimulator
      || system === refs.strategicFeedback;
  }

  private trackSystemUpdate(name: string, budgetMs: number, updateFn: () => void): void {
    const start = performance.now();
    try {
      updateFn();
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
  }

  getSystemTimings(): Array<{ name: string; timeMs: number; budgetMs: number }> {
    return Array.from(this.systemTimings.values()).map(entry => ({
      name: entry.name,
      timeMs: entry.emaMs,
      budgetMs: entry.budgetMs
    }));
  }
}
