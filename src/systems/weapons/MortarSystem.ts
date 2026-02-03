import * as THREE from 'three';
import { GameSystem } from '../../types';
import { ImprovedChunkManager } from '../terrain/ImprovedChunkManager';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { InventoryManager } from '../player/InventoryManager';
import { AudioManager } from '../audio/AudioManager';
import { ProgrammaticExplosivesFactory } from './ProgrammaticExplosivesFactory';
import { MortarBallistics, MortarRound } from './MortarBallistics';
import { MortarVisuals } from './MortarVisuals';

const UP_NORMAL = new THREE.Vector3(0, 1, 0);
const _offset = new THREE.Vector3();
const _effectPos = new THREE.Vector3();
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

  // Active mortar rounds
  private activeRounds: MortarRound[] = [];
  private nextRoundId = 0;

  // Modules
  private ballistics: MortarBallistics;
  private visuals: MortarVisuals;

  // Constants
  private readonly DAMAGE_RADIUS = 20;
  private readonly MAX_DAMAGE = 200;
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
  }

  async init(): Promise<void> {
    console.log('💣 Initializing Mortar System...');
  }

  update(deltaTime: number): void {
    // Update trajectory preview while aiming
    if (this.isAiming && this.isDeployed && this.tubePosition) {
      this.updateTrajectoryPreview();
    }

    // Update active mortar rounds
    for (let i = this.activeRounds.length - 1; i >= 0; i--) {
      const round = this.activeRounds[i];

      if (!round.isActive) continue;

      // Update fuse timer
      round.fuseTime -= deltaTime;
      if (round.fuseTime <= 0) {
        this.detonateRound(round);
        this.removeRound(i);
        continue;
      }

      // Update physics
      const impacted = this.ballistics.updateRoundPhysics(
        round,
        deltaTime,
        (x, z) => this.getGroundHeight(x, z)
      );

      if (impacted) {
        this.detonateRound(round);
        this.removeRound(i);
      }
    }
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

    // Remove active rounds
    this.activeRounds.forEach(round => {
      if (round.mesh) {
        this.scene.remove(round.mesh);
        round.mesh.traverse(child => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }
    });
    this.activeRounds = [];

    // Dispose visuals
    this.visuals.dispose();
  }

  deployMortar(playerPosition: THREE.Vector3, playerDirection: THREE.Vector3): boolean {
    if (this.isDeployed) {
      console.log('⚠️ Mortar already deployed');
      return false;
    }

    // Calculate deployment position (in front of player)
    _deployPos.copy(playerPosition);
    _direction.copy(playerDirection).multiplyScalar(3);
    _deployPos.add(_direction);
    _deployPos.y = this.getGroundHeight(_deployPos.x, _deployPos.z);

    // Create mortar tube mesh
    this.mortarTube = ProgrammaticExplosivesFactory.createMortarTube();
    this.mortarTube.position.copy(_deployPos);
    this.scene.add(this.mortarTube);

    if (this.tubePosition) {
      this.tubePosition.copy(_deployPos);
    } else {
      this.tubePosition = _deployPos.clone();
    }
    this.isDeployed = true;

    // Initialize yaw to face player's direction
    this.yaw = Math.atan2(playerDirection.x, playerDirection.z) * 180 / Math.PI;

    console.log(`💣 Mortar deployed at (${_deployPos.x.toFixed(1)}, ${_deployPos.y.toFixed(1)}, ${_deployPos.z.toFixed(1)})`);
    return true;
  }

  undeployMortar(): void {
    if (!this.isDeployed) return;

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

    console.log('💣 Mortar undeployed');
  }

  startAiming(): void {
    if (!this.isDeployed) {
      console.log('⚠️ Deploy mortar first (press E)');
      return;
    }

    this.isAiming = true;
    this.visuals.showTrajectory(true);
    this.updateTrajectoryPreview();
    console.log('💣 Mortar aiming started');
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
    if (!this.isAiming || !this.isDeployed || !this.tubePosition) {
      console.log('⚠️ Cannot fire - mortar not ready');
      return false;
    }

    // Check inventory
    if (this.inventoryManager && !this.inventoryManager.useMortarRound()) {
      console.log('⚠️ No mortar rounds remaining!');
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

    console.log(`💣 Mortar fired! Pitch: ${this.pitch.toFixed(1)}°, Yaw: ${this.yaw.toFixed(1)}°, Power: ${(this.power * 100).toFixed(0)}%`);
    return true;
  }

  private spawnMortarRound(position: THREE.Vector3, velocity: THREE.Vector3): void {
    const mesh = ProgrammaticExplosivesFactory.createMortarRound();
    mesh.position.copy(position);
    this.scene.add(mesh);

    const round: MortarRound = {
      id: `mortar_${this.nextRoundId++}`,
      position: position.clone(),
      velocity: velocity.clone(),
      mesh,
      isActive: true,
      fuseTime: this.FUSE_TIME
    };

    this.activeRounds.push(round);
  }

  private detonateRound(round: MortarRound): void {
    console.log(`💥 Mortar detonated at (${round.position.x.toFixed(1)}, ${round.position.y.toFixed(1)}, ${round.position.z.toFixed(1)})`);

    // Explosion visual effect
    if (this.explosionEffectsPool) {
      this.explosionEffectsPool.spawn(round.position);
    }

    // Debris effects
    if (this.impactEffectsPool) {
      for (let i = 0; i < 20; i++) {
        _offset.set(
          (Math.random() - 0.5) * 5,
          Math.random() * 2,
          (Math.random() - 0.5) * 5
        );
        _effectPos.copy(round.position).add(_offset);
        this.impactEffectsPool.spawn(_effectPos, UP_NORMAL);
      }
    }

    // Audio
    if (this.audioManager) {
      this.audioManager.playExplosionAt(round.position);
    }

    // Damage
    if (this.combatantSystem) {
      this.combatantSystem.applyExplosionDamage(
        round.position,
        this.DAMAGE_RADIUS,
        this.MAX_DAMAGE
      );
    }
  }

  private removeRound(index: number): void {
    const round = this.activeRounds[index];

    if (round.mesh) {
      this.scene.remove(round.mesh);
      round.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }

    this.activeRounds.splice(index, 1);
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
  }

  setImpactEffectsPool(pool: ImpactEffectsPool): void {
    this.impactEffectsPool = pool;
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
  }

  setInventoryManager(inventoryManager: InventoryManager): void {
    this.inventoryManager = inventoryManager;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
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
}
