// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { CombatantAI, type TankGunnerContext } from '../../systems/combat/CombatantAI';
import { TankAIGunnerRoute } from '../../systems/combat/ai/TankAIGunnerRoute';
import { TankBallisticSolver } from '../../systems/combat/projectiles/TankBallisticSolver';
import { TankCannonProjectileSystem } from '../../systems/combat/projectiles/TankCannonProjectile';
import { CombatantSystemDamage } from '../../systems/combat/CombatantSystemDamage';
import { Tank } from '../../systems/vehicle/Tank';
import { VehicleManager } from '../../systems/vehicle/VehicleManager';
import { Combatant, CombatantState, Faction } from '../../systems/combat/types';
import { wireNpcTankGunner, type CannonStepGate } from '../../core/StartupPlayerRuntimeComposer';
import { createTestCombatant } from '../../test-utils';
import { spatialGridManager } from '../../systems/combat/SpatialGridManager';
import type { SquadManager } from '../../systems/combat/SquadManager';
import type { CombatantSpawnManager } from '../../systems/combat/CombatantSpawnManager';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// The explosion-damage handler resolves blast candidates through the spatial
// grid singleton. Mock it to return every live combatant id so the real
// in-handler `distance <= radius` falloff still does the exact filtering — the
// same seam `CombatantSystemDamage.test.ts` uses.
vi.mock('../../systems/combat/SpatialGridManager', () => ({
  spatialGridManager: {
    getIsInitialized: vi.fn(() => true),
    queryRadius: vi.fn(() => [] as string[]),
    removeEntity: vi.fn(),
    syncEntity: vi.fn(),
  },
}));

/**
 * L3 scenario test for `npc-tank-cannon-wiring`.
 *
 * BEFORE THIS CYCLE, NPC-crewed M48 tanks never fired their cannon in prod:
 * `CombatantAI` already had the tank-gunner firing route + delegation, but
 * nothing bound a cannon system + ballistic solver to it at the composition
 * point (`setTankGunnerRoute` had zero production callers). So an NPC sitting
 * in a tank gunner seat with an enemy dead ahead did nothing.
 *
 * Wiring the route makes ground gunnery two-way. These tests pin the seam at
 * the behavior level, not the adapter internals:
 *
 *   1. DEAD-ON-MASTER: a `CombatantAI` whose tank-gunner route is NOT wired
 *      (the state on master) puts no round in flight for an NPC gunner.
 *   2. LIVE-AFTER-WIRING: the same NPC, with the route + a context provider +
 *      the shared cannon wired exactly as the composer wires them, launches a
 *      cannon round; that round, on armed impact, routes damage through the
 *      shared `CombatantSystemDamage.applyExplosionDamage` path and the enemy
 *      combatant loses health.
 *
 * The wiring helper below mirrors the production wiring in
 * `StartupPlayerRuntimeComposer.wireNpcTankGunner` (same pattern
 * `seated-weapon-fire.test.ts` uses for the player seated-weapon lifecycle).
 */

const GUNNER_ID = 'us_tank_gunner_1';
const ENEMY_ID = 'nva_grunt_1';
const VISUAL_RANGE = 400;

function gunnerSkill() {
  return {
    reactionDelayMs: 0,
    aimJitterAmplitude: 0,
    burstLength: 1,
    burstPauseMs: 0,
    leadingErrorFactor: 0,
    suppressionResistance: 1,
    visualRange: VISUAL_RANGE,
    fieldOfView: Math.PI * 2,
    firstShotAccuracy: 1,
    burstDegradation: 0,
  };
}

/** A flat-ground height source far below the muzzle: rounds never impact. */
function neverImpactGround(): number {
  return -10_000;
}

/**
 * Mirror of the production NPC tank-gunner wire
 * (`StartupPlayerRuntimeComposer.wireNpcTankGunner`): build a solver + route,
 * register them on the AI with a per-combatant context resolver that maps an
 * IN_VEHICLE combatant to its tank + turret + the *shared* cannon when (and
 * only when) it occupies the gunner seat, and register a once-per-frame cannon
 * stepper. Returns the cannon-step closure so the test can advance projectile
 * flight deterministically.
 */
function wireNpcTankGunnerForTest(args: {
  ai: CombatantAI;
  vehicleManager: VehicleManager;
  cannon: TankCannonProjectileSystem;
  terrainHeightAt: (x: number, z: number) => number;
}): void {
  const { ai, vehicleManager, cannon, terrainHeightAt } = args;
  const solver = new TankBallisticSolver();
  const route = new TankAIGunnerRoute();

  const contextProvider = (combatant: Combatant): TankGunnerContext | null => {
    const tank = vehicleManager.getTankByOccupant(combatant.id);
    if (!(tank instanceof Tank)) return null;
    const inGunnerSeat = tank
      .getSeats()
      .some((seat) => seat.role === 'gunner' && seat.occupantId === combatant.id);
    if (!inGunnerSeat) return null;
    return { tank, turret: tank.getTurret(), cannon, solver };
  };

  ai.setTankGunnerRoute(route, contextProvider);
  ai.setFrameStepper(() => cannon.update(1 / 60, terrainHeightAt));
}

