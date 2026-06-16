// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';
import { Faction } from '../combat/types';
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
  /** Crew-served weapons (door guns) only fire when the seat is manned. */
  crewServed: boolean;
}

interface HelicopterWeaponState {
  /** Pilot-operated weapons cycled by the active index. */
  weapons: WeaponInstance[];
  /** Crew-served weapons (door guns) fired independently when manned. */
  crewWeapons: WeaponInstance[];
  activeIndex: number;
  isFiring: boolean;
  /** True when a player gunner or AI crew occupies the door-gun seat(s). */
  crewManned: boolean;
  /**
   * True while the PLAYER is crewing the door gun. The AI auto-fire path is
   * suspended in this state — the player drives aim + trigger through
   * `firePlayerDoorGun` instead — so the two never double-fire the same belt.
   */
  playerCrewing: boolean;
  /** Owning faction; aircraft guns only damage enemies of this faction. */
  faction: Faction;
}

// ── Rearm rates ──
const MINIGUN_REARM_RATE = 100;  // rounds per second
const ROCKET_REARM_RATE = 1;     // rockets per second

// ── Rocket ballistics (CCIP-lite cue) ──
// The downward acceleration the rocket integrates against once spawned. The
// rocket flies as a `GrenadeSystem` projectile, which falls under that system's
// GRAVITY (m/s², magnitude). This is the SAME value the live fire path uses —
// the cue computes lead from it, it does not introduce new ballistics. Kept in
// sync with `GrenadeSystem.GRAVITY` (currently -52 → magnitude 52).
const ROCKET_GRAVITY = 52;
// Reference slant range the cue solves the impact drop at. The cue is a
// fall-lead hint, not a ranged solution — a fixed reference range keeps it
// deterministic and free of a target-range query.
const ROCKET_CUE_REFERENCE_RANGE = 300; // meters

/** Read-only snapshot of the active pilot weapon for the attack-sight cue. */
export type HeliWeaponKind = 'gun' | 'rockets';

/**
 * Rocket-fall cue inputs: the muzzle speed the active rocket pod launches at
 * plus the airframe's own forward airspeed and nose-down pitch. All read from
 * existing state — no new ballistics.
 */
export interface RocketCueParams {
  /** Rocket muzzle speed along the boresight (m/s). */
  muzzleSpeed: number;
  /** Airframe forward airspeed (m/s); adds to the launch speed when level. */
  airspeed: number;
  /** Nose pitch in radians; negative = nose-down (a dive). */
  pitch: number;
}

/**
 * CCIP-lite rocket-fall lead: the angle (radians, ≥ 0) the rocket's impact
 * sits BELOW the boresight pipper at the reference range. Deterministic and
 * dependency-free so it unit-tests directly.
 *
 * The rocket leaves along the boresight (pitch θ) at `muzzleSpeed`, with the
 * airframe's forward airspeed projected onto the boresight added on. It then
 * falls under gravity for the time it takes to reach the reference slant range.
 * The cue is the angular gap between the boresight and the gravity-bent impact
 * direction:
 *   - level flight (θ ≈ 0): full gravity drop → the cue sits well below the pipper;
 *   - nose-down dive (θ ≪ 0): the boresight already points down the fall line,
 *     so the angular gap shrinks → the cue converges toward the pipper.
 */
