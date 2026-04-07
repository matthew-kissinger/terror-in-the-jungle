import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { ITerrainRuntime, IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import type { VehicleManager } from './VehicleManager';
import { FixedWingPhysics } from './FixedWingPhysics';
import type { FixedWingCommand, FixedWingTerrainSample } from './FixedWingPhysics';
import { FixedWingAnimation } from './FixedWingAnimation';
import { FixedWingInteraction } from './FixedWingInteraction';
import { FixedWingVehicleAdapter } from './FixedWingVehicleAdapter';
import { shouldRenderAirVehicle } from './AirVehicleVisibility';
import {
  FIXED_WING_CONFIGS,
  getFixedWingConfigKeyForModelPath,
  getFixedWingDisplayInfo,
} from './FixedWingConfigs';
import type { FixedWingDisplayInfo } from './FixedWingConfigs';
import { ModelLoader } from '../assets/ModelLoader';
import { optimizeStaticModelDrawCalls } from '../assets/ModelDrawCallOptimizer';
import { Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';

const _terrainSampleNormal = new THREE.Vector3(0, 1, 0);

export interface FixedWingFlightData {
  airspeed: number;
  heading: number;
  verticalSpeed: number;
  altitude: number;
  altitudeAGL: number;
  phase: 'parked' | 'ground_roll' | 'rotation' | 'airborne' | 'stall' | 'landing_rollout';
  aoaDeg: number;
  sideslipDeg: number;
  throttle: number;
  brake: number;
  weightOnWheels: boolean;
  isStalled: boolean;
  flightState: 'grounded' | 'airborne' | 'stalled';
  stallSpeed: number;
  pitch: number;
  roll: number;
}

/**
 * Orchestrates all fixed-wing aircraft instances.
 * Parallel to HelicopterModel but simpler (no weapons, no door gunners).
 */
export class FixedWingModel implements GameSystem {
  private static readonly IDLE_SIMULATION_SPEED = 0.5;
  private scene: THREE.Scene;
  private modelLoader = new ModelLoader();
  private animation = new FixedWingAnimation();
  private interaction: FixedWingInteraction;

  // Per-aircraft state
  private groups = new Map<string, THREE.Group>();
  private physics = new Map<string, FixedWingPhysics>();
  private configKeys = new Map<string, string>();
  private displayNames = new Map<string, string>();
  private collisionRegistered = new Set<string>();
  private pilotedAircraftId: string | null = null;

  // Dependencies
  private terrainManager?: ITerrainRuntime;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private vehicleManager?: VehicleManager;

  // Controls from player input
  private currentCommand: FixedWingCommand = {
    throttleTarget: 0,
    pitchCommand: 0,
    rollCommand: 0,
    yawCommand: 0,
    brake: 0,
    freeLook: false,
    stabilityAssist: false,
  };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.interaction = new FixedWingInteraction(this.groups, this.displayNames);
  }

  // -- Dependency setters --

  setTerrainManager(terrainManager: ITerrainRuntime): void {
    this.terrainManager = terrainManager;
    this.interaction.setTerrainManager(terrainManager);
  }

  setPlayerController(playerController: IPlayerController): void {
    this.playerController = playerController;
    this.interaction.setPlayerController(playerController);
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
    this.interaction.setHUDSystem(hudSystem);
  }

  setVehicleManager(vehicleManager: VehicleManager): void {
    this.vehicleManager = vehicleManager;
  }

  // -- GameSystem lifecycle --

  async init(): Promise<void> {
    Logger.info('fixedwing', 'FixedWingModel initialized');
  }

  update(deltaTime: number): void {
    // Update interaction prompts
    this.interaction.checkPlayerProximity();

    const camera = this.playerController && typeof this.playerController.getCamera === 'function'
      ? this.playerController.getCamera()
      : null;

    for (const [aircraftId, phys] of this.physics) {
      const group = this.groups.get(aircraftId);
      if (!group) {
        continue;
      }

      const isPiloted = aircraftId === this.pilotedAircraftId;
      const shouldSimulate = isPiloted
        || phys.getFlightState() !== 'grounded'
        || phys.getAirspeed() > FixedWingModel.IDLE_SIMULATION_SPEED;

      if (isPiloted) {
        phys.setCommand(this.currentCommand);
      } else if (shouldSimulate) {
        phys.setCommand({
          throttleTarget: 0,
          pitchCommand: 0,
          rollCommand: 0,
          yawCommand: 0,
          brake: phys.getCommand().brake > 0 ? phys.getCommand().brake : 0,
        });
      }

      if (shouldSimulate) {
        const pos = phys.getPosition();
        const terrainSample = this.getTerrainSample(pos.x, pos.z);
        phys.update(deltaTime, terrainSample);

        group.position.copy(phys.getPosition());
        group.quaternion.copy(phys.getQuaternion());
      }

      const shouldRender = shouldRenderAirVehicle({
        camera,
        scene: this.scene,
        vehiclePosition: group.position,
        isAirborne: phys.getFlightState() !== 'grounded',
        isPiloted,
        currentlyVisible: group.visible,
      });
      group.visible = shouldRender;

      if (shouldRender) {
        this.animation.update(aircraftId, phys.getFlightSnapshot().throttle, deltaTime);
      }

      if (isPiloted && this.playerController) {
        this.playerController.updatePlayerPosition(phys.getPosition());
      }
    }
  }

  dispose(): void {
    for (const [id, group] of this.groups) {
      if (this.collisionRegistered.has(id)) {
        this.terrainManager?.unregisterCollisionObject(id);
      }
      this.scene.remove(group);
      group.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) {
          return;
        }
        if (node.userData.generatedMergedGeometry === true) {
          node.geometry.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach((material) => material.dispose());
          } else {
            node.material.dispose();
          }
        }
      });
      this.animation.dispose(id);
    }
    this.groups.clear();
    this.physics.clear();
    this.configKeys.clear();
    this.displayNames.clear();
    this.collisionRegistered.clear();
  }

  // -- Aircraft creation --

  /**
   * Create an interactive fixed-wing aircraft at a parking spot.
   * Called by the airfield layout system instead of placing a static model.
   */
  async createAircraftAtSpot(
    id: string,
    modelPath: string,
    worldPosition: THREE.Vector3,
    heading: number,
  ): Promise<boolean> {
    const configKey = getFixedWingConfigKeyForModelPath(modelPath);
    if (!configKey) {
      Logger.warn('fixedwing', `No config for model path: ${modelPath}`);
      return false;
    }

    const config = FIXED_WING_CONFIGS[configKey];
    if (!config) {
      Logger.warn('fixedwing', `No physics config for key: ${configKey}`);
      return false;
    }

    const display = getFixedWingDisplayInfo(configKey);
    if (!display) return false;

    try {
      const innerModel = await this.modelLoader.loadModel(modelPath);
      // GLB faces +Z but physics forward is -Z. Rotate inner model 180° on Y
      // so it visually aligns with the physics forward direction.
      innerModel.rotation.y = Math.PI;
      this.optimizeLoadedAircraft(innerModel, configKey);

      // Outer group is driven by physics quaternion (position + attitude).
      // Inner model handles the visual-to-physics rotation offset.
      const group = new THREE.Group();
      group.add(innerModel);
      group.position.copy(worldPosition);

      // Ensure Y is on terrain (use physics gearClearance instead of hardcoded offset)
      if (this.terrainManager) {
        const h = this.terrainManager.getHeightAt(worldPosition.x, worldPosition.z);
        group.position.y = h + config.physics.gearClearance;
        worldPosition.y = h + config.physics.gearClearance;
      }

      this.scene.add(group);
      this.groups.set(id, group);
      this.configKeys.set(id, configKey);
      this.displayNames.set(id, display.displayName);
      if (this.terrainManager) {
        this.terrainManager.registerCollisionObject(id, group, { dynamic: true });
        this.collisionRegistered.add(id);
      }

      // Create physics instance (starts grounded)
      const phys = new FixedWingPhysics(worldPosition.clone(), config.physics);
      // Set initial heading
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      phys.getQuaternion().copy(q);
      // Sync group to initial physics state so parked aircraft face the right way
      group.quaternion.copy(q);

      if (this.terrainManager) {
        phys.setWorldHalfExtent(this.terrainManager.getPlayableWorldSize() / 2);
      }

      this.physics.set(id, phys);

      // Wire animation on the inner model (where propeller nodes live)
      this.animation.initialize(id, configKey, innerModel);

      // Register with VehicleManager
      if (this.vehicleManager) {
        const adapter = new FixedWingVehicleAdapter(id, configKey, Faction.US, this);
        this.vehicleManager.register(adapter);
      }

      Logger.info('fixedwing', `Created ${display.displayName} at (${worldPosition.x.toFixed(0)}, ${worldPosition.z.toFixed(0)})`);
      return true;
    } catch (err) {
      Logger.warn('fixedwing', `Failed to load model ${modelPath}: ${err}`);
      return false;
    }
  }

  private optimizeLoadedAircraft(innerModel: THREE.Group, configKey: string): void {
    const display = getFixedWingDisplayInfo(configKey);
    const propellerNames = new Set(
      (display?.propellerNodes ?? []).map((name) => name.toLowerCase()),
    );

    const result = optimizeStaticModelDrawCalls(innerModel, {
      batchNamePrefix: `${configKey.toLowerCase()}_static`,
      excludeMesh: (mesh) => {
        const meshName = mesh.name.toLowerCase();
        for (const propName of propellerNames) {
          if (meshName.includes(propName)) {
            return true;
          }
        }
        return meshName.includes('propeller') || meshName.includes('prop_');
      },
    });

    if (result.sourceMeshCount > 0) {
      Logger.info(
        'fixedwing',
        `Optimized ${configKey} draw calls: ${result.sourceMeshCount} leaf meshes -> ${result.mergedMeshCount} batches`,
      );
    }
  }

  // -- Player interaction --

  tryEnterAircraft(): boolean {
    return this.interaction.tryEnterAircraft();
  }

  exitAircraft(): void {
    this.pilotedAircraftId = null;
    this.currentCommand = this.createIdleCommand();
    this.interaction.exitAircraft();
  }

  setPilotedAircraft(aircraftId: string | null): void {
    this.pilotedAircraftId = aircraftId;
    this.currentCommand = this.createIdleCommand();

    // Reset physics for parked aircraft to prevent stale micro-drift
    if (aircraftId) {
      const phys = this.physics.get(aircraftId);
      if (phys && phys.getPhase() === 'parked') {
        phys.resetToGround(phys.getPosition());
        // Restore heading from the group quaternion
        const group = this.groups.get(aircraftId);
        if (group) {
          phys.getQuaternion().copy(group.quaternion);
        }
      }
    }
  }

  setFixedWingCommand(command: FixedWingCommand): void {
    this.currentCommand = { ...command };
  }

  setFixedWingControls(controls: { throttle: number; pitch: number; roll: number; yaw: number }): void {
    this.currentCommand = {
      throttleTarget: controls.throttle,
      pitchCommand: controls.pitch,
      rollCommand: controls.roll,
      yawCommand: controls.yaw,
      brake: 0,
      freeLook: false,
      stabilityAssist: false,
    };
  }

  // -- Queries --

  getFlightData(aircraftId: string): FixedWingFlightData | null {
    const phys = this.physics.get(aircraftId);
    if (!phys) return null;

    const configKey = this.configKeys.get(aircraftId);
    const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
    const snapshot = phys.getFlightSnapshot();

    return {
      airspeed: snapshot.airspeed,
      heading: snapshot.headingDeg,
      verticalSpeed: snapshot.verticalSpeed,
      altitude: snapshot.altitude,
      altitudeAGL: snapshot.altitudeAGL,
      phase: snapshot.phase,
      aoaDeg: snapshot.aoaDeg,
      sideslipDeg: snapshot.sideslipDeg,
      throttle: snapshot.throttle,
      brake: snapshot.brake,
      weightOnWheels: snapshot.weightOnWheels,
      isStalled: snapshot.isStalled,
      flightState: phys.getFlightState(),
      stallSpeed: config?.physics.stallSpeed ?? 40,
      pitch: snapshot.pitchDeg,
      roll: snapshot.rollDeg,
    };
  }

  getDisplayInfo(aircraftId: string): FixedWingDisplayInfo | null {
    const configKey = this.configKeys.get(aircraftId);
    return configKey ? getFixedWingDisplayInfo(configKey) : null;
  }

  getPhysics(aircraftId: string): FixedWingPhysics | null {
    return this.physics.get(aircraftId) ?? null;
  }

  getAircraftPositionTo(id: string, target: THREE.Vector3): boolean {
    const group = this.groups.get(id);
    if (!group) return false;
    target.copy(group.position);
    return true;
  }

  getAircraftQuaternionTo(id: string, target: THREE.Quaternion): boolean {
    const phys = this.physics.get(id);
    if (!phys) return false;
    target.copy(phys.getQuaternion());
    return true;
  }

  getConfigKey(aircraftId: string): string | null {
    return this.configKeys.get(aircraftId) ?? null;
  }

  hasAircraft(): boolean {
    return this.groups.size > 0;
  }

  /** Check if a model path corresponds to a fixed-wing aircraft */
  static isFixedWingModelPath(modelPath: string): boolean {
    return getFixedWingConfigKeyForModelPath(modelPath) !== null;
  }

  private createIdleCommand(): FixedWingCommand {
    return {
      throttleTarget: 0,
      pitchCommand: 0,
      rollCommand: 0,
      yawCommand: 0,
      brake: 0,
      freeLook: false,
      stabilityAssist: false,
    };
  }

  private getTerrainSample(x: number, z: number): FixedWingTerrainSample {
    if (!this.terrainManager) {
      return { height: 0 };
    }

    return {
      height: this.terrainManager.getHeightAt(x, z),
      normal: this.terrainManager.getNormalAt(x, z, _terrainSampleNormal),
    };
  }
}
