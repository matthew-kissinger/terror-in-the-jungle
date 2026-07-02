// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { Faction } from '../combat/types';
import type { IGameRenderer } from '../../types/SystemInterfaces';
import type { FixedWingBombConfig } from './FixedWingArmament';

/**
 * Dropped-bomb ordnance for the fixed-wing attack aircraft (A-1 / F-4).
 *
 * A released bomb inherits the aircraft's world velocity and then falls under
 * the SAME gravity constant the GrenadeSystem projectile sim uses, detonating on
 * first ground impact via the shared projectile primitive. This module owns two
 * pure, decoupled pieces:
 *
 *   1. {@link predictBombImpact} — a small forward-Euler CCIP solver that steps
 *      the bomb the way `GrenadePhysics.updateGrenade` does (gravity, then
 *      position += velocity * dt) and returns the terrain intersection. It is
 *      deliberately NOT coupled to the mortar ballistics code.
 *   2. {@link FixedWingBombController} — the per-sortie bomb store + release
 *      orchestration (finite load, no rearm, airborne-gated), spawning through
 *      an injected projectile sink so the adapter stays thin and this stays
 *      unit-testable without the full GrenadeSystem.
 *
 * combat120 / AI_SANDBOX never exercises any of this (no aircraft, usesZones
 * false); the per-frame CCIP work is O(a few dozen fixed steps) and only runs
 * while piloting a bombed airframe.
 */

// Match the GrenadeSystem projectile sim gravity so the CCIP prediction lands
// where the released bomb actually falls.
export const BOMB_GRAVITY = -52;
// Long backstop fuse; the bomb detonates on ground impact well before this.
const BOMB_BACKSTOP_FUSE = 20;
const BOMB_KILLFEED_WEAPON = 'bomb';

// Screen-projected impact points beyond this normalized-device-coordinate box
// are treated as off-screen and hide the pipper (a small margin past the edges).
const BOMB_CUE_NDC_LIMIT = 1.1;

// Module-level scratch vectors: no per-call allocation on the hot aiming path.
const _bombPos = new THREE.Vector3();
const _bombVel = new THREE.Vector3();
const _bombStep = new THREE.Vector3();
const _bombImpactOut = new THREE.Vector3();
const _bombNdc = new THREE.Vector3();

interface BombImpactOptions {
  /** Gravity acceleration (m/s², negative). Must match the projectile sim. */
  gravity: number;
  /** Integration step (seconds). Smaller = more accurate, more iterations. */
  timeStep?: number;
  /** Iteration cap so a climbing/level release can never loop unbounded. */
  maxSteps?: number;
}

/**
 * Predict where a bomb released at `startPos` with world velocity `velocity`
 * will strike the terrain. Writes the impact point into `out` and returns it,
 * or returns `null` when no ground intersection occurs within the step budget
 * (e.g. the aircraft is climbing away from terrain).
 */
export function predictBombImpact(
  startPos: THREE.Vector3,
  velocity: THREE.Vector3,
  getGroundHeight: (x: number, z: number) => number,
  options: BombImpactOptions,
  out: THREE.Vector3,
): THREE.Vector3 | null {
  const timeStep = options.timeStep ?? 0.08;
  const maxSteps = options.maxSteps ?? 48;

  _bombPos.copy(startPos);
  _bombVel.copy(velocity);

  // If we already start at/under the ground, the impact is right here.
  if (_bombPos.y <= getGroundHeight(_bombPos.x, _bombPos.z)) {
    return out.copy(_bombPos);
  }

  for (let i = 0; i < maxSteps; i++) {
    // Gravity-then-position, matching GrenadePhysics.updateGrenade order.
    _bombVel.y += options.gravity * timeStep;
    _bombStep.copy(_bombVel).multiplyScalar(timeStep);
    _bombPos.add(_bombStep);

    const groundHeight = getGroundHeight(_bombPos.x, _bombPos.z);
    if (_bombPos.y <= groundHeight) {
      _bombPos.y = groundHeight;
      return out.copy(_bombPos);
    }
  }

  return null;
}

/**
 * Solve the CCIP bomb pipper as a pixel offset from the crosshair centre, or
 * `null` when it should be hidden (no terrain intersection in the step budget,
 * behind the camera, or off-screen). Combines {@link predictBombImpact} with a
 * camera projection so the adapter stays thin. `viewport` is the screen size the
 * NDC result is scaled into.
 */