export function computeRocketCueDrop(params: RocketCueParams): number {
  const { muzzleSpeed, airspeed, pitch } = params;
  // Launch speed along the boresight = muzzle speed + the airframe's airspeed
  // projected onto the boresight (cos of the dive angle). Floor it so a stalled
  // hover never divides by ~0.
  const launchSpeed = Math.max(1, muzzleSpeed + airspeed * Math.cos(pitch));
  const range = ROCKET_CUE_REFERENCE_RANGE;
  // Time to fly the reference range at the boresight launch speed.
  const t = range / launchSpeed;
  // Gravity drop over that flight (meters below the straight-line boresight path).
  const drop = 0.5 * ROCKET_GRAVITY * t * t;
  // Impact point relative to the muzzle, in the airframe's vertical plane:
  // straight out along the boresight (pitch θ) then pulled down by `drop`.
  const fwdY = range * Math.sin(pitch);
  const fwdH = range * Math.cos(pitch);
  const impactY = fwdY - drop;
  // Angle of the boresight and of the impact direction, measured from horizontal.
  const boresightAngle = Math.atan2(fwdY, fwdH);
  const impactAngle = Math.atan2(impactY, fwdH);
  // The cue is how far below the boresight the impact lands (never negative —
  // gravity only ever drops the rocket below the line of fire).
  return Math.max(0, boresightAngle - impactAngle);
}

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
const _aimDir = new THREE.Vector3();
const _shotRay = new THREE.Ray();

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
  private currentHitscanDamage = 0;
  private readonly hitscanDamageResolver = (): number => this.currentHitscanDamage;

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

  initWeapons(heliId: string, mounts: AircraftWeaponMount[], faction: Faction = Faction.US): void {
    const makeInstance = (config: AircraftWeaponMount): WeaponInstance => ({
      config,
      ammo: config.ammoCapacity,
      cooldownRemaining: 0,
      roundsSinceTracer: 0,
      lastPodSide: false,
      crewServed: config.firingMode === 'crew',
    });

    const weapons = mounts.filter(m => m.firingMode === 'pilot').map(makeInstance);
    const crewWeapons = mounts.filter(m => m.firingMode === 'crew').map(makeInstance);

    // Nothing to track if the airframe has no armament at all.
    if (weapons.length === 0 && crewWeapons.length === 0) return;

    this.states.set(heliId, {
      weapons,
      crewWeapons,
      activeIndex: 0,
      isFiring: false,
      crewManned: false,
      playerCrewing: false,
      faction,
    });
  }

  /**
   * Mark whether the door-gun seat(s) are occupied. Crew-served weapons stay
   * inert until manned (player gunner or AI crew), then fire automatically at
   * enemies via the door-gunner update path.
   */
  setCrewManned(heliId: string, manned: boolean): void {
    const state = this.states.get(heliId);
    if (state) state.crewManned = manned;
  }

  /**
   * Mark whether the PLAYER is crewing the door gun. While true the AI
   * auto-fire path is suspended — the player drives aim + trigger through
   * `firePlayerDoorGun` — so the door gun never double-fires. Setting it also
   * keeps the seat marked manned so the gun is live.
   */
  setPlayerCrewing(heliId: string, crewing: boolean): void {
    const state = this.states.get(heliId);
    if (!state) return;
    state.playerCrewing = crewing;
    if (crewing) state.crewManned = true;
  }

  /**
   * Fire the player-crewed door gun along an explicit world-space aim direction
   * (the adapter clamps it to the mount arc). Reuses the exact crew-served
   * hitscan damage/tracer/audio path the AI door gunner fires through — no new
   * ballistics. The mount world position is derived from the door weapon's
   * configured offset + the live airframe pose. A no-op when the aircraft has
   * no door gun, is grounded, or the player is not crewing it.
   *
   * `fire` latches the held trigger: cooldown still advances every frame so the
   * fire rate stays dt-accurate whether or not the trigger is down.
   */
  firePlayerDoorGun(
    heliId: string,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    aimDir: THREE.Vector3,
    fire: boolean,
    isGrounded: boolean,
    dt: number,
  ): void {
    const state = this.states.get(heliId);
    if (!state || !state.playerCrewing || isGrounded) return;

    _aimDir.copy(aimDir).normalize();
    for (const crew of state.crewWeapons) {
      this.advanceCooldown(crew, dt);
      if (fire && crew.ammo > 0 && crew.cooldownRemaining <= 0) {
        this.fireHitscan(crew, position, quaternion, _aimDir, dt, state.faction);
      }
    }
  }

  /** Aggregate door-gun status for the player gunner HUD (name + ammo). */
  getPlayerDoorGunStatus(heliId: string): { name: string; ammo: number; maxAmmo: number } | null {
    const state = this.states.get(heliId);
    if (!state || state.crewWeapons.length === 0) return null;
    const first = state.crewWeapons[0];
    const ammo = state.crewWeapons.reduce((sum, w) => sum + w.ammo, 0);
    const maxAmmo = state.crewWeapons.reduce((sum, w) => sum + w.config.ammoCapacity, 0);
    return { name: first.config.name, ammo: Math.floor(ammo), maxAmmo };
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

    // Rearm when grounded near helipad
    if (isGrounded && nearHelipad) {
      this.rearm(state, dt);
    }

    // Crew-served door guns: fire when manned and airborne, independent of the
    // pilot trigger. They stay inert when unmanned or grounded. A PLAYER gunner
    // drives the door gun on its own aim/fire path (`firePlayerDoorGun`), so the
    // AI auto-fire here is suspended while the player crews it.
    if (state.crewManned && !state.playerCrewing && !isGrounded) {
      // AI crew fire along the airframe's forward axis.
      _aimDir.set(0, 0, 1).applyQuaternion(quaternion).normalize();
      for (const crew of state.crewWeapons) {
        this.advanceCooldown(crew, dt);
        if (crew.ammo > 0 && crew.cooldownRemaining <= 0) {
          this.fireHitscan(crew, position, quaternion, _aimDir, dt, state.faction);
        }
      }
    }

    const active = state.weapons[state.activeIndex];
    if (active) {
      // Advance the firing clock by this frame's dt so the round budget passed
      // into the accumulator reflects how much time actually elapsed.
      this.advanceCooldown(active, dt);

      // Fire if holding trigger
      if (state.isFiring && active.ammo > 0 && active.cooldownRemaining <= 0) {
        const isProjectile = (active.config.projectileSpeed ?? 0) > 0;
        if (isProjectile) {
          this.fireProjectile(active, position, quaternion);
        } else {
          // Pilot weapons fire along the airframe forward axis.
          _aimDir.set(0, 0, 1).applyQuaternion(quaternion).normalize();
          this.fireHitscan(active, position, quaternion, _aimDir, dt, state.faction);
        }
      }

      // Push HUD status
      if (this.hudSystem) {
        this.hudSystem.setHelicopterWeaponStatus(active.config.name, active.ammo);
      }
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

  /**
   * Which kind of pilot weapon is selected — `'rockets'` for a ballistic
   * projectile pod, `'gun'` for a hitscan weapon. `null` when the aircraft has
   * no pilot armament. Read-only; drives which attack-sight reticle is
   * prominent (gun pipper vs rocket-fall cue).
   */
  getActiveWeaponKind(heliId: string): HeliWeaponKind | null {
    const state = this.states.get(heliId);
    const active = state?.weapons[state.activeIndex];
    if (!active) return null;
    return (active.config.projectileSpeed ?? 0) > 0 ? 'rockets' : 'gun';
  }

  /**
   * Ballistic params for the active rocket pod (muzzle speed + remaining
   * count), or `null` when the selected weapon is not a projectile pod. These
   * are the SAME values the live fire path integrates with — read-only, no new
   * ballistics — so the CCIP-lite cue can lead the rocket fall.
   */
  getActiveRocketBallistics(heliId: string): { muzzleSpeed: number; ammo: number } | null {
    const state = this.states.get(heliId);
    const active = state?.weapons[state.activeIndex];
    if (!active) return null;
    const muzzleSpeed = active.config.projectileSpeed ?? 0;
    if (muzzleSpeed <= 0) return null;
    return { muzzleSpeed, ammo: Math.floor(active.ammo) };
  }

  /** Number of crew-served weapons (door guns) registered for this aircraft. */
  getCrewWeaponCount(heliId: string): number {
    return this.states.get(heliId)?.crewWeapons.length ?? 0;
  }

  /** Aggregate crew-served ammo remaining (door guns). */
  getCrewAmmo(heliId: string): number {
    const state = this.states.get(heliId);
    if (!state) return 0;
    return state.crewWeapons.reduce((sum, w) => sum + w.ammo, 0);
  }

  // ── Cooldown clock ──

  /**
   * Advance a weapon's firing clock by one frame. The clock counts down by
   * `dt` every frame (whether or not the trigger is held) and is floored at
   * `-dt` so an idle or stalled frame can never bank more than a single
   * frame's worth of catch-up. When the trigger is held the resulting
   * non-positive deficit is what the hitscan accumulator spends to emit a
   * dt-accurate number of rounds.
   */
  private advanceCooldown(weapon: WeaponInstance, dt: number): void {
    weapon.cooldownRemaining -= dt;
    if (weapon.cooldownRemaining < -dt) {
      weapon.cooldownRemaining = -dt;
    }
  }

  // ── Hitscan (minigun) ──

  private fireHitscan(
    weapon: WeaponInstance,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
    aimDir: THREE.Vector3,
    dt: number,
    faction: Faction,
  ): void {
    const interval = 1 / weapon.config.fireRate;
    this.currentHitscanDamage = weapon.config.damage;

    // Accumulator: fire every round whose interval fits in the dt budget. The
    // caller (advanceCooldown) has already debited this frame's dt and floored
    // the deficit at -dt, so cooldownRemaining is in [-dt, 0] on entry. Each
    // round adds `interval`; the loop terminates once the deficit is repaid,
    // so a larger dt fires proportionally more rounds (dt-accurate fire rate)
    // while a single frame can never emit more than one frame's worth.
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

      // Fire along the supplied aim direction (airframe-forward for the pilot /
      // AI-crew paths; the player gunner's clamped door-gun aim when crewing).
      _forward.copy(aimDir).normalize();

      // Apply random spread
      this.applySpread(_forward, weapon.config.spreadDeg ?? 0);

      // Raycast against combatants
      _shotRay.origin.copy(_mountWorld);
      _shotRay.direction.copy(_forward);
      if (this.combatantSystem) {
        // Pass the owning faction so friend-or-foe filtering only damages enemies.
        const result = this.combatantSystem.handlePlayerShot(_shotRay, this.hitscanDamageResolver, 'helicopter_minigun', faction);

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
          if (result.hit) {
            _tracerEnd.copy(result.point);
          } else {
            _tracerEnd.copy(_mountWorld).addScaledVector(_forward, MAX_TRACER_RANGE);
          }
          this.tracerPool.spawn(_mountWorld, _tracerEnd, 120);
        }
      }

      // Muzzle flash (throttled)
      if (this.muzzleFlashAccumulator >= MUZZLE_FLASH_THROTTLE) {
        this.muzzleFlashAccumulator = 0;
        this.muzzleFlashSystem.spawnNPC(_mountWorld, _forward, 1.5, MuzzleFlashVariant.RIFLE);
      }

      // Audio (throttled: play sound at ~10/sec, matching muzzle flash)
      if (this.audioManager && weapon.roundsSinceTracer === 0) {
        this.audioManager.play('minigunBurst', _mountWorld);
      }
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
    this.grenadeSystem.spawnProjectile(_mountWorld, _rocketVel, 10.0, 'helicopter_rocket');

    // Audio
    if (this.audioManager) {
      this.audioManager.play('rocketLaunch', _mountWorld);
    }

    // HUD feedback
    if (this.hudSystem) {
      this.hudSystem.showMessage(`Rockets: ${weapon.ammo}/${weapon.config.ammoCapacity}`, 1500);
    }

    Logger.debug('helicopter', `Rocket fired. Remaining: ${weapon.ammo}`);
  }

  // ── Rearm ──

  private rearm(state: HelicopterWeaponState, dt: number): void {
    this.rearmWeapons(state.weapons, dt);
    this.rearmWeapons(state.crewWeapons, dt);
  }

  private rearmWeapons(weapons: WeaponInstance[], dt: number): void {
    for (const w of weapons) {
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
