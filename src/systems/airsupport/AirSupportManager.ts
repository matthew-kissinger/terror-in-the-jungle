import * as THREE from 'three';
import { GameSystem } from '../../types';
import { Logger } from '../../utils/Logger';
import { GameEventBus } from '../../core/GameEventBus';
import { TracerPool } from '../effects/TracerPool';
import { ModelLoader } from '../assets/ModelLoader';
import {
  AIR_SUPPORT_CONFIGS,
  type AirSupportType,
  type AirSupportRequest,
  type AirSupportMission,
} from './AirSupportTypes';
import { initSpooky, updateSpooky } from './SpookyMission';
import { initNapalm, updateNapalm } from './NapalmMission';
import { initRocketRun, updateRocketRun } from './RocketRunMission';
import { initRecon, updateRecon } from './ReconMission';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager, IHUDSystem, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { AircraftModels } from '../assets/modelPaths';
import { NPCFlightController, buildAirSupportMission } from './NPCFlightController';
import { FIXED_WING_CONFIGS } from '../vehicle/FixedWingConfigs';

interface AirSupportManagerDependencies {
  combatantSystem: CombatantSystem;
  grenadeSystem: GrenadeSystem;
  audioManager: IAudioManager;
  hudSystem: IHUDSystem;
  terrainSystem: ITerrainRuntime;
  explosionEffectsPool?: ExplosionEffectsPool;
}

const OUTBOUND_DURATION = 10; // seconds to fly away before cleanup
const DEFAULT_APPROACH = new THREE.Vector3(0, 0, 1); // south to north

let nextMissionId = 1;

export class AirSupportManager implements GameSystem {
  private scene: THREE.Scene;
  private modelLoader: ModelLoader;
  private tracerPool: TracerPool;

  // Dependencies (injected via setters)
  private combatantSystem?: CombatantSystem;
  private grenadeSystem?: GrenadeSystem;
  private audioManager?: IAudioManager;
  private hudSystem?: IHUDSystem;
  private terrainSystem?: ITerrainRuntime;
  private explosionEffectsPool?: ExplosionEffectsPool;