export function solveBombCueOffset(
  camera: THREE.Camera,
  startPos: THREE.Vector3,
  velocity: THREE.Vector3,
  getGroundHeight: (x: number, z: number) => number,
  viewport: { width: number; height: number },
): { x: number; y: number } | null {
  const impact = predictBombImpact(
    startPos,
    velocity,
    getGroundHeight,
    { gravity: BOMB_GRAVITY },
    _bombImpactOut,
  );
  if (!impact) return null;

  _bombNdc.copy(impact).project(camera);
  if (_bombNdc.z > 1
    || Math.abs(_bombNdc.x) > BOMB_CUE_NDC_LIMIT
    || Math.abs(_bombNdc.y) > BOMB_CUE_NDC_LIMIT) {
    return null;
  }
  // NDC (-1..1) -> pixel offset from screen centre (y flipped for screen space).
  return {
    x: (_bombNdc.x * viewport.width) / 2,
    y: (-_bombNdc.y * viewport.height) / 2,
  };
}

/**
 * Minimal projectile sink the controller releases a bomb through — the real
 * `GrenadeSystem.spawnProjectile` satisfies this structurally, so tests can
 * inject a spy without the full weapon system.
 */
export interface BombProjectileSink {
  spawnProjectile(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    fuseTime: number,
    killFeedWeaponType?: string,
    ownerFaction?: Faction,
    options?: { detonateOnImpact?: boolean; blastRadius?: number; blastDamage?: number },
  ): void;
}

/** Result of a release attempt so the caller can surface feedback. */
type BombReleaseResult = 'released' | 'grounded' | 'empty' | 'no-config';

/** Live pose + airborne state of the boarded airframe (adapter reads the model). */
export interface BombAirframe {
  /** Write the aircraft world position into `out`; false if unresolved. */
  getPosition(out: THREE.Vector3): boolean;
  /** Write the aircraft world velocity into `out`. */
  getVelocity(out: THREE.Vector3): void;
  /** True while off the ground (the airborne fire gate). */
  isAirborne(): boolean;
}

/** Runtime sinks the controller drives (all optional so tests inject subsets). */
export interface BombOutputs {
  projectiles?: BombProjectileSink;
  /** Camera + viewport for the CCIP projection; omit to skip the pipper. */
  camera?: THREE.Camera;
  viewport?: { width: number; height: number };
  getGroundHeight?: (x: number, z: number) => number;
  /** Push the CCIP pixel offset, or `null` to hide the pipper. */
  setBombCue?: (offset: { x: number; y: number } | null) => void;
  /** Flash the "Airborne to fire" hint when a grounded release is blocked. */
  flashAirborneHint?: () => void;
  /** Called after a bomb actually leaves the rack (store changed). */
  onReleased?: () => void;
}

const _ctrlPos = new THREE.Vector3();
const _ctrlVel = new THREE.Vector3();

/** Current viewport size, or a 16:9 fallback outside the browser (tests / SSR). */
function viewportSize(): { width: number; height: number } {
  return typeof window !== 'undefined'
    ? { width: window.innerWidth, height: window.innerHeight }
    : { width: 1920, height: 1080 };
}

/** Minimal airframe pose surface the bomb runtime reads (FixedWingModel satisfies it). */
interface BombPoseSource {
  getAircraftPositionTo(id: string, out: THREE.Vector3): boolean;
  getAircraftVelocityTo(id: string, out: THREE.Vector3): boolean;
  getFlightData(id: string): { flightState: string } | null;
}

/**
 * Concrete CCIP-cue sink on the renderer. `setCrosshairBombCue` is crosshair-
 * internal (not on the fenced `IGameRenderer`), so the runtime widens the
 * structural type — the same pattern as the attack-heli rocket cue. Intersecting
 * `IGameRenderer` avoids the weak-type error an all-optional shape would raise.
 */
export type BombCueRenderer = IGameRenderer & {
  setCrosshairBombCue?(offset: { x: number; y: number } | null): void;
};

/** Renderer/terrain/HUD sinks the bomb runtime binds to (all optional). */
export interface BombRuntimeDeps {
  grenadeSystem?: BombProjectileSink;
  terrainSystem?: { getEffectiveHeightAt(x: number, z: number): number };
  gameRenderer?: BombCueRenderer;
  camera?: THREE.Camera;
}

/**
 * Assemble the live {@link BombAirframe} pose view + {@link BombOutputs} sinks a
 * {@link FixedWingBombController} drives, once per board. Kept out of the player
 * adapter so the adapter stays a thin RMB/lifecycle shim over this + the
 * controller. `flashAirborneHint` and `onReleased` are the adapter's HUD hooks.
 */
