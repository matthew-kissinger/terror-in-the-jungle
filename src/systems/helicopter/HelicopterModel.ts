import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { HelipadSystem } from './HelipadSystem';
import { HelicopterPhysics, HelicopterControls } from './HelicopterPhysics';
import { getAircraftConfig } from './AircraftConfigs';
import { Logger } from '../../utils/Logger';
import { createHelicopterGeometry } from './HelicopterGeometry';
import { HelicopterAnimation } from './HelicopterAnimation';
import { HelicopterAudio } from './HelicopterAudio';
import { HelicopterInteraction } from './HelicopterInteraction';
import { IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';

export class HelicopterModel implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ImprovedChunkManager;
  private helipadSystem?: HelipadSystem;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private helicopters: Map<string, THREE.Group> = new Map();
  private helicopterPhysics: Map<string, HelicopterPhysics> = new Map();
  private interactionRadius = 5.0;

  // Subsystems
  private animation: HelicopterAnimation;
  private audio: HelicopterAudio;
  private interaction: HelicopterInteraction;

  // Track which helipads already have helicopters
  private createdForHelipads: Set<string> = new Set();
  private isCreating = false;

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

  setPlayerController(playerController: IPlayerController): void {
    this.playerController = playerController;
    this.interaction.setPlayerController(playerController);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
    this.interaction.setHUDSystem(hudSystem);
  }

  setPlayerInput(playerInput: PlayerInput): void {
    this.interaction.setPlayerInput(playerInput);
  }

  setAudioListener(listener: THREE.AudioListener): void {
    this.audio.setAudioListener(listener);
  }

  createHelicopterWhenReady(): void {
    if (!this.isCreating && this.helipadSystem) {
      void this.createHelicoptersForHelipads();
    }
  }

  private async createHelicoptersForHelipads(): Promise<void> {
    if (!this.helipadSystem || !this.terrainManager) return;
    if (this.isCreating) return;
    this.isCreating = true;

    const allHelipads = this.helipadSystem.getAllHelipads();

    for (const helipadInfo of allHelipads) {
      if (this.createdForHelipads.has(helipadInfo.id)) continue;

      const helipadPosition = this.helipadSystem.getHelipadPosition(helipadInfo.id);
      if (!helipadPosition) continue;

      // Terrain must be loaded
      const terrainHeight = this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z);
      const chunk = this.terrainManager.getChunkAt(helipadPosition);
      if (terrainHeight <= -100 && !chunk) continue;

      const helicopterId = `heli_${helipadInfo.id}`;
      await this.createHelicopterAtHelipad(helicopterId, helipadInfo.aircraft, helipadPosition);
      this.createdForHelipads.add(helipadInfo.id);
    }

    this.isCreating = false;
  }

  private async createHelicopterAtHelipad(
    helicopterId: string,
    aircraftKey: string,
    helipadPosition: THREE.Vector3,
  ): Promise<void> {
    if (this.helicopters.has(helicopterId)) return;

    const helicopterPosition = helipadPosition.clone();
    const baseHeight = Math.max(
      helipadPosition.y,
      this.terrainManager?.getHeightAt(helipadPosition.x, helipadPosition.z) ?? 0,
    );
    helicopterPosition.y = baseHeight;

    const helicopter = await createHelicopterGeometry(aircraftKey, helicopterId);
    helicopter.position.copy(helicopterPosition);

    this.scene.add(helicopter);
    this.helicopters.set(helicopterId, helicopter);

    const aircraftConfig = getAircraftConfig(aircraftKey);
    const physics = new HelicopterPhysics(helicopterPosition, aircraftConfig.physics);
    this.helicopterPhysics.set(helicopterId, physics);

    this.animation.initialize(helicopterId);
    this.audio.initialize(helicopterId, helicopter);

    if (this.terrainManager) {
      this.terrainManager.registerCollisionObject(helicopterId, helicopter);
    }

    Logger.debug('helicopter', `Created ${aircraftKey} "${helicopterId}" at (${helicopterPosition.x.toFixed(0)}, ${helicopterPosition.y.toFixed(1)}, ${helicopterPosition.z.toFixed(0)})`);
  }

  getHelicopterPosition(id: string): THREE.Vector3 | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.position.clone() : null;
  }

  getHelicopterPositionTo(id: string, target: THREE.Vector3): boolean {
    const helicopter = this.helicopters.get(id);
    if (!helicopter) return false;
    target.copy(helicopter.position);
    return true;
  }

  getHelicopterQuaternion(id: string): THREE.Quaternion | null {
    const helicopter = this.helicopters.get(id);
    return helicopter ? helicopter.quaternion.clone() : null;
  }

  getHelicopterQuaternionTo(id: string, target: THREE.Quaternion): boolean {
    const helicopter = this.helicopters.get(id);
    if (!helicopter) return false;
    target.copy(helicopter.quaternion);
    return true;
  }

  getAllHelicopters(): Array<{ id: string; position: THREE.Vector3; model: string }> {
    const result: Array<{ id: string; position: THREE.Vector3; model: string }> = [];
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
    // Create helicopters when helipads are ready
    if (!this.isCreating && this.helipadSystem && this.terrainManager) {
      const allHelipads = this.helipadSystem.getAllHelipads();
      const needsCreation = allHelipads.some(hp => !this.createdForHelipads.has(hp.id));
      if (needsCreation) {
        void this.createHelicoptersForHelipads();
      }
    }

    // Update helicopter physics and animations
    this.updateHelicopterPhysics(deltaTime);

    this.helicopters.forEach((helicopter, id) => {
      const physics = this.helicopterPhysics.get(id);
      this.animation.updateRotors(helicopter, id, physics, deltaTime);

      const isPlayerControlling = !!this.playerController &&
                                 this.playerController.isInHelicopter() &&
                                 this.playerController.getHelicopterId() === id;
      this.audio.update(id, deltaTime, physics, isPlayerControlling);
    });

    this.interaction.checkPlayerProximity();
  }

  tryEnterHelicopter(): void {
    this.interaction.tryEnterHelicopter();
  }

  exitHelicopter(): void {
    this.interaction.exitHelicopter();
  }

  private updateHelicopterPhysics(deltaTime: number): void {
    if (!this.terrainManager) return;

    const pilotedId = this.playerController?.isInHelicopter()
      ? this.playerController.getHelicopterId()
      : null;

    for (const [id, helicopter] of this.helicopters) {
      const physics = this.helicopterPhysics.get(id);
      if (!physics) continue;

      const isPiloted = id === pilotedId;

      if (isPiloted) {
        // Controls are set each frame by PlayerMovement.setHelicopterControls()
      } else if (!physics.getState().isGrounded) {
        // Unoccupied + airborne: zero controls so gravity pulls it down
        physics.setControls({ collective: 0, cyclicPitch: 0, cyclicRoll: 0, yaw: 0, engineBoost: false });
      } else {
        // Unoccupied + grounded: no update needed
        continue;
      }

      const currentPos = physics.getState().position;
      const terrainHeight = this.terrainManager.getHeightAt(currentPos.x, currentPos.z);

      let helipadHeight: number | undefined;
      if (this.helipadSystem) {
        for (const hp of this.helipadSystem.getAllHelipads()) {
          const dx = currentPos.x - hp.position.x;
          const dz = currentPos.z - hp.position.z;
          if (dx * dx + dz * dz < 15 * 15) {
            helipadHeight = hp.position.y;
            break;
          }
        }
      }

      physics.update(deltaTime, terrainHeight, helipadHeight);

      const state = physics.getState();
      helicopter.position.copy(state.position);

      const finalQuaternion = this.animation.updateVisualTilt(helicopter, id, physics, deltaTime);
      helicopter.quaternion.copy(finalQuaternion);

      if (isPiloted && this.playerController) {
        this.playerController.updatePlayerPosition(state.position);
      }
    }
  }

  setHelicopterControls(helicopterId: string, controls: Partial<HelicopterControls>): void {
    const physics = this.helicopterPhysics.get(helicopterId);
    if (physics) physics.setControls(controls);
  }

  getHelicopterState(helicopterId: string) {
    const physics = this.helicopterPhysics.get(helicopterId);
    return physics ? physics.getState() : null;
  }

  dispose(): void {
    this.helicopters.forEach((_, id) => {
      this.audio.dispose(id);
      this.animation.dispose(id);
    });
    this.audio.disposeAll();
    this.animation.disposeAll();

    this.helicopters.forEach((helicopter, id) => {
      this.scene.remove(helicopter);
      if (this.terrainManager) {
        this.terrainManager.unregisterCollisionObject(id);
      }
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
    this.createdForHelipads.clear();

    Logger.debug('helicopter', 'HelicopterModel disposed');
  }
}
