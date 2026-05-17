import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  TankCannonProjectileSystem,
  TANK_CANNON_CONSTANTS,
  resolveTankAmmoDamage,
} from './TankCannonProjectile';
import type { ExplosionEffectsPool } from '../../effects/ExplosionEffectsPool';
import type { CombatantSystem } from '../CombatantSystem';
import { Combatant, CombatantState, Faction, isAlly } from '../types';

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ────────── Fixtures ──────────

function flatGround(): (x: number, z: number) => number {
  return () => 0;
}

function makeMockExplosionPool() {
  return {
    spawn: vi.fn(),
  } as unknown as ExplosionEffectsPool & { spawn: ReturnType<typeof vi.fn> };
}

function makeMockCombatant(args: {
  id: string;
  faction: Faction;
  position: THREE.Vector3;
  health?: number;
}): Combatant {
  return {
    id: args.id,
    faction: args.faction,
    position: args.position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: args.health ?? 100,
    maxHealth: 100,
    state: CombatantState.IDLE,
    weaponSpec: {} as any,
    gunCore: {} as any,
    skillProfile: {} as any,
    lastShotTime: 0,
    currentBurst: 0,
    burstCooldown: 0,
    reactionTimer: 0,
    suppressionLevel: 0,
    alertTimer: 0,
    isFullAuto: false,
    panicLevel: 0,
    lastHitTime: 0,
    consecutiveMisses: 0,
    wanderAngle: 0,
    timeToDirectionChange: 0,
    lastUpdateTime: 0,
    updatePriority: 0,
    simLane: 'high',
    renderLane: 'impostor',
    kills: 0,
    deaths: 0,
  } as Combatant;
}

function makeMockCombatantSystem(initial: Combatant[] = []) {
  const combatants = [...initial];
  // Minimal stand-in for `CombatantSystem.applyExplosionDamage` so the
  // projectile system can be exercised in isolation. Mirrors the
  // behaviour of the production shared handler at the level tested here:
  // skip dead + same-alliance combatants, apply radial-decay damage,
  // mark kills. Kill-feed / squad bookkeeping is the production
  // handler's job — out of scope for the projectile unit test.
  const applyExplosionDamage = vi.fn(
    (
      center: THREE.Vector3,
      radius: number,
      maxDamage: number,
      _attackerId?: string,
      _weaponType: string = 'grenade',
      shooterFaction?: Faction,
    ) => {
      for (const c of combatants) {
        if (!c) continue;
        if (c.state === CombatantState.DEAD) continue;
        if (shooterFaction !== undefined && isAlly(c.faction, shooterFaction)) continue;
        const dist = c.position.distanceTo(center);
        if (dist > radius) continue;
        const damage = maxDamage * (1 - dist / radius);
        if (damage <= 0) continue;
        c.health -= damage;
        if (c.health <= 0) {
          c.health = 0;
          c.state = CombatantState.DEAD;
          c.deaths = (c.deaths ?? 0) + 1;
        }
      }
    },
  );
  return {
    getAllCombatants: vi.fn(() => combatants),
    applyExplosionDamage,
    push(c: Combatant) { combatants.push(c); },
  } as unknown as CombatantSystem & {
    push: (c: Combatant) => void;
    applyExplosionDamage: typeof applyExplosionDamage;
  };
}

// ────────── Damage resolver ──────────

describe('resolveTankAmmoDamage', () => {
  it('returns a positive damage envelope for every supported ammo type (MVP AP for all)', () => {
    for (const ammo of ['AP', 'HEAT', 'HE'] as const) {
      const profile = resolveTankAmmoDamage(ammo);
      expect(profile.maxDamage).toBeGreaterThan(0);
      expect(profile.radius).toBeGreaterThan(0);
    }
  });
});

// ────────── TankCannonProjectileSystem ──────────

