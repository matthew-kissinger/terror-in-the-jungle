import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HelipadSystem } from './HelipadSystem';
import { HelicopterPhysics, HelicopterControls } from './HelicopterPhysics';
import { Logger } from '../../utils/Logger';
import { createUH1HueyGeometry } from './HelicopterGeometry';
import { HelicopterAnimation } from './HelicopterAnimation';
import { HelicopterAudio } from './HelicopterAudio';
import { HelicopterInteraction } from './HelicopterInteraction';
import { IHUDSystem } from '../../types/SystemInterfaces';

export class HelicopterModel implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ImprovedChunkManager;
  private helipadSystem?: HelipadSystem;
  private playerController?: any;
  private hudSystem?: IHUDSystem;
  private helicopters: Map<string, THREE.Group> = new Map();
  private helicopterPhysics: Map<string, HelicopterPhysics> = new Map();
  private interactionRadius = 5.0; // Distance from helicopter to show prompt (around helicopter size)

  // Subsystems
  private animation: HelicopterAnimation;
  private audio: HelicopterAudio;
  private interaction: HelicopterInteraction;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.animation = new HelicopterAnimation();
    this.audio = new HelicopterAudio();
    this.interaction = new HelicopterInteraction(this.helicopters, this.interactionRadius);
  }

  async init(): Promise<void> {
    Logger.debug('helicopter', ' Initializing Helicopter Model System...');
  }

  setTerrainManager(terrainManager: ImprovedChunkManager): void {
    this.terrainManager = terrainManager;
    this.interaction.setTerrainManager(terrainManager);
  }

  setHelipadSystem(helipadSystem: HelipadSystem): void {
    this.helipadSystem = helipadSystem;
  }

  setPlayerController(playerController: any): void {
    this.playerController = playerController;
    this.interaction.setPlayerController(playerController);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
    this.interaction.setHUDSystem(hudSystem);
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
      Logger.warn('helicopter', ' Cannot create helicopter - required systems not available');
      return;
    }

    // Get helipad position
    const helipadPosition = this.helipadSystem.getHelipadPosition('us_helipad');
    if (!helipadPosition) {
      Logger.warn('helicopter', ' Cannot create helicopter - helipad not found');
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
    Logger.debug('helicopter', ' Initializing helicopter audio for us_huey');
    this.audio.initialize('us_huey', helicopter);

    // Register helicopter for collision detection
    if ('registerCollisionObject' in this.terrainManager) {
      (this.terrainManager as any).registerCollisionObject('us_huey', helicopter);
    }

    Logger.debug('helicopter', `  Created US UH-1 Huey at position (${helicopterPosition.x.toFixed(1)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(1)})`);
    Logger.debug('helicopter', ` DEBUG: Helipad position: (${helipadPosition.x.toFixed(1)}, ${helipadPosition.y.toFixed(1)}, ${helipadPosition.z.toFixed(1)})`);
    Logger.debug('helicopter', ` DEBUG: Base height: ${baseHeight.toFixed(2)}, Final height: ${helicopterPosition.y.toFixed(2)}`);
    Logger.debug('helicopter', ` DEBUG: Helicopter children count: ${helicopter.children.length}`);
    Logger.debug('helicopter', ` DEBUG: Scene children count: ${this.scene.children.length}`);
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
          Logger.debug('helicopter', `  CREATING HELICOPTER NOW! Helipad at (${helipadPosition.x}, ${helipadPosition.y}, ${helipadPosition.z}), terrain: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
          this.createUSHuey();
        } else {
          // Optional: Log waiting status occasionally
          if (Math.random() < 0.01) {
            Logger.debug('helicopter', ` Waiting for terrain to load at helipad location - height: ${terrainHeight.toFixed(2)}, chunk loaded: ${isChunkLoaded}`);
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
    this.interaction.checkPlayerProximity();
  }

  // Helicopter entry/exit methods
  tryEnterHelicopter(): void {
    this.interaction.tryEnterHelicopter();
  }

  exitHelicopter(): void {
    this.interaction.exitHelicopter();
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

    Logger.debug('helicopter', 'HelicopterModel disposed');
  }
}
