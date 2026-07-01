// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TaskingDirector } from './TaskingDirector';
import { WarEventEmitter } from '../strategy/WarEventEmitter';
import type { WarEvent } from '../strategy/types';
import { Alliance, Faction } from '../combat/types';
import { ZoneState, type CaptureZone } from '../world/ZoneManager';
import type { IZoneQuery } from '../../types/SystemInterfaces';

// ---------------------------------------------------------------------------
// The TaskingDirector reads live zone/war/ticket state and offers ONE opt-in
// mission at a time, clearing/completing it from the WarSimulator event stream.
// These are behavior tests: we hand it a zone snapshot + the real event emitter
// (the integration seam the runtime uses) and observe the OBSERVABLE outcomes —
// a candidate is offered, opting in activates it, the completion event clears it
// and dispatches a reward. We never assert on throttle/cooldown/reward tuning
// constants (docs/TESTING.md §Rules 2-3).
// ---------------------------------------------------------------------------

function zone(overrides: Partial<CaptureZone> & { name: string; x: number; z: number }): CaptureZone {
  const { name, x, z, ...rest } = overrides;
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    position: new THREE.Vector3(x, 0, z),
    radius: 30,
    height: 0,
    owner: null,
    state: ZoneState.NEUTRAL,
    captureProgress: 0,
    captureSpeed: 1,
    currentFlagHeight: 0,
    isHomeBase: false,
    ticketBleedRate: 1,
    ...rest,
  } as CaptureZone;
}

/** A zone query whose capturable set is a fixed snapshot. */
function fakeZoneQuery(zones: CaptureZone[]): IZoneQuery {
  return {
    getAllZones: () => zones,
    getCapturableZones: () => zones,
    getZoneAt: () => null,
    getZoneById: (id: string) => zones.find((z) => z.id === id) ?? null,
    getZonesByOwner: () => [],
    getNearestCapturableZone: () => null,
  } as IZoneQuery;
}

interface RewardCall {
  type: 'capture' | 'defend';
  points: number;
  multiplier: number;
}

/** A card double that records the views/rewards the director drives. */
function fakeCard() {
  const rewards: RewardCall[] = [];
  const views: string[] = [];
  let completed = 0;
  let failed = 0;
  const card = {
    setHandlers: () => {},
    setView: (v: { state: string }) => views.push(v.state),
    showCompleted: () => { completed++; },
    showFailed: () => { failed++; },
    dispatchReward: (type: 'capture' | 'defend', points: number, multiplier: number) =>
      rewards.push({ type, points, multiplier }),
  };
  return {
    card,
    rewards,
    views,
    get completed() { return completed; },
    get failed() { return failed; },
  };
}

/** A ticket system double. Phase gates derivation/clear. */
function fakeTickets(phase: string = 'COMBAT') {
  return { getGameState: () => ({ phase }) } as any;
}

function fakeAudio() {
  return { playVariantSet: vi.fn() };
}

function makeDirector(opts: {
  zones: CaptureZone[];
  alliance?: Alliance;
  phase?: string;
}) {
  const emitter = new WarEventEmitter();
  const director = new TaskingDirector();
  director.setZoneQuery(fakeZoneQuery(opts.zones));
  // setWarSimulator only touches `.events` (subscribe) + isEnabled().
  director.setWarSimulator({ events: emitter, isEnabled: () => true } as any);
  director.setTicketSystem(fakeTickets(opts.phase));
  director.setPlayerAlliance(opts.alliance ?? Alliance.BLUFOR);
  director.setPlayerPosition(0, 0);
  const recorder = fakeCard();
  director.setTaskCard(recorder.card as any);

  const dispatch = (events: WarEvent[]) => {
    for (const e of events) emitter.emit(e);
    emitter.flush();
  };
  // Run one throttled-derivation pass (a large delta clears the throttle).
  const tick = () => director.update(10);

  return { director, dispatch, tick, recorder };
}

describe('TaskingDirector — candidate derivation from live zone state', () => {
  it('offers a CAPTURE task for the nearest contested/enemy-held zone', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    tick();

    const offer = director.getPendingOffer();
    expect(offer).not.toBeNull();
    expect(offer?.kind).toBe('capture');
    expect(offer?.zoneName).toBe('A SHAU');
  });

  it('offers a DEFEND task for a player-held zone under attack', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'FIREBASE', x: 0, z: 40, owner: Faction.US, state: ZoneState.CONTESTED })],
    });
    tick();

    const offer = director.getPendingOffer();
    expect(offer?.kind).toBe('defend');
    expect(offer?.zoneName).toBe('FIREBASE');
  });

  it('prefers defending a threatened held zone over a distant capture', () => {
    const { director, tick } = makeDirector({
      zones: [
        zone({ name: 'CAPTURE ME', x: 30, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED }),
        zone({ name: 'HOLD ME', x: 0, z: 300, owner: Faction.US, state: ZoneState.CONTESTED }),
      ],
    });
    tick();

    expect(director.getPendingOffer()?.kind).toBe('defend');
    expect(director.getPendingOffer()?.zoneName).toBe('HOLD ME');
  });

  it('offers nothing when no zone is actionable', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'OURS', x: 0, z: 10, owner: Faction.US, state: ZoneState.BLUFOR_CONTROLLED })],
    });
    tick();
    expect(director.getPendingOffer()).toBeNull();
  });

  it('does not offer when the match has ended', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
      phase: 'ENDED',
    });
    tick();
    expect(director.getPendingOffer()).toBeNull();
  });
});

