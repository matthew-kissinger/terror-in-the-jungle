import * as THREE from 'three';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { IAudioManager } from '../../types/SystemInterfaces';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem, MuzzleFlashVariant } from '../effects/MuzzleFlashSystem';

// ── Config ──
const GUNNER_ACQUIRE_INTERVAL = 0.5; // seconds between target scans
const GUNNER_MAX_RANGE = 200;        // engagement range
const GUNNER_MIN_RANGE = 10;         // don't shoot at point-blank (own heli)
const TRACER_RANGE = 300;
const MUZZLE_FLASH_THROTTLE = 0.15;

// Scratch vectors
const _mountWorld = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _spreadDir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

interface GunnerState {
  config: AircraftWeaponMount;
  ammo: number;
  cooldownRemaining: number;
  targetId: string | null;
  acquireAccumulator: number;
  roundsSinceTracer: number;
}

/**
 * NPC door gunner AI. Automatically fires crew-operated weapons at nearby enemies.
 * One instance per helicopter that has crew weapons.
 */
export class HelicopterDoorGunner {
  private gunners = new Map<string, GunnerState[]>();
  private combatantSystem?: CombatantSystem;
  private audioManager?: IAudioManager;

  // Dedicated effect pools (tiny, separate from pilot weapons)
  private tracerPool: TracerPool;
  private muzzleFlashSystem: MuzzleFlashSystem;
  private muzzleFlashAccumulator = 0;

  constructor(scene: THREE.Scene) {
    this.tracerPool = new TracerPool(scene, 16);
    this.muzzleFlashSystem = new MuzzleFlashSystem(scene, 8);
  }

  setCombatantSystem(cs: CombatantSystem): void { this.combatantSystem = cs; }
  setAudioManager(am: IAudioManager): void { this.audioManager = am; }

  initGunners(heliId: string, mounts: AircraftWeaponMount[]): void {
    const crewWeapons = mounts.filter(m => m.firingMode === 'crew');
    if (crewWeapons.length === 0) return;

    this.gunners.set(heliId, crewWeapons.map(config => ({
      config,
      ammo: config.ammoCapacity,
      cooldownRemaining: 0,
      targetId: null,
      acquireAccumulator: 0,
      roundsSinceTracer: 0,
    })));
  }

  update(
    dt: number,
    heliId: string,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    isGrounded: boolean,
  ): void {
    const gunnerStates = this.gunners.get(heliId);
    if (!gunnerStates || !this.combatantSystem) return;

    // Don't fire when grounded
    if (isGrounded) return;

    for (const gunner of gunnerStates) {
      gunner.cooldownRemaining = Math.max(0, gunner.cooldownRemaining - dt);
      gunner.acquireAccumulator += dt;

      // Periodically scan for targets
      if (gunner.acquireAccumulator >= GUNNER_ACQUIRE_INTERVAL) {
        gunner.acquireAccumulator = 0;
        gunner.targetId = this.findTarget(position);
      }

      // Fire at target
      if (gunner.targetId && gunner.ammo > 0 && gunner.cooldownRemaining <= 0) {
        this.fireAtTarget(gunner, position, quaternion);
      }
    }
  }

  updateEffects(dt: number): void {
    this.tracerPool.update();
    this.muzzleFlashSystem.update(dt * 1000);
    this.muzzleFlashAccumulator += dt;
  }

  private findTarget(heliPos: THREE.Vector3): string | null {
    if (!this.combatantSystem) return null;

    const nearbyIds = this.combatantSystem.querySpatialRadius(heliPos, GUNNER_MAX_RANGE);
    let bestId: string | null = null;
    let bestDist = Infinity;

    for (const id of nearbyIds) {
      const combatants = this.combatantSystem.getAllCombatants();
      const c = combatants.find(c => c.id === id);
      if (!c || c.health <= 0 || c.isDying) continue;

      // Only shoot enemies (OPFOR from gunship's perspective = US heli vs OPFOR NPCs)
      // Simple heuristic: shoot any enemy faction
      const dist = c.position.distanceTo(heliPos);
      if (dist < GUNNER_MIN_RANGE) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }

    return bestId;
  }

  private fireAtTarget(gunner: GunnerState, heliPos: THREE.Vector3, quaternion: THREE.Quaternion): void {
    if (!this.combatantSystem) return;

    const combatants = this.combatantSystem.getAllCombatants();
    const target = combatants.find(c => c.id === gunner.targetId);
    if (!target || target.health <= 0) {
      gunner.targetId = null;
      return;
    }

    gunner.ammo--;
    gunner.cooldownRemaining = 1 / gunner.config.fireRate;
    gunner.roundsSinceTracer++;

    // Mount position in world space
    _mountWorld.set(
      gunner.config.localPosition[0],
      gunner.config.localPosition[1],
      gunner.config.localPosition[2],
    ).applyQuaternion(quaternion).add(heliPos);

    // Direction to target with spread
    _toTarget.subVectors(target.position, _mountWorld).normalize();
    this.applySpread(_toTarget, gunner.config.spreadDeg ?? 3);

    // Raycast
    const ray = new THREE.Ray(_mountWorld.clone(), _toTarget.clone());
    const dmg = gunner.config.damage;
    const result = this.combatantSystem.handlePlayerShot(ray, () => dmg);

    // Tracer every 4th round
    if (gunner.roundsSinceTracer >= 4) {
      gunner.roundsSinceTracer = 0;
      const tracerEnd = result.hit
        ? result.point.clone()
        : _mountWorld.clone().addScaledVector(_toTarget, TRACER_RANGE);
      this.tracerPool.spawn(_mountWorld.clone(), tracerEnd, 120);
    }

    // Impact effects on hit
    if (result.hit) {
      this.combatantSystem.impactEffectsPool?.spawn(result.point, _toTarget);
    }

    // Muzzle flash (throttled)
    if (this.muzzleFlashAccumulator >= MUZZLE_FLASH_THROTTLE) {
      this.muzzleFlashAccumulator = 0;
      this.muzzleFlashSystem.spawnNPC(_mountWorld.clone(), _toTarget.clone(), 1.2, MuzzleFlashVariant.RIFLE);
    }

    // Audio
    if (this.audioManager && gunner.roundsSinceTracer === 0) {
      this.audioManager.play('doorGunBurst', _mountWorld.clone());
    }
  }

  private applySpread(direction: THREE.Vector3, spreadDeg: number): void {
    if (spreadDeg <= 0) return;
    const spreadRad = (spreadDeg * Math.PI) / 180;
    const angle = Math.random() * spreadRad;
    const rotation = Math.random() * Math.PI * 2;

    _up.set(0, 1, 0);
    _right.crossVectors(direction, _up);
    if (_right.lengthSq() < 0.001) {
      _up.set(1, 0, 0);
      _right.crossVectors(direction, _up);
    }
    _right.normalize();
    _up.crossVectors(_right, direction).normalize();

    _spreadDir.copy(direction)
      .addScaledVector(_right, Math.sin(angle) * Math.cos(rotation))
      .addScaledVector(_up, Math.sin(angle) * Math.sin(rotation))
      .normalize();

    direction.copy(_spreadDir);
  }

  dispose(heliId: string): void {
    this.gunners.delete(heliId);
  }

  disposeAll(): void {
    this.gunners.clear();
    this.tracerPool.dispose();
    this.muzzleFlashSystem.dispose();
  }
}
