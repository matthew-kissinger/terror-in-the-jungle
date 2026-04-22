import * as THREE from 'three';
import { GameSystem } from '../../types';
import { HelipadSystem } from './HelipadSystem';
import { HelicopterPhysics, HelicopterControls } from './HelicopterPhysics';
import { getAircraftConfig } from './AircraftConfigs';
import { Logger } from '../../utils/Logger';
import { createHelicopterGeometry } from './HelicopterGeometry';
import { HelicopterAnimation } from './HelicopterAnimation';
import { HelicopterAudio } from './HelicopterAudio';
import { HelicopterInteraction } from './HelicopterInteraction';
import { SquadDeployFromHelicopter } from './SquadDeployFromHelicopter';
import { HelicopterWeaponSystem } from './HelicopterWeaponSystem';
import { HelicopterHealthSystem } from './HelicopterHealthSystem';
import { HelicopterDoorGunner } from './HelicopterDoorGunner';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { VehicleManager } from '../vehicle/VehicleManager';
import { HelicopterVehicleAdapter } from '../vehicle/HelicopterVehicleAdapter';
import { shouldRenderAirVehicle } from '../vehicle/AirVehicleVisibility';
import { Faction } from '../combat/types';
import type { IHUDSystem, IPlayerController, ITerrainRuntime, IAudioManager } from '../../types/SystemInterfaces';
import type { PlayerInput } from '../player/PlayerInput';
import type { HeightQueryCache } from '../terrain/HeightQueryCache';
import { modelLoader } from '../assets/ModelLoader';

interface HelicopterModelDependencies {
  terrainManager: ITerrainRuntime;
  helipadSystem: HelipadSystem;
  playerController: IPlayerController;
  hudSystem: IHUDSystem;
  audioListener: THREE.AudioListener;
  audioManager: IAudioManager;
  combatantSystem: CombatantSystem;
  grenadeSystem: GrenadeSystem;
  heightQueryCache: HeightQueryCache;
  vehicleManager: VehicleManager;
}

export class HelicopterModel implements GameSystem {
  private scene: THREE.Scene;
  private terrainManager?: ITerrainRuntime;
  private helipadSystem?: HelipadSystem;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private audioManager?: IAudioManager;
  private helicopters: Map<string, THREE.Group> = new Map();
  private helicopterPhysics: Map<string, HelicopterPhysics> = new Map();
  private interactionRadius = 5.0;

  // Subsystems
  private animation: HelicopterAnimation;
  private audio: HelicopterAudio;
  private interaction: HelicopterInteraction;
  private squadDeploy?: SquadDeployFromHelicopter;
  private weaponSystem: HelicopterWeaponSystem;
  private healthSystem: HelicopterHealthSystem;
  private doorGunner: HelicopterDoorGunner;

  private vehicleManager?: VehicleManager;

  // Deploy prompt polling (avoid per-frame checks)
  private deployPromptAccumulator = 0;
  private readonly DEPLOY_PROMPT_INTERVAL = 0.5; // check every 500ms
  private isDeployPromptVisible = false;
  private readonly deploySnapshot = {
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    groundHeight: 0,
  };

  // Callback for squad deploy events
  private onSquadDeployCallback?: (helicopterId: string, positions: THREE.Vector3[]) => void;

