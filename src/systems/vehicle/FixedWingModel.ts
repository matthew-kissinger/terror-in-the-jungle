import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { ITerrainRuntime, IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import type { VehicleManager } from './VehicleManager';
import { FixedWingPhysics } from './FixedWingPhysics';
import { FixedWingAnimation } from './FixedWingAnimation';
import { FixedWingInteraction } from './FixedWingInteraction';
import { FixedWingVehicleAdapter } from './FixedWingVehicleAdapter';
import { FIXED_WING_CONFIGS, getFixedWingDisplayInfo } from './FixedWingConfigs';
import type { FixedWingDisplayInfo } from './FixedWingConfigs';
import { ModelLoader } from '../assets/ModelLoader';
import { Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';
import { AircraftModels } from '../assets/modelPaths';

const _flightEuler = new THREE.Euler();

/** Map from model path to config key */
const MODEL_PATH_TO_CONFIG: Record<string, string> = {
  [AircraftModels.A1_SKYRAIDER]: 'A1_SKYRAIDER',
  [AircraftModels.F4_PHANTOM]: 'F4_PHANTOM',
  [AircraftModels.AC47_SPOOKY]: 'AC47_SPOOKY',
};

export interface FixedWingFlightData {
  airspeed: number;
  heading: number;
  verticalSpeed: number;
  altitude: number;
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
  private scene: THREE.Scene;
  private modelLoader = new ModelLoader();
  private animation = new FixedWingAnimation();
  private interaction: FixedWingInteraction;

  // Per-aircraft state
  private groups = new Map<string, THREE.Group>();
  private physics = new Map<string, FixedWingPhysics>();
  private configKeys = new Map<string, string>();
  private displayNames = new Map<string, string>();
  private pilotedAircraftId: string | null = null;

  // Dependencies
  private terrainManager?: ITerrainRuntime;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private vehicleManager?: VehicleManager;

  // Controls from player input
  private currentControls: { throttle: number; pitch: number; roll: number; yaw: number } = {
    throttle: 0, pitch: 0, roll: 0, yaw: 0,
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

    // Only run physics for the piloted aircraft. Idle parked aircraft skip
    // physics/animation entirely to avoid wasting frame budget.
    if (this.pilotedAircraftId) {
      const phys = this.physics.get(this.pilotedAircraftId);
      const group = this.groups.get(this.pilotedAircraftId);
      if (phys && group) {
        phys.setControls(this.currentControls);

        const pos = phys.getPosition();
        const terrainHeight = this.terrainManager?.getEffectiveHeightAt(pos.x, pos.z) ?? 0;
        phys.update(deltaTime, terrainHeight);

        // Sync outer group position; inner model has the visual rotation offset
        group.position.copy(phys.getPosition());
        group.quaternion.copy(phys.getQuaternion());

        // Propeller animation
        const controls = phys.getControls();
        this.animation.update(this.pilotedAircraftId, controls.throttle, deltaTime);

        // Sync player position to aircraft
        if (this.playerController) {
          this.playerController.updatePlayerPosition(phys.getPosition());
        }
      }
    }
  }

  dispose(): void {
    for (const [id, group] of this.groups) {
      this.scene.remove(group);
      this.animation.dispose(id);
    }
    this.groups.clear();
    this.physics.clear();
    this.configKeys.clear();
    this.displayNames.clear();
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
    const configKey = MODEL_PATH_TO_CONFIG[modelPath];
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

      // Outer group is driven by physics quaternion (position + attitude).
      // Inner model handles the visual-to-physics rotation offset.
      const group = new THREE.Group();
      group.add(innerModel);
      group.position.copy(worldPosition);

      // Ensure Y is on terrain
      if (this.terrainManager) {
        const h = this.terrainManager.getEffectiveHeightAt(worldPosition.x, worldPosition.z);
        group.position.y = h + 0.5;
        worldPosition.y = h + 0.5;
      }

      this.scene.add(group);
      this.groups.set(id, group);
      this.configKeys.set(id, configKey);
      this.displayNames.set(id, display.displayName);

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

  // -- Player interaction --

  tryEnterAircraft(): boolean {
    return this.interaction.tryEnterAircraft();
  }

  exitAircraft(): void {
    this.pilotedAircraftId = null;
    this.currentControls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    this.interaction.exitAircraft();
  }

  setPilotedAircraft(aircraftId: string | null): void {
    this.pilotedAircraftId = aircraftId;
    if (!aircraftId) {
      this.currentControls = { throttle: 0, pitch: 0, roll: 0, yaw: 0 };
    }
  }

  setFixedWingControls(controls: { throttle: number; pitch: number; roll: number; yaw: number }): void {
    this.currentControls = controls;
  }

  // -- Queries --

  getFlightData(aircraftId: string): FixedWingFlightData | null {
    const phys = this.physics.get(aircraftId);
    if (!phys) return null;

    const configKey = this.configKeys.get(aircraftId);
    const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;

    // Extract pitch and roll from quaternion (reuse scratch euler)
    _flightEuler.setFromQuaternion(phys.getQuaternion(), 'YXZ');

    return {
      airspeed: phys.getAirspeed(),
      heading: phys.getHeading(),
      verticalSpeed: phys.getVerticalSpeed(),
      altitude: phys.getAltitude(),
      isStalled: phys.isStalled(),
      flightState: phys.getFlightState(),
      stallSpeed: config?.physics.stallSpeed ?? 40,
      pitch: THREE.MathUtils.radToDeg(_flightEuler.x),
      roll: THREE.MathUtils.radToDeg(_flightEuler.z),
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
    return modelPath in MODEL_PATH_TO_CONFIG;
  }
}
