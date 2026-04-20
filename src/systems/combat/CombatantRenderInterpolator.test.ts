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

  // ── Vertical-clamp regression (npc-and-player-leap-fix) ──
  //
  // A distant-culled NPC's logical Y is held at DISTANT_CULLED_DEFAULT_Y = 3
  // while far from the camera. On LOD promotion the next movement tick
  // resamples real terrain height — which on A Shau DEM can be +50m or
  // more. Before the vertical clamp the interpolator resolved that gap at
  // the full 18 m/s horizontal cap, which rendered as a visible "leap into
  // the air" over several seconds. The two-tier vertical cap eases large
  // gaps in slowly while leaving small, legitimate terrain-follow deltas
  // at the locomotion rate.

  it('does not leap vertically on a multi-meter Y snap', () => {
    const interp = new CombatantRenderInterpolator({
      maxSpeedMps: 18,
      maxVerticalFarMps: 2,
      maxVerticalNearMps: 8,
    });
    const c = makeCombatant('a', new THREE.Vector3(0, 3, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    // Simulate LOD promotion: logical Y corrected from 3 → 53.
    c.position.set(0, 53, 0);
    const dt = 1 / 60;

    for (let i = 0; i < 30; i++) {
      const previousY = c.renderedPosition!.y;
      interp.update(combatants, dt);
      const ySteppedThisFrame = c.renderedPosition!.y - previousY;
      // While the gap is still large, every frame must stay within the
      // far-tier cap. No single frame is allowed to "leap."
      expect(Math.abs(ySteppedThisFrame)).toBeLessThanOrEqual(8 * dt + 1e-6);
    }
  });

  it('closes a vertical gap eventually when given enough frames', () => {
    const interp = new CombatantRenderInterpolator({
      maxSpeedMps: 18,
      maxVerticalFarMps: 2,
      maxVerticalNearMps: 8,
    });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    c.position.set(0, 5, 0);
    for (let i = 0; i < 600; i++) interp.update(combatants, 1 / 60);

    expect(Math.abs(c.renderedPosition!.y - 5)).toBeLessThan(0.05);
  });

  it('does not let horizontal travel spend itself on Y during a simultaneous jump', () => {
    // On a combined XZ+Y snap, Y and XZ resolve independently so the
    // horizontal motion stays at its own cap and the vertical stays at
    // its own (much tighter) cap. This matters for an NPC coming out of
    // distant-culled simulation: horizontal catch-up should still close
    // normally, vertical should not launch.
    const interp = new CombatantRenderInterpolator({
      maxSpeedMps: 18,
      maxVerticalFarMps: 2,
      maxVerticalNearMps: 8,
    });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    c.position.set(20, 50, 0); // 20m horizontal jump + 50m vertical snap
    const dt = 1 / 60;
    interp.update(combatants, dt);

    const xzStep = Math.hypot(c.renderedPosition!.x, c.renderedPosition!.z);
    expect(xzStep).toBeCloseTo(18 * dt, 4); // horizontal at full cap
    expect(Math.abs(c.renderedPosition!.y)).toBeLessThanOrEqual(2 * dt + 1e-6);
  });

  it('tracks small grounded Y adjustments at the locomotion rate', () => {
    // A combatant sprinting down a slope produces per-frame Y deltas of a
    // few centimetres; these must track tightly so the sprite stays glued
    // to terrain. Simulate a 1 cm/tick descent and confirm rendered Y
    // stays within the snap radius of logical Y.
    const interp = new CombatantRenderInterpolator({
      maxSpeedMps: 18,
      maxVerticalFarMps: 2,
      maxVerticalNearMps: 8,
    });
    const c = makeCombatant('a', new THREE.Vector3(0, 0, 0));
    const combatants = new Map([[c.id, c]]);
    interp.update(combatants, 1 / 60);

    for (let i = 0; i < 30; i++) {
      c.position.y -= 0.01;
      interp.update(combatants, 1 / 60);
      expect(Math.abs(c.renderedPosition!.y - c.position.y)).toBeLessThan(0.02);
    }
  });
});