  // State
  private activeMissions: AirSupportMission[] = [];
  private pendingRequests: Array<{ request: AirSupportRequest; requestedAt: number }> = [];
  private cooldowns: Map<AirSupportType, number> = new Map();
  private flightControllers: Map<string, NPCFlightController> = new Map();
  private gameElapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.modelLoader = new ModelLoader();
    this.tracerPool = new TracerPool(scene, 32);
  }

  async init(): Promise<void> {
    Logger.debug('air-support', 'Initializing Air Support Manager...');
  }

  configureDependencies(dependencies: AirSupportManagerDependencies): void {
    this.setCombatantSystem(dependencies.combatantSystem);
    this.setGrenadeSystem(dependencies.grenadeSystem);
    this.setAudioManager(dependencies.audioManager);
    this.setHUDSystem(dependencies.hudSystem);
    this.setTerrainSystem(dependencies.terrainSystem);
    if (dependencies.explosionEffectsPool) {
      this.setExplosionEffectsPool(dependencies.explosionEffectsPool);
    }
  }

  // ── Dependency setters ──

  setCombatantSystem(cs: CombatantSystem): void {
    this.combatantSystem = cs;
  }

  setGrenadeSystem(gs: GrenadeSystem): void {
    this.grenadeSystem = gs;
  }

  setAudioManager(am: IAudioManager): void {
    this.audioManager = am;
  }

  setHUDSystem(hud: IHUDSystem): void {
    this.hudSystem = hud;
  }

  setTerrainSystem(terrain: ITerrainRuntime): void {
    this.terrainSystem = terrain;
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
  }

  // ── Public API ──

  requestSupport(request: AirSupportRequest): boolean {
    const config = AIR_SUPPORT_CONFIGS[request.type];
    if (!config) return false;

    // Check cooldown
    const cooldownEnd = this.cooldowns.get(request.type) ?? 0;
    if (this.gameElapsed < cooldownEnd) {
      this.hudSystem?.showMessage(`${request.type} not ready (${Math.ceil(cooldownEnd - this.gameElapsed)}s)`, 2000);
      return false;
    }

    // Queue request
    this.pendingRequests.push({ request, requestedAt: this.gameElapsed });
    this.hudSystem?.showMessage(`${formatSupportName(request.type)} inbound - ${config.delay}s`, 3000);

    GameEventBus.emit('air_support_inbound', {
      type: request.type,
      targetPosition: request.targetPosition.clone(),
      eta: config.delay,
    });

    return true;
  }

  cancelSupport(missionId: string): void {
    const idx = this.activeMissions.findIndex(m => m.id === missionId);
    if (idx >= 0) {
      const mission = this.activeMissions[idx];
      this.cleanupMission(mission);
      this.activeMissions.splice(idx, 1);
      // Reduced cooldown on cancel
      const config = AIR_SUPPORT_CONFIGS[mission.type];
      this.cooldowns.set(mission.type, this.gameElapsed + config.cooldown * 0.5);
    }
  }

  getCooldownRemaining(type: AirSupportType): number {
    const cooldownEnd = this.cooldowns.get(type) ?? 0;
    return Math.max(0, cooldownEnd - this.gameElapsed);
  }

  getActiveMissions(): ReadonlyArray<AirSupportMission> {
    return this.activeMissions;
  }

  getSupportTypes(): AirSupportType[] {
    return Object.keys(AIR_SUPPORT_CONFIGS) as AirSupportType[];
  }

  // ── Update loop ──

  update(deltaTime: number): void {
    this.gameElapsed += deltaTime;

    // Process pending requests (check if delay has elapsed)
    this.processPending();

    // Update active missions
    for (let i = this.activeMissions.length - 1; i >= 0; i--) {
      const mission = this.activeMissions[i];
      mission.elapsed += deltaTime;

      this.updateMission(mission, deltaTime);

      // Check for mission completion
      if (mission.state === 'outbound') {
        mission.missionData.outboundTime = (mission.missionData.outboundTime ?? 0) + deltaTime;
        if (mission.missionData.outboundTime > OUTBOUND_DURATION) {
          this.cleanupMission(mission);
          this.activeMissions.splice(i, 1);

          const config = AIR_SUPPORT_CONFIGS[mission.type];
          this.cooldowns.set(mission.type, this.gameElapsed + config.cooldown);

          GameEventBus.emit('air_support_complete', {
            type: mission.type,
            missionId: mission.id,
          });
        }
      }

      // Safety: force complete if mission runs way too long
      if (mission.elapsed > AIR_SUPPORT_CONFIGS[mission.type].duration * 3) {
        this.cleanupMission(mission);
        this.activeMissions.splice(i, 1);
      }
    }

    // Update tracer pool
    this.tracerPool.update();
  }

  dispose(): void {
    for (const mission of this.activeMissions) {
      this.cleanupMission(mission);
    }
    this.activeMissions.length = 0;
    this.pendingRequests.length = 0;
    this.flightControllers.clear();
    this.tracerPool.dispose();
  }

  // ── Private ──

  private processPending(): void {
    for (let i = this.pendingRequests.length - 1; i >= 0; i--) {
      const pending = this.pendingRequests[i];
      const config = AIR_SUPPORT_CONFIGS[pending.request.type];
      const elapsed = this.gameElapsed - pending.requestedAt;

      if (elapsed >= config.delay) {
        this.pendingRequests.splice(i, 1);
        void this.spawnMission(pending.request);
      }
    }
  }

  private async spawnMission(request: AirSupportRequest): Promise<void> {
    const config = AIR_SUPPORT_CONFIGS[request.type];

    // Load aircraft model (or create placeholder)
    let aircraft: THREE.Group;
    const modelPath = AircraftModels[config.modelKey as keyof typeof AircraftModels];
    if (modelPath) {
      try {
        aircraft = await this.modelLoader.loadModel(modelPath);
      } catch {
        aircraft = createPlaceholderAircraft(request.type);
      }
    } else {
      aircraft = createPlaceholderAircraft(request.type);
    }

    // Scale aircraft
    aircraft.scale.setScalar(2.0);
    this.scene.add(aircraft);

    const approachDir = request.approachDirection?.clone().normalize() ?? DEFAULT_APPROACH.clone();

    const mission: AirSupportMission = {
      id: `air_${nextMissionId++}`,
      type: request.type,
      aircraft,
      state: 'active',
      elapsed: 0,
      duration: config.duration,
      targetPosition: request.targetPosition.clone(),
      approachDirection: approachDir,
      missionData: {},
    };

    // Create physics-driven flight controller for supported mission types
    const physicsConfig = this.getPhysicsConfig(request.type);
    if (physicsConfig) {
      const startPos = request.targetPosition.clone()
        .addScaledVector(approachDir, -500);
      startPos.y = (this.terrainSystem?.getHeightAt(startPos.x, startPos.z) ?? 0) + config.altitude;

      const fc = new NPCFlightController(aircraft, startPos, physicsConfig);
      const missionType = request.type === 'spooky' ? 'orbit' as const
        : request.type === 'recon' ? 'flyover' as const
        : 'attack_run' as const;
      fc.setMission(buildAirSupportMission(
        request.targetPosition,
        approachDir,
        config.altitude,
        config.speed,
        missionType,
      ));
      this.flightControllers.set(mission.id, fc);
    }

    // Initialize mission-specific state
    switch (request.type) {
      case 'spooky': initSpooky(mission); break;
      case 'napalm': initNapalm(mission); break;
      case 'rocket_run': initRocketRun(mission); break;
      case 'recon': initRecon(mission); break;
    }

    this.activeMissions.push(mission);
    this.hudSystem?.showMessage(`${formatSupportName(request.type)} on station`, 3000);

    GameEventBus.emit('air_support_active', {
      type: request.type,
      missionId: mission.id,
    });
  }

  private updateMission(mission: AirSupportMission, dt: number): void {
    // Update physics-driven flight if available
    const fc = this.flightControllers.get(mission.id);
    if (fc && mission.state !== 'outbound') {
      const terrainH = this.terrainSystem?.getHeightAt(
        mission.aircraft.position.x, mission.aircraft.position.z
      ) ?? 0;
      fc.update(dt, terrainH);
      // Physics controller syncs aircraft position/quaternion automatically
    }

    if (mission.state === 'outbound') {
      if (fc) {
        // Let physics handle outbound flight too
        const terrainH = this.terrainSystem?.getHeightAt(
          mission.aircraft.position.x, mission.aircraft.position.z
        ) ?? 0;
        fc.update(dt, terrainH);
      } else {
        // Legacy: direct manipulation for non-physics missions
        const speed = AIR_SUPPORT_CONFIGS[mission.type].speed;
        mission.aircraft.position.x += mission.approachDirection.x * speed * dt;
        mission.aircraft.position.z += mission.approachDirection.z * speed * dt;
        mission.aircraft.position.y += 10 * dt; // climb out
      }
      return;
    }

    const getHeight = (x: number, z: number) =>
      this.terrainSystem?.getHeightAt(x, z) ?? 0;

    const explosionSpawn = this.explosionEffectsPool
      ? (pos: THREE.Vector3) => this.explosionEffectsPool!.spawn(pos)
      : undefined;

    switch (mission.type) {
      case 'spooky':
        updateSpooky(mission, dt, this.combatantSystem, this.audioManager, this.tracerPool, getHeight, this.flightControllers.has(mission.id));
        // Spooky auto-transitions to outbound when duration expires
        if (mission.elapsed >= mission.duration) {
          mission.state = 'outbound';
        }
        break;

      case 'napalm':
        updateNapalm(mission, dt, this.combatantSystem, this.audioManager, explosionSpawn, getHeight);
        break;

      case 'rocket_run':
        updateRocketRun(mission, dt, this.grenadeSystem, this.audioManager, getHeight);
        break;

      case 'recon':
        updateRecon(mission, dt, this.combatantSystem, getHeight);
        break;
    }
  }

  /**
   * Get the FixedWingPhysicsConfig for a mission type, if physics-driven flight is available.
   * Currently enabled for spooky (AC-47) only; other missions use legacy direct positioning.
   */
  private getPhysicsConfig(type: AirSupportType) {
    switch (type) {
      case 'spooky': return FIXED_WING_CONFIGS.AC47_SPOOKY?.physics;
      default: return undefined;
    }
  }

  private cleanupMission(mission: AirSupportMission): void {
    const fc = this.flightControllers.get(mission.id);
    if (fc) {
      fc.dispose();
      this.flightControllers.delete(mission.id);
    }
    if (typeof (this.modelLoader as any).isSharedInstance === 'function'
      && this.modelLoader.isSharedInstance(mission.aircraft)) {
      this.modelLoader.disposeInstance(mission.aircraft);
      return;
    }

    this.scene.remove(mission.aircraft);
    mission.aircraft.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}

function createPlaceholderAircraft(type: AirSupportType): THREE.Group {
  const group = new THREE.Group();
  // Simple box placeholder until GLB loads
  const size = type === 'spooky' ? 8 : type === 'napalm' ? 6 : 4;
  const geometry = new THREE.BoxGeometry(size * 0.3, size * 0.2, size);
  const material = new THREE.MeshStandardMaterial({ color: 0x556655, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);
  // Add wings
  const wingGeometry = new THREE.BoxGeometry(size * 1.5, size * 0.05, size * 0.3);
  const wing = new THREE.Mesh(wingGeometry, material);
  group.add(wing);
  return group;
}

function formatSupportName(type: AirSupportType): string {
  switch (type) {
    case 'spooky': return 'Spooky gunship';
    case 'napalm': return 'Napalm strike';
    case 'rocket_run': return 'Rocket run';
    case 'recon': return 'Recon flight';
  }
}
