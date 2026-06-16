// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterWeaponSystem, computeRocketCueDrop } from './HelicopterWeaponSystem';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';
import { Faction } from '../combat/types';

// Mock effect systems to avoid WebGL in tests
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
    spawnPlayer = vi.fn();
    update = vi.fn();
    dispose = vi.fn();
  },
  MuzzleFlashVariant: { RIFLE: 0, SHOTGUN: 1, SMG: 2, PISTOL: 3 },
}));

vi.mock('../../utils/Logger');

const HELI_ID = 'heli_test';

const MINIGUN: AircraftWeaponMount = {
  name: 'M134 Minigun',
  type: 'nose_turret',
  firingMode: 'pilot',
  ammoCapacity: 4000,
  localPosition: [0, -0.3, 2.5],
  fireRate: 50,
  damage: 15,
  spreadDeg: 2.5,
  tracerInterval: 3,
};

const ROCKET: AircraftWeaponMount = {
  name: 'Rocket Pod',
  type: 'rocket_pod',
  firingMode: 'pilot',
  ammoCapacity: 14,
  localPosition: [-1.2, -0.2, 1.0],
  fireRate: 3.3,
  damage: 150,
  damageRadius: 8,
  projectileSpeed: 150,
};

const CREW_GUN: AircraftWeaponMount = {
  name: 'M60 Door Gun',
  type: 'side_mount',
  firingMode: 'crew',
  ammoCapacity: 500,
  localPosition: [-1.5, 0.3, -0.5],
  fireRate: 9,
  damage: 20,
  spreadDeg: 3,
};

function makeCombatantSystem() {
  return {
    handlePlayerShot: vi.fn().mockReturnValue({ hit: false, point: new THREE.Vector3() }),
    applyExplosionDamage: vi.fn(),
    impactEffectsPool: { spawn: vi.fn() },
    explosionEffectsPool: { spawn: vi.fn() },
  } as unknown as CombatantSystem;
}

function makeGrenadeSystem() {
  return {
    spawnProjectile: vi.fn(),
  } as unknown as GrenadeSystem;
}

function makeAudioManager() {
  return {
    play: vi.fn(),
    playWeaponSwitchSound: vi.fn(),
    getListener: vi.fn(),
  } as unknown as IAudioManager;
}

function makeHUDSystem() {
  return {
    showHitMarker: vi.fn(),
    addKill: vi.fn(),
    addKillToFeed: vi.fn(),
    setHelicopterWeaponStatus: vi.fn(),
    showMessage: vi.fn(),
  } as unknown as IHUDSystem;
}

