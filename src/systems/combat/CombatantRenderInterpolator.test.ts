import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CombatantRenderInterpolator } from './CombatantRenderInterpolator';
import { Combatant, CombatantState, Faction } from './types';

function makeCombatant(id: string, position: THREE.Vector3, state: CombatantState = CombatantState.PATROLLING): Combatant {
  return {
    id,
    faction: Faction.US,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    rotation: 0,
    visualRotation: 0,
    rotationVelocity: 0,
    scale: new THREE.Vector3(1, 1, 1),
    health: 100,
    maxHealth: 100,
    state,
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
    lodLevel: 'high',
    kills: 0,
    deaths: 0,
  } as Combatant;
}

describe('CombatantRenderInterpolator', () => {
  it('initializes rendered position to logical on first update', () => {
    const interp = new CombatantRenderInterpolator();
    const c = makeCombatant('a', new THREE.Vector3(5, 0, 10));

    interp.update(new Map([[c.id, c]]), 1 / 60);

    expect(c.renderedPosition).toBeDefined();
    expect(c.renderedPosition!.x).toBeCloseTo(5);
    expect(c.renderedPosition!.z).toBeCloseTo(10);
  });

  it('keeps rendered locked to logical when motion is within the cap', () => {
    const interp = new CombatantRenderInterpolator();
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    // Move logical by 0.1m per frame — well under the cap at 1/60s.
    for (let i = 0; i < 10; i++) {
      c.position.x += 0.1;
      interp.update(combatants, 1 / 60);
      expect(c.renderedPosition!.x).toBeCloseTo(c.position.x, 5);
    }
  });

  it('limits rendered movement per frame to the configured max speed on teleport', () => {
    const interp = new CombatantRenderInterpolator({ maxSpeedMps: 18 });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    // Teleport logical 50m ahead.
    c.position.set(50, 0, 0);
    const dt = 1 / 60;

    let previousX = 0;
    for (let i = 0; i < 10; i++) {
      interp.update(combatants, dt);
      const step = c.renderedPosition!.x - previousX;
      expect(step).toBeLessThanOrEqual(18 * dt + 1e-9);
      expect(step).toBeGreaterThanOrEqual(0);
      previousX = c.renderedPosition!.x;
    }
    expect(c.renderedPosition!.x).toBeLessThan(50);
  });

  it('never exceeds the per-frame cap across a series of teleport-sized jumps', () => {
    const interp = new CombatantRenderInterpolator({ maxSpeedMps: 18 });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    const dt = 1 / 60;
    const maxStep = 18 * dt;
    interp.update(combatants, dt);

    const jumps = [
      new THREE.Vector3(30, 0, 0),
      new THREE.Vector3(-20, 0, 10),
      new THREE.Vector3(0, 0, 40),
      new THREE.Vector3(25, 0, -15),
    ];
    let previous = c.renderedPosition!.clone();
    for (const target of jumps) {
      c.position.copy(target);
      for (let i = 0; i < 30; i++) {
        interp.update(combatants, dt);
        const step = c.renderedPosition!.distanceTo(previous);
        expect(step).toBeLessThanOrEqual(maxStep + 1e-9);
        previous = c.renderedPosition!.clone();
      }
    }
  });

  it('eventually closes the gap to logical given enough frames', () => {
    const interp = new CombatantRenderInterpolator({ maxSpeedMps: 18 });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    c.position.set(5, 0, 0);
    for (let i = 0; i < 60; i++) interp.update(combatants, 1 / 60);

    expect(c.renderedPosition!.distanceTo(c.position)).toBeLessThan(0.02);
  });

  it('passes through unclamped for vehicle-mounted combatants', () => {
    const interp = new CombatantRenderInterpolator({ maxSpeedMps: 18 });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0), CombatantState.IN_VEHICLE);
    const combatants = new Map([[c.id, c]]);

    interp.update(combatants, 1 / 60);
    c.position.set(100, 0, 0); // helicopter moves 100m in one frame
    interp.update(combatants, 1 / 60);

    expect(c.renderedPosition!.x).toBeCloseTo(100);
  });

  it('passes through unclamped for dying combatants so death animation stays anchored', () => {
    const interp = new CombatantRenderInterpolator();
    const c = makeCombatant('a', new THREE.Vector3(10, 0, 10));
    c.isDying = true;
    c.deathProgress = 0.1;

    interp.update(new Map([[c.id, c]]), 1 / 60);

    expect(c.renderedPosition!.x).toBeCloseTo(10);
    expect(c.renderedPosition!.z).toBeCloseTo(10);
  });

  it('snap() forces rendered to logical immediately', () => {
    const interp = new CombatantRenderInterpolator({ maxSpeedMps: 18 });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    c.position.set(100, 0, 0);
    interp.update(combatants, 1 / 60);
    expect(c.renderedPosition!.x).toBeLessThan(10); // still clamped

    interp.snap(c);
    expect(c.renderedPosition!.x).toBeCloseTo(100);
  });

  it('initializes newly spawned combatants even when deltaTime is zero', () => {
    const interp = new CombatantRenderInterpolator();
    const c = makeCombatant('a', new THREE.Vector3(7, 0, 9));

    interp.update(new Map([[c.id, c]]), 0);

    expect(c.renderedPosition!.x).toBeCloseTo(7);
    expect(c.renderedPosition!.z).toBeCloseTo(9);
  });

  it('handles zero deltaTime without moving an already-primed rendered position', () => {
    const interp = new CombatantRenderInterpolator();
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    c.position.set(50, 0, 0);
    interp.update(combatants, 0);

    expect(c.renderedPosition!.x).toBeCloseTo(0);
  });
});
