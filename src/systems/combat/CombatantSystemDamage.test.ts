import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CombatantSystemDamage } from './CombatantSystemDamage';
import { CombatantState, Faction } from './types';
import { createTestCombatant } from '../../test-utils';
import { KillAssistTracker } from './KillAssistTracker';
import type { SquadManager } from './SquadManager';
import type { CombatantSpawnManager } from './CombatantSpawnManager';

vi.mock('./KillAssistTracker', () => ({
  KillAssistTracker: {
    trackDamage: vi.fn(),
    processKillAssists: vi.fn(() => new Set<string>()),
  },
}));

describe('CombatantSystemDamage', () => {
  let combatants: Map<string, ReturnType<typeof createTestCombatant>>;
  let damage: CombatantSystemDamage;

  beforeEach(() => {
    clearWorldBuilderState();
    combatants = new Map();
    damage = new CombatantSystemDamage(
      combatants,
      { getSquad: vi.fn(), removeSquadMember: vi.fn() } as unknown as SquadManager,
      { queueRespawn: vi.fn() } as unknown as CombatantSpawnManager,
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearWorldBuilderState();
  });

  it('keeps player-authored explosion damage scaled by distance by default', () => {
    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

    expect(target.health).toBeCloseTo(80);
    expect(target.state).not.toBe(CombatantState.DEAD);
  });

  it('lets the WorldBuilder one-shot flag make player-authored explosions lethal', () => {
    publishWorldBuilderState(true);

    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, 'PLAYER');

    expect(target.health).toBeLessThanOrEqual(0);
    expect(target.state).toBe(CombatantState.DEAD);
    expect(KillAssistTracker.trackDamage).toHaveBeenCalledWith(target, 'PLAYER', 100);
  });

  it('does not apply the WorldBuilder one-shot flag to non-player explosions', () => {
    publishWorldBuilderState(true);

    const target = createTestCombatant({
      id: 'target-1',
      faction: Faction.NVA,
      health: 100,
      position: new THREE.Vector3(5, 0, 0),
    });
    combatants.set(target.id, target);

    damage.applyExplosionDamage(new THREE.Vector3(0, 0, 0), 10, 40, undefined, 'napalm');

    expect(target.health).toBeCloseTo(80);
    expect(target.state).not.toBe(CombatantState.DEAD);
  });
});

type WorldBuilderTestWindow = { __worldBuilder?: unknown };
type WorldBuilderTestGlobal = typeof globalThis & { window?: WorldBuilderTestWindow };

function clearWorldBuilderState(): void {
  delete (globalThis as WorldBuilderTestGlobal).window?.__worldBuilder;
}

function publishWorldBuilderState(oneShotKills: boolean): void {
  const global = globalThis as WorldBuilderTestGlobal;
  global.window = global.window ?? {};
  global.window.__worldBuilder = {
    invulnerable: false,
    infiniteAmmo: false,
    noClip: false,
    oneShotKills,
    shadowsEnabled: true,
    postProcessEnabled: true,
    hudVisible: true,
    ambientAudioEnabled: true,
    npcTickPaused: false,
    forceTimeOfDay: -1,
    active: true,
  };
}