describe('HelicopterWeaponSystem', () => {
  let ws: HelicopterWeaponSystem;
  let scene: THREE.Scene;
  let cs: ReturnType<typeof makeCombatantSystem>;
  let gs: ReturnType<typeof makeGrenadeSystem>;
  let audio: ReturnType<typeof makeAudioManager>;
  let hud: ReturnType<typeof makeHUDSystem>;

  const pos = new THREE.Vector3(100, 50, 200);
  const quat = new THREE.Quaternion(); // identity = facing +Z

  beforeEach(() => {
    scene = new THREE.Scene();
    ws = new HelicopterWeaponSystem(scene);
    cs = makeCombatantSystem();
    gs = makeGrenadeSystem();
    audio = makeAudioManager();
    hud = makeHUDSystem();

    ws.setCombatantSystem(cs as unknown as CombatantSystem);
    ws.setGrenadeSystem(gs as unknown as GrenadeSystem);
    ws.setAudioManager(audio as unknown as IAudioManager);
    ws.setHUDSystem(hud as unknown as IHUDSystem);
  });

  describe('initWeapons', () => {
    it('should only register pilot weapons', () => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET, CREW_GUN]);
      expect(ws.getWeaponCount(HELI_ID)).toBe(2); // crew gun excluded
    });

    it('should set ammo to max capacity', () => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
      const status = ws.getWeaponStatus(HELI_ID);
      expect(status).not.toBeNull();
      expect(status!.ammo).toBe(4000);
      expect(status!.maxAmmo).toBe(4000);
      expect(status!.name).toBe('M134 Minigun');
    });

    it('should return null status for unknown helicopter', () => {
      expect(ws.getWeaponStatus('nonexistent')).toBeNull();
    });

    it('should not create state for no pilot weapons', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      expect(ws.getWeaponStatus(HELI_ID)).toBeNull();
      expect(ws.getWeaponCount(HELI_ID)).toBe(0);
    });
  });

  describe('firing hitscan (minigun)', () => {
    beforeEach(() => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
    });

    it('should consume ammo when firing', () => {
      ws.startFiring(HELI_ID);
      // dt = 0.1 at 50 rps = 5 rounds
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      const status = ws.getWeaponStatus(HELI_ID)!;
      expect(status.ammo).toBeLessThan(4000);
      expect(status.ammo).toBeGreaterThan(3990); // should fire ~5 rounds
    });

    it('should not fire when not started', () => {
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });

    it('should stop firing on stopFiring', () => {
      ws.startFiring(HELI_ID);
      ws.stopFiring(HELI_ID);
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });

    it('should call handlePlayerShot with correct damage', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.02, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).toHaveBeenCalled();

      // Check the damage calculator returns correct damage
      const damageCalc = (cs.handlePlayerShot as any).mock.calls[0][1];
      expect(damageCalc(100, false)).toBe(15);
    });

    it('routes hitscan fire through a normalized shot ray without mutating helicopter pose inputs', () => {
      ws.dispose(HELI_ID);
      const directGun = { ...MINIGUN, spreadDeg: 0 };
      ws.initWeapons(HELI_ID, [directGun], Faction.US);
      ws.startFiring(HELI_ID);

      const positionBefore = pos.clone();
      const quaternionBefore = quat.clone();
      ws.update(0.02, HELI_ID, pos, quat, false, false);

      expect(cs.handlePlayerShot).toHaveBeenCalled();
      const [ray, damage, weaponType, shooterFaction] = (cs.handlePlayerShot as any).mock.calls[0] as [
        THREE.Ray,
        (distance: number, isHeadshot: boolean) => number,
        string,
        Faction,
      ];
      const expectedOrigin = new THREE.Vector3(...directGun.localPosition)
        .applyQuaternion(quat)
        .add(pos);
      const expectedDirection = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
      expect(ray.origin.distanceTo(expectedOrigin)).toBeLessThan(0.000001);
      expect(ray.direction.length()).toBeCloseTo(1, 6);
      expect(ray.direction.angleTo(expectedDirection)).toBeLessThan(0.000001);
      expect(damage(50, false)).toBe(directGun.damage);
      expect(weaponType).toBe('helicopter_minigun');
      expect(shooterFaction).toBe(Faction.US);
      expect(pos.distanceTo(positionBefore)).toBe(0);
      expect(quat.dot(quaternionBefore)).toBeCloseTo(1, 6);
    });

    it('should show hit marker on hit', () => {
      (cs.handlePlayerShot as any).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(110, 45, 210),
        killed: false,
        headshot: false,
      });

      ws.startFiring(HELI_ID);
      ws.update(0.02, HELI_ID, pos, quat, false, false);
      expect(hud.showHitMarker).toHaveBeenCalledWith('hit');
    });

    it('should show kill marker and add kill on kill', () => {
      (cs.handlePlayerShot as any).mockReturnValue({
        hit: true,
        point: new THREE.Vector3(110, 45, 210),
        killed: true,
        headshot: false,
      });

      ws.startFiring(HELI_ID);
      ws.update(0.02, HELI_ID, pos, quat, false, false);
      expect(hud.showHitMarker).toHaveBeenCalledWith('kill');
      expect(hud.addKill).toHaveBeenCalled();
      expect(hud.addKillToFeed).toHaveBeenCalled();
    });

    it('should push weapon status to HUD each update', () => {
      ws.update(0.016, HELI_ID, pos, quat, false, false);
      expect(hud.setHelicopterWeaponStatus).toHaveBeenCalledWith('M134 Minigun', 4000);
    });

    it('should stop firing when ammo depleted', () => {
      // Use small ammo weapon for faster test
      ws.disposeAll();
      const smallGun: AircraftWeaponMount = {
        ...MINIGUN,
        ammoCapacity: 10,
      };
      ws.initWeapons(HELI_ID, [smallGun]);
      ws.setCombatantSystem(cs as unknown as CombatantSystem);
      ws.setHUDSystem(hud as unknown as IHUDSystem);

      ws.startFiring(HELI_ID);
      // Fire enough to drain 10 rounds
      for (let i = 0; i < 20; i++) {
        ws.update(0.1, HELI_ID, pos, quat, false, false);
      }

      // Should have fired exactly 10 rounds
      expect(cs.handlePlayerShot).toHaveBeenCalledTimes(10);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(0);
    });
  });

  describe('firing projectile (rockets)', () => {
    beforeEach(() => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
      ws.switchWeapon(HELI_ID, 1); // switch to rockets
    });

    it('should switch to rockets and report status', () => {
      const status = ws.getWeaponStatus(HELI_ID)!;
      expect(status.name).toBe('Rocket Pod');
      expect(status.ammo).toBe(14);
    });

    it('should fire rocket via grenadeSystem.spawnProjectile', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(gs.spawnProjectile).toHaveBeenCalledTimes(1);

      const [spawnPos, spawnVel, fuse] = (gs.spawnProjectile as any).mock.calls[0];
      expect(spawnPos).toBeInstanceOf(THREE.Vector3);
      expect(spawnVel).toBeInstanceOf(THREE.Vector3);
      expect(spawnVel.length()).toBeCloseTo(150, 0);
      expect(fuse).toBe(10.0);
    });

    it('should consume rocket ammo', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(13);
    });

    it('should respect cooldown between rockets', () => {
      ws.startFiring(HELI_ID);
      // At 3.3 rps, cooldown = ~0.303s. Two updates of 0.1s should only fire once.
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      expect(gs.spawnProjectile).toHaveBeenCalledTimes(1);
    });

    it('should play rocket audio', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(audio.play).toHaveBeenCalledWith('rocketLaunch', expect.any(THREE.Vector3));
    });
  });

  describe('weapon switching', () => {
    beforeEach(() => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
    });

    it('should switch active weapon', () => {
      ws.switchWeapon(HELI_ID, 1);
      expect(ws.getWeaponStatus(HELI_ID)!.name).toBe('Rocket Pod');
    });

    it('should ignore invalid weapon index', () => {
      ws.switchWeapon(HELI_ID, 5);
      expect(ws.getWeaponStatus(HELI_ID)!.name).toBe('M134 Minigun');
    });

    it('should stop firing on switch', () => {
      ws.startFiring(HELI_ID);
      ws.switchWeapon(HELI_ID, 1);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      // Should not fire because isFiring was reset
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
      expect(gs.spawnProjectile).not.toHaveBeenCalled();
    });

    it('should play weapon switch sound', () => {
      ws.switchWeapon(HELI_ID, 1);
      expect(audio.playWeaponSwitchSound).toHaveBeenCalled();
    });
  });

  describe('rearm', () => {
    beforeEach(() => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
    });

    it('should rearm minigun when grounded near helipad', () => {
      // Drain some ammo
      ws.startFiring(HELI_ID);
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      ws.stopFiring(HELI_ID);
      const ammoAfterFiring = ws.getWeaponStatus(HELI_ID)!.ammo;
      expect(ammoAfterFiring).toBeLessThan(4000);

      // Rearm for 1 second at 100 rps
      ws.update(1.0, HELI_ID, pos, quat, true, true);
      const ammoAfterRearm = ws.getWeaponStatus(HELI_ID)!.ammo;
      expect(ammoAfterRearm).toBeGreaterThan(ammoAfterFiring);
    });

    it('should not rearm when not grounded', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      ws.stopFiring(HELI_ID);
      const ammoAfterFiring = ws.getWeaponStatus(HELI_ID)!.ammo;

      ws.update(1.0, HELI_ID, pos, quat, false, true);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(ammoAfterFiring);
    });

    it('should not rearm when not near helipad', () => {
      ws.startFiring(HELI_ID);
      ws.update(0.1, HELI_ID, pos, quat, false, false);
      ws.stopFiring(HELI_ID);
      const ammoAfterFiring = ws.getWeaponStatus(HELI_ID)!.ammo;

      ws.update(1.0, HELI_ID, pos, quat, true, false);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(ammoAfterFiring);
    });

    it('should not exceed max capacity', () => {
      ws.update(100.0, HELI_ID, pos, quat, true, true);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(4000);
    });

    it('should rearm rockets at slower rate', () => {
      ws.switchWeapon(HELI_ID, 1);
      // Fire one rocket
      ws.startFiring(HELI_ID);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      ws.stopFiring(HELI_ID);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(13);

      // Rearm 1 second at 1 rocket/sec
      ws.update(1.0, HELI_ID, pos, quat, true, true);
      expect(ws.getWeaponStatus(HELI_ID)!.ammo).toBe(14);
    });
  });

  describe('crew-served door guns', () => {
    it('registers crew weapons so a manned door gun can fire', () => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET, CREW_GUN]);
      // Pilot weapon count is unchanged (crew guns are a separate channel)...
      expect(ws.getWeaponCount(HELI_ID)).toBe(2);
      // ...but the crew door gun is now tracked with ammo, not dropped.
      expect(ws.getCrewWeaponCount(HELI_ID)).toBe(1);
      expect(ws.getCrewAmmo(HELI_ID)).toBe(CREW_GUN.ammoCapacity);
    });

    it('stays inert while the door-gun seat is unmanned', () => {
      ws.initWeapons(HELI_ID, [MINIGUN, CREW_GUN]);
      // Airborne, trigger not pulled, seat unmanned: only the manned crew path
      // would fire, and it must not.
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });

    it('fires the door gun once the seat is manned and the heli is airborne', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setCrewManned(HELI_ID, true);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).toHaveBeenCalled();
      // Door gun should have drawn down its own ammo pool.
      expect(ws.getCrewAmmo(HELI_ID)).toBeLessThan(CREW_GUN.ammoCapacity);
    });

    it('holds fire when manned but still on the ground', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setCrewManned(HELI_ID, true);
      ws.update(0.5, HELI_ID, pos, quat, true, false); // grounded
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });
  });

  describe('player-crewed door gun (door-gun-seat)', () => {
    const aimDir = new THREE.Vector3(-1, 0, 0); // straight out the left door

    it('reports the door-gun belt status for the player gunner HUD', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      const status = ws.getPlayerDoorGunStatus(HELI_ID)!;
      expect(status.name).toBe('M60 Door Gun');
      expect(status.ammo).toBe(CREW_GUN.ammoCapacity);
      expect(status.maxAmmo).toBe(CREW_GUN.ammoCapacity);
    });

    it('returns null door-gun status for an aircraft with no door gun', () => {
      ws.initWeapons(HELI_ID, [MINIGUN]);
      expect(ws.getPlayerDoorGunStatus(HELI_ID)).toBeNull();
    });

    it('fires the door gun along the player aim direction while crewing', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setPlayerCrewing(HELI_ID, true);

      ws.firePlayerDoorGun(HELI_ID, pos, quat, aimDir, true, false, 0.5);

      expect(cs.handlePlayerShot).toHaveBeenCalled();
      expect(ws.getCrewAmmo(HELI_ID)).toBeLessThan(CREW_GUN.ammoCapacity);
      // The shot ray points along the supplied (left-door) aim, not the airframe nose.
      const ray = (cs.handlePlayerShot as any).mock.calls[0][0] as THREE.Ray;
      expect(ray.direction.x).toBeLessThan(-0.9);
    });

    it('does not fire the door gun when the trigger is released', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setPlayerCrewing(HELI_ID, true);
      ws.firePlayerDoorGun(HELI_ID, pos, quat, aimDir, false, false, 0.5);
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });

    it('holds the door gun on the ground even with the trigger held', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setPlayerCrewing(HELI_ID, true);
      ws.firePlayerDoorGun(HELI_ID, pos, quat, aimDir, true, true, 0.5); // grounded
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();
    });

    it('suspends the AI auto-fire path while the player crews the door gun', () => {
      ws.initWeapons(HELI_ID, [CREW_GUN]);
      ws.setCrewManned(HELI_ID, true);
      ws.setPlayerCrewing(HELI_ID, true);

      // The per-frame update would auto-fire a manned AI door gun, but the
      // player is crewing it — so the auto path must stay silent (no double-fire).
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).not.toHaveBeenCalled();

      // Once the player leaves, the AI auto-fire resumes.
      ws.setPlayerCrewing(HELI_ID, false);
      ws.update(0.5, HELI_ID, pos, quat, false, false);
      expect(cs.handlePlayerShot).toHaveBeenCalled();
    });
  });

  describe('friend-or-foe filtering', () => {
    it('shoots through the shared combatant fire path with the owning faction', () => {
      // OPFOR gunship: its guns must resolve hits as an OPFOR shooter so the
      // shared IFF filter spares OPFOR combatants.
      ws.initWeapons(HELI_ID, [MINIGUN], Faction.NVA);
      ws.startFiring(HELI_ID);
      ws.update(0.05, HELI_ID, pos, quat, false, false);

      expect(cs.handlePlayerShot).toHaveBeenCalled();
      const faction = (cs.handlePlayerShot as any).mock.calls[0][3];
      expect(faction).toBe(Faction.NVA);
    });

    it('defaults to the US faction for the player gunship', () => {
      ws.initWeapons(HELI_ID, [MINIGUN]);
      ws.startFiring(HELI_ID);
      ws.update(0.05, HELI_ID, pos, quat, false, false);

      const faction = (cs.handlePlayerShot as any).mock.calls[0][3];
      expect(faction).toBe(Faction.US);
    });
  });

  describe('dispose', () => {
    it('should remove helicopter state', () => {
      ws.initWeapons(HELI_ID, [MINIGUN]);
      ws.dispose(HELI_ID);
      expect(ws.getWeaponStatus(HELI_ID)).toBeNull();
    });

    it('should clear all states on disposeAll', () => {
      ws.initWeapons('heli_a', [MINIGUN]);
      ws.initWeapons('heli_b', [MINIGUN]);
      ws.disposeAll();
      expect(ws.getWeaponStatus('heli_a')).toBeNull();
      expect(ws.getWeaponStatus('heli_b')).toBeNull();
    });
  });

  // ── Attack-sight state (gunship-reticle-upgrade) ──
  describe('active-weapon kind + rocket ballistics (read-only)', () => {
    beforeEach(() => {
      ws.initWeapons(HELI_ID, [MINIGUN, ROCKET]);
    });

    it('reports the selected pilot weapon kind, switching with the active weapon', () => {
      // Index 0 = minigun (hitscan), index 1 = rocket pod (projectile).
      expect(ws.getActiveWeaponKind(HELI_ID)).toBe('gun');
      ws.switchWeapon(HELI_ID, 1);
      expect(ws.getActiveWeaponKind(HELI_ID)).toBe('rockets');
      ws.switchWeapon(HELI_ID, 0);
      expect(ws.getActiveWeaponKind(HELI_ID)).toBe('gun');
    });

    it('has no weapon kind for an aircraft with no pilot armament', () => {
      ws.initWeapons('unarmed', [CREW_GUN]);
      expect(ws.getActiveWeaponKind('unarmed')).toBeNull();
    });

    it('exposes rocket ballistics only while the rocket pod is selected', () => {
      // Gun selected: no rocket ballistics.
      expect(ws.getActiveRocketBallistics(HELI_ID)).toBeNull();

      ws.switchWeapon(HELI_ID, 1);
      const ballistics = ws.getActiveRocketBallistics(HELI_ID);
      expect(ballistics).not.toBeNull();
      // Muzzle speed is the SAME value the rocket fire path launches at.
      expect(ballistics!.muzzleSpeed).toBe(ROCKET.projectileSpeed);
      expect(ballistics!.ammo).toBe(ROCKET.ammoCapacity);
    });
  });

  describe('computeRocketCueDrop (CCIP-lite rocket-fall lead)', () => {
    const MUZZLE = 150;

    it('drops the cue below the boresight in level flight', () => {
      const drop = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 0, pitch: 0 });
      // Gravity bends a level shot down → the impact sits below the pipper.
      expect(drop).toBeGreaterThan(0);
    });

    it('converges the cue toward the pipper as the nose pitches down into a dive', () => {
      const level = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 40, pitch: 0 });
      const shallow = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 40, pitch: -0.3 });
      const steep = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 40, pitch: -0.8 });
      // The steeper the dive, the smaller the angular gap to the boresight.
      expect(shallow).toBeLessThan(level);
      expect(steep).toBeLessThan(shallow);
    });

    it('never returns a negative drop (gravity only ever pulls below the line of fire)', () => {
      const steepDive = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 60, pitch: -1.2 });
      expect(steepDive).toBeGreaterThanOrEqual(0);
    });

    it('forward airspeed flattens the lead (a faster shot falls less over the same range)', () => {
      const slow = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 0, pitch: 0 });
      const fast = computeRocketCueDrop({ muzzleSpeed: MUZZLE, airspeed: 60, pitch: 0 });
      expect(fast).toBeLessThan(slow);
    });
  });
});
