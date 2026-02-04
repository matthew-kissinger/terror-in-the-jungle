import * as THREE from 'three';
import { MortarRound } from './MortarBallistics';
import { CombatantSystem } from '../combat/CombatantSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { ExplosionEffectsPool } from '../effects/ExplosionEffectsPool';
import { AudioManager } from '../audio/AudioManager';
import { Logger } from '../../utils/Logger';

const UP_NORMAL = new THREE.Vector3(0, 1, 0);
const _offset = new THREE.Vector3();
const _effectPos = new THREE.Vector3();

export class MortarRoundManager {
  private scene: THREE.Scene;
  private combatantSystem?: CombatantSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private explosionEffectsPool?: ExplosionEffectsPool;
  private audioManager?: AudioManager;

  // Active mortar rounds
  private activeRounds: MortarRound[] = [];
  private nextRoundId = 0;

  // Constants
  private readonly DAMAGE_RADIUS = 20;
  private readonly MAX_DAMAGE = 200;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Spawn a new mortar round
   */
  spawnRound(mesh: THREE.Group, position: THREE.Vector3, velocity: THREE.Vector3, fuseTime: number): void {
    mesh.position.copy(position);
    this.scene.add(mesh);

    const round: MortarRound = {
      id: `mortar_${this.nextRoundId++}`,
      position: position.clone(),
      velocity: velocity.clone(),
      mesh,
      isActive: true,
      fuseTime
    };

    this.activeRounds.push(round);
  }

  /**
   * Update all active rounds
   */
  updateRounds(
    deltaTime: number,
    updatePhysics: (round: MortarRound, deltaTime: number) => boolean
  ): void {
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
      const impacted = updatePhysics(round, deltaTime);

      if (impacted) {
        this.detonateRound(round);
        this.removeRound(i);
      }
    }
  }

  /**
   * Detonate a mortar round
   */
  private detonateRound(round: MortarRound): void {
    Logger.info('mortar', `💥 Mortar detonated at (${round.position.x.toFixed(1)}, ${round.position.y.toFixed(1)}, ${round.position.z.toFixed(1)})`);

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

  /**
   * Remove round using swap-and-pop
   */
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

    const last = this.activeRounds.length - 1;
    if (index !== last) {
      this.activeRounds[index] = this.activeRounds[last];
    }
    this.activeRounds.pop();
  }

  /**
   * Cleanup all active rounds
   */
  dispose(): void {
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
  }

  // Setters for dependencies
  setCombatantSystem(system: CombatantSystem): void {
    this.combatantSystem = system;
  }

  setImpactEffectsPool(pool: ImpactEffectsPool): void {
    this.impactEffectsPool = pool;
  }

  setExplosionEffectsPool(pool: ExplosionEffectsPool): void {
    this.explosionEffectsPool = pool;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }
}
