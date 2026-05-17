import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { M2HBEmplacementSystem, M2HB_STATS } from './M2HBEmplacement';
import { M2HBWeapon } from './M2HBWeapon';
import {
  spawnScenarioM2HBEmplacements,
  M2HB_SCENARIO_SPAWNS,
  createM2HBEmplacement,
} from './M2HBEmplacementSpawn';
import { Emplacement } from '../../vehicle/Emplacement';
import { VehicleManager } from '../../vehicle/VehicleManager';
import { Faction } from '../types';
import type { EmplacementPlayerAdapter } from '../../vehicle/EmplacementPlayerAdapter';

vi.mock('../../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../effects/TracerPool', () => ({
  TracerPool: class {
    public spawn = vi.fn();
    public update = vi.fn();
    public dispose = vi.fn();
  },
}));

// ────────────────────────── M2HBWeapon behavior ──────────────────────────

describe('M2HBWeapon', () => {
  it('starts with a full 250-round box (matching M2HB belt convention)', () => {
    const w = new M2HBWeapon();
    expect(w.getAmmo()).toBe(M2HB_STATS.ammoBoxRounds);
    expect(w.ammoMax).toBe(M2HB_STATS.ammoBoxRounds);
    expect(w.isEmpty()).toBe(false);
  });

  it('cycles only one round per cyclic-RPM interval no matter how often tryFire is called', () => {
    const w = new M2HBWeapon();
    expect(w.tryFire()).toBe(true);
    // Hammering tryFire in the same frame should not cycle more rounds —
    // cyclic-RPM cooldown gates the cadence.
    expect(w.tryFire()).toBe(false);
    expect(w.tryFire()).toBe(false);
    // After enough time to clear one round interval (~104 ms at 575 RPM),
    // the next call cycles a round.
    w.update(60 / M2HB_STATS.rpm);
    expect(w.tryFire()).toBe(true);
  });

  it('refuses to cycle when the box is empty', () => {
    const w = new M2HBWeapon(2);
    expect(w.tryFire()).toBe(true);
    w.update(60 / M2HB_STATS.rpm);
    expect(w.tryFire()).toBe(true);
    w.update(60 / M2HB_STATS.rpm);
    expect(w.tryFire()).toBe(false); // empty
    expect(w.isEmpty()).toBe(true);
  });

  it('refills the box on reload (the dismount path)', () => {
    const w = new M2HBWeapon(3);
    w.tryFire(); w.update(1); w.tryFire(); w.update(1); w.tryFire(); w.update(1);
    expect(w.isEmpty()).toBe(true);
    w.reload();
    expect(w.isEmpty()).toBe(false);
    expect(w.getAmmo()).toBe(3);
  });

  it('flags every fifth round as a tracer (matches the M2HB belt loadout)', () => {
    const w = new M2HBWeapon();
    const tracerHits: boolean[] = [];
    for (let i = 0; i < M2HB_STATS.tracerEveryNth * 3; i++) {
      w.tryFire();
      tracerHits.push(w.consumeTracerFlag());
      w.update(60 / M2HB_STATS.rpm);
    }
    // Three tracer rounds across 15 cycled rounds.
    expect(tracerHits.filter(Boolean)).toHaveLength(3);
    // First tracer at index 4 (the 5th round), then 9, then 14.
    expect(tracerHits.indexOf(true)).toBe(M2HB_STATS.tracerEveryNth - 1);
  });

  it('applies recoil kick on fire and decays it back toward zero over time', () => {
    const w = new M2HBWeapon();
    expect(w.getRecoilOffsetM()).toBe(0);
    w.tryFire();
    expect(w.getRecoilOffsetM()).toBeGreaterThan(0);
    // Several seconds later the recoil should have decayed nearly to zero.
    for (let i = 0; i < 20; i++) w.update(0.1);
    expect(w.getRecoilOffsetM()).toBeLessThan(0.001);
  });

  it('gates audio playback so 575-RPM bursts do not stack samples', () => {
    const w = new M2HBWeapon();
    w.tryFire();
    expect(w.consumeAudioGate()).toBe(true);
    // A second consume inside the audio interval is blocked.
    expect(w.consumeAudioGate()).toBe(false);
    // After the gate expires, the next consume opens again.
    w.update(M2HB_STATS.audioMinIntervalSec + 0.01);
    expect(w.consumeAudioGate()).toBe(true);
  });
});

