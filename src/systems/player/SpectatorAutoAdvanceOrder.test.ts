// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { SpectatorCamera, SpectatorCandidate } from './SpectatorCamera';
import { Faction } from '../combat/types';

vi.mock('../../utils/Logger', () => ({
  Logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

function makeCandidates(ids: string[]): SpectatorCandidate[] {
  return ids.map((id, i) => ({
    id,
    position: new THREE.Vector3(i * 10, 0, 0),
    faction: Faction.US,
  }));
}

/**
 * When the spectated target dies, auto-advance should hand off to the target
 * that followed it in the viewing order, not snap back to the first candidate.
 *
 * This is a behavioral contract on the public target selection: with the order
 * [A, B, C] while watching the middle target B, B dying should leave the
 * camera on C (the next survivor in order) -- the same target a manual
 * `nextTarget()` would land on. Snapping to A (index 0) is the regression.
 */
describe('SpectatorCamera auto-advance preserves viewing order', () => {
  let camera: THREE.PerspectiveCamera;
  let spectator: SpectatorCamera;

  beforeEach(() => {
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    spectator = new SpectatorCamera(camera);
  });

  afterEach(() => {
    spectator.deactivate();
  });

  it('advances to the next survivor after the dead target, not back to index 0', () => {
    const all = makeCandidates(['A', 'B', 'C']);
    spectator.activate(all);

    // Move from A -> B so the *middle* candidate is the one watched.
    spectator.nextTarget();
    expect(spectator.getCurrentTargetId()).toBe('B');

    // B dies; the live candidate list is now [A, C] (order preserved).
    const survivors = makeCandidates(['A', 'C']);
    spectator.update(0.016, survivors);

    // The next target after B in order is C. The buggy index-0 fallback would
    // hand the camera to A instead.
    expect(spectator.getCurrentTargetId()).toBe('C');
  });
});
