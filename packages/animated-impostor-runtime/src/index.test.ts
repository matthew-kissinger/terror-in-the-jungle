// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import {
  createAnimatedImpostorPlayer,
  getFrameUvRect,
  parseAnimatedImpostorMeta,
  sampleAnimatedImpostorFrame,
} from './index';

const meta = parseAnimatedImpostorMeta({
  version: 1,
  atlas: { image: 'atlas.png', width: 256, height: 128 },
  frames: [
    { clip: 'idle', index: 0, x: 0, y: 0, width: 64, height: 64, durationMs: 100 },
    { clip: 'idle', index: 1, x: 64, y: 0, width: 64, height: 64, durationMs: 100 },
    { clip: 'run', index: 0, x: 0, y: 64, width: 64, height: 64, durationMs: 50 },
  ],
});

describe('animated impostor runtime', () => {
  it('parses sidecar metadata and rejects invalid shapes', () => {
    expect(meta.frames).toHaveLength(3);
    expect(() => parseAnimatedImpostorMeta({ version: 1, atlas: {}, frames: [] })).toThrow();
  });

  it('samples looping and clamped frames', () => {
    expect(sampleAnimatedImpostorFrame(meta, 'idle', 150).index).toBe(1);
    expect(sampleAnimatedImpostorFrame(meta, 'idle', 250).index).toBe(0);
    expect(sampleAnimatedImpostorFrame(meta, 'idle', 250, { loop: false }).index).toBe(1);
  });

  it('computes normalized UV rectangles', () => {
    const rect = getFrameUvRect(meta, meta.frames[1]!);
    expect(rect).toEqual({ u0: 0.25, v0: 0, u1: 0.5, v1: 0.5 });
  });

  it('creates a clip-switching player', () => {
    const player = createAnimatedImpostorPlayer(meta, { clip: 'idle' });
    expect(player.sample(10).clip).toBe('idle');
    player.setClip('run');
    expect(player.getClip()).toBe('run');
    expect(player.sample(10).clip).toBe('run');
  });
});