describe('TankCannonProjectileSystem', () => {
  let scene: THREE.Scene;
  let explosionPool: ReturnType<typeof makeMockExplosionPool>;
  let combatantSystem: ReturnType<typeof makeMockCombatantSystem>;
  let system: TankCannonProjectileSystem;

  beforeEach(() => {
    scene = new THREE.Scene();
    explosionPool = makeMockExplosionPool();
    combatantSystem = makeMockCombatantSystem();
    system = new TankCannonProjectileSystem(scene, explosionPool, combatantSystem, 4);
  });

  it('launch() assigns the muzzle velocity along the barrel direction', () => {
    const id = system.launch({
      origin: new THREE.Vector3(0, 5, 0),
      direction: new THREE.Vector3(0, 0, -1),
      muzzleSpeed: 400,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    const snap = system.getSnapshot(id);
    expect(snap).not.toBeNull();
    expect(snap!.velocity.z).toBeCloseTo(-400, 5);
    expect(snap!.velocity.x).toBeCloseTo(0, 5);
    expect(snap!.velocity.y).toBeCloseTo(0, 5);
  });

  it('gravity decreases the projectile vertical velocity each frame', () => {
    const id = system.launch({
      origin: new THREE.Vector3(0, 50, 0),
      direction: new THREE.Vector3(0, 0, -1),
      muzzleSpeed: 400,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    const v0 = system.getSnapshot(id)!.velocity.y;
    system.update(1 / 60, flatGround());
    const v1 = system.getSnapshot(id)!.velocity.y;
    system.update(1 / 60, flatGround());
    const v2 = system.getSnapshot(id)!.velocity.y;

    expect(v1).toBeLessThan(v0);
    expect(v2).toBeLessThan(v1);
    // After two 1/60 s steps the vertical velocity should be ≈ 2 * GRAVITY / 60.
    expect(v2).toBeCloseTo(TANK_CANNON_CONSTANTS.GRAVITY * (2 / 60), 4);
  });

  it('impact under the arming distance is a dud — no damage and no explosion', () => {
    const enemyClose = makeMockCombatant({
      id: 'nva_a',
      faction: Faction.NVA,
      position: new THREE.Vector3(0, 0, -5),
      health: 100,
    });
    combatantSystem.push(enemyClose);

    // Aim slightly downward so the round impacts the ground well inside the
    // 20 m arming distance; muzzle origin is 1 m above ground.
    system.launch({
      origin: new THREE.Vector3(0, 1, 0),
      direction: new THREE.Vector3(0, -1, 0),
      muzzleSpeed: 50,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    // Step until impact (round travels straight down ~1 m).
    for (let i = 0; i < 30; i++) system.update(1 / 60, flatGround());

    expect(system.getActiveCount()).toBe(0);
    expect(explosionPool.spawn).not.toHaveBeenCalled();
    expect(enemyClose.health).toBe(100);
  });

  it('impact past the arming distance applies damage and spawns an explosion', () => {
    // Origin 5 m up, flat aim: gravity brings the round to y=0 in
    // t = sqrt(10/9.8) ≈ 1.01 s; horizontal travel at 200 m/s ≈ 202 m.
    // Enemy at z = -120 is well inside the AP blast radius at landing.
    const enemy = makeMockCombatant({
      id: 'nva_b',
      faction: Faction.NVA,
      position: new THREE.Vector3(202, 0, 0),
      health: 100,
    });
    combatantSystem.push(enemy);

    system.launch({
      origin: new THREE.Vector3(0, 5, 0),
      direction: new THREE.Vector3(1, 0, 0),
      muzzleSpeed: 200,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    for (let i = 0; i < 240; i++) {
      system.update(1 / 60, flatGround());
      if (system.getActiveCount() === 0) break;
    }

    expect(system.getActiveCount()).toBe(0);
    expect(explosionPool.spawn).toHaveBeenCalledTimes(1);
    expect(enemy.health).toBeLessThan(100);
  });

  it('friendly-fire exclusion: same-faction combatants in radius take no damage', () => {
    const friendly = makeMockCombatant({
      id: 'us_friend',
      faction: Faction.US,
      position: new THREE.Vector3(202, 0, 0),
      health: 100,
    });
    const enemy = makeMockCombatant({
      id: 'nva_target',
      faction: Faction.NVA,
      position: new THREE.Vector3(204, 0, 0),
      health: 100,
    });
    combatantSystem.push(friendly);
    combatantSystem.push(enemy);

    system.launch({
      origin: new THREE.Vector3(0, 5, 0),
      direction: new THREE.Vector3(1, 0, 0),
      muzzleSpeed: 200,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    for (let i = 0; i < 240; i++) {
      system.update(1 / 60, flatGround());
      if (system.getActiveCount() === 0) break;
    }

    expect(explosionPool.spawn).toHaveBeenCalledTimes(1);
    // Allied US combatant untouched even though they're inside the blast.
    expect(friendly.health).toBe(100);
    // NVA enemy in the same radius does take damage.
    expect(enemy.health).toBeLessThan(100);
  });

  it('alliance-based friendly fire: ARVN allies of US shooter are also spared', () => {
    const arvn = makeMockCombatant({
      id: 'arvn_friend',
      faction: Faction.ARVN,
      position: new THREE.Vector3(202, 0, 0),
      health: 100,
    });
    combatantSystem.push(arvn);

    system.launch({
      origin: new THREE.Vector3(0, 5, 0),
      direction: new THREE.Vector3(1, 0, 0),
      muzzleSpeed: 200,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    for (let i = 0; i < 240; i++) {
      system.update(1 / 60, flatGround());
      if (system.getActiveCount() === 0) break;
    }

    expect(arvn.health).toBe(100);
  });

  it('pool exhaustion returns an empty id rather than allocating', () => {
    const launchArgs = {
      origin: new THREE.Vector3(0, 50, 0),
      direction: new THREE.Vector3(0, 0, -1),
      muzzleSpeed: 400,
      ammoType: 'AP' as const,
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    };
    for (let i = 0; i < 4; i++) {
      expect(system.launch(launchArgs)).not.toBe('');
    }
    // 5th shot with pool size 4 — should refuse rather than crash.
    expect(system.launch(launchArgs)).toBe('');
    expect(system.getActiveCount()).toBe(4);
  });

  it('self-destruct fuse retires orphan projectiles that never hit ground', () => {
    // Fire straight up forever; under flat ground = 0 the projectile briefly
    // dips below 0 only after gravity wins. With a high muzzle speed the
    // fuse is the watchdog that prevents endless flight.
    system.launch({
      origin: new THREE.Vector3(0, 5, 0),
      direction: new THREE.Vector3(0, 1, 0),
      muzzleSpeed: 400,
      ammoType: 'AP',
      shooterId: 'tank_1',
      shooterFaction: Faction.US,
    });

    expect(system.getActiveCount()).toBe(1);
    // Step well past MAX_FLIGHT_TIME_S.
    const steps = Math.ceil((TANK_CANNON_CONSTANTS.MAX_FLIGHT_TIME_S + 1) * 60);
    // Use a sentinel ground far below origin so the round does not impact first.
    const deepGround = () => -10_000;
    for (let i = 0; i < steps; i++) system.update(1 / 60, deepGround);
    expect(system.getActiveCount()).toBe(0);
  });

  it('dispose() removes meshes from the scene and prevents further launches', () => {
    const childrenBefore = scene.children.length;
    expect(childrenBefore).toBeGreaterThan(0);
    system.dispose();
    expect(scene.children.length).toBe(0);
    expect(
      system.launch({
        origin: new THREE.Vector3(),
        direction: new THREE.Vector3(0, 0, -1),
        muzzleSpeed: 400,
        ammoType: 'AP',
        shooterId: 'tank_1',
        shooterFaction: Faction.US,
      }),
    ).toBe('');
  });
});
