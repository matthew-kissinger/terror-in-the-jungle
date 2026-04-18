/**
 * Policy behavior tests. Each policy is a pure `(obs, nowMs) → action` that
 * the runner calls per tick. Tests script observation sequences directly —
 * no live engine.
 */

import { describe, it, expect } from 'vitest';
import { createPolicy } from '../policies';
import type { AgentObservation, OwnStateSnapshot, VisibleEntity } from '../../../systems/agent/AgentTypes';
import { Faction } from '../../../systems/combat/types';

function own(overrides: Partial<OwnStateSnapshot> = {}): OwnStateSnapshot {
  return {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    yawRad: 0, pitchRad: 0,
    healthAbs: 100, healthFrac: 1,
    ammoInMag: 30, ammoReserve: 90,
    stance: 'standing', isRunning: false, isGrounded: true, isDead: false,
    inVehicle: null, faction: Faction.US,
    ...overrides,
  };
}

function obs(visible: VisibleEntity[], ownOverrides: Partial<OwnStateSnapshot> = {}): AgentObservation {
  return {
    tick: 0, timeMs: 0,
    ownState: own(ownOverrides),
    visibleEntities: visible,
    objectives: [],
  };
}

function enemyAt(x: number, z: number, id = 'e1', extra: Partial<VisibleEntity> = {}): VisibleEntity {
  return {
    id, kind: 'combatant', faction: Faction.NVA,
    position: { x, y: 0, z },
    distance: Math.hypot(x, z),
    bearingRad: Math.atan2(x, z),
    healthFrac: 1,
    ...extra,
  };
}

describe('engage-nearest-hostile policy', () => {
  const p = createPolicy({ kind: 'engage-nearest-hostile', fireMode: 'hold', reengageCooldownMs: 0 });

  it('returns cease-fire when no hostile is visible', () => {
    p.reset?.();
    const a = p.tick(obs([]), 0);
    expect(a?.kind).toBe('cease-fire');
  });

  it('alternates fire-at and move-to when a hostile is far away', () => {
    p.reset?.();
    const first = p.tick(obs([enemyAt(0, 200)]), 10);
    const second = p.tick(obs([enemyAt(0, 200)]), 20);
    // one should be fire-at, the other move-to toward the enemy
    const kinds = [first?.kind, second?.kind].sort();
    expect(kinds).toContain('fire-at');
    expect(kinds).toContain('move-to');
    const move = [first, second].find((x) => x?.kind === 'move-to') as { kind: 'move-to'; target: { z: number }; stance?: string };
    expect(move.target.z).toBeGreaterThan(0); // toward enemy, not away
  });

  it('sprints when the enemy is beyond sprintBeyondM', () => {
    const sp = createPolicy({ kind: 'engage-nearest-hostile', fireMode: 'hold', reengageCooldownMs: 0, sprintBeyondM: 50 });
    sp.reset?.();
    // first tick is fire-at (toggle=0 → 1, next → 0 is fire); ensure at least
    // one move-to with sprint stance appears.
    const actions = [
      sp.tick(obs([enemyAt(0, 200)]), 10),
      sp.tick(obs([enemyAt(0, 200)]), 20),
    ];
    const move = actions.find((a) => a?.kind === 'move-to') as { kind: 'move-to'; stance?: string };
    expect(move).toBeDefined();
    expect(move.stance).toBe('sprint');
  });

  it('picks the nearest hostile when multiple are visible', () => {
    p.reset?.();
    const actions = [
      p.tick(obs([enemyAt(0, 200, 'far'), enemyAt(5, 5, 'near')]), 10),
      p.tick(obs([enemyAt(0, 200, 'far'), enemyAt(5, 5, 'near')]), 20),
    ];
    const fire = actions.find((a) => a?.kind === 'fire-at') as { kind: 'fire-at'; target: string };
    expect(fire).toBeDefined();
    expect(fire.target).toBe('near');
  });

  it('ignores dead hostiles', () => {
    p.reset?.();
    const a = p.tick(obs([enemyAt(0, 50, 'dead', { healthFrac: 0 })]), 10);
    expect(a?.kind).toBe('cease-fire');
  });
});

describe('hold-position policy', () => {
  it('emits stop-moving on the first tick', () => {
    const p = createPolicy({ kind: 'hold-position' });
    p.reset?.();
    expect(p.tick(obs([]), 0)?.kind).toBe('stop-moving');
  });

  it('looks at the nearest hostile when faceNearestHostile=true', () => {
    const p = createPolicy({ kind: 'hold-position', faceNearestHostile: true });
    p.reset?.();
    p.tick(obs([enemyAt(0, 50)]), 0); // first tick stop-moving
    const a = p.tick(obs([enemyAt(0, 50)]), 10);
    expect(a?.kind).toBe('look-at');
  });
});

describe('patrol-waypoints policy', () => {
  it('moves toward the first waypoint', () => {
    const p = createPolicy({
      kind: 'patrol-waypoints',
      waypoints: [{ x: 100, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }],
    });
    p.reset?.();
    const a = p.tick(obs([]), 0) as { kind: string; target: { x: number } };
    expect(a.kind).toBe('move-to');
    expect(a.target.x).toBe(100);
  });

  it('advances to the next waypoint once within tolerance', () => {
    const p = createPolicy({
      kind: 'patrol-waypoints',
      waypoints: [{ x: 1, y: 0, z: 1 }, { x: 50, y: 0, z: 50 }],
    });
    p.reset?.();
    // Observation places player at origin; wp1 is (1,1) so distance is sqrt(2) ≈ 1.4 < tolerance 4.
    const a = p.tick(obs([]), 0) as { kind: string; target: { x: number; z: number } };
    expect(a.kind).toBe('move-to');
    expect(a.target.x).toBe(50); // advanced
    expect(a.target.z).toBe(50);
  });
});

describe('do-nothing policy', () => {
  it('returns null each tick', () => {
    const p = createPolicy({ kind: 'do-nothing' });
    p.reset?.();
    expect(p.tick(obs([]), 0)).toBeNull();
  });
});
