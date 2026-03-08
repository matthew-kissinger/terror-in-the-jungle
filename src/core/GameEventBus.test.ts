import { describe, it, expect, beforeEach } from 'vitest';
import { GameEventBus } from './GameEventBus';
import * as THREE from 'three';
import { Faction } from '../systems/combat/types';

describe('GameEventBus', () => {
  beforeEach(() => {
    GameEventBus.clear();
  });

  it('delivers events only after flush()', () => {
    const received: string[] = [];
    GameEventBus.subscribe('npc_killed', (e) => received.push(e.victimId));

    GameEventBus.emit('npc_killed', {
      killerId: 'a', victimId: 'b',
      killerFaction: Faction.US, victimFaction: Faction.NVA,
      isHeadshot: false, position: new THREE.Vector3(),
    });

    expect(received).toHaveLength(0);
    GameEventBus.flush();
    expect(received).toEqual(['b']);
  });

  it('delivers to multiple subscribers', () => {
    let count = 0;
    GameEventBus.subscribe('explosion', () => count++);
    GameEventBus.subscribe('explosion', () => count++);

    GameEventBus.emit('explosion', {
      position: new THREE.Vector3(), radius: 10, source: 'test',
    });
    GameEventBus.flush();
    expect(count).toBe(2);
  });

  it('unsubscribe stops delivery', () => {
    let count = 0;
    const unsub = GameEventBus.subscribe('player_kill', () => count++);

    GameEventBus.emit('player_kill', {
      victimId: 'x', victimFaction: Faction.NVA, isHeadshot: false,
    });
    GameEventBus.flush();
    expect(count).toBe(1);

    unsub();

    GameEventBus.emit('player_kill', {
      victimId: 'y', victimFaction: Faction.NVA, isHeadshot: false,
    });
    GameEventBus.flush();
    expect(count).toBe(1); // unchanged
  });

  it('clear() removes all subscriptions and queued events', () => {
    let count = 0;
    GameEventBus.subscribe('zone_captured', () => count++);
    GameEventBus.emit('zone_captured', {
      zoneId: 'z1', zoneName: 'Alpha', faction: Faction.US,
    });

    GameEventBus.clear();
    GameEventBus.flush();
    expect(count).toBe(0);
  });

  it('flush() with empty queue is a no-op', () => {
    // Should not throw
    GameEventBus.flush();
  });

  it('events of different types do not cross-deliver', () => {
    const kills: string[] = [];
    const explosions: string[] = [];
    GameEventBus.subscribe('player_kill', (e) => kills.push(e.victimId));
    GameEventBus.subscribe('explosion', (e) => explosions.push(e.source));

    GameEventBus.emit('player_kill', {
      victimId: 'v1', victimFaction: Faction.NVA, isHeadshot: false,
    });
    GameEventBus.emit('explosion', {
      position: new THREE.Vector3(), radius: 5, source: 'grenade',
    });

    GameEventBus.flush();
    expect(kills).toEqual(['v1']);
    expect(explosions).toEqual(['grenade']);
  });

  it('multiple events are batched in a single flush', () => {
    const ids: string[] = [];
    GameEventBus.subscribe('npc_killed', (e) => ids.push(e.victimId));

    for (let i = 0; i < 5; i++) {
      GameEventBus.emit('npc_killed', {
        killerId: 'a', victimId: `npc_${i}`,
        killerFaction: Faction.US, victimFaction: Faction.NVA,
        isHeadshot: false, position: new THREE.Vector3(),
      });
    }

    GameEventBus.flush();
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe('npc_0');
    expect(ids[4]).toBe('npc_4');
  });

  it('match_phase_change delivers correct payload', () => {
    let received: { phase: string; mode: string } | null = null;
    GameEventBus.subscribe('match_phase_change', (e) => { received = e; });

    GameEventBus.emit('match_phase_change', { phase: 'playing', mode: 'tdm' });
    GameEventBus.flush();

    expect(received).toEqual({ phase: 'playing', mode: 'tdm' });
  });
});
