import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { HelicopterWeaponSystem } from './HelicopterWeaponSystem';
import type { AircraftWeaponMount } from './AircraftConfigs';
import type { CombatantSystem } from '../combat/CombatantSystem';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { IAudioManager, IHUDSystem } from '../../types/SystemInterfaces';

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
});