  // Track which helipads already have helicopters
  private createdForHelipads: Set<string> = new Set();
  private isCreating = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.animation = new HelicopterAnimation();
    this.audio = new HelicopterAudio();
    this.interaction = new HelicopterInteraction(this.helicopters, this.interactionRadius);
    this.weaponSystem = new HelicopterWeaponSystem(scene);
    this.healthSystem = new HelicopterHealthSystem();
    this.healthSystem.onDestroyed((heliId, position) => this.handleHelicopterDestroyed(heliId, position));
    this.doorGunner = new HelicopterDoorGunner(scene);
  }

  async init(): Promise<void> {
    Logger.debug('helicopter', ' Initializing Helicopter Model System...');
  }

  configureDependencies(dependencies: HelicopterModelDependencies): void {
    this.setTerrainManager(dependencies.terrainManager);
    this.setHelipadSystem(dependencies.helipadSystem);
    this.setPlayerController(dependencies.playerController);
    this.setHUDSystem(dependencies.hudSystem);
    this.setAudioListener(dependencies.audioListener);
    this.setAudioManager(dependencies.audioManager);
    this.setCombatantSystem(dependencies.combatantSystem);
    this.setGrenadeSystem(dependencies.grenadeSystem);
    this.setHeightQueryCache(dependencies.heightQueryCache);
    this.setVehicleManager(dependencies.vehicleManager);
  }

  setTerrainManager(terrainManager: ITerrainRuntime): void {
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
    this.weaponSystem.setHUDSystem(hudSystem);
    this.healthSystem.setHUDSystem(hudSystem);
  }

  setPlayerInput(playerInput: PlayerInput): void {
    this.interaction.setPlayerInput(playerInput);
  }

  setAudioListener(listener: THREE.AudioListener): void {
    this.audio.setAudioListener(listener);
  }

  setAudioManager(audioManager: IAudioManager): void {
    this.audioManager = audioManager;
    this.weaponSystem.setAudioManager(audioManager);
    this.healthSystem.setAudioManager(audioManager);
    this.doorGunner.setAudioManager(audioManager);
  }

  setCombatantSystem(cs: CombatantSystem): void {
    this.weaponSystem.setCombatantSystem(cs);
    this.doorGunner.setCombatantSystem(cs);
  }

  setGrenadeSystem(gs: GrenadeSystem): void {
    this.weaponSystem.setGrenadeSystem(gs);
  }

  setVehicleManager(vm: VehicleManager): void {
    this.vehicleManager = vm;
  }

  setHeightQueryCache(cache: HeightQueryCache): void {
    this.squadDeploy = new SquadDeployFromHelicopter(cache);
  }

  /**
   * Register a callback to receive squad deploy events.
   * The callback receives the helicopter ID and terrain-snapped spawn positions.
   */
  onSquadDeploy(callback: (helicopterId: string, positions: THREE.Vector3[]) => void): void {
    this.onSquadDeployCallback = callback;
  }

  /**
   * Attempt to deploy squad from the currently piloted helicopter.
   * Called from PlayerController via input callback.
   */
  tryDeploySquad(): void {
    if (!this.squadDeploy || !this.playerController) return;

    const helicopterId = this.playerController.getHelicopterId();
    if (!helicopterId) return;

    const physics = this.helicopterPhysics.get(helicopterId);
    if (!physics) return;

    const state = physics.getState();
    const snapshot = {
      position: state.position.clone(),
      velocity: state.velocity.clone(),
      groundHeight: state.groundHeight,
    };

    const check = this.squadDeploy.canDeploy(helicopterId, snapshot);
    if (!check.canDeploy) {
      if (this.hudSystem) {
        this.hudSystem.showMessage(check.reason ?? 'Cannot deploy here', 2000);
      }
      return;
    }

    const result = this.squadDeploy.deploySquad(helicopterId, snapshot);
    if (!result.success) {
      if (this.hudSystem) {
        this.hudSystem.showMessage(result.reason ?? 'Deploy failed', 2000);
      }
      return;
    }

    // Play deploy sound
    if (this.audioManager) {
      this.audioManager.play('tacticalInsertionDrop', state.position.clone());
    }

    // Notify listeners
    if (this.onSquadDeployCallback) {
      this.onSquadDeployCallback(helicopterId, result.positions);
    }

    if (this.hudSystem) {
      this.hudSystem.showMessage('Squad deployed!', 2000);
      this.isDeployPromptVisible = false;
      this.hudSystem.hideSquadDeployPrompt();
    }

    Logger.info('helicopter', `Squad deployed from ${helicopterId} at ${result.positions.length} positions`);
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

      // Terrain must be ready at the helipad position
      const terrainHeight = this.terrainManager.getHeightAt(helipadPosition.x, helipadPosition.z);
      const hasTerrain = this.terrainManager.isTerrainReady() && this.terrainManager.hasTerrainAt(helipadPosition.x, helipadPosition.z);
      if (terrainHeight <= -100 && !hasTerrain) continue;

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
    if (this.terrainManager) {
      const ws = this.terrainManager.getPlayableWorldSize();
      if (ws > 0) physics.setWorldHalfExtent(ws * 0.5);
    }
    this.helicopterPhysics.set(helicopterId, physics);

    this.weaponSystem.initWeapons(helicopterId, aircraftConfig.weapons);
    this.healthSystem.initHealth(helicopterId, aircraftConfig.role);
    this.doorGunner.initGunners(helicopterId, aircraftConfig.weapons);
    this.animation.initialize(helicopterId, helicopter);
    this.audio.initialize(helicopterId, helicopter);

    if (this.terrainManager) {
      this.terrainManager.registerCollisionObject(helicopterId, helicopter, { dynamic: true });
    }

    // Register with VehicleManager
    if (this.vehicleManager) {
      const adapter = new HelicopterVehicleAdapter(helicopterId, aircraftKey, Faction.US, this);
      this.vehicleManager.register(adapter);
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
      if (!helicopter.visible) {
        return;
      }
      const physics = this.helicopterPhysics.get(id);
      // Skip rotor animation for idle grounded helicopters (engineRPM === 0)
      const state = physics?.getState();
      if (!state || !(state.isGrounded && state.engineRPM === 0)) {
        this.animation.updateRotors(helicopter, id, physics, deltaTime);
      }

      const isPlayerControlling = !!this.playerController &&
                                 this.playerController.isInHelicopter() &&
                                 this.playerController.getHelicopterId() === id;
      this.audio.update(id, deltaTime, physics, isPlayerControlling);
    });

    this.interaction.checkPlayerProximity();

    // Poll deploy readiness at reduced frequency
    this.updateDeployPrompt(deltaTime);
  }

  private handleHelicopterDestroyed(heliId: string, position: THREE.Vector3): void {
    // Force pilot out if they're in this helicopter
    const isPiloted = this.playerController?.isInHelicopter() &&
                      this.playerController.getHelicopterId() === heliId;
    if (isPiloted) {
      this.interaction.exitHelicopter();
      if (this.hudSystem) {
        this.hudSystem.showMessage('Helicopter destroyed!', 3000);
      }
    }

    // Hide the helicopter (remove from scene but keep in maps for respawn later)
    const helicopter = this.helicopters.get(heliId);
    if (helicopter) {
      helicopter.visible = false;
    }

    // Stop weapon/audio systems for this helicopter
    this.weaponSystem.dispose(heliId);
    this.audio.dispose(heliId);

    Logger.info('helicopter', `${heliId} destroyed at (${position.x.toFixed(0)}, ${position.y.toFixed(0)}, ${position.z.toFixed(0)})`);
  }

  private updateDeployPrompt(deltaTime: number): void {
    if (!this.squadDeploy || !this.hudSystem || !this.playerController) return;
    if (!this.playerController.isInHelicopter()) {
      if (this.isDeployPromptVisible) {
        this.isDeployPromptVisible = false;
        this.hudSystem.hideSquadDeployPrompt();
      }
      return;
    }

    this.deployPromptAccumulator += deltaTime;
    if (this.deployPromptAccumulator < this.DEPLOY_PROMPT_INTERVAL) return;
    this.deployPromptAccumulator = 0;

    const helicopterId = this.playerController.getHelicopterId();
    if (!helicopterId) return;

    const physics = this.helicopterPhysics.get(helicopterId);
    if (!physics) return;

    const state = physics.getState();
    this.deploySnapshot.position.copy(state.position);
    this.deploySnapshot.velocity.copy(state.velocity);
    this.deploySnapshot.groundHeight = state.groundHeight;

    const check = this.squadDeploy.canDeploy(helicopterId, this.deploySnapshot);
    if (check.canDeploy && !this.isDeployPromptVisible) {
      this.isDeployPromptVisible = true;
      this.hudSystem.showSquadDeployPrompt();
    } else if (!check.canDeploy && this.isDeployPromptVisible) {
      this.isDeployPromptVisible = false;
      this.hudSystem.hideSquadDeployPrompt();
    }
  }

  tryEnterHelicopter(): void {
    this.interaction.tryEnterHelicopter();
  }

  startFiring(heliId: string): void { this.weaponSystem.startFiring(heliId); }
  stopFiring(heliId: string): void { this.weaponSystem.stopFiring(heliId); }
  switchHelicopterWeapon(heliId: string, index: number): void { this.weaponSystem.switchWeapon(heliId, index); }
  getWeaponStatus(heliId: string): { name: string; ammo: number; maxAmmo: number } | null { return this.weaponSystem.getWeaponStatus(heliId); }
  getWeaponCount(heliId: string): number { return this.weaponSystem.getWeaponCount(heliId); }

  applyDamage(heliId: string, damage: number): void {
    const pos = this.getHelicopterPosition(heliId);
    if (!pos) return;
    this.healthSystem.applyDamage(heliId, damage, pos);
  }

  getHealthPercent(heliId: string): number { return this.healthSystem.getHealthPercent(heliId); }
  isHelicopterDestroyed(heliId: string): boolean { return this.healthSystem.isDestroyed(heliId); }

  /**
   * Check if a ray hits any helicopter. Used for NPC/player shots against helicopters.
   * Returns the hit helicopter ID and point, or null.
   */
  checkRayHit(ray: THREE.Ray, maxDistance = 400): { heliId: string; point: THREE.Vector3; distance: number } | null {
    const sphere = new THREE.Sphere();
    let closest: { heliId: string; point: THREE.Vector3; distance: number } | null = null;

    for (const [id, helicopter] of this.helicopters) {
      if (this.healthSystem.isDestroyed(id)) continue;

      // Use a 4m radius sphere centered on helicopter position (approximation)
      sphere.set(helicopter.position, 4.0);
      const intersectPoint = new THREE.Vector3();

      if (ray.intersectSphere(sphere, intersectPoint)) {
        const dist = ray.origin.distanceTo(intersectPoint);
        if (dist > maxDistance) continue;
        if (!closest || dist < closest.distance) {
          closest = { heliId: id, point: intersectPoint.clone(), distance: dist };
        }
      }
    }

    return closest;
  }

  exitHelicopter(): void {
    this.interaction.exitHelicopter();
  }

  private updateHelicopterPhysics(deltaTime: number): void {
    if (!this.terrainManager) return;

    const worldHalfExtent = this.terrainManager.getPlayableWorldSize() * 0.5;
    const pilotedId = this.playerController?.isInHelicopter()
      ? this.playerController.getHelicopterId()
      : null;
    const camera = this.playerController && typeof this.playerController.getCamera === 'function'
      ? this.playerController.getCamera()
      : null;

    for (const [id, helicopter] of this.helicopters) {
      if (this.healthSystem.isDestroyed(id)) continue;

      const physics = this.helicopterPhysics.get(id);
      if (!physics) continue;

      if (worldHalfExtent > 0) physics.setWorldHalfExtent(worldHalfExtent);

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
      const visualState = typeof physics.getInterpolatedState === 'function'
        ? physics.getInterpolatedState()
        : state;
      helicopter.position.copy(visualState.position);

      const finalQuaternion = this.animation.updateVisualTilt(helicopter, id, physics, deltaTime);
      helicopter.quaternion.copy(finalQuaternion);

      helicopter.visible = shouldRenderAirVehicle({
        camera,
        scene: this.scene,
        vehiclePosition: helicopter.position,
        isAirborne: !state.isGrounded,
        isPiloted,
        currentlyVisible: helicopter.visible,
      });

      if (isPiloted && this.playerController) {
        // Feed the interpolated visual pose, not raw physics. The camera lerps
        // from `helicopter.position` (set to the interpolated state above), so
        // the PlayerController, weapon system, and any other downstream
        // consumer must share the same time base. Reading raw physics here
        // aliased the fixed-step sawtooth against the render cadence and
        // produced visible tick-back-and-forth at high refresh. Simulation-
        // internal booleans (`state.isGrounded`) stay raw.
        this.playerController.updatePlayerPosition(helicopter.position);

        // Update weapon system for piloted helicopter
        this.weaponSystem.update(
          deltaTime, id, helicopter.position, helicopter.quaternion,
          state.isGrounded, helipadHeight !== undefined,
        );

        // Repair when grounded on helipad
        if (state.isGrounded && helipadHeight !== undefined) {
          this.healthSystem.repair(id, deltaTime);
        }

        // Push health to HUD
        this.healthSystem.updateHUD(id);
      }

      // Door gunner AI only matters for the piloted helicopter
      if (isPiloted) {
        this.doorGunner.update(deltaTime, id, helicopter.position, helicopter.quaternion, state.isGrounded);
      }
    }

    // Tick weapon effects once per frame
    this.weaponSystem.updateEffects(deltaTime);
    this.doorGunner.updateEffects(deltaTime);
  }

  setHelicopterControls(helicopterId: string, controls: Partial<HelicopterControls>): void {
    const physics = this.helicopterPhysics.get(helicopterId);
    if (physics) physics.setControls(controls);
  }

  getHelicopterState(helicopterId: string) {
    const physics = this.helicopterPhysics.get(helicopterId);
    return physics ? physics.getState() : null;
  }

  getFlightData(helicopterId: string): { airspeed: number; heading: number; verticalSpeed: number } | null {
    const physics = this.helicopterPhysics.get(helicopterId);
    if (!physics) return null;
    return {
      airspeed: physics.getAirspeed(),
      heading: physics.getHeading(),
      verticalSpeed: physics.getVerticalSpeed(),
    };
  }

  getAircraftRole(helicopterId: string): import('./AircraftConfigs').AircraftRole {
    const helicopter = this.helicopters.get(helicopterId);
    const aircraftKey = helicopter?.userData.model || 'UH1_HUEY';
    return getAircraftConfig(aircraftKey).role;
  }

  dispose(): void {
    this.helicopters.forEach((_, id) => {
      this.audio.dispose(id);
      this.animation.dispose(id);
    });
    this.audio.disposeAll();
    this.animation.disposeAll();
    this.weaponSystem.disposeAll();
    this.healthSystem.disposeAll();
    this.doorGunner.disposeAll();

    this.helicopters.forEach((helicopter, id) => {
      this.scene.remove(helicopter);
      if (this.terrainManager) {
        this.terrainManager.unregisterCollisionObject(id);
      }
      helicopter.children.forEach((child) => {
        if (typeof (modelLoader as any).isSharedInstance === 'function'
          && modelLoader.isSharedInstance(child)) {
          modelLoader.disposeInstance(child);
          return;
        }
        child.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.geometry.dispose();
            if (Array.isArray(node.material)) {
              node.material.forEach((material) => material.dispose());
            } else {
              node.material.dispose();
            }
          }
        });
      });
    });
    this.helicopters.clear();
    this.helicopterPhysics.clear();
    this.createdForHelipads.clear();
    this.squadDeploy?.dispose();

    Logger.debug('helicopter', 'HelicopterModel disposed');
  }
}
