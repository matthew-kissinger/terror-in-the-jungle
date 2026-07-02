/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameEventBus, type TargetMark } from '../../core/GameEventBus';
import { CommandSmokeMarkerFlow } from './CommandSmokeMarkerFlow';

function makeMark(): TargetMark {
  return {
    id: 'mark-1',
    kind: 'smoke-marker',
    position: new THREE.Vector3(10, 0, 20),
    createdAt: 1,
    source: 'player',
  };
}

function makeFlow() {
  const beginStrikeOnSmoke = vi.fn();
  const consumeActiveSmokeMark = vi.fn();
  const emitVisibility = vi.fn();
  const flow = new CommandSmokeMarkerFlow({
    beginStrikeOnSmoke,
    consumeActiveSmokeMark,
    emitVisibility,
  });
  flow.mount(document.body);
  return { flow, beginStrikeOnSmoke, consumeActiveSmokeMark, emitVisibility };
}

function promptText(): string {
  return document.body.querySelector<HTMLElement>('[aria-live="polite"]')?.textContent ?? '';
}

function promptVisible(): boolean {
  return document.body.querySelector<HTMLElement>('[aria-live="polite"]')?.getAttribute('aria-hidden') === 'false';
}

describe('CommandSmokeMarkerFlow', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    GameEventBus.clear();
  });

  it('shows the armed prompt while the marker is in hand', () => {
    const { flow } = makeFlow();

    flow.armThrow('a1_napalm', 'A-1 Napalm');

    expect(promptVisible()).toBe(true);
    expect(promptText()).toContain('SMOKE MARKER ARMED');
    expect(promptText()).toContain('A-1 NAPALM');

    flow.dispose();
  });

  it('holds a MARKER OUT cue from throw-release until the smoke registers', () => {
    const { flow, beginStrikeOnSmoke } = makeFlow();
    flow.armThrow('a1_napalm', 'A-1 Napalm');

    // Throw leaves the hand: the canister is in flight, so the pending mission
    // stays on screen instead of the HUD going blank until settle.
    flow.handleThrowModeEnd('thrown');
    expect(promptVisible()).toBe(true);
    expect(promptText()).toContain('MARKER OUT');

    // Smoke registers: the cue drops and the strike designation takes over.
    GameEventBus.emit('target_mark_set', { mark: makeMark() });
    GameEventBus.flush();

    expect(promptVisible()).toBe(false);
    expect(beginStrikeOnSmoke).toHaveBeenCalledTimes(1);

    flow.dispose();
  });

  it('clears everything on a cancelled throw with no strike', () => {
    const { flow, beginStrikeOnSmoke } = makeFlow();
    flow.armThrow('a1_napalm', 'A-1 Napalm');

    flow.handleThrowModeEnd('cancelled');
    expect(promptVisible()).toBe(false);

    // A later mark must not resurrect the cancelled call-in.
    GameEventBus.emit('target_mark_set', { mark: makeMark() });
    GameEventBus.flush();
    expect(beginStrikeOnSmoke).not.toHaveBeenCalled();

    flow.dispose();
  });

  it('forceClearPending drops an airborne MARKER OUT mission on death (no strike from beyond the grave)', () => {
    const { flow, beginStrikeOnSmoke } = makeFlow();
    flow.armThrow('a1_napalm', 'A-1 Napalm');
    flow.handleThrowModeEnd('thrown');
    expect(promptText()).toContain('MARKER OUT');

    // Player dies while the canister is still settling.
    flow.forceClearPending();
    expect(promptVisible()).toBe(false);

    // The delayed smoke registration must NOT resurrect the mission post-respawn.
    GameEventBus.emit('target_mark_set', { mark: makeMark() });
    GameEventBus.flush();
    expect(beginStrikeOnSmoke).not.toHaveBeenCalled();

    flow.dispose();
  });

  it('consumes the active smoke mark only when a smoke-sourced strike commits', () => {
    const { flow, consumeActiveSmokeMark } = makeFlow();

    flow.setConsumeActiveSmokeOnCommit(true);
    flow.handleStrikeCommitted();
    expect(consumeActiveSmokeMark).toHaveBeenCalledTimes(1);

    // The flag is one-shot: a subsequent commit without re-arming does nothing.
    consumeActiveSmokeMark.mockClear();
    flow.handleStrikeCommitted();
    expect(consumeActiveSmokeMark).not.toHaveBeenCalled();

    flow.dispose();
  });
});
