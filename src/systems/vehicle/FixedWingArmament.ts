// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

/**
 * Per-airframe forward / broadside armament tables for the fixed-wing fleet.
 *
 * Before this module all three airframes shared one identical nose hitscan
 * (`FIXED_WING_FORWARD_GUN`). The table below differentiates them so each craft
 * fires with its own geometry, spread, cadence, and magazine:
 *
 *  - A-1 Skyraider — 4x 20 mm wing cannons. Forward, paired-convergence muzzles,
 *    tighter spread and heavier per-round damage than the old shared gun.
 *  - F-4 Phantom — nose 20 mm rotary. Forward, high rate, large magazine; this
 *    is the closest to the legacy behavior (tuned).
 *  - AC-47 Spooky — 3x 7.62 mm minigun BROADSIDE. The signature gunship battery
 *    fires 90° to the LEFT of the nose (left-perpendicular in airframe space),
 *    a generous magazine, tracer-heavy. No forward nose gun.
 *
 * Geometry is expressed in airframe-local space and rotated by the aircraft
 * quaternion at fire time. `fireAxis` is the local fire direction; `muzzles`
 * are local muzzle offsets (forward = -Z, right = +X, up = +Y). All shots still
 * route through the shared combatant hitscan path — only origin / direction /
 * spread / cadence / magazine differ per airframe.
 */
export interface FixedWingWeaponConfig {
  /** HUD-facing weapon name. */
  readonly name: string;
  /** Full magazine load (rounds). */
  readonly ammoCapacity: number;
  /** Rounds per second. */
  readonly fireRate: number;
  /** Damage per hit (routed through the shared hitscan path). */
  readonly damage: number;
  /** Random cone spread, degrees. */
  readonly spreadDeg: number;
  /** Emit one tracer every N rounds (1 = every round). */
  readonly tracerInterval: number;
  /**
   * Local fire direction in airframe space (forward = -Z). Forward guns use
   * (0,0,-1); the AC-47 broadside uses (-1,0,0) — 90° to the left of the nose.
   */
  readonly fireAxis: readonly [number, number, number];
  /**
   * Local muzzle offsets in airframe space. Each entry is one barrel; the gun
   * round-robins across them so paired wing cannons converge and the broadside
   * battery walks across its three barrels.
   */
  readonly muzzles: ReadonlyArray<readonly [number, number, number]>;
}

/**
 * A-1 Skyraider: four wing-mounted 20 mm cannons. Paired convergence (two per
 * wing), tighter spread and heavier per-round damage than the old shared gun.
 */
const A1_WING_CANNONS: FixedWingWeaponConfig = {
  name: '4x 20mm Wing Cannon',
  ammoCapacity: 480,
  fireRate: 20,
  damage: 28,
  spreadDeg: 0.5,
  tracerInterval: 2,
  fireAxis: [0, 0, -1],
  muzzles: [
    [-2.6, -0.4, -3.0],
    [-1.6, -0.4, -3.0],
    [1.6, -0.4, -3.0],
    [2.6, -0.4, -3.0],
  ],
};

/**
 * F-4 Phantom: nose-mounted 20 mm rotary. High rate, large magazine — the
 * closest to the legacy shared behavior (tuned), straight off the nose.
 */
const F4_NOSE_ROTARY: FixedWingWeaponConfig = {
  name: '20mm Nose Rotary',
  ammoCapacity: 640,
  fireRate: 24,
  damage: 20,
  spreadDeg: 0.8,
  tracerInterval: 3,
  fireAxis: [0, 0, -1],
  muzzles: [[0, -0.3, -4.0]],
};

/**
 * AC-47 Spooky: three 7.62 mm miniguns firing BROADSIDE, 90° to the left of the
 * nose — the signature orbit-fire geometry. Generous magazine, tracer-heavy
 * (every round), lighter per-hit damage offset by the firehose volume.
 */
const AC47_BROADSIDE_BATTERY: FixedWingWeaponConfig = {
  name: '3x 7.62mm Broadside',
  ammoCapacity: 1500,
  fireRate: 33,
  damage: 12,
  spreadDeg: 1.2,
  tracerInterval: 1,
  fireAxis: [-1, 0, 0],
  muzzles: [
    [-2.2, -0.2, 2.0],
    [-2.2, -0.2, 0.0],
    [-2.2, -0.2, -2.0],
  ],
};

/**
 * Per-config-key armament table. Keys match `FIXED_WING_CONFIGS`. Unknown keys
 * fall back to the F-4 nose rotary so a new airframe still has a forward gun.
 */
const FIXED_WING_ARMAMENT: Record<string, FixedWingWeaponConfig> = {
  A1_SKYRAIDER: A1_WING_CANNONS,
  F4_PHANTOM: F4_NOSE_ROTARY,
  AC47_SPOOKY: AC47_BROADSIDE_BATTERY,
};

const DEFAULT_FIXED_WING_WEAPON = F4_NOSE_ROTARY;

/** Resolve the armament config for an aircraft config key (never null). */
export function getFixedWingWeaponConfig(configKey: string | null): FixedWingWeaponConfig {
  if (!configKey) return DEFAULT_FIXED_WING_WEAPON;
  return FIXED_WING_ARMAMENT[configKey] ?? DEFAULT_FIXED_WING_WEAPON;
}

/**
 * Compute the world-space muzzle origin + fire direction for one round.
 *
 * `barrelIndex` selects which muzzle fires (round-robin across barrels). The
 * direction is the airframe `fireAxis` rotated into world space — forward for
 * nose/wing guns, left-perpendicular for the AC-47 broadside. Outputs are
 * written into the provided vectors to avoid per-shot allocation.
 */
export function computeFixedWingShot(
  config: FixedWingWeaponConfig,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  barrelIndex: number,
  outMuzzle: THREE.Vector3,
  outDirection: THREE.Vector3,
): void {
  outDirection
    .set(config.fireAxis[0], config.fireAxis[1], config.fireAxis[2])
    .applyQuaternion(quaternion)
    .normalize();

  const barrel = config.muzzles[barrelIndex % config.muzzles.length];
  outMuzzle
    .set(barrel[0], barrel[1], barrel[2])
    .applyQuaternion(quaternion)
    .add(position);
}
