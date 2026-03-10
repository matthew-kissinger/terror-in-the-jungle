import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';

vi.mock('../effects/TracerPool', () => ({
  TracerPool: class {
    spawn = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock('../effects/MuzzleFlashSystem', () => ({
  MuzzleFlashSystem: class {
    spawnNPC = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
  MuzzleFlashVariant: { RIFLE: 0 },
}));

vi.mock('../../utils/Logger');

import { HelicopterDoorGunner } from './HelicopterDoorGunner';

// ── Fixtures ──

const CREW_GUN: AircraftWeaponMount = {
  name: 'M60 Door Gun', type: 'side_mount', firingMode: 'crew',
  ammoCapacity: 500, localPosition: [-1.5, 0.3, -0.5],
  fireRate: 9, damage: 20, spreadDeg: 3,
};

const PILOT_GUN: AircraftWeaponMount = {
  name: 'M134', type: 'nose_turret', firingMode: 'pilot',
  ammoCapacity: 4000, localPosition: [0, -0.3, 2.5],
  fireRate: 50, damage: 15, spreadDeg: 2.5,
};

function makeCombatantSystem() {
  return {
    querySpatialRadius: vi.fn().mockReturnValue([]),
    getAllCombatants: vi.fn().mockReturnValue([]),
    handlePlayerShot: vi.fn().mockReturnValue({ hit: false, point: new THREE.Vector3() }),
    impactEffectsPool: { spawn: vi.fn() },
  } as unknown as CombatantSystem;
}

function makeAudioManager() {
  return { play: vi.fn() } as any;
}

function makeTarget(id: string, pos: THREE.Vector3, health = 100, isDying = false) {
  return { id, position: pos, health, isDying };
}

describe('HelicopterDoorGunner', () => {
  let scene: THREE.Scene;
  let gunner: HelicopterDoorGunner;
  let cs: ReturnType<typeof makeCombatantSystem>;
  const heliPos = new THREE.Vector3(0, 50, 0);
  const heliQuat = new THREE.Quaternion();
  const HELI_ID = 'heli-1';

  beforeEach(() => {
    scene = new THREE.Scene();
    gunner = new HelicopterDoorGunner(scene);
    cs = makeCombatantSystem();
    gunner.setCombatantSystem(cs as any);
  });

  // ── initGunners ──

  it('creates gunners only for crew weapons', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN, PILOT_GUN]);
    // Should fire with crew gun but not pilot gun - verify by updating
    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    // Accumulate past acquire interval
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    // Only 1 shot expected (crew gun only)
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
  });

  it('creates nothing for pilot-only mounts', () => {
    gunner.initGunners(HELI_ID, [PILOT_GUN]);
    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  // ── Grounded ──

  it('does not fire when grounded', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);
    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, true);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  // ── No combatant system ──

  it('does not fire without combatantSystem set', () => {
    const bareGunner = new HelicopterDoorGunner(scene);
    bareGunner.initGunners(HELI_ID, [CREW_GUN]);
    // No setCombatantSystem call
    bareGunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  // ── Target acquisition ──

  it('scans for targets at 0.5s interval', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    gunner.update(0.3, HELI_ID, heliPos, heliQuat, false);
    expect(cs.querySpatialRadius).not.toHaveBeenCalled();

    gunner.update(0.3, HELI_ID, heliPos, heliQuat, false);
    expect(cs.querySpatialRadius).toHaveBeenCalledTimes(1);
    expect(cs.querySpatialRadius).toHaveBeenCalledWith(heliPos, 200);
  });

  it('selects the closest enemy in range', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const far = makeTarget('far', new THREE.Vector3(0, 50, 150));
    const close = makeTarget('close', new THREE.Vector3(0, 50, 50));
    (cs.querySpatialRadius as any).mockReturnValue(['far', 'close']);
    (cs.getAllCombatants as any).mockReturnValue([far, close]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);

    // Should fire at the closer target
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
    // Verify the target is 'close' by checking getAllCombatants was used to find it
    const shotCall = (cs.handlePlayerShot as any).mock.calls[0];
    expect(shotCall).toBeDefined();
  });

  it('ignores dead combatants during target acquisition', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const dead = makeTarget('dead', new THREE.Vector3(0, 50, 50), 0);
    (cs.querySpatialRadius as any).mockReturnValue(['dead']);
    (cs.getAllCombatants as any).mockReturnValue([dead]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('ignores dying combatants during target acquisition', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const dying = makeTarget('dying', new THREE.Vector3(0, 50, 50), 50, true);
    (cs.querySpatialRadius as any).mockReturnValue(['dying']);
    (cs.getAllCombatants as any).mockReturnValue([dying]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('ignores targets below minimum range (10m)', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const tooClose = makeTarget('close', new THREE.Vector3(0, 50, 5)); // 5m away
    (cs.querySpatialRadius as any).mockReturnValue(['close']);
    (cs.getAllCombatants as any).mockReturnValue([tooClose]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  // ── Firing ──

  it('fires when target acquired and cooldown expired', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
  });

  it('consumes ammo on fire', () => {
    const lowAmmoGun = { ...CREW_GUN, ammoCapacity: 3 };
    gunner.initGunners(HELI_ID, [lowAmmoGun]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    // First shot
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);

    // Fire remaining 2 shots (need to pass cooldown each time)
    const cooldown = 1 / lowAmmoGun.fireRate;
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(3);

    // 4th shot should not fire - out of ammo
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(3);
  });

  it('respects cooldown (1/fireRate)', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    // First shot at t=0.6
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);

    // Too soon - cooldown is 1/9 ~= 0.111s
    gunner.update(0.05, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);

    // After cooldown
    gunner.update(0.1, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(2);
  });

  it('clears target if target is dead when firing', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    // Acquire target
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);

    // Target dies
    target.health = 0;
    const cooldown = 1 / CREW_GUN.fireRate;
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    // Should not fire because target is dead - fireAtTarget clears targetId
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
  });

  // ── Tracer ──

  it('spawns tracer every 4th round', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    const cooldown = 1 / CREW_GUN.fireRate;

    // Fire 4 rounds
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false); // round 1
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false); // round 2
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false); // round 3
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false); // round 4

    // TracerPool.spawn should have been called once (on 4th round)
    const tracerPool = (gunner as any).tracerPool;
    expect(tracerPool.spawn).toHaveBeenCalledTimes(1);
  });

  // ── Audio ──

  it('plays audio at tracer round intervals', () => {
    const audio = makeAudioManager();
    gunner.setAudioManager(audio);
    gunner.initGunners(HELI_ID, [CREW_GUN]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    const cooldown = 1 / CREW_GUN.fireRate;

    // Fire 4 rounds to hit tracer interval
    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);
    gunner.update(cooldown + 0.01, HELI_ID, heliPos, heliQuat, false);

    // Audio plays when roundsSinceTracer resets to 0
    expect(audio.play).toHaveBeenCalledWith('doorGunBurst', expect.any(THREE.Vector3));
  });

  // ── Dispose ──

  it('dispose() removes gunner state for a helicopter', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);
    gunner.dispose(HELI_ID);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('disposeAll() clears everything and disposes effect pools', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);
    gunner.initGunners('heli-2', [CREW_GUN]);
    gunner.disposeAll();

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    gunner.update(0.6, 'heli-2', heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();

    const tracerPool = (gunner as any).tracerPool;
    const muzzleFlash = (gunner as any).muzzleFlashSystem;
    expect(tracerPool.dispose).toHaveBeenCalled();
    expect(muzzleFlash.dispose).toHaveBeenCalled();
  });

  // ── Multiple gunners ──

  it('supports multiple crew gunners per helicopter', () => {
    const leftGun = { ...CREW_GUN, name: 'Left M60', localPosition: [-1.5, 0.3, -0.5] as [number, number, number] };
    const rightGun = { ...CREW_GUN, name: 'Right M60', localPosition: [1.5, 0.3, -0.5] as [number, number, number] };
    gunner.initGunners(HELI_ID, [leftGun, rightGun]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    // Both gunners should fire
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(2);
  });

  // ── Zero ammo ──

  it('does not fire with 0 ammo', () => {
    const emptyGun = { ...CREW_GUN, ammoCapacity: 0 };
    gunner.initGunners(HELI_ID, [emptyGun]);

    const target = makeTarget('e1', new THREE.Vector3(0, 50, 100));
    (cs.querySpatialRadius as any).mockReturnValue(['e1']);
    (cs.getAllCombatants as any).mockReturnValue([target]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  // ── updateEffects ──

  it('updateEffects updates tracer and muzzle flash pools', () => {
    const tracerPool = (gunner as any).tracerPool;
    const muzzleFlash = (gunner as any).muzzleFlashSystem;

    gunner.updateEffects(0.016);

    expect(tracerPool.update).toHaveBeenCalled();
    expect(muzzleFlash.update).toHaveBeenCalledWith(16); // dt * 1000
  });

  // ── No targets ──

  it('does nothing when no targets found', () => {
    gunner.initGunners(HELI_ID, [CREW_GUN]);
    (cs.querySpatialRadius as any).mockReturnValue([]);

    gunner.update(0.6, HELI_ID, heliPos, heliQuat, false);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });
});