// ───────────────────────── M2HBEmplacementSystem ─────────────────────────

function makeMockCombatantSystem(opts: { hit?: boolean } = {}) {
  const point = new THREE.Vector3(5, 1, -10);
  const impactEffectsPool = { spawn: vi.fn() };
  return {
    handlePlayerShot: vi.fn().mockReturnValue({
      hit: opts.hit === true,
      point,
      killed: false,
      headshot: false,
      damageDealt: opts.hit === true ? M2HB_STATS.damagePerRound : 0,
    }),
    impactEffectsPool,
  } as any;
}

function makeMockAudio() {
  return { play: vi.fn() } as any;
}

function makeEmplacementForSystem(scene: THREE.Scene, vehicleId = 'm2hb_test_1') {
  const tripodRoot = new THREE.Group();
  tripodRoot.position.set(0, 0, 0);
  scene.add(tripodRoot);
  const yawNode = new THREE.Object3D();
  tripodRoot.add(yawNode);
  const pitchNode = new THREE.Object3D();
  yawNode.add(pitchNode);
  const emplacement = new Emplacement(vehicleId, tripodRoot, Faction.US, {
    yawNode,
    pitchNode,
  });
  return { emplacement, pitchNode };
}

function makeMockPlayerAdapter(vehicleId: string, opts: { active?: boolean; fire?: boolean } = {}) {
  let active = opts.active ?? true;
  return {
    getActiveEmplacementId: vi.fn(() => (active ? vehicleId : null)),
    consumeFireRequest: vi.fn(() => opts.fire === true),
    setActive(v: boolean) { active = v; },
  } as unknown as EmplacementPlayerAdapter;
}

