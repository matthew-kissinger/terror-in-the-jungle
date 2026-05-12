import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createLodTierOverlay } from './lodTierOverlay';
import type { Combatant } from '../../../systems/combat/types';

function mkCombatant(id: string, lod: Combatant['simLane']): Combatant {
  return {
    id, simLane: lod,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(),
    rotation: 0, visualRotation: 0, rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
  } as unknown as Combatant;
}

describe('lodTierOverlay', () => {
  it('mount adds a single Points draw-call and draw range scales with combatant count', () => {
    const combatants = new Map<string, Combatant>();
    combatants.set('a', mkCombatant('a', 'high'));
    combatants.set('b', mkCombatant('b', 'medium'));
    combatants.set('c', mkCombatant('c', 'culled'));
    const overlay = createLodTierOverlay({ combatants });
    const group = new THREE.Group();
    overlay.mount(group);
    const points = group.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(points).toBeDefined();
    overlay.update!(0.016);
    expect(points.geometry.drawRange.count).toBe(3);
    overlay.unmount();
    expect(group.children.length).toBe(0);
  });
});
