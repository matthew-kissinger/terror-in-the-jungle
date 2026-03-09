import * as THREE from 'three';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';
import { TracerPool } from '../effects/TracerPool';
import { MuzzleFlashSystem, MuzzleFlashVariant } from '../effects/MuzzleFlashSystem';
import { Logger } from '../../utils/Logger';

// ── Per-weapon instance state ──

interface WeaponInstance {
  config: AircraftWeaponMount;
  ammo: number;
  cooldownRemaining: number;
  roundsSinceTracer: number;
  lastPodSide: boolean; // alternating left/right for rocket pods
}

interface HelicopterWeaponState {
  weapons: WeaponInstance[];
  activeIndex: number;
  isFiring: boolean;
}

// ── Rearm rates ──
const MINIGUN_REARM_RATE = 100;  // rounds per second
const ROCKET_REARM_RATE = 1;     // rockets per second

// ── Tracer / muzzle flash ──
const MAX_TRACER_RANGE = 400;    // max hitscan visual range
const MUZZLE_FLASH_THROTTLE = 0.1; // seconds between muzzle flashes (~10/sec)

// Scratch vectors (reused per frame to avoid allocation)
const _forward = new THREE.Vector3();
const _spreadDir = new THREE.Vector3();
const _mountWorld = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _rocketVel = new THREE.Vector3();
const _tracerEnd = new THREE.Vector3();

export class HelicopterWeaponSystem {
  private scene: THREE.Scene;
  private states = new Map<string, HelicopterWeaponState>();

  // Dedicated effect pools (small, helicopter-only)
  private tracerPool: TracerPool;
  private muzzleFlashSystem: MuzzleFlashSystem;
  private muzzleFlashAccumulator = 0;

