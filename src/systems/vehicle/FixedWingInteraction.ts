import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import type { IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import { Logger } from '../../utils/Logger';

const POST_EXIT_INTERACTION_COOLDOWN_MS = 300;
const INTERACTION_RADIUS = 8; // Slightly larger than helicopter (5m) since planes are bigger

/**
 * Handles player proximity detection and entry/exit for fixed-wing aircraft.
 * Mirrors HelicopterInteraction but for fixed-wing.
 */
export class FixedWingInteraction {
  private aircraft: Map<string, THREE.Group>;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private terrainManager?: ITerrainRuntime;
  private isPlayerNearAircraft = false;
  private nearestAircraftId: string | null = null;
  private suppressInteractionUntilMs = 0;
  private displayNames: Map<string, string>;

  constructor(aircraft: Map<string, THREE.Group>, displayNames: Map<string, string>) {
    this.aircraft = aircraft;
    this.displayNames = displayNames;
  }

  setPlayerController(playerController: IPlayerController): void {
    this.playerController = playerController;
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  setTerrainManager(terrainManager: ITerrainRuntime): void {
    this.terrainManager = terrainManager;
  }

  private findNearestAircraft(playerPosition: THREE.Vector3): { id: string; group: THREE.Group; distance: number } | null {
    let nearest: { id: string; group: THREE.Group; distance: number } | null = null;
    for (const [id, group] of this.aircraft) {
      const dx = playerPosition.x - group.position.x;
      const dz = playerPosition.z - group.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (!nearest || dist < nearest.distance) {
        nearest = { id, group, distance: dist };
      }
    }
    return nearest;
  }

  checkPlayerProximity(): void {
    if (!this.playerController || !this.hudSystem) return;
    if (this.aircraft.size === 0) return;
    if (Date.now() < this.suppressInteractionUntilMs) {
      this.clearInteractionPrompt();
      return;
    }

    // Don't show prompt if player is in any vehicle
    if (this.playerController.isInHelicopter() || this.playerController.isInFixedWing()) {
      this.clearInteractionPrompt();
      return;
    }

    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) return;

    const nearest = this.findNearestAircraft(playerPosition);
    if (!nearest) return;

    const isNearNow = nearest.distance <= INTERACTION_RADIUS;

    if (isNearNow !== this.isPlayerNearAircraft) {
      this.isPlayerNearAircraft = isNearNow;

      if (this.isPlayerNearAircraft) {
        this.nearestAircraftId = nearest.id;
        const name = this.displayNames.get(nearest.id) ?? 'aircraft';
        Logger.debug('fixedwing', `Player near ${nearest.id} (${nearest.distance.toFixed(1)}m)`);

        const isTouchDevice = shouldUseTouchControls();
        const promptText = isTouchDevice ? `Tap ENTER to board ${name}` : `Press E to enter ${name}`;
        this.hudSystem.setInteractionContext?.({
          kind: 'vehicle-enter',
          promptText,
          buttonLabel: 'ENTER',
          targetId: nearest.id,
        });
      } else {
        this.nearestAircraftId = null;
        this.hudSystem.setInteractionContext?.(null);
      }
    }
  }

  tryEnterAircraft(): boolean {
    if (!this.playerController) return false;
    if (Date.now() < this.suppressInteractionUntilMs) return false;
    if (this.playerController.isInHelicopter() || this.playerController.isInFixedWing()) return false;

    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) return false;

    const nearest = this.findNearestAircraft(playerPosition);
    if (!nearest || nearest.distance > INTERACTION_RADIUS) return false;

    Logger.debug('fixedwing', `PLAYER ENTERING ${nearest.id}`);
    this.playerController.enterFixedWing(nearest.id, nearest.group.position.clone());
    this.clearInteractionPrompt();
    return true;
  }

  exitAircraft(): void {
    if (!this.playerController) return;
    if (!this.playerController.isInFixedWing()) return;

    const aircraftId = this.playerController.getFixedWingId();
    const aircraft = aircraftId ? this.aircraft.get(aircraftId) : null;
    if (!aircraft) return;

    // Calculate exit position beside the aircraft
    const exitPosition = aircraft.position.clone();
    const rightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);
    exitPosition.addScaledVector(rightVector, 4);

    if (this.terrainManager) {
      const terrainHeight = this.terrainManager.getEffectiveHeightAt(exitPosition.x, exitPosition.z);
      exitPosition.y = Math.max(exitPosition.y, terrainHeight + 1.5);
    }

    Logger.debug('fixedwing', `PLAYER EXITING AIRCRAFT`);
    this.playerController.exitFixedWing(exitPosition);
    this.suppressInteractionUntilMs = Date.now() + POST_EXIT_INTERACTION_COOLDOWN_MS;
    this.clearInteractionPrompt();
  }

  private clearInteractionPrompt(): void {
    this.isPlayerNearAircraft = false;
    this.nearestAircraftId = null;
    this.hudSystem?.setInteractionContext?.(null);
  }
}
