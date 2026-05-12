/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EntityInspectorPanel } from './EntityInspectorPanel';
import type { Combatant } from '../../systems/combat/types';
import type { IPlayerController } from '../../types/SystemInterfaces';
import type { IVehicle } from '../../systems/vehicle/IVehicle';

afterEach(() => { document.body.innerHTML = ''; });

function makeCombatant(id: string): Combatant {
  return {
    id,
    faction: 'US' as any,
    position: new THREE.Vector3(10, 20, 30),
    velocity: new THREE.Vector3(1, 0, 0),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 80,
    maxHealth: 100,
    state: 'engage' as any,
    weaponSpec: { name: 'M16' } as any,
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
    renderLane: 'culled',
    kills: 3,
    deaths: 0,
  };
}

function makePlayer(): IPlayerController {
  const pos = new THREE.Vector3(1, 2, 3);
  const vel = new THREE.Vector3(5, 0, 0);
  return {
    getPosition: (t?: THREE.Vector3) => (t ? t.copy(pos) : pos.clone()),
    getVelocity: (t?: THREE.Vector3) => (t ? t.copy(vel) : vel.clone()),
    isInHelicopter: () => false,
    isInFixedWing: () => false,
    getHelicopterId: () => null,
    getFixedWingId: () => null,
  } as unknown as IPlayerController;
}

describe('EntityInspectorPanel', () => {
  it('is hidden by default and shows after show()', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    expect(panel.isVisible()).toBe(false);

    const combatant = makeCombatant('c42');
    panel.setSources({
      combatants: { getAllCombatants: () => [combatant] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    panel.show({ kind: 'combatant', id: 'c42' });
    expect(panel.isVisible()).toBe(true);
    expect(panel.getTarget()).toEqual({ kind: 'combatant', id: 'c42' });
  });

  it('renders combatant fields in the body after show()', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    const combatant = makeCombatant('c9');
    panel.setSources({
      combatants: { getAllCombatants: () => [combatant] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    panel.show({ kind: 'combatant', id: 'c9' });
    const text = host.textContent ?? '';
    expect(text).toContain('c9');
    expect(text).toContain('health');
    expect(text).toContain('80');
  });

  it('shows (entity gone) when the combatant has despawned', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    panel.setSources({
      combatants: { getAllCombatants: () => [] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    panel.show({ kind: 'combatant', id: 'ghost' });
    expect(host.textContent).toContain('entity gone');
  });

  it('close() clears target and hides the panel', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    panel.setSources({
      combatants: { getAllCombatants: () => [makeCombatant('c1')] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    panel.show({ kind: 'combatant', id: 'c1' });
    expect(panel.isVisible()).toBe(true);
    panel.close();
    expect(panel.isVisible()).toBe(false);
    expect(panel.getTarget()).toBeNull();
  });

  it('Follow button delegates to the follow controller', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    panel.setSources({
      combatants: { getAllCombatants: () => [makeCombatant('c1')] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    const startFollow = vi.fn(() => true);
    const stopFollow = vi.fn();
    let following = false;
    panel.setFollowController({
      startFollow: (k, id) => { following = startFollow(k, id); return following; },
      stopFollow: () => { stopFollow(); following = false; },
      isFollowing: () => following,
    });
    panel.show({ kind: 'combatant', id: 'c1' });

    const buttons = host.querySelectorAll('button');
    const followBtn = Array.from(buttons).find(b => /follow/i.test(b.textContent ?? '')) as HTMLButtonElement;
    followBtn.click();
    expect(startFollow).toHaveBeenCalledWith('combatant', 'c1');
    followBtn.click();
    expect(stopFollow).toHaveBeenCalled();
  });

  it('inspects vehicle targets', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    const vehicle: IVehicle = {
      vehicleId: 'heli_1',
      category: 'helicopter',
      faction: 'US' as any,
      getSeats: () => [],
      enterVehicle: () => 0,
      exitVehicle: () => null,
      getOccupant: () => null,
      getPilotId: () => null,
      hasFreeSeats: () => true,
      getPosition: () => new THREE.Vector3(0, 50, 0),
      getQuaternion: () => new THREE.Quaternion(),
      getVelocity: () => new THREE.Vector3(0, 0, 0),
      isDestroyed: () => false,
      getHealthPercent: () => 1,
      update: () => undefined,
      dispose: () => undefined,
    };
    panel.setSources({
      combatants: { getAllCombatants: () => [] },
      vehicles: { getVehicle: (id) => (id === 'heli_1' ? vehicle : null) },
      player: makePlayer(),
    });
    panel.show({ kind: 'vehicle', id: 'heli_1' });
    expect(host.textContent).toContain('heli_1');
    expect(host.textContent).toContain('helicopter');
  });

  it('inspects player target', () => {
    const panel = new EntityInspectorPanel();
    const host = document.createElement('div');
    panel.mount(host);
    panel.setSources({
      combatants: { getAllCombatants: () => [] },
      vehicles: { getVehicle: () => null },
      player: makePlayer(),
    });
    panel.show({ kind: 'player', id: 'player' });
    const text = host.textContent ?? '';
    expect(text).toContain('on-foot');
    expect(text).toContain('1.00');  // x=1
  });
});