export function createBombRuntime(
  model: BombPoseSource,
  deps: BombRuntimeDeps,
  aircraftId: string,
  hooks: { flashAirborneHint?: () => void; onReleased?: () => void },
): { airframe: BombAirframe; outputs: BombOutputs } {
  const terrain = deps.terrainSystem;
  return {
    airframe: {
      getPosition: (out) => model.getAircraftPositionTo(aircraftId, out),
      getVelocity: (out) => { model.getAircraftVelocityTo(aircraftId, out); },
      isAirborne: () => {
        const fd = model.getFlightData(aircraftId);
        return fd ? fd.flightState !== 'grounded' : false;
      },
    },
    outputs: {
      projectiles: deps.grenadeSystem,
      camera: deps.camera,
      viewport: viewportSize(),
      getGroundHeight: terrain ? (x, z) => terrain.getEffectiveHeightAt(x, z) : undefined,
      setBombCue: deps.gameRenderer?.setCrosshairBombCue?.bind(deps.gameRenderer),
      flashAirborneHint: hooks.flashAirborneHint,
      onReleased: hooks.onReleased,
    },
  };
}

/**
 * Per-sortie bomb store + release + CCIP orchestration for one boarded airframe.
 * Constructed on board with the airframe's bomb config (or none), depleted per
 * release, and never rearmed (owner decision A5) — the load simply runs out,
 * matching the guns. It owns the drop mechanics and the pipper solve so the
 * player adapter stays thin; it reads pose through {@link BombAirframe} and
 * drives feedback through {@link BombOutputs}, so it unit-tests without the model
 * or the full GrenadeSystem.
 */
export class FixedWingBombController {
  private remaining = 0;
  private readonly config: FixedWingBombConfig | null;

  constructor(config: FixedWingBombConfig | null) {
    this.config = config;
    this.remaining = config?.count ?? 0;
  }

  /** Airframe carries bombs (A-1 / F-4). AC-47 / gun-only craft return false. */
  hasBombs(): boolean {
    return this.config !== null;
  }

  /** Bombs left this sortie. */
  getRemaining(): number {
    return this.remaining;
  }

  /** Full sortie load (0 when the airframe carries no bombs). */
  getCapacity(): number {
    return this.config?.count ?? 0;
  }

  /**
   * Per-frame update: refresh the CCIP pipper from the live pose. Release is a
   * separate discrete call ({@link tryRelease}) so input edge-detection stays in
   * the adapter. Hides the pipper when grounded / no terrain intersection / the
   * projection is off-screen, or when the airframe carries no bombs.
   */
  updateCue(airframe: BombAirframe, out: BombOutputs): void {
    if (!out.setBombCue) return;
    if (!this.config || !airframe.isAirborne() || !out.camera || !out.viewport
      || !out.getGroundHeight || !airframe.getPosition(_ctrlPos)) {
      out.setBombCue(null);
      return;
    }
    airframe.getVelocity(_ctrlVel);
    out.setBombCue(solveBombCueOffset(out.camera, _ctrlPos, _ctrlVel, out.getGroundHeight, out.viewport));
  }

  /**
   * Release one bomb with the aircraft's inherited world velocity (zero added
   * muzzle speed), detonating on ground impact via the shared projectile
   * primitive. Blocked while grounded (reuses the airborne gate the gun uses)
   * and when the load is spent. `ownerFaction` is passed so the blast spares
   * friendlies (IFF, A4) while `'PLAYER'` attribution — carried through the
   * effects path — still credits the pilot and reaches the pilot's own body at
   * 0.75x (F1). Drives {@link BombOutputs} feedback and returns the raw result.
   */
  tryRelease(airframe: BombAirframe, ownerFaction: Faction, out: BombOutputs): BombReleaseResult {
    const result = this.release(airframe, ownerFaction, out.projectiles);
    if (result === 'released') out.onReleased?.();
    else if (result === 'grounded') out.flashAirborneHint?.();
    return result;
  }

  private release(
    airframe: BombAirframe,
    ownerFaction: Faction,
    sink: BombProjectileSink | undefined,
  ): BombReleaseResult {
    if (!this.config) return 'no-config';
    if (!airframe.isAirborne()) return 'grounded';
    if (this.remaining <= 0) return 'empty';
    if (!sink || !airframe.getPosition(_ctrlPos)) return 'empty';
    airframe.getVelocity(_ctrlVel);

    this.remaining--;
    sink.spawnProjectile(
      _ctrlPos.clone(),
      _ctrlVel.clone(),
      BOMB_BACKSTOP_FUSE,
      BOMB_KILLFEED_WEAPON,
      ownerFaction,
      { detonateOnImpact: true, blastRadius: this.config.blastRadius, blastDamage: this.config.blastDamage },
    );
    return 'released';
  }
}
