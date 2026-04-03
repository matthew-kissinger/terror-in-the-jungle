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

    // Update physics and animation for all aircraft
    for (const [id, phys] of this.physics) {
      const group = this.groups.get(id);
      if (!group) continue;

      // Apply player controls to piloted aircraft
      if (id === this.pilotedAircraftId) {
        phys.setControls(this.currentControls);
      }

      // Get terrain height under aircraft
      const pos = phys.getPosition();
      const terrainHeight = this.terrainManager?.getEffectiveHeightAt(pos.x, pos.z) ?? 0;

      // Step physics
      phys.update(deltaTime, terrainHeight);

      // Sync mesh to physics
      group.position.copy(phys.getPosition());
      group.quaternion.copy(phys.getQuaternion());

      // Update propeller animation
      const controls = phys.getControls();
      this.animation.update(id, controls.throttle, deltaTime);

      // Sync player position to aircraft when piloted
      if (id === this.pilotedAircraftId && this.playerController) {
        this.playerController.updatePlayerPosition(phys.getPosition());
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
      const group = await this.modelLoader.loadModel(modelPath);
      // Apply same rotation convention as helicopter: -90 deg Y so nose faces forward
      group.rotation.y = heading - Math.PI / 2;
      group.position.copy(worldPosition);

      // Ensure Y is on terrain
      if (this.terrainManager) {
        const h = this.terrainManager.getEffectiveHeightAt(worldPosition.x, worldPosition.z);
        group.position.y = h + 0.5; // Slightly above ground
        worldPosition.y = h + 0.5;
      }

      this.scene.add(group);
      this.groups.set(id, group);
      this.configKeys.set(id, configKey);
      this.displayNames.set(id, display.displayName);

      // Create physics instance (starts grounded)
      const phys = new FixedWingPhysics(worldPosition.clone(), config.physics);
      // Set initial heading via quaternion
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      phys.getQuaternion().copy(q);

      if (this.terrainManager) {
        phys.setWorldHalfExtent(this.terrainManager.getPlayableWorldSize() / 2);
      }

      this.physics.set(id, phys);

      // Wire animation
      this.animation.initialize(id, configKey, group);

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

    // Extract pitch and roll from quaternion
    const euler = new THREE.Euler().setFromQuaternion(phys.getQuaternion(), 'YXZ');

    return {
      airspeed: phys.getAirspeed(),
      heading: phys.getHeading(),
      verticalSpeed: phys.getVerticalSpeed(),
      altitude: phys.getAltitude(),
      isStalled: phys.isStalled(),
      flightState: phys.getFlightState(),
      stallSpeed: config?.physics.stallSpeed ?? 40,
      pitch: THREE.MathUtils.radToDeg(euler.x),
      roll: THREE.MathUtils.radToDeg(euler.z),
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