describe('M2HBEmplacementSystem', () => {
  let scene: THREE.Scene;
  let system: M2HBEmplacementSystem;

  beforeEach(() => {
    scene = new THREE.Scene();
    system = new M2HBEmplacementSystem(scene);
  });

  it('registers and looks up bindings by vehicleId', () => {
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_a');
    const weapon = new M2HBWeapon();
    system.registerBinding({ vehicleId: 'emp_a', emplacement, weapon, pitchNode });
    expect(system.getBindingCount()).toBe(1);
    expect(system.getWeapon('emp_a')).toBe(weapon);
    expect(system.getWeapon('missing')).toBeNull();
  });

  it('exposes an NPC-fire entry point that bypasses the player adapter', () => {
    const cs = makeMockCombatantSystem({ hit: true });
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_npc');
    const weapon = new M2HBWeapon();
    system.setCombatantSystem(cs);
    system.registerBinding({ vehicleId: 'emp_npc', emplacement, weapon, pitchNode });

    const fired = system.tryFire('emp_npc', new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));

    expect(fired).toBe(true);
    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
    // Damage callback returns the M2HB per-round damage.
    const dmgFn = cs.handlePlayerShot.mock.calls[0][1];
    expect(dmgFn()).toBe(M2HB_STATS.damagePerRound);
  });

  it('routes a player fire-request from the bound adapter into a combatant raycast', () => {
    const cs = makeMockCombatantSystem({ hit: true });
    const audio = makeMockAudio();
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_player');
    const weapon = new M2HBWeapon();
    const adapter = makeMockPlayerAdapter('emp_player', { fire: true });
    system.setCombatantSystem(cs);
    system.setAudioManager(audio);
    system.registerBinding({ vehicleId: 'emp_player', emplacement, weapon, pitchNode });
    system.attachPlayerAdapter('emp_player', adapter);

    system.update(1 / 60);

    expect(cs.handlePlayerShot).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith(M2HB_STATS.audioCue, expect.anything(), expect.any(Number));
    expect(cs.impactEffectsPool.spawn).toHaveBeenCalled();
  });

  it('does not fire when the player adapter says no emplacement is active', () => {
    const cs = makeMockCombatantSystem({ hit: true });
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_idle');
    const weapon = new M2HBWeapon();
    const adapter = makeMockPlayerAdapter('emp_idle', { active: false, fire: true });
    system.setCombatantSystem(cs);
    system.registerBinding({ vehicleId: 'emp_idle', emplacement, weapon, pitchNode });
    system.attachPlayerAdapter('emp_idle', adapter);

    system.update(1 / 60);

    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });

  it('refills the box when the gunner seat clears (reload on dismount)', () => {
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_reload');
    const weapon = new M2HBWeapon(4);
    system.registerBinding({ vehicleId: 'emp_reload', emplacement, weapon, pitchNode });

    // Mount, deplete the box.
    emplacement.enterVehicle('player', 'gunner');
    system.update(1 / 60);
    while (!weapon.isEmpty()) {
      weapon.tryFire();
      weapon.update(1);
    }
    expect(weapon.isEmpty()).toBe(true);

    // Dismount: the system observes the seat clearing and reloads.
    emplacement.exitVehicle('player');
    system.update(1 / 60);

    expect(weapon.isEmpty()).toBe(false);
    expect(weapon.getAmmo()).toBe(4);
  });

  it('drives the pitch-rig recoil offset from the weapon state', () => {
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_recoil');
    const weapon = new M2HBWeapon();
    system.registerBinding({ vehicleId: 'emp_recoil', emplacement, weapon, pitchNode });

    // Fire one round directly on the weapon; the system's update will
    // copy the recoil offset into the pitch rig's local position.z.
    weapon.tryFire();
    expect(pitchNode.position.z).toBe(0); // not yet visited by update
    system.update(1 / 60);
    expect(pitchNode.position.z).toBeLessThan(0); // pulled toward -Z by recoil
  });

  it('does not double-fire when no fire is requested (idle frames are cheap)', () => {
    const cs = makeMockCombatantSystem();
    const { emplacement, pitchNode } = makeEmplacementForSystem(scene, 'emp_quiet');
    const weapon = new M2HBWeapon();
    const adapter = makeMockPlayerAdapter('emp_quiet', { fire: false });
    system.setCombatantSystem(cs);
    system.registerBinding({ vehicleId: 'emp_quiet', emplacement, weapon, pitchNode });
    system.attachPlayerAdapter('emp_quiet', adapter);

    for (let i = 0; i < 10; i++) system.update(1 / 60);
    expect(cs.handlePlayerShot).not.toHaveBeenCalled();
  });
});

// ───────────────────────── Scenario spawn ─────────────────────────

