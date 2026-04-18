import * as THREE from 'three';
import type { GameSystem } from '../../types';
import type { ITerrainRuntime, IHUDSystem, IPlayerController } from '../../types/SystemInterfaces';
import type { VehicleManager } from './VehicleManager';
import { Airframe } from './airframe/Airframe';
import type { AirframeIntent, AirframeTerrainProbe } from './airframe/types';
import {
  airframeConfigFromLegacy,
  airframeStateToFixedWingSnapshot,
  fixedWingFlightStateFromSnapshot,
} from './FixedWingTypes';
import type {
  FixedWingCommand,
  FixedWingFlightPhase,
  FixedWingFlightSnapshot,
  FixedWingFlightState,
  FixedWingTerrainSample,
} from './FixedWingTypes';
import { FixedWingAnimation } from './FixedWingAnimation';
import { FixedWingInteraction } from './FixedWingInteraction';
import { FixedWingVehicleAdapter } from './FixedWingVehicleAdapter';
import { shouldRenderAirVehicle } from './AirVehicleVisibility';
import {
  buildFixedWingPilotCommand,
  createIdleFixedWingPilotIntent,
  deriveFixedWingControlPhase,
} from './FixedWingControlLaw';
import type { FixedWingControlPhase, FixedWingPilotIntent } from './FixedWingControlLaw';
import {
  deriveFixedWingOperationState,
  getFixedWingExitStatus,
} from './FixedWingOperations';
import type {
  FixedWingOperationState,
  FixedWingSpawnMetadata,
} from './FixedWingOperations';
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

interface CachedTerrainSample {
  sample: FixedWingTerrainSample;
  lastSampleMs: number;
}

interface AircraftRuntime {
  airframe: Airframe;
  /**
   * Pending command fed to the Airframe each update. Latest gameplay-side
   * command, translated to an `AirframeIntent` at step time.
   */
  command: FixedWingCommand;
  worldHalfExtent: number;
}

export interface FixedWingFlightData {
  airspeed: number;
  heading: number;
  verticalSpeed: number;
  altitude: number;
  altitudeAGL: number;
  controlPhase: FixedWingControlPhase;
  operationState: FixedWingOperationState;
  phase: FixedWingFlightPhase;
  aoaDeg: number;
  sideslipDeg: number;
  throttle: number;
  brake: number;
  weightOnWheels: boolean;
  isStalled: boolean;
  flightState: FixedWingFlightState;
  stallSpeed: number;
  pitch: number;
  roll: number;
  orbitHoldEnabled: boolean;
  configKey: string | null;
}

