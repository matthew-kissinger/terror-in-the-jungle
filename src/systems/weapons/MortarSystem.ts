import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { InventoryManager } from '../player/InventoryManager';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { modelLoader } from '../assets/ModelLoader';
import { StructureModels } from '../assets/modelPaths';
import { MortarBallistics } from './MortarBallistics';
import { MortarVisuals } from './MortarVisuals';
import { MortarRoundManager } from './MortarRoundManager';
import { MortarCamera } from './MortarCamera';
import { Logger } from '../../utils/Logger';

const _deployPos = new THREE.Vector3();
const _direction = new THREE.Vector3();

export class MortarSystem implements GameSystem {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private chunkManager?: ImprovedChunkManager;
  private combatantSystem?: CombatantSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private explosionEffectsPool?: ExplosionEffectsPool;
  private inventoryManager?: InventoryManager;
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;

  // Mortar tube placement
  private mortarTube?: THREE.Group;
  private tubePosition?: THREE.Vector3;
  private isDeployed = false;

  // Aiming state
  private isAiming = false;
  private pitch = 65; // degrees (45-85)
  private yaw = 0; // degrees (relative to world)
  private power = 0.5; // 0-1

  // Mortar camera view
  private mortarCameraModule?: MortarCamera;
  private usingMortarCamera = false;

  // Modules
  private ballistics: MortarBallistics;
  private visuals: MortarVisuals;
  private roundManager: MortarRoundManager;

  // Constants
  private readonly FUSE_TIME = 15; // Maximum flight time before auto-detonation

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    chunkManager?: ImprovedChunkManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.chunkManager = chunkManager;