  // Injected dependencies
  private combatantSystem?: CombatantSystem;
  private grenadeSystem?: GrenadeSystem;
  private audioManager?: IAudioManager;
  private hudSystem?: IHUDSystem;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.tracerPool = new TracerPool(scene, 32);
    this.muzzleFlashSystem = new MuzzleFlashSystem(scene, 16);
  }

  // ── Dependency injection ──

  setCombatantSystem(cs: CombatantSystem): void { this.combatantSystem = cs; }
  setGrenadeSystem(gs: GrenadeSystem): void { this.grenadeSystem = gs; }
  setAudioManager(am: IAudioManager): void { this.audioManager = am; }
  setHUDSystem(hud: IHUDSystem): void { this.hudSystem = hud; }

  // ── Lifecycle ──

  initWeapons(heliId: string, mounts: AircraftWeaponMount[]): void {
    // Only pilot-operated weapons for now
    const pilotWeapons = mounts.filter(m => m.firingMode === 'pilot');
    if (pilotWeapons.length === 0) return;

    const weapons: WeaponInstance[] = pilotWeapons.map(config => ({
      config,
      ammo: config.ammoCapacity,
      cooldownRemaining: 0,
      roundsSinceTracer: 0,
      lastPodSide: false,
    }));

    this.states.set(heliId, {
      weapons,
      activeIndex: 0,
      isFiring: false,
    });
  }

  startFiring(heliId: string): void {
    const state = this.states.get(heliId);
    if (state) state.isFiring = true;
  }

  stopFiring(heliId: string): void {
    const state = this.states.get(heliId);
    if (state) state.isFiring = false;
  }

  switchWeapon(heliId: string, index: number): void {
    const state = this.states.get(heliId);
    if (!state) return;
    if (index < 0 || index >= state.weapons.length) return;
    if (state.activeIndex === index) return;
    state.activeIndex = index;
    state.isFiring = false; // stop firing on switch

    const w = state.weapons[index];
    Logger.info('helicopter', `Weapon switched to ${w.config.name} (${w.ammo}/${w.config.ammoCapacity})`);

    if (this.audioManager) {
      this.audioManager.playWeaponSwitchSound();
    }
  }

  // ── Per-frame update ──

  update(
    dt: number,
    heliId: string,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    isGrounded: boolean,
    nearHelipad: boolean,
  ): void {
    const state = this.states.get(heliId);
    if (!state) return;

    const active = state.weapons[state.activeIndex];
    if (!active) return;

    // Rearm when grounded near helipad
    if (isGrounded && nearHelipad) {
      this.rearm(state, dt);
    }

    // Decrement cooldown
    if (active.cooldownRemaining > 0) {
      active.cooldownRemaining -= dt;
    }

    // Fire if holding trigger
    if (state.isFiring && active.ammo > 0 && active.cooldownRemaining <= 0) {
      const isProjectile = (active.config.projectileSpeed ?? 0) > 0;
      if (isProjectile) {
        this.fireProjectile(active, position, quaternion);
      } else {
        this.fireHitscan(active, position, quaternion, dt);
      }
    }

    // Push HUD status
    if (this.hudSystem) {
      this.hudSystem.setHelicopterWeaponStatus(active.config.name, active.ammo);
    }
  }

  /** Tick visual effects (call once per frame regardless of weapon state) */
  updateEffects(dt: number): void {
    this.tracerPool.update();
    this.muzzleFlashSystem.update(dt * 1000); // MuzzleFlashSystem expects ms-like dt
    this.muzzleFlashAccumulator += dt;
  }

  getWeaponStatus(heliId: string): { name: string; ammo: number; maxAmmo: number } | null {
    const state = this.states.get(heliId);
    if (!state) return null;
    const active = state.weapons[state.activeIndex];
    if (!active) return null;
    return { name: active.config.name, ammo: active.ammo, maxAmmo: active.config.ammoCapacity };
  }

  getWeaponCount(heliId: string): number {
    return this.states.get(heliId)?.weapons.length ?? 0;
  }

  // ── Hitscan (minigun) ──

  private fireHitscan(
    weapon: WeaponInstance,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    dt: number,
  ): void {
    const interval = 1 / weapon.config.fireRate;

    // Accumulator: fire as many rounds as the dt budget allows
    // (weapon.cooldownRemaining is already <= 0 when we enter)
    while (weapon.cooldownRemaining <= 0 && weapon.ammo > 0) {
      weapon.cooldownRemaining += interval;
      weapon.ammo--;
      weapon.roundsSinceTracer++;

      // Compute mount world position
      _mountWorld.set(
        weapon.config.localPosition[0],
        weapon.config.localPosition[1],
        weapon.config.localPosition[2],
      ).applyQuaternion(quaternion).add(position);

      // Forward direction from helicopter quaternion
      _forward.set(0, 0, 1).applyQuaternion(quaternion).normalize();

      // Apply random spread
      this.applySpread(_forward, weapon.config.spreadDeg ?? 0);

      // Raycast against combatants
      const ray = new THREE.Ray(_mountWorld.clone(), _forward.clone());
      if (this.combatantSystem) {
        const dmg = weapon.config.damage;
        const result = this.combatantSystem.handlePlayerShot(ray, () => dmg);

        if (result.hit) {
          // Impact effect
          this.combatantSystem.impactEffectsPool?.spawn(result.point, _forward);

          // HUD feedback
          if (this.hudSystem) {
            if (result.killed) {
              this.hudSystem.showHitMarker(result.headshot ? 'headshot' : 'kill');
              this.hudSystem.addKill(result.headshot);
              this.hudSystem.addKillToFeed(
                'Player', 0 as any, 'Enemy', 1 as any,
                result.headshot, 'helicopter_minigun',
              );
            } else {
              this.hudSystem.showHitMarker('hit');
            }
          }
        }

        // Tracer
        const tracerInterval = weapon.config.tracerInterval ?? 3;
        if (weapon.roundsSinceTracer >= tracerInterval) {
          weapon.roundsSinceTracer = 0;
          _tracerEnd.copy(result.hit ? result.point : _mountWorld.clone().addScaledVector(_forward, MAX_TRACER_RANGE));
          this.tracerPool.spawn(_mountWorld.clone(), _tracerEnd.clone(), 120);
        }
      }

      // Muzzle flash (throttled)
      if (this.muzzleFlashAccumulator >= MUZZLE_FLASH_THROTTLE) {
        this.muzzleFlashAccumulator = 0;
        this.muzzleFlashSystem.spawnNPC(_mountWorld.clone(), _forward.clone(), 1.5, MuzzleFlashVariant.RIFLE);
      }

      // Audio (throttled: play sound at ~10/sec, matching muzzle flash)
      if (this.audioManager && weapon.roundsSinceTracer === 0) {
        this.audioManager.play('minigunBurst', _mountWorld.clone());
      }

      // Cap iterations to avoid infinite loop on very large dt
      if (weapon.cooldownRemaining > -dt) break;
    }
  }

  // ── Projectile (rockets) ──

  private fireProjectile(
    weapon: WeaponInstance,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    if (!this.grenadeSystem) return;

    weapon.ammo--;
    weapon.cooldownRemaining = 1 / weapon.config.fireRate;

    // Compute mount position with alternating left/right offset for pods
    const sideOffset = weapon.lastPodSide ? 1.2 : -1.2;
    weapon.lastPodSide = !weapon.lastPodSide;

    _right.set(1, 0, 0).applyQuaternion(quaternion);
    _mountWorld.set(0, weapon.config.localPosition[1], weapon.config.localPosition[2])
      .applyQuaternion(quaternion)
      .add(position)
      .addScaledVector(_right, sideOffset);

    // Forward velocity
    _forward.set(0, 0, 1).applyQuaternion(quaternion).normalize();
    const speed = weapon.config.projectileSpeed ?? 150;
    _rocketVel.copy(_forward).multiplyScalar(speed);

    // Spawn projectile via GrenadeSystem (handles physics, collision, explosion)
    this.grenadeSystem.spawnProjectile(_mountWorld.clone(), _rocketVel.clone(), 10.0, 'helicopter_rocket');

    // Audio
    if (this.audioManager) {
      this.audioManager.play('rocketLaunch', _mountWorld.clone());
    }

    // HUD feedback
    if (this.hudSystem) {
      this.hudSystem.showMessage(`Rockets: ${weapon.ammo}/${weapon.config.ammoCapacity}`, 1500);
    }

    Logger.debug('helicopter', `Rocket fired. Remaining: ${weapon.ammo}`);
  }

  // ── Rearm ──

  private rearm(state: HelicopterWeaponState, dt: number): void {
    for (const w of state.weapons) {
      if (w.ammo >= w.config.ammoCapacity) continue;

      const isProjectile = (w.config.projectileSpeed ?? 0) > 0;
      const rate = isProjectile ? ROCKET_REARM_RATE : MINIGUN_REARM_RATE;
      const amount = rate * dt;
      w.ammo = Math.min(w.config.ammoCapacity, w.ammo + amount);

      // Snap to integer for projectile weapons
      if (isProjectile) {
        w.ammo = Math.floor(w.ammo);
      }
    }
  }

  // ── Spread ──

  private applySpread(direction: THREE.Vector3, spreadDeg: number): void {
    if (spreadDeg <= 0) return;
    const spreadRad = (spreadDeg * Math.PI) / 180;
    const angle = Math.random() * spreadRad;
    const rotation = Math.random() * Math.PI * 2;

    // Compute perpendicular axes
    _up.set(0, 1, 0);
    _right.crossVectors(direction, _up);
    if (_right.lengthSq() < 0.001) {
      _up.set(1, 0, 0);
      _right.crossVectors(direction, _up);
    }
    _right.normalize();
    _up.crossVectors(_right, direction).normalize();

    // Rotate direction within cone
    _spreadDir.copy(direction)
      .addScaledVector(_right, Math.sin(angle) * Math.cos(rotation))
      .addScaledVector(_up, Math.sin(angle) * Math.sin(rotation))
      .normalize();

    direction.copy(_spreadDir);
  }

  // ── Cleanup ──

  dispose(heliId: string): void {
    this.states.delete(heliId);
  }

  disposeAll(): void {
    this.states.clear();
    this.tracerPool.dispose();
    this.muzzleFlashSystem.dispose();
  }
}
