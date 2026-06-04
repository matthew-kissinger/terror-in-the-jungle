/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, expect, it } from 'vitest';
import { PersistenceSystem } from './PersistenceSystem';
import { WarState } from './types';

function makeState(overrides: Partial<WarState> = {}): WarState {
  return {
    schemaVersion: 1,
    timestamp: 123,
    gameMode: 'open_frontier',
    elapsedTime: 300,
    agents: [],
    squads: [],
    factions: {},
    zones: [],
    player: { x: 0, y: 0, z: 0, health: 100, kills: 0, deaths: 0 },
    ...overrides,
  };
}

describe('PersistenceSystem save/load roundtrip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reloads the same state that was saved into a slot', () => {
    const sys = new PersistenceSystem();
    const state = makeState({
      elapsedTime: 612,
      gameMode: 'zone_control',
      factions: { US: { tickets: 90, kills: 3, deaths: 1 } },
    });

    expect(sys.save(1, state)).toBe(true);
    const loaded = sys.load(1);

    expect(loaded).not.toBeNull();
    expect(loaded!.gameMode).toBe('zone_control');
    expect(loaded!.elapsedTime).toBe(612);
    expect(loaded!.factions.US.tickets).toBe(90);
  });

  it('returns null when loading an empty slot', () => {
    const sys = new PersistenceSystem();
    expect(sys.load(1)).toBeNull();
  });

  it('keeps slots independent', () => {
    const sys = new PersistenceSystem();
    sys.save(1, makeState({ gameMode: 'open_frontier' }));
    sys.save(2, makeState({ gameMode: 'team_deathmatch' }));

    expect(sys.load(1)!.gameMode).toBe('open_frontier');
    expect(sys.load(2)!.gameMode).toBe('team_deathmatch');
  });
});

describe('PersistenceSystem slot bounds', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('rejects saving to an out-of-range slot', () => {
    const sys = new PersistenceSystem();
    expect(sys.save(-1, makeState())).toBe(false);
    expect(sys.save(3, makeState())).toBe(false);
  });

  it('returns null for loads from out-of-range slots', () => {
    const sys = new PersistenceSystem();
    expect(sys.load(-1)).toBeNull();
    expect(sys.load(99)).toBeNull();
  });

  it('accepts the documented slot range (auto + two manual)', () => {
    const sys = new PersistenceSystem();
    expect(sys.save(0, makeState())).toBe(true);
    expect(sys.save(1, makeState())).toBe(true);
    expect(sys.save(2, makeState())).toBe(true);
  });
});

describe('PersistenceSystem slot metadata', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports existence and agent counts per slot', () => {
    const sys = new PersistenceSystem();
    sys.save(1, makeState({ gameMode: 'open_frontier', agents: [{} as any, {} as any] }));

    const saves = sys.listSaves();
    const slot0 = saves.find((s) => s.slot === 0)!;
    const slot1 = saves.find((s) => s.slot === 1)!;

    expect(slot0.exists).toBe(false);
    expect(slot1.exists).toBe(true);
    expect(slot1.gameMode).toBe('open_frontier');
    expect(slot1.agentCount).toBe(2);
  });

  it('reports a corrupt slot as non-existent rather than throwing', () => {
    const sys = new PersistenceSystem();
    // Directly stuff invalid JSON into the slot's storage key.
    localStorage.setItem('titj-war-save-1', '{ not valid json');

    const saves = sys.listSaves();
    const slot1 = saves.find((s) => s.slot === 1)!;
    expect(slot1.exists).toBe(false);

    // load() also tolerates corruption.
    expect(sys.load(1)).toBeNull();
  });
});

describe('PersistenceSystem mode-scoped queries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('detects whether any save exists for a given mode', () => {
    const sys = new PersistenceSystem();
    sys.save(2, makeState({ gameMode: 'zone_control' }));

    expect(sys.hasSaveForMode('zone_control')).toBe(true);
    expect(sys.hasSaveForMode('open_frontier')).toBe(false);
  });

  it('returns the auto-save only when its mode matches the query', () => {
    const sys = new PersistenceSystem();
    sys.save(0, makeState({ gameMode: 'open_frontier', elapsedTime: 77 }));

    const matching = sys.getAutoSave('open_frontier');
    expect(matching).not.toBeNull();
    expect(matching!.elapsedTime).toBe(77);

    // Auto-save exists but is a different mode -> no match.
    expect(sys.getAutoSave('zone_control')).toBeNull();
  });
});

describe('PersistenceSystem delete', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes a saved slot so it loads as empty afterward', () => {
    const sys = new PersistenceSystem();
    sys.save(1, makeState());
    expect(sys.load(1)).not.toBeNull();

    sys.deleteSave(1);
    expect(sys.load(1)).toBeNull();
  });

  it('ignores deletes for out-of-range slots without affecting valid ones', () => {
    const sys = new PersistenceSystem();
    sys.save(1, makeState());

    sys.deleteSave(99); // no-op
    expect(sys.load(1)).not.toBeNull();
  });
});

describe('PersistenceSystem auto-save cadence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes the auto-save slot once the elapsed interval has been reached and persists the state', () => {
    const sys = new PersistenceSystem();
    let calls = 0;
    const getState = () => {
      calls++;
      return makeState({ gameMode: 'open_frontier', elapsedTime: 90 });
    };

    // The first save only triggers once enough time has elapsed.
    sys.checkAutoSave(90, getState);

    expect(calls).toBe(1);
    const auto = sys.getAutoSave('open_frontier');
    expect(auto).not.toBeNull();
    expect(auto!.elapsedTime).toBe(90);
  });

  it('does not re-save before another auto-save interval elapses', () => {
    const sys = new PersistenceSystem();
    let calls = 0;
    const getState = () => {
      calls++;
      return makeState();
    };

    sys.checkAutoSave(90, getState); // first save once past the initial interval
    sys.checkAutoSave(100, getState); // only 10s later -> skipped

    expect(calls).toBe(1);
  });

  it('saves again once another full interval has elapsed', () => {
    const sys = new PersistenceSystem();
    let calls = 0;
    const getState = () => {
      calls++;
      return makeState();
    };

    sys.checkAutoSave(90, getState);
    sys.checkAutoSave(200, getState); // well past the next interval

    expect(calls).toBe(2);
  });
});
