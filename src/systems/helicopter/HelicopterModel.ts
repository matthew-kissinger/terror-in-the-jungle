import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HelipadSystem } from './HelipadSystem';
import { HelicopterPhysics, HelicopterControls } from './HelicopterPhysics';
import { Logger } from '../../utils/Logger';
import { createUH1HueyGeometry } from './HelicopterGeometry';
import { HelicopterAnimation } from './HelicopterAnimation';
import { HelicopterAudio } from './HelicopterAudio';

export class HelicopterModel implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ImprovedChunkManager;
  private helipadSystem?: HelipadSystem;
  private playerController?: any;
  private hudSystem?: any;
  private helicopters: Map<string, THREE.Group> = new Map();
  private helicopterPhysics: Map<string, HelicopterPhysics> = new Map();
  private interactionRadius = 5.0; // Distance from helicopter to show prompt (around helicopter size)
  private isPlayerNearHelicopter = false;

  // Subsystems
  private animation: HelicopterAnimation;
  private audio: HelicopterAudio;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.animation = new HelicopterAnimation();
    this.audio = new HelicopterAudio();
  }

  async init(): Promise<void> {
    Logger.debug('helicopter', '🚁 Initializing Helicopter Model System...');
  }

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
    this.terrainManager = terrainManager;
  }

  setHelipadSystem(helipadSystem: HelipadSystem): void {
    this.helipadSystem = helipadSystem;
  }

  setPlayerController(playerController: any): void {
    this.playerController = playerController;
  }

  setHUDSystem(hudSystem: any): void {
    this.hudSystem = hudSystem;
  }

  setAudioListener(listener: THREE.AudioListener): void {
    this.audio.setAudioListener(listener);
  }

  createHelicopterWhenReady(): void {
    if (!this.helicopters.has('us_huey') && this.helipadSystem) {
      this.createUSHuey();
    }
  }

  private createUSHuey(): void {
    if (!this.helipadSystem || !this.terrainManager) {
      Logger.warn('helicopter', '⚠️ Cannot create helicopter - required systems not available');
      return;
    }

    // Get helipad position
    const helipadPosition = this.helipadSystem.getHelipadPosition('us_helipad');
    if (!helipadPosition) {
      Logger.warn('helicopter', '⚠️ Cannot create helicopter - helipad not found');
      return;
    }

    // Position helicopter on helipad center with safe height calculation
    const helicopterPosition = helipadPosition.clone();

    // Use safer height calculation - helicopter sits directly on helipad surface
    const baseHeight = Math.max(helipadPosition.y, this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z));
    helicopterPosition.y = baseHeight; // Helicopter sits directly on helipad, not floating

    const helicopter = createUH1HueyGeometry();
    helicopter.position.copy(helicopterPosition);

    this.scene.add(helicopter);
    this.helicopters.set('us_huey', helicopter);

    // Initialize physics for this helicopter
    const physics = new HelicopterPhysics(helicopterPosition);
    this.helicopterPhysics.set('us_huey', physics);

    // Initialize animation state
    this.animation.initialize('us_huey');

    // Initialize helicopter audio
    Logger.debug('helicopter', '🚁🔊 Initializing helicopter audio for us_huey');
    this.audio.initialize('us_huey', helicopter);

    // Register helicopter for collision detection
    if ('registerCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).registerCollisionObject('us_huey', helicopter);
    }

    Logger.debug('helicopter', `🚁 ✅ Created US UH-1 Huey at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    Logger.debug('helicopter', `🚁 DEBUG: Helipad position: (${helipadPosition.x.toFixed(1)}, ${helipadPosition.y.toFixed(1)}, ${helipadPosition.z.toFixed(1)})`);
    Logger.debug('helicopter', `🚁 DEBUG: Base height: ${baseHeight.toFixed(2)}, Final height: ${helicopterPosition.y.toFixed(2)}`);
    Logger.debug('helicopter', `🚁 DEBUG: Helicopter children count: ${helicopter.children.length}`);
    Logger.debug('helicopter', `🚁 DEBUG: Scene children count: ${this.scene.children.length}`);
  }


  getHelicopterPosition(id: string): THREE.Vector3 | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.position.clone() : null;
  }

  getHelicopterPositionTo(id: string, target: THREE.Vector3): boolean {
    const helicopter = this.helicopters.get(id);
    if (!helicopter) {
      return false;
    }

    target.copy(helicopter.position);
    return true;
  }

  getHelicopterQuaternion(id: string): THREE.Quaternion | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.quaternion.clone() : null;
  }

  getHelicopterQuaternionTo(id: string, target: THREE.Quaternion): boolean {
    const helicopter = this.helicopters.get(id);
    if (!helicopter) {
      return false;
    }

    target.copy(helicopter.quaternion);
    return true;
  }

  getAllHelicopters(): Array<{ id: string; position: THREE.Vector3; model: string }> {
    const result: Array<{ id: string; position: THREE.Vector3; model: string }> = []

    this.helicopters.forEach((helicopter, id) => {
      result.push({
        id,
        position: helicopter.position.clone(),
        model: helicopter.userData.model || 'unknown'
      });
    });

    return result;
  }

  update(deltaTime: number): void {
    // Create helicopter when helipad is ready - more robust checking
    if (!this.helicopters.has('us_huey') && this.helipadSystem && this.terrainManager) {
      const helipadPosition = this.helipadSystem.getHelipadPosition('us_helipad');
      if (helipadPosition) {
        // Wait for terrain to be fully loaded at helipad location
        const terrainHeight = this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z);

        // Check if terrain chunk is loaded using available getChunkAt method
        const chunk = this.terrainManager.getChunkAt(helipadPosition);
        const isChunkLoaded = chunk !== undefined;

        // Create helicopter only when we have valid terrain data and chunk is loaded
        if ((terrainHeight > -100 && isChunkLoaded) || terrainHeight > 0) {
          Logger.debug('helicopter', `🚁 ⚡ CREATING HELICOPTER NOW! Helipad at (${helipadPosition.x}, ${helipadPosition.y}, ${helipadPosition.z}), terrain: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          this.createUSHuey();
        } else {
          // Optional: Log waiting status occasionally
          if (Math.random() < 0.01) {
            Logger.debug('helicopter', `🚁 Waiting for terrain to load at helipad location - height: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          }
        }
      }
    }

    // Update helicopter physics and animations
    this.updateHelicopterPhysics(deltaTime);

    // Update rotor animations for all helicopters
    this.helicopters.forEach((helicopter, id) => {
      const physics = this.helicopterPhysics.get(id);
      this.animation.updateRotors(helicopter, id, physics, deltaTime);

      // Update audio
      const isPlayerControlling = this.playerController &&
                                 this.playerController.isInHelicopter() &&
                                 this.playerController.getHelicopterId() === id;
      this.audio.update(id, deltaTime, physics, isPlayerControlling);
    });

    // Check player proximity to helicopter for interaction prompt
    this.checkPlayerProximity();
  }

  private checkPlayerProximity(): void {
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
      Logger.debug('helicopter', '🚁 DEBUG: No player position available');
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
      Logger.debug('helicopter', `🚁 DEBUG: Player pos: (${playerPosition.x.toFixed(1)}, ${playerPosition.y.toFixed(1)}, ${playerPosition.z.toFixed(1)}), Helicopter pos: (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)}), Horizontal distance: ${horizontalDistance.toFixed(1)}m, 3D distance: ${fullDistance.toFixed(1)}m`);
    }

    const isNearNow = horizontalDistance <= this.interactionRadius;

    // Only update UI if proximity state changed
    if (isNearNow !== this.isPlayerNearHelicopter) {
      this.isPlayerNearHelicopter = isNearNow;

      if (this.isPlayerNearHelicopter) {
        Logger.debug('helicopter', `🚁 ⚡ Player near helicopter (${horizontalDistance.toFixed(1)}m horizontal) - SHOWING PROMPT!`);
        this.hudSystem.showInteractionPrompt('Press E to enter helicopter');
      } else {
        Logger.debug('helicopter', '🚁 ⚡ Player left helicopter area - HIDING PROMPT!');
        this.hudSystem.hideInteractionPrompt();
      }
    }
  }

  // Helicopter entry/exit methods
    tryEnterHelicopter(): void {
    if (!this.playerController) {
      Logger.warn('helicopter', '🚁 Cannot enter helicopter - no player controller');
      return;
    }

    // Check if player is already in a helicopter
    if (this.playerController.isInHelicopter()) {
      Logger.debug('helicopter', '🚁 Player is already in a helicopter');
      return;
    }

    const helicopter = this.helicopters.get('us_huey');
    if (!helicopter) {
      Logger.debug('helicopter', '🚁 No helicopter available for entry');
      return;
    }

    // Check if player is close enough
    const playerPosition = this.playerController.getPosition();
    if (!playerPosition) {
      Logger.warn('helicopter', '🚁 Cannot get player position for helicopter entry');
      return;
    }

    const helicopterPosition = helicopter.position;
    const horizontalDistance = Math.sqrt(
      Math.pow(playerPosition.x - helicopterPosition.x, 2) +
      Math.pow(playerPosition.z - helicopterPosition.z, 2)
    );

    if (horizontalDistance > this.interactionRadius) {
      Logger.debug('helicopter', `🚁 Player too far from helicopter (${horizontalDistance.toFixed(1)}m) - must be within ${this.interactionRadius}m`);
      return;
    }

    // Enter the helicopter
    Logger.debug('helicopter', `🚁 ⚡ PLAYER ENTERING HELICOPTER!`);
    this.playerController.enterHelicopter('us_huey', helicopterPosition.clone());

    // Hide interaction prompt
    if (this.hudSystem) {
      this.hudSystem.hideInteractionPrompt();
    }
  }

  exitHelicopter(): void {
    if (!this.playerController) {
      Logger.warn('helicopter', '🚁 Cannot exit helicopter - no player controller');
      return;
    }

    if (!this.playerController.isInHelicopter()) {
      Logger.debug('helicopter', '🚁 Player is not in a helicopter');
      return;
    }

    const helicopterId = this.playerController.getHelicopterId();
    const helicopter = helicopterId ? this.helicopters.get(helicopterId) : null;

    if (!helicopter) {
      Logger.warn('helicopter', '🚁 Cannot find helicopter for exit');
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

    Logger.debug('helicopter', `🚁 ⚡ PLAYER EXITING HELICOPTER!`);
    this.playerController.exitHelicopter(exitPosition);
  }

  // New method: Update helicopter physics when player is controlling
  private updateHelicopterPhysics(deltaTime: number): void {
    if (!this.playerController || !this.playerController.isInHelicopter()) {
      return; // Only update physics when player is flying
    }

    const helicopterId = this.playerController.getHelicopterId();
    if (!helicopterId) return;

    const helicopter = this.helicopters.get(helicopterId);
    const physics = this.helicopterPhysics.get(helicopterId);

    if (!helicopter || !physics || !this.terrainManager) {
      return;
    }

    // Get control inputs from player controller
    const controls = this.getControlInputs();
    physics.setControls(controls);

    // Get terrain height at helicopter position
    const currentPos = physics.getState().position;
    const terrainHeight = this.terrainManager.getHeightAt(currentPos.x, currentPos.z);

    // Check if helicopter is over a helipad
    let helipadHeight: number | undefined;
    if (this.helipadSystem) {
      const helipadPos = this.helipadSystem.getHelipadPosition('us_helipad');
      if (helipadPos) {
        const distanceToHelipad = Math.sqrt(
          Math.pow(currentPos.x - helipadPos.x, 2) +
          Math.pow(currentPos.z - helipadPos.z, 2)
        );
        // If within helipad radius, use helipad height
        if (distanceToHelipad < 15) { // Helipad collision radius
          helipadHeight = helipadPos.y;
        }
      }
    }

    // Update physics
    physics.update(deltaTime, terrainHeight, helipadHeight);

    // Apply physics state to 3D model
    const state = physics.getState();
    helicopter.position.copy(state.position);

    // Update visual tilt and apply to helicopter quaternion
    const finalQuaternion = this.animation.updateVisualTilt(helicopter, helicopterId, physics, deltaTime);
    helicopter.quaternion.copy(finalQuaternion);

    // Update player position without affecting camera (camera has its own logic)
    this.playerController.updatePlayerPosition(state.position);
  }

  // Get control inputs from keyboard/mouse
  private getControlInputs(): Partial<HelicopterControls> {
    // This will be called by the PlayerController to provide input
    // For now, return default values - we'll update PlayerController to provide these
    return {};
  }


  // Public method for PlayerController to set helicopter controls
  setHelicopterControls(helicopterId: string, controls: Partial<HelicopterControls>): void {
    const physics = this.helicopterPhysics.get(helicopterId);
    if (physics) {
      physics.setControls(controls);
    }
  }

  // Get helicopter physics state for external systems
  getHelicopterState(helicopterId: string) {
    const physics = this.helicopterPhysics.get(helicopterId);
    return physics ? physics.getState() : null;
  }

  dispose(): void {
    // Dispose of audio
    this.helicopters.forEach((_, id) => {
      this.audio.dispose(id);
    });
    this.audio.disposeAll();

    // Dispose of animation state
    this.helicopters.forEach((_, id) => {
      this.animation.dispose(id);
    });
    this.animation.disposeAll();

    // Dispose of geometries and materials
    this.helicopters.forEach(helicopter => {
      this.scene.remove(helicopter);
      // Dispose of all geometries and materials
      helicopter.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.helicopters.clear();
    this.helicopterPhysics.clear();

    // Unregister collision objects
    if (this.terrainManager && 'unregisterCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).unregisterCollisionObject('us_huey');
    }

    Logger.debug('helicopter', '🧹 HelicopterModel disposed');
  }
}
