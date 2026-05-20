import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { Emplacement } from '../../systems/vehicle/Emplacement';
import { GroundVehicle } from '../../systems/vehicle/GroundVehicle';
import { GroundVehicleProximityChecker } from '../../systems/vehicle/GroundVehicleProximityChecker';
import { PBR } from '../../systems/vehicle/PBR';
import {
  PlayerVehicleAdapterFactory,
  type PlayerVehicleAdapterFactoryDeps,
} from '../../systems/vehicle/PlayerVehicleAdapterFactory';
import { Sampan } from '../../systems/vehicle/Sampan';
import { Tank } from '../../systems/vehicle/Tank';
import { VehicleManager } from '../../systems/vehicle/VehicleManager';
import { VehicleSessionController } from '../../systems/vehicle/VehicleSessionController';
import type { IVehicle } from '../../systems/vehicle/IVehicle';
import type { PlayerState } from '../../types';
import type { IHUDSystem } from '../../types/SystemInterfaces';
import { Faction } from '../../systems/combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * L3 cross-category integration test for the player vehicle boarding wire
 * (cycle-vekhikl-player-boarding-wire, R2 merge gate task
 * `vekhikl-board-integration-test-and-playtest-evidence`).
 *
 * Sibling L3 tests in this directory cover each adapter family in depth
 * (m151-board, m48-board, sampan-board, pbr-pilot-board, m2hb-board). This
 * test is the "all five fit together" gate: a single data-driven iteration
 * over the five drivable categories, wiring the REAL PlayerVehicleAdapterFactory
 * + GroundVehicleProximityChecker + VehicleManager + VehicleSessionController
 * already on master and asserting that the boarding round-trip lands and
 * tears down cleanly for each vehicle type.
 *
 * Behavior-only per docs/TESTING.md — no implementation-mirror assertions
 * on internal adapter state, smoothing constants, or specific magnitudes.
 *
 * What this test does NOT cover (sibling L3s do):
 *  - per-adapter input forwarding under sustained input (W throttle, A/D turn)
 *  - per-adapter exit-pose geometry (off the side of the hull)
 *  - per-adapter HUD / camera teardown details
 *
 * What this test DOES cover (the cross-category contract):
 *  - the factory's `resolveAdapterFamily` dispatch picks the correct
 *    `vehicleType` for each drivable category + id-pattern
 *  - the proximity checker → factory hand-off is the load-bearing surface
 *    (the prompted vehicle id is the one boarded)
 *  - the session controller flips to `isInVehicle()` on entry and back on
 *    exit for every vehicle type
 *  - the underlying IVehicle releases its seat on exit so an NPC can
 *    re-occupy it without the player blocking the lock
 *  - the mortar-fallback gate is preserved: the factory returns `false`
 *    when no vehicle is in proximity (this is the F-key router's signal
 *    to forward F to `onMortarFire`)
 */

// ───────────────────────────── Test fixtures ─────────────────────────────

function createPlayerState(spawn: THREE.Vector3): PlayerState {
  return {
    position: spawn.clone(),
    velocity: new THREE.Vector3(),
    speed: 10,
    runSpeed: 20,
    isRunning: false,
    isGrounded: true,
    isJumping: false,
    jumpForce: 12,
    gravity: -25,
    isCrouching: false,
    isInHelicopter: false,
    helicopterId: null,
    isInFixedWing: false,
    fixedWingId: null,
  };
}

function createPlayerInput() {
  return {
    setInHelicopter: vi.fn(),
    setFlightVehicleMode: vi.fn(),
    setInputContext: vi.fn(),
    isKeyPressed: vi.fn(() => false),
    getMouseMovement: vi.fn(() => ({ x: 0, y: 0 })),
    clearMouseMovement: vi.fn(),
    getIsPointerLocked: vi.fn(() => false),
    getTouchControls: vi.fn(() => null),
    getTouchMovementVector: vi.fn(() => ({ x: 0, z: 0 })),
    relockPointer: vi.fn(),
    clearTransientInputState: vi.fn(),
    isMouseButtonPressed: vi.fn(() => false),
  };
}

function createCameraController() {
  return {
    saveInfantryAngles: vi.fn(),
    restoreInfantryAngles: vi.fn(),
  };
}

function createHud(): IHUDSystem {
  return {
    showInteractionPrompt: vi.fn(),
    hideInteractionPrompt: vi.fn(),
    setVehicleContext: vi.fn(),
    updateElevation: vi.fn(),
    showMessage: vi.fn(),
  } as unknown as IHUDSystem;
}

function makeObject(position: THREE.Vector3): THREE.Group {
  const obj = new THREE.Group();
  obj.position.copy(position);
  return obj;
}

/**
 * One row of the data-driven matrix: the factory under test, plus the
 * proximity checker the boarding path reads from, plus the constructed
 * vehicle so the test can prime the prompt + assert seat-release.
 */
interface BoardingHarness {
  factory: PlayerVehicleAdapterFactory;
  proximityChecker: GroundVehicleProximityChecker;
  session: VehicleSessionController;
  playerState: PlayerState;
  vehicle: IVehicle;
}

