/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pickEntityFromClick } from './FreeFlyPick';
import type { Combatant } from '../../systems/combat/types';
import type { IVehicle } from '../../systems/vehicle/IVehicle';

function makeCombatant(id: string, pos: THREE.Vector3): Combatant {
  return {
    id,
    position: pos,
    velocity: new THREE.Vector3(),
  } as unknown as Combatant;
}

function mockEngine(opts: {
  combatants: Combatant[];
  vehicles?: IVehicle[];
  cameraPos: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  canvasRect: { left: number; top: number; width: number; height: number };
}) {
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 5000);
  camera.position.copy(opts.cameraPos);
  camera.lookAt(opts.cameraLookAt);
  camera.updateMatrixWorld(true);

  const canvas = document.createElement('canvas');
  canvas.width = opts.canvasRect.width;
  canvas.height = opts.canvasRect.height;
  canvas.getBoundingClientRect = () => ({
    left: opts.canvasRect.left,
    top: opts.canvasRect.top,
    right: opts.canvasRect.left + opts.canvasRect.width,
    bottom: opts.canvasRect.top + opts.canvasRect.height,
    width: opts.canvasRect.width,
    height: opts.canvasRect.height,
    x: opts.canvasRect.left,
    y: opts.canvasRect.top,
    toJSON() { return {}; },
  } as DOMRect);

  return {
    renderer: {
      renderer: { domElement: canvas },
      getActiveCamera: () => camera,
    },
    systemManager: {
      combatantSystem: { getAllCombatants: () => opts.combatants },
      vehicleManager: { getAllVehicles: () => opts.vehicles ?? [] },
    },
  } as any;
}

describe('pickEntityFromClick', () => {
  it('picks a combatant in the center of the screen', () => {
    const combatant = makeCombatant('target', new THREE.Vector3(0, 0, -50));
    const engine = mockEngine({
      combatants: [combatant],
      cameraPos: new THREE.Vector3(0, 0, 0),
      cameraLookAt: new THREE.Vector3(0, 0, -1),
      canvasRect: { left: 0, top: 0, width: 800, height: 600 },
    });
    const event = { clientX: 400, clientY: 300, button: 0 } as MouseEvent;
    const pick = pickEntityFromClick(engine, event);
    expect(pick).toEqual({ kind: 'combatant', id: 'target' });
  });

  it('returns null when the click misses all entities', () => {
    const combatant = makeCombatant('target', new THREE.Vector3(500, 0, -50));
    const engine = mockEngine({
      combatants: [combatant],
      cameraPos: new THREE.Vector3(0, 0, 0),
      cameraLookAt: new THREE.Vector3(0, 0, -1),
      canvasRect: { left: 0, top: 0, width: 800, height: 600 },
    });
    const event = { clientX: 400, clientY: 300, button: 0 } as MouseEvent;
    const pick = pickEntityFromClick(engine, event);
    expect(pick).toBeNull();
  });

  it('prefers combatant over vehicle when both are in range', () => {
    const combatant = makeCombatant('c1', new THREE.Vector3(0, 0, -50));
    const vehicle = {
      vehicleId: 'v1',
      category: 'helicopter',
      getPosition: () => new THREE.Vector3(0, 0, -50),
    } as unknown as IVehicle;
    const engine = mockEngine({
      combatants: [combatant],
      vehicles: [vehicle],
      cameraPos: new THREE.Vector3(0, 0, 0),
      cameraLookAt: new THREE.Vector3(0, 0, -1),
      canvasRect: { left: 0, top: 0, width: 800, height: 600 },
    });
    const event = { clientX: 400, clientY: 300, button: 0 } as MouseEvent;
    const pick = pickEntityFromClick(engine, event);
    expect(pick?.kind).toBe('combatant');
  });

  it('falls back to vehicle when no combatant is under the cursor', () => {
    const vehicle = {
      vehicleId: 'v1',
      category: 'helicopter',
      getPosition: () => new THREE.Vector3(0, 0, -80),
    } as unknown as IVehicle;
    const engine = mockEngine({
      combatants: [],
      vehicles: [vehicle],
      cameraPos: new THREE.Vector3(0, 0, 0),
      cameraLookAt: new THREE.Vector3(0, 0, -1),
      canvasRect: { left: 0, top: 0, width: 800, height: 600 },
    });
    const event = { clientX: 400, clientY: 300, button: 0 } as MouseEvent;
    const pick = pickEntityFromClick(engine, event);
    expect(pick).toEqual({ kind: 'vehicle', id: 'v1' });
  });
});
