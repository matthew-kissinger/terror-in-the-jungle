import * as THREE from 'three';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { Logger } from '../../utils/Logger';
import { IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import { shouldUseTouchControls } from '../../utils/DeviceDetector';
import type { PlayerInput } from '../player/PlayerInput';

export class HelicopterInteraction {
  private helicopters: Map<string, THREE.Group>;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private terrainManager?: ImprovedChunkManager;
  private playerInput?: PlayerInput;
  private interactionRadius: number;
  private isPlayerNearHelicopter = false;

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

  setPlayerInput(playerInput: PlayerInput): void {
    this.playerInput = playerInput;
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
    this.terrainManager = terrainManager;
  }

  checkPlayerProximity(): void {
    if (!this.playerController || !this.hudSystem) {
      return;
    }

    const helicopter = this.helicopters.get('us_huey');
    if (!helicopter) {
      return;
    }

    // If player is in helicopter, don't show interaction prompt
    if (this.playerController.isInHelicopter()) {
      if (this.isPlayerNearHelicopter) {
        this.isPlayerNearHelicopter = false;
        this.hudSystem.hideInteractionPrompt();
      }
      return;
    }

    // Get player position from camera (PlayerController uses camera position)
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      Logger.debug('helicopter', ' DEBUG: No player position available');
      return;
    }

    const helicopterPosition = helicopter.position;

    // Use horizontal distance (X,Z) so it works when player is on top of helicopter
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPosition.x - helicopterPosition.x, 2) +
      Math.pow(playerPosition.z - helicopterPosition.z, 2)
    );

    // Always log distance for debugging
    if (Math.random() < 0.1) { // Log 10% of the time to avoid spam
      const fullDistance = playerPosition.distanceTo(helicopterPosition);
      Logger.debug('helicopter', ` DEBUG: Player pos: (${playerPosition.x.toFixed(1)}, ${playerPosition.y.toFixed(1)}, ${playerPosition.z.toFixed(1)}), Helicopter pos: (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)}), Horizontal distance: ${horizontalDistance.toFixed(1)}m, 3D distance: ${fullDistance.toFixed(1)}m`);
    }

    const isNearNow = horizontalDistance <= this.interactionRadius;

    // Only update UI if proximity state changed
    if (isNearNow !== this.isPlayerNearHelicopter) {
      this.isPlayerNearHelicopter = isNearNow;

      if (this.isPlayerNearHelicopter) {
        Logger.debug('helicopter', `  Player near helicopter (${horizontalDistance.toFixed(1)}m horizontal) - SHOWING PROMPT!`);

        // Show appropriate prompt and button based on device
        const isTouchDevice = shouldUseTouchControls();
        const promptText = isTouchDevice ? 'Tap button to enter helicopter' : 'Press E to enter helicopter';
        this.hudSystem.showInteractionPrompt(promptText);

        // Show touch interaction button if on touch device
        if (isTouchDevice && this.playerInput) {
          const touchControls = this.playerInput.getTouchControls();
          touchControls?.interactionButton.showButton();
        }
      } else {
        Logger.debug('helicopter', '  Player left helicopter area - HIDING PROMPT!');
        this.hudSystem.hideInteractionPrompt();

        // Hide touch interaction button if on touch device
        if (shouldUseTouchControls() && this.playerInput) {
          const touchControls = this.playerInput.getTouchControls();
          touchControls?.interactionButton.hideButton();
        }
      }
    }
  }

  tryEnterHelicopter(): void {
    if (!this.playerController) {
      Logger.warn('helicopter', ' Cannot enter helicopter - no player controller');
      return;
    }

    // Check if player is already in a helicopter
    if (this.playerController.isInHelicopter()) {
      Logger.debug('helicopter', ' Player is already in a helicopter');
      return;
    }

    const helicopter = this.helicopters.get('us_huey');
    if (!helicopter) {
      Logger.debug('helicopter', ' No helicopter available for entry');
      return;
    }

    // Check if player is close enough
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      Logger.warn('helicopter', ' Cannot get player position for helicopter entry');
      return;
    }

    const helicopterPosition = helicopter.position;
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPosition.x - helicopterPosition.x, 2) +
      Math.pow(playerPosition.z - helicopterPosition.z, 2)
    );

    if (horizontalDistance > this.interactionRadius) {
      Logger.debug('helicopter', ` Player too far from helicopter (${horizontalDistance.toFixed(1)}m) - must be within ${this.interactionRadius}m`);
      return;
    }

    // Enter the helicopter
    Logger.debug('helicopter', `  PLAYER ENTERING HELICOPTER!`);
    this.playerController.enterHelicopter('us_huey', helicopterPosition.clone());

    // Hide interaction prompt and touch button
    if (this.hudSystem) {
      this.hudSystem.hideInteractionPrompt();
    }
    if (shouldUseTouchControls() && this.playerInput) {
      const touchControls = this.playerInput.getTouchControls();
      touchControls?.interactionButton.hideButton();
    }
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
      const terrainHeight = this.terrainManager.getHeightAt(exitPosition.x, exitPosition.z);
      exitPosition.y = Math.max(exitPosition.y, terrainHeight + 1.5); // Player height above terrain
    }

    Logger.debug('helicopter', `  PLAYER EXITING HELICOPTER!`);
    this.playerController.exitHelicopter(exitPosition);
  }
}