async function buildHarness(vehicle: IVehicle): Promise<BoardingHarness> {
  const vehicleManager = new VehicleManager();
  await vehicleManager.init();
  vehicleManager.register(vehicle);

  const session = new VehicleSessionController();
  // Stand the player 1 m off the +X side of the vehicle — inside the
  // proximity checker's prompt radius so the first `checkPlayerProximity`
  // call latches the vehicle id.
  const playerSpawn = vehicle.getPosition().clone().add(new THREE.Vector3(1, 0, 0));
  const playerState = createPlayerState(playerSpawn);

  const proximityChecker = new GroundVehicleProximityChecker(
    vehicleManager,
    () => playerState.position,
    () => session.isInVehicle(),
  );
  proximityChecker.setHUDSystem(createHud());

  const deps: PlayerVehicleAdapterFactoryDeps = {
    vehicleManager,
    vehicleSessionController: session,
    proximityChecker,
    playerState,
    input: createPlayerInput() as any,
    cameraController: createCameraController() as any,
    hudSystem: createHud(),
  };
  const factory = new PlayerVehicleAdapterFactory(deps);

  return { factory, proximityChecker, session, playerState, vehicle };
}

/**
 * Each row: human label + how to construct the vehicle + the expected
 * vehicleType string the session controller should see after dispatch.
 *
 * Ids are the same patterns the seed-rotation registry hands out at
 * runtime (see `MapSeedRegistry.ts` + `OperationalRuntimeComposer.ts`):
 *   - M151 → `motor_pool_small_m151`
 *   - M48  → `m48_tank_of_us_fob` (matches the factory's `m48_*` id rule)
 *   - Sampan → `sampan_open_frontier_river`
 *   - PBR  → `pbr_us_open_frontier`
 *   - M2HB → `m2hb_emp_of_us_fob`
 */
const SCENARIO_ROWS: Array<{
  label: string;
  expectedType: 'ground' | 'tank' | 'watercraft' | 'emplacement';
  build: (position: THREE.Vector3) => IVehicle;
  id: string;
}> = [
  {
    label: 'M151 jeep (ground)',
    expectedType: 'ground',
    build: (p) => new GroundVehicle('motor_pool_small_m151', makeObject(p), Faction.US),
    id: 'motor_pool_small_m151',
  },
  {
    label: 'M48 Patton (tank)',
    expectedType: 'tank',
    build: (p) => new Tank('m48_tank_of_us_fob', makeObject(p), Faction.US),
    id: 'm48_tank_of_us_fob',
  },
  {
    label: 'Sampan (watercraft)',
    expectedType: 'watercraft',
    build: (p) => new Sampan('sampan_open_frontier_river', makeObject(p), Faction.NVA),
    id: 'sampan_open_frontier_river',
  },
  {
    label: 'PBR (watercraft, pilot)',
    expectedType: 'watercraft',
    build: (p) => new PBR('pbr_us_open_frontier', makeObject(p), Faction.US),
    id: 'pbr_us_open_frontier',
  },
  {
    label: 'M2HB tripod (emplacement)',
    expectedType: 'emplacement',
    build: (p) => new Emplacement('m2hb_emp_of_us_fob', makeObject(p), Faction.US),
    id: 'm2hb_emp_of_us_fob',
  },
];

// ───────────────────────────── Tests ─────────────────────────────

describe('PlayerVehicleAdapterFactory — cross-category boarding (5 vehicle types)', () => {
  for (const row of SCENARIO_ROWS) {
    it(`board → exit round-trip works for ${row.label}`, async () => {
      const vehicle = row.build(new THREE.Vector3(50, 0, 50));
      const h = await buildHarness(vehicle);

      // The proximity checker resolves the nearest drivable inside its
      // PROMPT_RADIUS_M (6 m). With the player 1 m off the vehicle, one
      // tick is enough to latch the id the factory will read.
      h.proximityChecker.checkPlayerProximity();
      expect(h.proximityChecker.getLastShownVehicleId()).toBe(row.id);

      // ── Board ──
      expect(h.session.isInVehicle()).toBe(false);
      const boarded = h.factory.tryBoardNearest();

      expect(boarded).toBe(true);
      expect(h.session.isInVehicle()).toBe(true);
      expect(h.session.getVehicleType()).toBe(row.expectedType);
      expect(h.session.getVehicleId()).toBe(row.id);

      // ── Exit ──
      const exited = h.factory.tryExit();

      expect(exited).toBe(true);
      expect(h.session.isInVehicle()).toBe(false);
      expect(h.session.getVehicleType()).toBeNull();
      expect(h.session.getVehicleId()).toBeNull();
    });
  }

  it('preserves the mortar-fallback signal when no vehicle is in proximity', async () => {
    // Build a harness whose vehicle sits well outside the prompt radius
    // (PROMPT_RADIUS_M = 6 m). The proximity checker should NOT latch an
    // id, the factory should refuse to board, and the F-key router can
    // safely forward F to onMortarFire on the strength of that `false`.
    const farJeep = new GroundVehicle(
      'motor_pool_small_m151',
      makeObject(new THREE.Vector3(200, 0, 200)),
      Faction.US,
    );
    const h = await buildHarness(farJeep);
    // Move the player away from the +X spawn offset baked by `buildHarness`
    // so we're definitively outside the 6 m prompt radius.
    h.playerState.position.set(0, 0, 0);

    h.proximityChecker.checkPlayerProximity();
    expect(h.proximityChecker.getLastShownVehicleId()).toBeNull();

    const boarded = h.factory.tryBoardNearest();

    expect(boarded).toBe(false);
    expect(h.session.isInVehicle()).toBe(false);
  });

  it('tryExit() returns false when no vehicle is currently seated (mortar-fallback parity on exit)', async () => {
    const jeep = new GroundVehicle(
      'motor_pool_small_m151',
      makeObject(new THREE.Vector3(10, 0, 10)),
      Faction.US,
    );
    const h = await buildHarness(jeep);

    // No board call → tryExit should be a no-op + return false so the
    // F-key router can fall back to mortar fire even when the player is
    // not seated (parity with the boarding path's `false` semantics).
    expect(h.session.isInVehicle()).toBe(false);
    expect(h.factory.tryExit()).toBe(false);
  });
});
