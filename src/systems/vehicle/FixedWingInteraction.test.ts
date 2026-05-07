import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FixedWingInteraction } from './FixedWingInteraction';

vi.mock('../../utils/DeviceDetector', () => ({
  shouldUseTouchControls: vi.fn(() => false),
}));

function createAircraftMap(): Map<string, THREE.Group> {
  return new Map();
}

function addAircraft(map: Map<string, THREE.Group>, id: string, x: number, z: number): void {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  map.set(id, group);
}

describe('FixedWingInteraction', () => {
  it('prioritizes trainer aircraft over nearby gunship aircraft', () => {
    const aircraft = createAircraftMap();
    addAircraft(aircraft, 'ac47', 2, 0);
    addAircraft(aircraft, 'a1', 4, 0);

    const displayNames = new Map([
      ['ac47', 'AC-47 Spooky'],
      ['a1', 'A-1 Skyraider'],
    ]);
    const configKeys = new Map([
      ['ac47', 'AC47_SPOOKY'],
      ['a1', 'A1_SKYRAIDER'],
    ]);

    const enterFixedWing = vi.fn();
    const hud = { setInteractionContext: vi.fn() };
    const playerController = {
      isInHelicopter: () => false,
      isInFixedWing: () => false,
      getPosition: () => new THREE.Vector3(0, 0, 0),
      enterFixedWing,
    };

    const interaction = new FixedWingInteraction(aircraft, displayNames, configKeys);
    interaction.setHUDSystem(hud as any);
    interaction.setPlayerController(playerController as any);

    interaction.checkPlayerProximity();
    interaction.tryEnterAircraft();

    expect(hud.setInteractionContext).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'a1',
      promptText: expect.stringContaining('A-1 Skyraider'),
    }));
    expect(enterFixedWing).toHaveBeenCalledWith('a1', expect.any(THREE.Vector3));
  });

  it('allows gunship aircraft to be boarded when they are the only nearby fixed-wing option', () => {
    const aircraft = createAircraftMap();
    addAircraft(aircraft, 'ac47', 3, 0);

    const displayNames = new Map([['ac47', 'AC-47 Spooky']]);
    const configKeys = new Map([['ac47', 'AC47_SPOOKY']]);

    const hud = { setInteractionContext: vi.fn() };
    const playerController = {
      isInHelicopter: () => false,
      isInFixedWing: () => false,
      getPosition: () => new THREE.Vector3(0, 0, 0),
      enterFixedWing: vi.fn(),
    };

    const interaction = new FixedWingInteraction(aircraft, displayNames, configKeys);
    interaction.setHUDSystem(hud as any);
    interaction.setPlayerController(playerController as any);

    interaction.checkPlayerProximity();

    expect(interaction.tryEnterAircraft()).toBe(true);
    expect(hud.setInteractionContext).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'ac47',
      promptText: expect.stringContaining('AC-47 Spooky'),
    }));
    expect(playerController.enterFixedWing).toHaveBeenCalledWith('ac47', expect.any(THREE.Vector3));
  });

  it('keeps a render-culled parked aircraft enterable when the player is on foot', () => {
    const aircraft = createAircraftMap();
    addAircraft(aircraft, 'a1', 3, 0);
    aircraft.get('a1')!.visible = false;

    const displayNames = new Map([['a1', 'A-1 Skyraider']]);
    const configKeys = new Map([['a1', 'A1_SKYRAIDER']]);

    const hud = { setInteractionContext: vi.fn() };
    const playerController = {
      isInHelicopter: () => false,
      isInFixedWing: () => false,
      getPosition: () => new THREE.Vector3(0, 0, 0),
      enterFixedWing: vi.fn(),
    };

    const interaction = new FixedWingInteraction(aircraft, displayNames, configKeys);
    interaction.setHUDSystem(hud as any);
    interaction.setPlayerController(playerController as any);

    interaction.checkPlayerProximity();

    expect(interaction.tryEnterAircraft()).toBe(true);
    expect(hud.setInteractionContext).toHaveBeenCalledWith(expect.objectContaining({
      targetId: 'a1',
      promptText: expect.stringContaining('A-1 Skyraider'),
    }));
    expect(playerController.enterFixedWing).toHaveBeenCalledWith('a1', expect.any(THREE.Vector3));
  });
});