describe('createM2HBEmplacement + spawnScenarioM2HBEmplacements', () => {
  it('adds the tripod mesh to the scene, registers an emplacement vehicle, and binds the weapon', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    const { emplacement, weapon, root } = createM2HBEmplacement(scene, vm, sys, {
      vehicleId: 'm2hb_test',
      position: new THREE.Vector3(10, 0, 20),
      faction: Faction.US,
    });

    expect(scene.children).toContain(root);
    expect(emplacement.category).toBe('emplacement');
    expect(emplacement.faction).toBe(Faction.US);
    expect(vm.getVehicle('m2hb_test')).toBe(emplacement);
    expect(sys.getWeapon('m2hb_test')).toBe(weapon);
  });

  it('scenario spawn table covers the cycle-VEKHIKL-2 spawn points (OF US base, A Shau NVA bunker)', () => {
    // Open Frontier US-side emplacement is US-faction; A Shau NVA-side
    // is NVA-faction. We pin the factions (gameplay-meaningful) without
    // asserting the exact world coordinates.
    expect(M2HB_SCENARIO_SPAWNS.open_frontier.faction).toBe(Faction.US);
    expect(M2HB_SCENARIO_SPAWNS.a_shau_valley.faction).toBe(Faction.NVA);
    // Distinct ids so VehicleManager can register both at once.
    expect(M2HB_SCENARIO_SPAWNS.open_frontier.vehicleId)
      .not.toBe(M2HB_SCENARIO_SPAWNS.a_shau_valley.vehicleId);
  });

  it('spawnScenarioM2HBEmplacements registers both modes when both are requested', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    const spawned = spawnScenarioM2HBEmplacements({
      modes: ['open_frontier', 'a_shau_valley'],
      scene,
      vehicleManager: vm,
      m2hbSystem: sys,
    });

    expect(spawned).toHaveLength(2);
    expect(vm.getVehiclesByCategory('emplacement')).toHaveLength(2);
    expect(sys.getBindingCount()).toBe(2);
  });

  it('honours an optional resolvePosition (e.g. a terrain-snap callback)', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    const snapped = new THREE.Vector3(100, 200, 300);
    spawnScenarioM2HBEmplacements({
      modes: ['open_frontier'],
      scene,
      vehicleManager: vm,
      m2hbSystem: sys,
      resolvePosition: () => snapped,
    });

    const emp = vm.getVehiclesByCategory('emplacement')[0];
    expect(emp.getPosition().toArray()).toEqual(snapped.toArray());
  });
});

// ───────────────────────── VehicleManager surface ─────────────────────────

describe('VehicleManager.spawnScenarioM2HBEmplacements + emplacement queries', () => {
  it('registers M2HB emplacements through VehicleManager.spawnScenarioM2HBEmplacements', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    const ids = vm.spawnScenarioM2HBEmplacements({
      scene,
      m2hbSystem: sys,
      modes: ['open_frontier', 'a_shau_valley'],
    });

    expect(ids).toHaveLength(2);
    for (const id of ids) {
      expect(vm.getVehicle(id)?.category).toBe('emplacement');
    }
  });

  it('answers getEmplacementByOccupant only when the seated vehicle is an emplacement', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    createM2HBEmplacement(scene, vm, sys, {
      vehicleId: 'emp_a',
      position: new THREE.Vector3(),
      faction: Faction.US,
    });
    const emp = vm.getVehicle('emp_a')!;
    emp.enterVehicle('player', 'gunner');

    expect(vm.getEmplacementByOccupant('player')).toBe(emp);
    expect(vm.getEmplacementByOccupant('someone_else')).toBeNull();
  });

  it('lists only free, in-radius, friendly emplacements for NPC scoring', () => {
    const scene = new THREE.Scene();
    const vm = new VehicleManager();
    const sys = new M2HBEmplacementSystem(scene);

    createM2HBEmplacement(scene, vm, sys, {
      vehicleId: 'emp_us_near',
      position: new THREE.Vector3(5, 0, 0),
      faction: Faction.US,
    });
    createM2HBEmplacement(scene, vm, sys, {
      vehicleId: 'emp_us_far',
      position: new THREE.Vector3(500, 0, 0),
      faction: Faction.US,
    });
    createM2HBEmplacement(scene, vm, sys, {
      vehicleId: 'emp_nva_near',
      position: new THREE.Vector3(-5, 0, 0),
      faction: Faction.NVA,
    });

    const center = new THREE.Vector3(0, 0, 0);
    const found = vm.getFreeEmplacementsByFaction(Faction.US, center, 50);
    expect(found.map(v => v.vehicleId)).toEqual(['emp_us_near']);

    // Occupy the only near US emplacement and re-query.
    vm.getVehicle('emp_us_near')!.enterVehicle('npc_1', 'gunner');
    expect(vm.getFreeEmplacementsByFaction(Faction.US, center, 50)).toHaveLength(0);
  });
});
