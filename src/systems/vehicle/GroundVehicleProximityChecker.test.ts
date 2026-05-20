import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  GroundVehicleProximityChecker,
  resolveVehiclePromptCopy,
  PROMPT_RADIUS_M,
} from './GroundVehicleProximityChecker';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import type { IVehicle, VehicleCategory } from './IVehicle';

/**
 * Minimal IVehicle stand-in for the checker's read-only surface. The
 * checker only reads `vehicleId`, `category`, `isDestroyed()`, and
 * `getPosition()`, so the fake covers exactly those.
 */
class FakeVehicle implements Pick<IVehicle, 'vehicleId' | 'category' | 'isDestroyed' | 'getPosition'> {
  constructor(
    public vehicleId: string,
    public category: VehicleCategory,
    private position: THREE.Vector3,
    private destroyed = false,
  ) {}
  isDestroyed(): boolean {
    return this.destroyed;
  }
  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }
  setPosition(x: number, z: number): void {
    this.position.set(x, 0, z);
  }
}

/**
 * Pared-down VehicleManager surface — the checker only calls
 * `getVehiclesInRadius`, so we don't need to drag the real class in.
 */
function makeVehicleManager(vehicles: FakeVehicle[]) {
  return {
    getVehiclesInRadius(center: THREE.Vector3, radius: number): IVehicle[] {
      const radiusSq = radius * radius;
      return vehicles.filter((v) => {
        const dx = v.getPosition().x - center.x;
        const dz = v.getPosition().z - center.z;
        return dx * dx + dz * dz <= radiusSq;
      }) as unknown as IVehicle[];
    },
  };
}

function makeHud(): IHUDSystem & {
  showInteractionPrompt: ReturnType<typeof vi.fn>;
  hideInteractionPrompt: ReturnType<typeof vi.fn>;
} {
  return {
    showInteractionPrompt: vi.fn(),
    hideInteractionPrompt: vi.fn(),
  } as unknown as IHUDSystem & {
    showInteractionPrompt: ReturnType<typeof vi.fn>;
    hideInteractionPrompt: ReturnType<typeof vi.fn>;
  };
}