    this.ballistics = new MortarBallistics();
    this.visuals = new MortarVisuals(scene);
    this.roundManager = new MortarRoundManager(scene);
  }

  async init(): Promise<void> {
    Logger.info('mortar', 'Initializing Mortar System...');
    this.mortarCameraModule = new MortarCamera();
  }

  update(deltaTime: number): void {
    // Update trajectory preview while aiming
    if (this.isAiming && this.isDeployed && this.tubePosition) {
      this.updateTrajectoryPreview();
    }

    // Update mortar camera position if using mortar camera view
    if (this.usingMortarCamera && this.mortarCameraModule && this.tubePosition) {
      this.mortarCameraModule.update(this.tubePosition);
    }

    // Update active mortar rounds
    this.roundManager.updateRounds(
      deltaTime,
      (round, dt) => this.ballistics.updateRoundPhysics(
        round,
        dt,
        (x, z) => this.getGroundHeight(x, z)
      )
    );
  }


  dispose(): void {
    // Remove mortar tube
    if (this.mortarTube) {
      this.scene.remove(this.mortarTube);
      this.mortarTube.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    // Dispose modules
    this.roundManager.dispose();
    this.visuals.dispose();
  }

  private isDeploying = false;

  deployMortar(playerPosition: THREE.Vector3, playerDirection: THREE.Vector3): boolean {
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) return false;
    if (this.isDeployed || this.isDeploying) {
      Logger.warn('mortar', ' Mortar already deployed');
      return false;
    }

    this.isDeploying = true;

    // Calculate deployment position (in front of player)
    const deployTarget = playerPosition.clone();
    const dir = playerDirection.clone().multiplyScalar(3);
    deployTarget.add(dir);
    deployTarget.y = this.getGroundHeight(deployTarget.x, deployTarget.z);

    const yawAtDeploy = Math.atan2(playerDirection.x, playerDirection.z) * 180 / Math.PI;

    // Load mortar GLB model async, then finalize deployment
    void this.finishDeploy(deployTarget, yawAtDeploy);
    return true;
  }

  private async finishDeploy(pos: THREE.Vector3, yawDeg: number): Promise<void> {
    try {
      const scene = await modelLoader.loadModel(StructureModels.MORTAR_PIT);

      // Tag the tube mesh for pitch rotation if found
      let tubeFound = false;
      scene.traverse((child) => {
        const n = child.name.toLowerCase();
        if (n === 'tube' || n.includes('tube') || n.includes('barrel')) {
          child.name = 'tube';
          tubeFound = true;
        }
      });

      // If no named tube part, wrap the whole model in a group named 'tube'
      if (!tubeFound) {
        const tubeWrapper = new THREE.Group();
        tubeWrapper.name = 'tube';
        // Move all children into the wrapper
        while (scene.children.length > 0) {
          tubeWrapper.add(scene.children[0]);
        }
        scene.add(tubeWrapper);
      }

      this.mortarTube = scene;
      this.mortarTube.position.copy(pos);
      this.scene.add(this.mortarTube);

      if (this.tubePosition) {
        this.tubePosition.copy(pos);
      } else {
        this.tubePosition = pos.clone();
      }

      this.yaw = yawDeg;
      this.isDeployed = true;
      this.isDeploying = false;

      Logger.info('mortar', `Mortar deployed at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)})`);
    } catch (err) {
      this.isDeploying = false;
      Logger.warn('mortar', 'Failed to load mortar model', err);
    }
  }

  undeployMortar(): void {
    if (!this.isDeployed) return;

    // Disable mortar camera if active
    if (this.usingMortarCamera) {
      this.usingMortarCamera = false;
    }

    // Remove mortar tube
    if (this.mortarTube) {
      this.scene.remove(this.mortarTube);
      this.mortarTube.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      this.mortarTube = undefined;
    }

    this.tubePosition = undefined;
    this.isDeployed = false;
    this.isAiming = false;
    this.visuals.showTrajectory(false);

    Logger.info('mortar', 'Mortar undeployed');
  }

  startAiming(): void {
    if (!this.isDeployed) {
      Logger.warn('mortar', ' Deploy mortar first (press E)');
      return;
    }

    this.isAiming = true;
    this.visuals.showTrajectory(true);
    this.updateTrajectoryPreview();
    Logger.info('mortar', 'Mortar aiming started');
  }

  cancelAiming(): void {
    this.isAiming = false;
    this.visuals.showTrajectory(false);
  }

  adjustPitch(deltaDegrees: number): void {
    if (!this.isAiming) return;

    const range = this.ballistics.getPitchRange();
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + deltaDegrees,
      range.min,
      range.max
    );

    this.updateMortarTubeRotation();
  }

  adjustYaw(deltaDegrees: number): void {
    if (!this.isAiming) return;

    this.yaw = (this.yaw + deltaDegrees) % 360;
    if (this.yaw < 0) this.yaw += 360;

    this.updateMortarTubeRotation();
  }

  adjustPower(delta: number): void {
    if (!this.isAiming) return;

    this.power = THREE.MathUtils.clamp(this.power + delta, 0, 1);
  }

  fireMortarRound(): boolean {
    if (this.ticketSystem && !this.ticketSystem.isGameActive()) return false;
    if (!this.isAiming || !this.isDeployed || !this.tubePosition) {
      Logger.warn('mortar', ' Cannot fire - mortar not ready');
      return false;
    }

    // Check inventory
    if (this.inventoryManager && !this.inventoryManager.useMortarRound()) {
      Logger.warn('mortar', ' No mortar rounds remaining!');
      return false;
    }

    // Compute initial velocity
    const velocity = this.ballistics.computeVelocityVector(
      this.pitch,
      this.yaw,
      this.power
    );

    // Spawn mortar round
    _deployPos.copy(this.tubePosition);
    _deployPos.y += 2.5; // Launch from top of tube

    this.spawnMortarRound(_deployPos, velocity);

    // Play audio
    if (this.audioManager) {
      this.audioManager.playExplosionAt(_deployPos); // Use explosion sound for mortar fire
    }

    Logger.info('mortar', `Mortar fired! Pitch: ${this.pitch.toFixed(1)}°, Yaw: ${this.yaw.toFixed(1)}°, Power: ${(this.power * 100).toFixed(0)}%`);
    return true;
  }

  private spawnMortarRound(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const mesh = this.createMortarRound();
    this.roundManager.spawnRound(mesh, position, velocity, this.FUSE_TIME);
  }

  /** Procedural mortar round projectile (small, no GLB needed). */
  private createMortarRound(): THREE.Group {
    const round = new THREE.Group();
    round.name = 'mortar_round';

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 1.5, 12),
      new THREE.MeshStandardMaterial({ color: 0x4A5D23, metalness: 0.5, roughness: 0.6 })
    );
    body.castShadow = true;
    round.add(body);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x606060, metalness: 0.8, roughness: 0.3 })
    );
    nose.position.y = 1.05;
    nose.castShadow = true;
    round.add(nose);

    const finGeo = new THREE.BoxGeometry(0.15, 0.8, 0.05);
    const finMat = new THREE.MeshStandardMaterial({ color: 0x505050, metalness: 0.7, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      const angle = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(angle) * 0.35, -0.9, Math.sin(angle) * 0.35);
      fin.rotation.y = angle;
      fin.castShadow = true;
      round.add(fin);
    }

    return round;
  }

  private updateTrajectoryPreview(): void {
    if (!this.tubePosition) return;

    _deployPos.copy(this.tubePosition);
    _deployPos.y += 2.5; // Top of tube

    const velocity = this.ballistics.computeVelocityVector(
      this.pitch,
      this.yaw,
      this.power
    );

    const trajectory = this.ballistics.computeTrajectory(
      _deployPos,
      velocity,
      (x, z) => this.getGroundHeight(x, z)
    );

    this.visuals.updateTrajectory(trajectory);
  }

  private updateMortarTubeRotation(): void {
    if (!this.mortarTube) return;

    // Rotate entire tube group for yaw
    this.mortarTube.rotation.y = THREE.MathUtils.degToRad(this.yaw);

    // Rotate tube mesh for pitch
    const tube = this.mortarTube.getObjectByName('tube');
    if (tube) {
      tube.rotation.x = THREE.MathUtils.degToRad(this.pitch);
    }
  }

  private getGroundHeight(x: number, z: number): number {
    if (this.chunkManager) {
      return this.chunkManager.getEffectiveHeightAt(x, z);
    }
    return 0;
  }

  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
    this.roundManager.setCombatantSystem(system);
  }

  setImpactEffectsPool(pool: ImpactEffectsPool): void {
    this.impactEffectsPool = pool;
    this.roundManager.setImpactEffectsPool(pool);
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
    this.roundManager.setExplosionEffectsPool(pool);
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
    this.roundManager.setAudioManager(audioManager);
  }

  isCurrentlyAiming(): boolean {
    return this.isAiming;
  }

  isCurrentlyDeployed(): boolean {
    return this.isDeployed;
  }

  getAimingState(): { pitch: number; yaw: number; power: number } {
    return {
      pitch: this.pitch,
      yaw: this.yaw,
      power: this.power
    };
  }

  /**
   * Toggle mortar camera view (top-down view for aiming)
   * Only works when mortar is deployed
   */
  toggleMortarCamera(): boolean {
    if (!this.isDeployed) {
      Logger.warn('mortar', ' Cannot use mortar camera - mortar not deployed');
      return false;
    }

    this.usingMortarCamera = !this.usingMortarCamera;
    Logger.info('mortar', `Mortar camera ${this.usingMortarCamera ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Check if mortar camera view is currently active
   */
  isUsingMortarCamera(): boolean {
    return this.usingMortarCamera && this.isDeployed;
  }

  /**
   * Get the mortar camera for rendering
   */
  getMortarCamera(): THREE.OrthographicCamera | undefined {
    return this.isUsingMortarCamera() && this.mortarCameraModule ? this.mortarCameraModule.getCamera() : undefined;
  }
}