function createIdleCommand(): FixedWingCommand {
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

/**
 * Translate a gameplay-side `FixedWingCommand` into an `AirframeIntent`. The
 * legacy shim used to do this internally. Two things to preserve:
 *
 * 1. `stabilityAssist` maps directly to `tier: 'assist' | 'raw'`. The Airframe
 *    command builder branches on tier, and the scales in the `feel` config
 *    are deliberately neutralized (see `airframeConfigFromLegacy`) so the
 *    legacy command values flow through unchanged.
 * 2. `brake` is only meaningful while weight-on-wheels; the Airframe command
 *    builder clamps it at ground-tier, so no extra gating is needed here.
 */
function commandToAirframeIntent(cmd: FixedWingCommand): AirframeIntent {
  return {
    pitch: cmd.pitchCommand,
    roll: cmd.rollCommand,
    yaw: cmd.yawCommand,
    throttle: cmd.throttleTarget,
    brake: cmd.brake,
    tier: cmd.stabilityAssist ? 'assist' : 'raw',
  };
}

function makeStaticTerrainProbe(sample: FixedWingTerrainSample): AirframeTerrainProbe {
  const normal = sample.normal ?? new THREE.Vector3(0, 1, 0);
  const height = sample.height;
  return {
    sample() {
      return { height, normal };
    },
    sweep(from: THREE.Vector3, to: THREE.Vector3) {
      if (from.y >= height && to.y < height) {
        const t = (from.y - height) / Math.max(from.y - to.y, 0.0001);
        const point = new THREE.Vector3().lerpVectors(from, to, t);
        point.y = height;
        return { hit: true, point, normal };
      }
      return null;
    },
  };
}

function sanitizeCommand(command: Partial<FixedWingCommand>, base: FixedWingCommand): FixedWingCommand {
  const next: FixedWingCommand = { ...base };
  if (command.throttleTarget !== undefined) {
    next.throttleTarget = THREE.MathUtils.clamp(command.throttleTarget, 0, 1);
  }
  if (command.pitchCommand !== undefined) {
    next.pitchCommand = THREE.MathUtils.clamp(command.pitchCommand, -1, 1);
  }
  if (command.rollCommand !== undefined) {
    next.rollCommand = THREE.MathUtils.clamp(command.rollCommand, -1, 1);
  }
  if (command.yawCommand !== undefined) {
    next.yawCommand = THREE.MathUtils.clamp(command.yawCommand, -1, 1);
  }
  if (command.brake !== undefined) {
    next.brake = THREE.MathUtils.clamp(command.brake, 0, 1);
  }
  if (command.freeLook !== undefined) {
    next.freeLook = command.freeLook;
  }
  if (command.stabilityAssist !== undefined) {
    next.stabilityAssist = command.stabilityAssist;
  }
  return next;
}

/**
 * Orchestrates all fixed-wing aircraft instances.
 * Parallel to HelicopterModel but simpler (no weapons, no door gunners).
 */
export class FixedWingModel implements GameSystem {
  private static readonly IDLE_SIMULATION_SPEED = 0.5;
  private static readonly AI_TERRAIN_SAMPLE_INTERVAL_MS = 100;
  private scene: THREE.Scene;
  private modelLoader = new ModelLoader();
  private animation = new FixedWingAnimation();
  private interaction: FixedWingInteraction;

  // Per-aircraft state
  private groups = new Map<string, THREE.Group>();
  private runtimes = new Map<string, AircraftRuntime>();
  private configKeys = new Map<string, string>();
  private displayNames = new Map<string, string>();
  private collisionRegistered = new Set<string>();
  private spawnMetadata = new Map<string, FixedWingSpawnMetadata>();
  private lineupAircraft = new Set<string>();
  private terrainSampleCache = new Map<string, CachedTerrainSample>();
  private pilotedAircraftId: string | null = null;

  // Dependencies
  private terrainManager?: ITerrainRuntime;
  private playerController?: IPlayerController;
  private hudSystem?: IHUDSystem;
  private vehicleManager?: VehicleManager;

  // Controls from player input
  private currentPilotIntent: FixedWingPilotIntent = createIdleFixedWingPilotIntent();
  private currentCommand: FixedWingCommand = createIdleCommand();
  private pilotIntentActive = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.interaction = new FixedWingInteraction(this.groups, this.displayNames, this.configKeys);
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

    for (const [aircraftId, runtime] of this.runtimes) {
      const group = this.groups.get(aircraftId);
      if (!group) {
        continue;
      }

      const isPiloted = aircraftId === this.pilotedAircraftId;
      const snapshot = this.buildSnapshot(runtime);
      const flightState = fixedWingFlightStateFromSnapshot(snapshot);
      const shouldSimulate = isPiloted
        || flightState !== 'grounded'
        || snapshot.airspeed > FixedWingModel.IDLE_SIMULATION_SPEED;

      if (isPiloted) {
        const configKey = this.configKeys.get(aircraftId);
        const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
        if (config && this.pilotIntentActive) {
          const position = runtime.airframe.getPosition();
          runtime.command = sanitizeCommand(
            buildFixedWingPilotCommand(
              snapshot,
              config.physics,
              config.pilotProfile,
              this.currentPilotIntent,
              { positionX: position.x, positionZ: position.z },
            ),
            runtime.command,
          );
        } else {
          runtime.command = sanitizeCommand(this.currentCommand, runtime.command);
        }
      } else if (shouldSimulate) {
        runtime.command = sanitizeCommand({
          throttleTarget: 0,
          pitchCommand: 0,
          rollCommand: 0,
          yawCommand: 0,
          brake: runtime.command.brake > 0 ? runtime.command.brake : 0,
        }, runtime.command);
      }

      if (shouldSimulate) {
        const pos = runtime.airframe.getPosition();
        const terrainSample = this.getTerrainSampleCached(aircraftId, pos.x, pos.z, isPiloted);
        runtime.airframe.step(
          commandToAirframeIntent(runtime.command),
          makeStaticTerrainProbe(terrainSample),
          deltaTime,
        );

        const postSnapshot = this.buildSnapshot(runtime);
        const configKey = this.configKeys.get(aircraftId);
        const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
        if (config && (postSnapshot.airspeed > config.operation.taxiSpeedMax || !postSnapshot.weightOnWheels)) {
          this.lineupAircraft.delete(aircraftId);
        }

        group.position.copy(runtime.airframe.getPosition());
        group.quaternion.copy(runtime.airframe.getQuaternion());
      }

      const currentSnapshot = shouldSimulate ? this.buildSnapshot(runtime) : snapshot;
      const currentFlightState = fixedWingFlightStateFromSnapshot(currentSnapshot);
      const shouldRender = shouldRenderAirVehicle({
        camera,
        scene: this.scene,
        vehiclePosition: group.position,
        isAirborne: currentFlightState !== 'grounded',
        isPiloted,
        currentlyVisible: group.visible,
      });
      group.visible = shouldRender;

      if (shouldRender) {
        this.animation.update(aircraftId, currentSnapshot.throttle, deltaTime);
      }

      if (isPiloted && this.playerController) {
        this.playerController.updatePlayerPosition(runtime.airframe.getPosition());
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
    this.runtimes.clear();
    this.configKeys.clear();
    this.displayNames.clear();
    this.collisionRegistered.clear();
    this.spawnMetadata.clear();
    this.lineupAircraft.clear();
    this.terrainSampleCache.clear();
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
    metadata?: FixedWingSpawnMetadata,
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
      if (metadata) {
        this.spawnMetadata.set(id, {
          standId: metadata.standId,
          taxiRoute: metadata.taxiRoute.map((point) => point.clone()),
          runwayStart: metadata.runwayStart
            ? {
                id: metadata.runwayStart.id,
                position: metadata.runwayStart.position.clone(),
                heading: metadata.runwayStart.heading,
                holdShortPosition: metadata.runwayStart.holdShortPosition?.clone(),
                shortFinalDistance: metadata.runwayStart.shortFinalDistance,
                shortFinalAltitude: metadata.runwayStart.shortFinalAltitude,
              }
            : undefined,
        });
      }
      if (this.terrainManager) {
        this.terrainManager.registerCollisionObject(id, group, { dynamic: true });
        this.collisionRegistered.add(id);
      }

      // Build the airframe instance (starts parked on the ground).
      const airframe = new Airframe(worldPosition.clone(), airframeConfigFromLegacy(config.physics));
      // Set initial heading on the airframe quaternion.
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
      airframe.getQuaternion().copy(q);
      // Sync group to initial physics state so parked aircraft face the right way.
      group.quaternion.copy(q);

      let worldHalfExtent = 0;
      if (this.terrainManager) {
        worldHalfExtent = this.terrainManager.getPlayableWorldSize() / 2;
        airframe.setWorldHalfExtent(worldHalfExtent);
      }

      this.runtimes.set(id, {
        airframe,
        command: createIdleCommand(),
        worldHalfExtent,
      });

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
    if (this.pilotedAircraftId) {
      const flightData = this.getFlightData(this.pilotedAircraftId);
      const configKey = this.configKeys.get(this.pilotedAircraftId);
      const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
      if (flightData && config) {
        const exitStatus = getFixedWingExitStatus({
          weightOnWheels: flightData.weightOnWheels,
          airspeed: flightData.airspeed,
          altitudeAGL: flightData.altitudeAGL,
        }, config);
        if (!exitStatus.canExit) {
          this.hudSystem?.showMessage(exitStatus.message ?? 'Cannot exit aircraft yet.', 2000);
          return;
        }
      }
    }
    this.pilotedAircraftId = null;
    this.currentCommand = createIdleCommand();
    this.currentPilotIntent = createIdleFixedWingPilotIntent();
    this.pilotIntentActive = false;
    this.interaction.exitAircraft();
  }

  setPilotedAircraft(aircraftId: string | null): void {
    this.pilotedAircraftId = aircraftId;
    this.currentCommand = createIdleCommand();
    this.currentPilotIntent = createIdleFixedWingPilotIntent();
    this.pilotIntentActive = false;

    // Reset physics for parked aircraft to prevent stale micro-drift
    if (aircraftId) {
      const runtime = this.runtimes.get(aircraftId);
      if (runtime) {
        const snapshot = this.buildSnapshot(runtime);
        if (snapshot.phase === 'parked') {
          runtime.airframe.resetToGround(runtime.airframe.getPosition());
          runtime.command = createIdleCommand();
          if (runtime.worldHalfExtent > 0) {
            runtime.airframe.setWorldHalfExtent(runtime.worldHalfExtent);
          }
          // Restore heading from the group quaternion
          const group = this.groups.get(aircraftId);
          if (group) {
            runtime.airframe.getQuaternion().copy(group.quaternion);
          }
        }
      }
    }
  }

  setFixedWingCommand(command: FixedWingCommand): void {
    this.pilotIntentActive = false;
    this.currentCommand = { ...command };
  }

  setFixedWingControls(controls: { throttle: number; pitch: number; roll: number; yaw: number }): void {
    this.pilotIntentActive = false;
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

  setFixedWingPilotIntent(intent: FixedWingPilotIntent): void {
    this.currentPilotIntent = { ...intent };
    this.pilotIntentActive = true;
  }

  // -- Queries --

  getFlightData(aircraftId: string): FixedWingFlightData | null {
    const runtime = this.runtimes.get(aircraftId);
    if (!runtime) return null;

    const configKey = this.configKeys.get(aircraftId);
    const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
    const snapshot = this.buildSnapshot(runtime);

    const controlPhase = config ? deriveFixedWingControlPhase(snapshot, config.physics) : 'flight';
    const orbitHoldEnabled = this.isOrbitHoldActive(aircraftId);
    return {
      airspeed: snapshot.airspeed,
      heading: snapshot.headingDeg,
      verticalSpeed: snapshot.verticalSpeed,
      altitude: snapshot.altitude,
      altitudeAGL: snapshot.altitudeAGL,
      controlPhase,
      operationState: config
        ? deriveFixedWingOperationState(snapshot, controlPhase, config, {
            orbitHoldEnabled,
            lineupActive: this.lineupAircraft.has(aircraftId),
          })
        : 'cruise',
      phase: snapshot.phase,
      aoaDeg: snapshot.aoaDeg,
      sideslipDeg: snapshot.sideslipDeg,
      throttle: snapshot.throttle,
      brake: snapshot.brake,
      weightOnWheels: snapshot.weightOnWheels,
      isStalled: snapshot.isStalled,
      flightState: fixedWingFlightStateFromSnapshot(snapshot),
      stallSpeed: config?.physics.stallSpeed ?? 40,
      pitch: snapshot.pitchDeg,
      roll: snapshot.rollDeg,
      orbitHoldEnabled,
      configKey: configKey ?? null,
    };
  }

  getDisplayInfo(aircraftId: string): FixedWingDisplayInfo | null {
    const configKey = this.configKeys.get(aircraftId);
    return configKey ? getFixedWingDisplayInfo(configKey) : null;
  }

  getAircraftPositionTo(id: string, target: THREE.Vector3): boolean {
    const group = this.groups.get(id);
    if (!group) return false;
    target.copy(group.position);
    return true;
  }

  getAircraftQuaternionTo(id: string, target: THREE.Quaternion): boolean {
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;
    target.copy(runtime.airframe.getQuaternion());
    return true;
  }

  getAircraftVelocityTo(id: string, target: THREE.Vector3): boolean {
    const runtime = this.runtimes.get(id);
    if (!runtime) return false;
    target.copy(runtime.airframe.getVelocity());
    return true;
  }

  getConfigKey(aircraftId: string): string | null {
    return this.configKeys.get(aircraftId) ?? null;
  }

  getAircraftIds(): string[] {
    return Array.from(this.groups.keys());
  }

  getSpawnMetadata(aircraftId: string): FixedWingSpawnMetadata | null {
    return this.spawnMetadata.get(aircraftId) ?? null;
  }

  positionAircraftAtRunwayStart(aircraftId: string): boolean {
    const metadata = this.spawnMetadata.get(aircraftId);
    const runwayStart = metadata?.runwayStart;
    const runtime = this.runtimes.get(aircraftId);
    const group = this.groups.get(aircraftId);
    const configKey = this.configKeys.get(aircraftId);
    const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
    if (!runwayStart || !runtime || !group || !config) {
      return false;
    }
    this.resetPilotedCommandState(aircraftId);

    const position = runwayStart.position.clone();
    if (this.terrainManager) {
      position.y = this.terrainManager.getHeightAt(position.x, position.z) + config.physics.gearClearance;
    }

    runtime.airframe.resetToGround(position);
    runtime.command = createIdleCommand();
    if (runtime.worldHalfExtent > 0) {
      runtime.airframe.setWorldHalfExtent(runtime.worldHalfExtent);
    }
    runtime.airframe.getQuaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), runwayStart.heading);
    group.position.copy(runtime.airframe.getPosition());
    group.quaternion.copy(runtime.airframe.getQuaternion());
    this.lineupAircraft.add(aircraftId);
    return true;
  }

  positionAircraftOnApproach(aircraftId: string): boolean {
    const metadata = this.spawnMetadata.get(aircraftId);
    const runwayStart = metadata?.runwayStart;
    const runtime = this.runtimes.get(aircraftId);
    const group = this.groups.get(aircraftId);
    const configKey = this.configKeys.get(aircraftId);
    const config = configKey ? FIXED_WING_CONFIGS[configKey] : null;
    if (!runwayStart || !runtime || !group || !config) {
      return false;
    }
    this.resetPilotedCommandState(aircraftId);

    const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), runwayStart.heading);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
    const position = runwayStart.position.clone().addScaledVector(forward, -(runwayStart.shortFinalDistance ?? 160));
    let groundHeight = 0;
    if (this.terrainManager) {
      groundHeight = this.terrainManager.getHeightAt(position.x, position.z);
      position.y = groundHeight + (runwayStart.shortFinalAltitude ?? 40);
    } else {
      position.y += runwayStart.shortFinalAltitude ?? 40;
    }

    runtime.airframe.resetAirborne(
      position,
      quaternion,
      Math.max(config.operation.approachSpeed, config.physics.v2Speed * 0.9),
      -5,
      groundHeight,
    );
    if (runtime.worldHalfExtent > 0) {
      runtime.airframe.setWorldHalfExtent(runtime.worldHalfExtent);
    }
    group.position.copy(runtime.airframe.getPosition());
    group.quaternion.copy(runtime.airframe.getQuaternion());
    this.lineupAircraft.delete(aircraftId);
    return true;
  }

  getDebugTelemetry(aircraftId: string): Record<string, unknown> | null {
    const flightData = this.getFlightData(aircraftId);
    if (!flightData) {
      return null;
    }
    const metadata = this.spawnMetadata.get(aircraftId);
    return {
      aircraftId,
      configKey: flightData.configKey,
      operationState: flightData.operationState,
      controlPhase: flightData.controlPhase,
      airspeed: Number(flightData.airspeed.toFixed(2)),
      altitudeAGL: Number(flightData.altitudeAGL.toFixed(2)),
      pitch: Number(flightData.pitch.toFixed(2)),
      roll: Number(flightData.roll.toFixed(2)),
      weightOnWheels: flightData.weightOnWheels,
      isStalled: flightData.isStalled,
      orbitHoldEnabled: flightData.orbitHoldEnabled,
      standId: metadata?.standId ?? null,
      runwayStartId: metadata?.runwayStart?.id ?? null,
    };
  }

  hasAircraft(): boolean {
    return this.groups.size > 0;
  }

  /** Check if a model path corresponds to a fixed-wing aircraft */
  static isFixedWingModelPath(modelPath: string): boolean {
    return getFixedWingConfigKeyForModelPath(modelPath) !== null;
  }

  private buildSnapshot(runtime: AircraftRuntime): FixedWingFlightSnapshot {
    return airframeStateToFixedWingSnapshot(runtime.airframe.getState());
  }

  private getTerrainSampleCached(
    aircraftId: string,
    x: number,
    z: number,
    isPiloted: boolean,
  ): FixedWingTerrainSample {
    if (!this.terrainManager) {
      return { height: 0 };
    }

    let cached = this.terrainSampleCache.get(aircraftId);
    if (!cached) {
      cached = {
        sample: { height: 0, normal: new THREE.Vector3(0, 1, 0) },
        lastSampleMs: Number.NEGATIVE_INFINITY,
      };
      this.terrainSampleCache.set(aircraftId, cached);
    }

    const nowMs = performance.now();
    const needsRefresh = isPiloted
      || nowMs - cached.lastSampleMs >= FixedWingModel.AI_TERRAIN_SAMPLE_INTERVAL_MS;

    if (needsRefresh) {
      cached.sample.height = this.terrainManager.getHeightAt(x, z);
      const normal = cached.sample.normal ?? new THREE.Vector3(0, 1, 0);
      this.terrainManager.getNormalAt(x, z, normal);
      cached.sample.normal = normal;
      cached.lastSampleMs = nowMs;
    }

    return cached.sample;
  }

  private isOrbitHoldActive(aircraftId: string): boolean {
    return this.pilotedAircraftId === aircraftId && this.currentPilotIntent.orbitHoldEnabled;
  }

  private resetPilotedCommandState(aircraftId: string): void {
    if (this.pilotedAircraftId !== aircraftId) {
      return;
    }
    this.currentCommand = createIdleCommand();
    this.currentPilotIntent = createIdleFixedWingPilotIntent();
    this.pilotIntentActive = false;
  }
}