describe('GroundVehicleProximityChecker', () => {
  it('shows the prompt when a drivable ground vehicle is within range', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(5, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const playerPos = new THREE.Vector3(0, 0, 0);

    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => playerPos,
      () => false,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();

    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);
    expect(hud.showInteractionPrompt).toHaveBeenCalledWith('Press F to board M151 Jeep');
    expect(hud.hideInteractionPrompt).not.toHaveBeenCalled();
  });

  it('hides the prompt when the player walks out of range', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(5, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const playerPos = new THREE.Vector3(0, 0, 0);

    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => playerPos,
      () => false,
    );
    checker.setHUDSystem(hud);

    // Initial in-range tick shows the prompt.
    checker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);

    // Walk to (12, 0, 0); jeep is at (5, 0, 0) → 7 m apart, outside
    // the 6 m PROMPT_RADIUS_M.
    playerPos.set(12, 0, 0);
    checker.checkPlayerProximity();
    expect(hud.hideInteractionPrompt).toHaveBeenCalledTimes(1);
  });

  it('suppresses the prompt while the player is seated in a vehicle', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(2, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    let inVehicle = false;
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => inVehicle,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);

    // Player enters the vehicle (still within 2 m).
    inVehicle = true;
    checker.checkPlayerProximity();
    expect(hud.hideInteractionPrompt).toHaveBeenCalledTimes(1);
    // No further show() until the player exits.
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);

    // Player exits the vehicle still in range → prompt re-appears.
    inVehicle = false;
    checker.checkPlayerProximity();
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(2);
  });

  it('does not re-flash the panel when the same vehicle stays in range', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(3, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => false,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();
    checker.checkPlayerProximity();
    checker.checkPlayerProximity();

    // Three ticks, one show — the cache prevents repeat signals.
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);
  });

  it('skips aircraft (helicopter / fixed_wing) because they have their own proximity systems', () => {
    const heli = new FakeVehicle('uh1_heli', 'helicopter', new THREE.Vector3(2, 0, 0));
    const plane = new FakeVehicle('ac47_plane', 'fixed_wing', new THREE.Vector3(3, 0, 0));
    const manager = makeVehicleManager([heli, plane]);
    const hud = makeHud();
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => false,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();

    expect(hud.showInteractionPrompt).not.toHaveBeenCalled();
  });

  it('picks the nearest drivable vehicle when several are in range', () => {
    const farTank = new FakeVehicle('m48_tank_of_us_fob', 'ground', new THREE.Vector3(5, 0, 0));
    const closeJeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(1, 0, 0));
    const manager = makeVehicleManager([farTank, closeJeep]);
    const hud = makeHud();
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => false,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();

    expect(hud.showInteractionPrompt).toHaveBeenCalledWith('Press F to board M151 Jeep');
  });

  it('runs the proximity check on the 10 Hz cadence from update(dt)', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(3, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => false,
    );
    checker.setHUDSystem(hud);

    // 60 Hz frames (~16ms) below the 10 Hz cadence threshold (100ms).
    checker.update(0.016);
    checker.update(0.016);
    checker.update(0.016);
    expect(hud.showInteractionPrompt).not.toHaveBeenCalled();

    // Crossing the 100 ms threshold dispatches one check.
    checker.update(0.06);
    expect(hud.showInteractionPrompt).toHaveBeenCalledTimes(1);
  });

  it('hides the prompt when the only candidate is destroyed', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(2, 0, 0), true);
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => new THREE.Vector3(0, 0, 0),
      () => false,
    );
    checker.setHUDSystem(hud);

    checker.checkPlayerProximity();

    expect(hud.showInteractionPrompt).not.toHaveBeenCalled();
    expect(hud.hideInteractionPrompt).not.toHaveBeenCalled();
  });

  it('exports a 6 m prompt radius', () => {
    // Spot-check the default radius matches the brief's PROMPT_RADIUS_M = 6 m
    // contract — the value is consumed by the cycle's playtest evidence
    // capture, so a silent retune here would invalidate the playtest set.
    expect(PROMPT_RADIUS_M).toBe(6);
  });

  it('exposes the currently prompted vehicle id (or null) for the boarding factory', () => {
    const jeep = new FakeVehicle('motor_pool_small_m151', 'ground', new THREE.Vector3(3, 0, 0));
    const manager = makeVehicleManager([jeep]);
    const hud = makeHud();
    const playerPos = new THREE.Vector3(0, 0, 0);

    const checker = new GroundVehicleProximityChecker(
      manager as never,
      () => playerPos,
      () => false,
    );
    checker.setHUDSystem(hud);

    // No prompt yet → null
    expect(checker.getLastShownVehicleId()).toBeNull();

    // Prompt shown → returns the prompted id
    checker.checkPlayerProximity();
    expect(checker.getLastShownVehicleId()).toBe('motor_pool_small_m151');

    // Walk out of range → prompt hides, id goes back to null
    playerPos.set(20, 0, 0);
    checker.checkPlayerProximity();
    expect(checker.getLastShownVehicleId()).toBeNull();
  });
});

describe('resolveVehiclePromptCopy', () => {
  it.each<[string, VehicleCategory, string]>([
    ['motor_pool_small_m151', 'ground', 'Press F to board M151 Jeep'],
    ['m48_tank_of_us_fob', 'ground', 'Press F to board M48 Patton tank'],
    ['sampan_open_frontier_river', 'watercraft', 'Press F to board Sampan'],
    ['pbr_us_open_frontier', 'watercraft', 'Press F to board PBR gunboat'],
    ['m2hb_emp_of_us_fob', 'emplacement', 'Press F to crew M2HB emplacement'],
    ['pbr_us_open_frontier_mount_fwd', 'emplacement', 'Press F to crew M2HB emplacement'],
  ])('returns "%s" copy for %s/%s', (vehicleId, category, expected) => {
    const fake = {
      vehicleId,
      category,
      isDestroyed: () => false,
      getPosition: () => new THREE.Vector3(),
    } as unknown as IVehicle;
    expect(resolveVehiclePromptCopy(fake)).toBe(expected);
  });
});
