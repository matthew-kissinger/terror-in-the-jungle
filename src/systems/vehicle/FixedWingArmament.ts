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
 *
 * Muzzle offsets are re-banded to the Kiln catalog airframe dims
 * (kiln-war-2026-06): A-1 13.42 m span / 10.28 m length, F-4 14.12 m length,
 * AC-47 28.4 m span / 21.15 m length. (The war-asset catalog carries explicit
 * `muzzleNodes` only for hand weapons; aircraft armament is positioned off the
 * measured airframe bbox, not a per-node anchor — the muzzles sit on the wing
 * roots / nose / left fuselage of the larger airframes.) The
 * `?aircraftArt=legacy` escape hatch reuses these Kiln-tuned offsets on the
 * legacy GLBs as a best-effort approximation (close enough that the tracer
 * origin still reads on-airframe).
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
  // Two cannons per wing on the 13.42 m-span Kiln wing, firing from the leading
  // edge ahead of the 10.28 m fuselage origin (nose ~-5.1 m).
  muzzles: [
    [-3.0, -0.4, -3.0],
    [-1.8, -0.4, -3.0],
    [1.8, -0.4, -3.0],
    [3.0, -0.4, -3.0],
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
  // Nose gun pushed forward to the nose of the 14.12 m Kiln airframe (origin near
  // the wing; nose tip is ~-7 m, so -5.0 m clears the radome).
  muzzles: [[0, -0.3, -5.0]],
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
  // Three windows down the left fuselage of the 21.15 m-long Kiln airframe; the
  // guns poke out the left side (-X) and walk fore-to-aft along the cabin (Z).
  muzzles: [
    [-2.0, -0.3, 3.2],
    [-2.0, -0.3, 0.0],
    [-2.0, -0.3, -3.2],
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
 * Left-side broadside gunner view tuning for the AC-47 (fixedwing-camera-fit).
 * The forward chase cam cannot aim guns that fire 90° to the left, so the AC-47
 * gets a toggled gunner view that looks down the broadside fire axis. The camera
 * sits OPPOSITE the fire axis (off the aircraft's right side) at `lateralOffset`
 * and `heightOffset`, looking across the airframe toward the broadside
 * convergence point with a slight down-angle for orbit fire. Other airframes
 * have no broadside view (their guns fire forward).
 */
export interface FixedWingBroadsideView {
  /** Camera offset along the airframe right axis (opposite the left fire axis), metres. */
  readonly lateralOffset: number;
  /** Camera height above the airframe, metres. */
  readonly heightOffset: number;
  /** Aft offset along the airframe so the gunner sits behind the battery, metres. */
  readonly aftOffset: number;
}

/**
 * Per-airframe chase / sight camera tuning (fixedwing-camera-fit). Data-driven
 * so the camera consumes the table rather than hardcoding feel per airframe:
 *
 *  - A-1 Skyraider — closer, lower chase; agile prop attacker.
 *  - F-4 Phantom — farther, higher chase + speed FOV widen; fast jet.
 *  - AC-47 Spooky — wide, stately chase + the broadside gunner view.
 *
 * `sightConvergenceRange` is the reference range (metres) at which the reflector
 * reticle is boresighted: the camera aims its screen centre at the gun
 * convergence point this far down the fire axis, so the reticle predicts where
 * the guns hit (forward for A-1/F-4, broadside-left for the AC-47).
 */
export interface FixedWingCameraFit {
  readonly chaseDistance: number;
  readonly chaseHeight: number;
  readonly fovWidenEnabled: boolean;
  readonly sightConvergenceRange: number;
  /** Present only for airframes with a broadside battery (the AC-47). */
  readonly broadside?: FixedWingBroadsideView;
}

// Chase distances re-banded to the Kiln catalog airframe dims (kiln-war-2026-06):
// dominant framing dim A-1 13.42 m < F-4 14.12 m < AC-47 28.4 m. Ordering
// a1 < f4 < ac47 is preserved (agile prop closest, gunship widest). The
// sightConvergenceRange values are gunnery boresight references (not airframe
// dims) and are left unchanged.
const A1_CAMERA_FIT: FixedWingCameraFit = {
  chaseDistance: 30,
  chaseHeight: 8,
  fovWidenEnabled: false,
  sightConvergenceRange: 320,
};

const F4_CAMERA_FIT: FixedWingCameraFit = {
  chaseDistance: 36,
  chaseHeight: 9,
  fovWidenEnabled: true,
  sightConvergenceRange: 420,
};

const AC47_CAMERA_FIT: FixedWingCameraFit = {
  chaseDistance: 50,
  chaseHeight: 13,
  fovWidenEnabled: false,
  sightConvergenceRange: 360,
  // Gunner view sits off the right side (+X) of the 28.4 m-span Kiln airframe
  // and looks across at the left-fuselage broadside battery; widened to clear
  // the larger half-span (~14.2 m).
  broadside: {
    lateralOffset: 32,
    heightOffset: 11,
    aftOffset: 5,
  },
};

const FIXED_WING_CAMERA_FITS: Record<string, FixedWingCameraFit> = {
  A1_SKYRAIDER: A1_CAMERA_FIT,
  F4_PHANTOM: F4_CAMERA_FIT,
  AC47_SPOOKY: AC47_CAMERA_FIT,
};

const DEFAULT_FIXED_WING_CAMERA_FIT = F4_CAMERA_FIT;

/** Resolve the camera-fit tuning for an aircraft config key (never null). */
export function getFixedWingCameraFit(configKey: string | null): FixedWingCameraFit {
  if (!configKey) return DEFAULT_FIXED_WING_CAMERA_FIT;
  return FIXED_WING_CAMERA_FITS[configKey] ?? DEFAULT_FIXED_WING_CAMERA_FIT;
}

const _convAccum = new THREE.Vector3();
const _convDir = new THREE.Vector3();

/**
 * Compute the world-space gun convergence point for an airframe — the point the
 * reflector reticle is boresighted to. Averages the muzzle origins and projects
 * `range` metres along the fire axis (forward for nose/wing guns, broadside-left
 * for the AC-47), all rotated into world space by the aircraft quaternion. The
 * reticle predicts gun hits when the camera aims its screen centre here. Written
 * into `out` to avoid allocation.
 */
export function computeFixedWingConvergencePoint(
  config: FixedWingWeaponConfig,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  range: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  // Average the local muzzle offsets (paired wing cannons converge; the
  // broadside battery centres on its middle barrel).
  _convAccum.set(0, 0, 0);
  for (const muzzle of config.muzzles) {
    _convAccum.x += muzzle[0];
    _convAccum.y += muzzle[1];
    _convAccum.z += muzzle[2];
  }
  _convAccum.multiplyScalar(1 / config.muzzles.length);

  _convDir
    .set(config.fireAxis[0], config.fireAxis[1], config.fireAxis[2])
    .normalize()
    .multiplyScalar(range);

  return out
    .copy(_convAccum)
    .add(_convDir)
    .applyQuaternion(quaternion)
    .add(position);
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