describe('TaskingDirector — opt-in transitions and reward', () => {
  it('accepting an offer makes it the active task; only one at a time', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    tick();
    expect(director.getPendingOffer()).not.toBeNull();

    director.acceptOffer();
    expect(director.getPendingOffer()).toBeNull();
    expect(director.getActiveTask()?.zoneName).toBe('A SHAU');

    // No second offer is derived while a task is active.
    tick();
    expect(director.getPendingOffer()).toBeNull();
  });

  it('does nothing until the player opts in (offer is not auto-activated)', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    tick();
    // An offer exists but is NOT active until accepted.
    expect(director.getPendingOffer()).not.toBeNull();
    expect(director.getActiveTask()).toBeNull();
  });

  it('completes the active CAPTURE task and dispatches a reward when the zone is taken', () => {
    const { director, tick, dispatch, recorder } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED, ticketBleedRate: 1.5 })],
    });
    tick();
    director.acceptOffer();
    expect(director.getActiveTask()).not.toBeNull();

    // The player's alliance captures the task zone → complete + reward.
    dispatch([
      { type: 'zone_captured', zoneId: 'a_shau', zoneName: 'A SHAU', faction: Faction.US, timestamp: 0 },
    ]);

    expect(director.getActiveTask()).toBeNull();
    expect(recorder.completed).toBe(1);
    expect(recorder.rewards).toHaveLength(1);
    expect(recorder.rewards[0].type).toBe('capture');
    expect(recorder.rewards[0].points).toBeGreaterThan(0);
  });

  it('plays local objective-complete audio only when the player is near the objective', () => {
    const audio = fakeAudio();
    const { director, tick, dispatch } = makeDirector({
      zones: [zone({ name: 'NEAR', x: 20, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    director.setAudioManager(audio as any);
    tick();
    director.acceptOffer();

    dispatch([
      { type: 'zone_captured', zoneId: 'near', zoneName: 'NEAR', faction: Faction.US, timestamp: 0 },
    ]);

    expect(audio.playVariantSet).toHaveBeenCalledWith(
      'objectiveCompleteLocal',
      expect.any(THREE.Vector3),
      expect.any(Number),
    );
  });

  it('does not play objective-complete audio for distant task completion', () => {
    const audio = fakeAudio();
    const { director, tick, dispatch } = makeDirector({
      zones: [zone({ name: 'DISTANT', x: 200, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    director.setAudioManager(audio as any);
    tick();
    director.acceptOffer();

    dispatch([
      { type: 'zone_captured', zoneId: 'distant', zoneName: 'DISTANT', faction: Faction.US, timestamp: 0 },
    ]);

    expect(audio.playVariantSet).not.toHaveBeenCalled();
  });

  it('fails the active DEFEND task without reward when the zone is lost', () => {
    const { director, tick, dispatch, recorder } = makeDirector({
      zones: [zone({ name: 'FIREBASE', x: 0, z: 40, owner: Faction.US, state: ZoneState.CONTESTED })],
    });
    tick();
    director.acceptOffer();
    expect(director.getActiveTask()?.kind).toBe('defend');

    dispatch([
      { type: 'zone_lost', zoneId: 'firebase', zoneName: 'FIREBASE', faction: Faction.US, timestamp: 0 },
    ]);

    expect(director.getActiveTask()).toBeNull();
    expect(recorder.failed).toBe(1);
    expect(recorder.rewards).toHaveLength(0);
  });

  it('declining an offer suppresses that zone so it is not immediately re-offered', () => {
    const { director, tick } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    tick();
    expect(director.getPendingOffer()).not.toBeNull();

    director.declineOffer();
    expect(director.getPendingOffer()).toBeNull();

    // Re-deriving immediately yields nothing — the declined zone is on cooldown.
    tick();
    expect(director.getPendingOffer()).toBeNull();
  });

  it('ignores completion events that do not match the active task zone', () => {
    const { director, tick, dispatch, recorder } = makeDirector({
      zones: [zone({ name: 'A SHAU', x: 50, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED })],
    });
    tick();
    director.acceptOffer();

    dispatch([
      { type: 'zone_captured', zoneId: 'some_other_zone', zoneName: 'OTHER', faction: Faction.US, timestamp: 0 },
    ]);

    // Still active, no reward — the event was for a different zone.
    expect(director.getActiveTask()).not.toBeNull();
    expect(recorder.rewards).toHaveLength(0);
  });
});

describe('TaskingDirector.deriveCandidate — pure read', () => {
  it('returns null for an empty / non-actionable snapshot', () => {
    expect(
      TaskingDirector.deriveCandidate({
        capturableZones: [],
        playerAlliance: Alliance.BLUFOR,
        playerX: 0,
        playerZ: 0,
      }),
    ).toBeNull();
  });

  it('scales the value band off the zone ticket-bleed rate', () => {
    const high = TaskingDirector.deriveCandidate({
      capturableZones: [zone({ name: 'KEY', x: 10, z: 0, owner: Faction.NVA, state: ZoneState.OPFOR_CONTROLLED, ticketBleedRate: 2 })],
      playerAlliance: Alliance.BLUFOR,
      playerX: 0,
      playerZ: 0,
    });
    expect(high?.band).toBe('high');
  });
});