/**
 * Build a CombatantSystem-shaped damage sink for the cannon: a real
 * `CombatantSystemDamage` instance (the actual prod damage code) behind the
 * `applyExplosionDamage` surface the cannon calls, plus a cosmetic explosion
 * pool. This keeps the kill/damage attribution path real while staying L3.
 */
function makeDamageSink(combatants: Map<string, Combatant>): {
  explosionEffectsPool: { spawn: ReturnType<typeof vi.fn> };
  applyExplosionDamage: CombatantSystemDamage['applyExplosionDamage'];
} {
  const damage = new CombatantSystemDamage(
    combatants,
    { getSquad: vi.fn(), getAllSquads: () => new Map(), removeSquadMember: vi.fn() } as unknown as SquadManager,
    { queueRespawn: vi.fn() } as unknown as CombatantSpawnManager,
  );
  return {
    explosionEffectsPool: { spawn: vi.fn() },
    applyExplosionDamage: damage.applyExplosionDamage.bind(damage),
  };
}

describe('NPC-crewed M48 cannon fires + applies damage (npc-tank-cannon-wiring)', () => {
  let scene: THREE.Scene;
  let combatants: Map<string, Combatant>;
  let vehicleManager: VehicleManager;
  let tank: Tank;
  let gunner: Combatant;
  let enemy: Combatant;
  let cannon: TankCannonProjectileSystem;
  let ai: CombatantAI;
  let barrelTip: THREE.Vector3;

  beforeEach(() => {
    scene = new THREE.Scene();
    combatants = new Map();

    // Spatial-grid mock returns all live combatant ids so the real blast
    // falloff inside applyExplosionDamage runs unchanged.
    (spatialGridManager.queryRadius as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => Array.from(combatants.keys()),
    );

    // M48 placed at the origin facing chassis-forward (-Z), registered with a
    // real VehicleManager so the production occupant lookup resolves it.
    const tankObject = new THREE.Group();
    scene.add(tankObject);
    tank = new Tank('m48_us_test', tankObject, Faction.US);
    tank.getTurret().update(1 / 60); // settle the rig nodes at neutral pose
    vehicleManager = new VehicleManager();
    vehicleManager.register(tank);

    // Resolve the muzzle tip + forward direction so the enemy can be placed
    // dead ahead (no slew / no lead needed → aim converges on the first tick).
    barrelTip = new THREE.Vector3();
    const barrelDir = new THREE.Vector3();
    tank.getTurret().getBarrelTipWorldPosition(barrelTip);
    tank.getTurret().getBarrelDirectionWorld(barrelDir);

    // US gunner seated in the tank's gunner seat. `lastShotTime` is well in the
    // past (the route gates the cannon on `now - lastShotTime`; `performance.now()`
    // can be only a few hundred ms into the test process, so a 0 would read as
    // "just fired" and trip the reload gate).
    gunner = createTestCombatant({
      id: GUNNER_ID,
      faction: Faction.US,
      state: CombatantState.IN_VEHICLE,
      position: barrelTip.clone(),
      skillProfile: gunnerSkill() as any,
      lastShotTime: -1_000_000,
    });
    combatants.set(gunner.id, gunner);
    tank.enterVehicle(gunner.id, 'gunner');

    // NVA enemy ~40 m dead ahead along the barrel line, at the muzzle height
    // so the bore points straight at it.
    const enemyPos = barrelTip.clone().addScaledVector(barrelDir, 40);
    enemy = createTestCombatant({
      id: ENEMY_ID,
      faction: Faction.NVA,
      state: CombatantState.PATROLLING,
      position: enemyPos,
      health: 100,
      maxHealth: 100,
    });
    combatants.set(enemy.id, enemy);

    ai = new CombatantAI();
    ai.setPlayerFaction(Faction.US); // player is friendly → never a gunner target
    ai.beginFrame();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('DEAD ON MASTER: an unwired tank-gunner route puts no round in flight', () => {
    const sink = makeDamageSink(combatants);
    cannon = new TankCannonProjectileSystem(
      scene,
      sink.explosionEffectsPool as any,
      sink as any,
      8,
    );

    // No setTankGunnerRoute → reproduces master: the IN_VEHICLE branch is a
    // no-op for the gunner.
    const playerPos = new THREE.Vector3(0, 0, 10_000);
    for (let i = 0; i < 10; i++) {
      ai.updateAI(gunner, 1 / 60, playerPos, combatants);
      cannon.update(1 / 60, neverImpactGround);
    }

    expect(cannon.getActiveCount()).toBe(0);
    expect(enemy.health).toBe(100);
  });

  it('SINGLE-OWNER STEPPING: with a player tank session active the shared pool advances exactly once per frame', () => {
    const sink = makeDamageSink(combatants);
    cannon = new TankCannonProjectileSystem(
      scene,
      sink.explosionEffectsPool as any,
      sink as any,
      8,
    );

    // Wire through the REAL production wire (exported for this seam) with the
    // single-owner gate the composer shares between the player session
    // lifecycle and the NPC frame stepper.
    const gate: CannonStepGate = { playerOwns: false };
    wireNpcTankGunner({
      combatantSystem: { combatantAI: ai } as any,
      vehicleManager,
      terrainSystem: { getEffectiveHeightAt: neverImpactGround } as any,
      cannon,
      cannonStepGate: gate,
    });

    const updateSpy = vi.spyOn(cannon, 'update');

    // Player boards a tank → lifecycle marks the player session as the
    // pool's sole stepper. Each frame: the adapter steps once (scaled
    // ctx.deltaTime), then combat AI's beginFrame runs — the NPC stepper
    // must yield, leaving exactly ONE pool advance per frame.
    gate.playerOwns = true;
    for (let frame = 0; frame < 5; frame++) {
      updateSpy.mockClear();
      cannon.update(1 / 60, neverImpactGround); // TankPlayerAdapter.cannonStep path
      ai.beginFrame(1 / 60);                    // combat frame with scaled dt
      expect(updateSpy).toHaveBeenCalledTimes(1);
    }

    // Player dismounts → the NPC stepper owns the step again (scaled dt).
    gate.playerOwns = false;
    updateSpy.mockClear();
    ai.beginFrame(1 / 60);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenLastCalledWith(1 / 60, expect.any(Function));

    // Paused frame (TimeScale dt=0): shells must freeze, not advance at
    // wall-clock — the stepper skips entirely.
    updateSpy.mockClear();
    ai.beginFrame(0);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('LIVE AFTER WIRING: the NPC gunner launches a cannon round at the enemy', () => {
    const sink = makeDamageSink(combatants);
    cannon = new TankCannonProjectileSystem(
      scene,
      sink.explosionEffectsPool as any,
      sink as any,
      8,
    );
    wireNpcTankGunnerForTest({ ai, vehicleManager, cannon, terrainHeightAt: neverImpactGround });

    const playerPos = new THREE.Vector3(0, 0, 10_000);
    // A handful of ticks: acquire → slew/converge → reload gate (gunner starts
    // with lastShotTime 0, so the very first converged tick clears it).
    let fired = false;
    for (let i = 0; i < 5 && !fired; i++) {
      ai.beginFrame();
      ai.updateAI(gunner, 1 / 60, playerPos, combatants);
      fired = cannon.getActiveCount() > 0;
    }

    expect(fired).toBe(true);
  });

  it('LIVE AFTER WIRING: the launched round applies damage to the enemy on armed impact', () => {
    const sink = makeDamageSink(combatants);
    cannon = new TankCannonProjectileSystem(
      scene,
      sink.explosionEffectsPool as any,
      sink as any,
      8,
    );

    // Terrain that is far below the muzzle until the shell has cleared the
    // 20 m arming distance, then rises to meet the shell right at the enemy's
    // forward distance so it detonates armed, on the enemy.
    const enemyForward = barrelTip.distanceTo(enemy.position);
    const terrainHeightAt = (x: number, z: number): number => {
      const dx = x - barrelTip.x;
      const dz = z - barrelTip.z;
      const traveled = Math.hypot(dx, dz);
      // Force an impact once the shell reaches (and passes) the enemy's range.
      return traveled >= enemyForward ? barrelTip.y + 1 : -10_000;
    };

    wireNpcTankGunnerForTest({ ai, vehicleManager, cannon, terrainHeightAt });

    const playerPos = new THREE.Vector3(0, 0, 10_000);
    // Run long enough to fire and let the round travel to the enemy + detonate.
    for (let i = 0; i < 30; i++) {
      ai.beginFrame();
      ai.updateAI(gunner, 1 / 60, playerPos, combatants);
    }

    // The enemy took blast damage routed through the real damage handler...
    expect(enemy.health).toBeLessThan(100);
    // ...and the explosion VFX fired exactly where the shell landed.
    expect(sink.explosionEffectsPool.spawn).toHaveBeenCalled();
  });

  it('does not fire for a non-gunner crew seat (driver rides, does not shoot)', () => {
    const sink = makeDamageSink(combatants);
    cannon = new TankCannonProjectileSystem(
      scene,
      sink.explosionEffectsPool as any,
      sink as any,
      8,
    );

    // Move the gunner out and seat a driver instead.
    tank.exitVehicle(gunner.id);
    const driver = createTestCombatant({
      id: 'us_tank_driver_1',
      faction: Faction.US,
      state: CombatantState.IN_VEHICLE,
      position: barrelTip.clone(),
      skillProfile: gunnerSkill() as any,
      lastShotTime: -1_000_000,
    });
    combatants.set(driver.id, driver);
    tank.enterVehicle(driver.id, 'pilot');

    wireNpcTankGunnerForTest({ ai, vehicleManager, cannon, terrainHeightAt: neverImpactGround });

    const playerPos = new THREE.Vector3(0, 0, 10_000);
    for (let i = 0; i < 10; i++) {
      ai.beginFrame();
      ai.updateAI(driver, 1 / 60, playerPos, combatants);
    }

    // The context resolver returns null for a non-gunner seat → no fire.
    expect(cannon.getActiveCount()).toBe(0);
  });
});
