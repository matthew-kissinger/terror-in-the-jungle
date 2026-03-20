import * as THREE from 'three';
import type { ITerrainRuntime } from '../../types/SystemInterfaces';
import { Logger } from '../../utils/Logger';
import { IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';

const POST_EXIT_INTERACTION_COOLDOWN_MS = 1000;

export class HelicopterInteraction {
  private helicopters: Map<string, THREE.Group>;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private terrainManager?: ITerrainRuntime;
  private interactionRadius: number;
  private isPlayerNearHelicopter = false;
  private nearestHelicopterId: string | null = null;
  private suppressInteractionUntilMs = 0;

  constructor(
    helicopters: Map<string, THREE.Group>,
    interactionRadius: number
  ) {
    this.helicopters = helicopters;
    this.interactionRadius = interactionRadius;
  }

  setPlayerController(playerController: IPlayerController): void {
    this.playerController = playerController;
  }

  setPlayerInput(_playerInput: unknown): void {}

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  setTerrainManager(terrainManager: ITerrainRuntime): void {
    this.terrainManager = terrainManager;
  }

  private findNearestHelicopter(playerPosition: THREE.Vector3): { id: string; group: THREE.Group; distance: number } | null {
    let nearest: { id: string; group: THREE.Group; distance: number } | null = null;
    for (const [id, group] of this.helicopters) {
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
    if (!this.playerController || !this.hudSystem) {
      return;
    }

    if (this.helicopters.size === 0) {
      return;
    }

    if (Date.now() < this.suppressInteractionUntilMs) {
      this.clearInteractionPrompt();
      return;
    }

    // If player is in helicopter, don't show interaction prompt
    if (this.playerController.isInHelicopter()) {
      this.clearInteractionPrompt();
      return;
    }

    // Get player position from camera (PlayerController uses camera position)
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      return;
    }

    const nearest = this.findNearestHelicopter(playerPosition);
    if (!nearest) {
      return;
    }

    const isNearNow = nearest.distance <= this.interactionRadius;

    // Only update UI if proximity state changed
    if (isNearNow !== this.isPlayerNearHelicopter) {
      this.isPlayerNearHelicopter = isNearNow;

      if (this.isPlayerNearHelicopter) {
        this.nearestHelicopterId = nearest.id;
        Logger.debug('helicopter', `Player near ${nearest.id} (${nearest.distance.toFixed(1)}m) - SHOWING PROMPT`);

        const isTouchDevice = shouldUseTouchControls();
        const promptText = isTouchDevice ? 'Tap ENTER to board helicopter' : 'Press E to enter helicopter';
        this.hudSystem.setInteractionContext?.({
          kind: 'vehicle-enter',
          promptText,
          buttonLabel: 'ENTER',
          targetId: nearest.id,
        });
      } else {
        this.nearestHelicopterId = null;
        this.hudSystem.setInteractionContext?.(null);
      }
    }
  }

  tryEnterHelicopter(): void {
    if (!this.playerController) {
      Logger.warn('helicopter', 'Cannot enter helicopter - no player controller');
      return;
    }

    if (Date.now() < this.suppressInteractionUntilMs) {
      return;
    }

    if (this.playerController.isInHelicopter()) {
      return;
    }

    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      Logger.warn('helicopter', 'Cannot get player position for helicopter entry');
      return;
    }

    const nearest = this.findNearestHelicopter(playerPosition);
    if (!nearest || nearest.distance > this.interactionRadius) {
      Logger.debug('helicopter', nearest
        ? `Too far from ${nearest.id} (${nearest.distance.toFixed(1)}m)`
        : 'No helicopters available');
      return;
    }

    Logger.debug('helicopter', `PLAYER ENTERING ${nearest.id}`);
    this.playerController.enterHelicopter(nearest.id, nearest.group.position.clone());

    this.clearInteractionPrompt();
  }

  exitHelicopter(): void {
    if (!this.playerController) {
      Logger.warn('helicopter', ' Cannot exit helicopter - no player controller');
      return;
    }

    if (!this.playerController.isInHelicopter()) {
      Logger.debug('helicopter', ' Player is not in a helicopter');
      return;
    }

    const helicopterId = this.playerController.getHelicopterId();
    const helicopter = helicopterId ? this.helicopters.get(helicopterId) : null;

    if (!helicopter) {
      Logger.warn('helicopter', ' Cannot find helicopter for exit');
      return;
    }

    // Calculate exit position (beside the helicopter door)
    const helicopterPosition = helicopter.position;
    const exitPosition = helicopterPosition.clone();
    exitPosition.x += 3; // Move 3 units to the right (door side)
    exitPosition.y = helicopterPosition.y; // Same height as helicopter

    // Make sure exit position is above terrain
    if (this.terrainManager) {
      const terrainHeight = this.terrainManager.getEffectiveHeightAt(exitPosition.x, exitPosition.z);
      exitPosition.y = Math.max(exitPosition.y, terrainHeight + 1.5); // Player height above terrain
    }

    Logger.debug('helicopter', `  PLAYER EXITING HELICOPTER!`);
    this.playerController.exitHelicopter(exitPosition);
    this.suppressInteractionUntilMs = Date.now() + POST_EXIT_INTERACTION_COOLDOWN_MS;
    this.clearInteractionPrompt();
  }

  private clearInteractionPrompt(): void {
    this.isPlayerNearHelicopter = false;
    this.nearestHelicopterId = null;
    this.hudSystem?.setInteractionContext?.(null);
  }
}
