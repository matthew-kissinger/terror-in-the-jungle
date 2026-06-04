// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategicFeedback } from './StrategicFeedback';
import { WarEventEmitter } from './WarEventEmitter';
import { WarEvent } from './types';
import { Faction } from '../combat/types';

// ---------------------------------------------------------------------------
// StrategicFeedback subscribes to WarSimulator.events and turns war events into
// HUD messages + distant-combat audio. We drive it through the real event
// emitter (the actual integration seam) and observe the HUD/audio calls it
// makes. performance.now() is mocked so cooldown windows are deterministic.
// ---------------------------------------------------------------------------

function makeFeedback() {
  const emitter = new WarEventEmitter();
  const messages: Array<{ text: string; duration: number }> = [];
  const audioVolumes: number[] = [];

  const hud = {
    showMessage: (text: string, duration: number) => messages.push({ text, duration }),
  } as any;
  const audio = {
    playDistantCombat: (volume: number) => audioVolumes.push(volume),
  } as any;

  const feedback = new StrategicFeedback();
  feedback.setHUDSystem(hud);
  feedback.setAudioManager(audio);
  // setWarSimulator only touches `.events` to subscribe.
  feedback.setWarSimulator({ events: emitter } as any);

  const dispatch = (events: WarEvent[]) => {
    for (const e of events) emitter.emit(e);
    emitter.flush();
  };

  return { feedback, dispatch, messages, audioVolumes };
}

let nowMs = 0;

beforeEach(() => {
  nowMs = 100000; // start well past zero so initial cooldowns are satisfied
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('StrategicFeedback HUD messaging', () => {
  it('shows a HUD message when a zone is captured', () => {
    const { dispatch, messages } = makeFeedback();

    dispatch([
      { type: 'zone_captured', zoneId: 'z1', zoneName: 'Hill 937', faction: Faction.US, timestamp: 0 },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].text).toContain('Hill 937');
  });

  it('phrases friendly and enemy captures differently', () => {
    const { dispatch, messages } = makeFeedback();

    dispatch([
      { type: 'zone_captured', zoneId: 'z1', zoneName: 'Alpha', faction: Faction.US, timestamp: 0 },
      { type: 'zone_captured', zoneId: 'z2', zoneName: 'Bravo', faction: Faction.NVA, timestamp: 0 },
    ]);

    const friendly = messages.find((m) => m.text.includes('Alpha'))!.text;
    const enemy = messages.find((m) => m.text.includes('Bravo'))!.text;
    expect(friendly).not.toBe(enemy);
  });

  it('throttles repeated messages for the same zone within the cooldown window', () => {
    const { dispatch, messages } = makeFeedback();

    dispatch([{ type: 'zone_contested', zoneId: 'z1', zoneName: 'Alpha', timestamp: 0 }]);
    // Immediately re-fire the same key while still inside the cooldown.
    dispatch([{ type: 'zone_contested', zoneId: 'z1', zoneName: 'Alpha', timestamp: 0 }]);

    expect(messages).toHaveLength(1);
  });

  it('shows the message again once the cooldown has elapsed', () => {
    const { dispatch, messages } = makeFeedback();

    dispatch([{ type: 'zone_contested', zoneId: 'z1', zoneName: 'Alpha', timestamp: 0 }]);
    nowMs += 60000; // advance well beyond any per-message cooldown
    dispatch([{ type: 'zone_contested', zoneId: 'z1', zoneName: 'Alpha', timestamp: 0 }]);

    expect(messages).toHaveLength(2);
  });

  it('treats different zones as independent for throttling', () => {
    const { dispatch, messages } = makeFeedback();

    dispatch([
      { type: 'zone_contested', zoneId: 'z1', zoneName: 'Alpha', timestamp: 0 },
      { type: 'zone_contested', zoneId: 'z2', zoneName: 'Bravo', timestamp: 0 },
    ]);

    expect(messages).toHaveLength(2);
  });
});

describe('StrategicFeedback distant battle proximity', () => {
  it('announces a major battle that is close to the player', () => {
    const { feedback, dispatch, messages } = makeFeedback();
    feedback.setPlayerPosition(0, 0);

    dispatch([{ type: 'major_battle', x: 100, z: 100, intensity: 1, timestamp: 0 }]);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.some((m) => /fighting/i.test(m.text))).toBe(true);
  });

  it('stays silent for a major battle far from the player', () => {
    const { feedback, dispatch, messages, audioVolumes } = makeFeedback();
    feedback.setPlayerPosition(0, 0);

    // 50km away — well outside any audible/announce radius.
    dispatch([{ type: 'major_battle', x: 50000, z: 0, intensity: 1, timestamp: 0 }]);

    expect(messages).toHaveLength(0);
    expect(audioVolumes).toHaveLength(0);
  });

  it('plays distant-combat audio for a nearby major battle', () => {
    const { feedback, dispatch, audioVolumes } = makeFeedback();
    feedback.setPlayerPosition(0, 0);

    dispatch([{ type: 'major_battle', x: 200, z: 0, intensity: 1, timestamp: 0 }]);

    expect(audioVolumes.length).toBeGreaterThanOrEqual(1);
    // Volume is a positive, bounded gain.
    expect(audioVolumes[0]).toBeGreaterThan(0);
    expect(audioVolumes[0]).toBeLessThanOrEqual(1);
  });

  it('produces louder audio for a closer battle than a farther one', () => {
    const close = makeFeedback();
    close.feedback.setPlayerPosition(0, 0);
    close.dispatch([{ type: 'major_battle', x: 200, z: 0, intensity: 1, timestamp: 0 }]);

    const far = makeFeedback();
    far.feedback.setPlayerPosition(0, 0);
    far.dispatch([{ type: 'major_battle', x: 4500, z: 0, intensity: 1, timestamp: 0 }]);

    expect(close.audioVolumes[0]).toBeGreaterThan(far.audioVolumes[0]);
  });
});

describe('StrategicFeedback dependency gating', () => {
  it('does nothing harmful when no HUD or audio is wired', () => {
    const emitter = new WarEventEmitter();
    const feedback = new StrategicFeedback();
    feedback.setWarSimulator({ events: emitter } as any);
    feedback.setPlayerPosition(0, 0);

    expect(() => {
      emitter.emit({ type: 'zone_captured', zoneId: 'z1', zoneName: 'Alpha', faction: Faction.US, timestamp: 0 });
      emitter.emit({ type: 'major_battle', x: 100, z: 100, intensity: 1, timestamp: 0 });
      emitter.flush();
    }).not.toThrow();
  });

  it('stops reacting to events after dispose unsubscribes it', () => {
    const { feedback, dispatch, messages } = makeFeedback();

    dispatch([{ type: 'zone_captured', zoneId: 'z1', zoneName: 'Alpha', faction: Faction.US, timestamp: 0 }]);
    expect(messages).toHaveLength(1);

    feedback.dispose();
    dispatch([{ type: 'zone_captured', zoneId: 'z2', zoneName: 'Bravo', faction: Faction.US, timestamp: 0 }]);

    // No new messages after dispose.
    expect(messages).toHaveLength(1);
  });
});
