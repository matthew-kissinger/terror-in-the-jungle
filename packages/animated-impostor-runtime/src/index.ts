// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface AnimatedImpostorAtlas {
  image: string;
  width: number;
  height: number;
}

export interface AnimatedImpostorFrame {
  clip: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
}

export interface AnimatedImpostorMeta {
  version: 1;
  atlas: AnimatedImpostorAtlas;
  frames: AnimatedImpostorFrame[];
}

export interface FrameSampleOptions {
  loop?: boolean;
}

export interface AnimatedImpostorPlayerOptions extends FrameSampleOptions {
  clip: string;
}

export interface AnimatedImpostorPlayer {
  sample(elapsedMs: number): AnimatedImpostorFrame;
  setClip(clip: string): void;
  getClip(): string;
}

export function parseAnimatedImpostorMeta(json: unknown): AnimatedImpostorMeta {
  if (!isObject(json)) {
    throw new Error('Animated impostor metadata must be an object.');
  }
  if (json.version !== 1) {
    throw new Error('Animated impostor metadata version must be 1.');
  }
  if (!isObject(json.atlas)) {
    throw new Error('Animated impostor metadata requires atlas.');
  }

  const atlas = {
    image: requireString(json.atlas.image, 'atlas.image'),
    width: requirePositiveNumber(json.atlas.width, 'atlas.width'),
    height: requirePositiveNumber(json.atlas.height, 'atlas.height'),
  };

  if (!Array.isArray(json.frames) || json.frames.length === 0) {
    throw new Error('Animated impostor metadata requires at least one frame.');
  }

  const frames = json.frames.map((frame, frameIndex) => {
    if (!isObject(frame)) {
      throw new Error(`Frame ${frameIndex} must be an object.`);
    }
    return {
      clip: requireString(frame.clip, `frames[${frameIndex}].clip`),
      index: requireNonNegativeInteger(frame.index, `frames[${frameIndex}].index`),
      x: requireNonNegativeNumber(frame.x, `frames[${frameIndex}].x`),
      y: requireNonNegativeNumber(frame.y, `frames[${frameIndex}].y`),
      width: requirePositiveNumber(frame.width, `frames[${frameIndex}].width`),
      height: requirePositiveNumber(frame.height, `frames[${frameIndex}].height`),
      durationMs: requirePositiveNumber(frame.durationMs, `frames[${frameIndex}].durationMs`),
    };
  });

  return { version: 1, atlas, frames };
}

export function getAnimatedImpostorClips(meta: AnimatedImpostorMeta): string[] {
  return [...new Set(meta.frames.map((frame) => frame.clip))];
}

export function sampleAnimatedImpostorFrame(
  meta: AnimatedImpostorMeta,
  clip: string,
  elapsedMs: number,
  options: FrameSampleOptions = {},
): AnimatedImpostorFrame {
  const frames = meta.frames
    .filter((frame) => frame.clip === clip)
    .sort((a, b) => a.index - b.index);
  if (frames.length === 0) {
    throw new Error(`Unknown animated impostor clip: ${clip}`);
  }

  const totalDuration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const loop = options.loop ?? true;
  let time = Math.max(0, elapsedMs);
  if (loop) {
    time %= totalDuration;
  } else {
    time = Math.min(time, totalDuration - 0.0001);
  }

  let cursor = 0;
  for (const frame of frames) {
    cursor += frame.durationMs;
    if (time < cursor) {
      return frame;
    }
  }

  return frames[frames.length - 1] as AnimatedImpostorFrame;
}

export function getFrameUvRect(meta: AnimatedImpostorMeta, frame: AnimatedImpostorFrame): {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
} {
  return {
    u0: frame.x / meta.atlas.width,
    v0: frame.y / meta.atlas.height,
    u1: (frame.x + frame.width) / meta.atlas.width,
    v1: (frame.y + frame.height) / meta.atlas.height,
  };
}

export function createAnimatedImpostorPlayer(
  meta: AnimatedImpostorMeta,
  options: AnimatedImpostorPlayerOptions,
): AnimatedImpostorPlayer {
  let activeClip = options.clip;

  return {
    sample: (elapsedMs) => sampleAnimatedImpostorFrame(meta, activeClip, elapsedMs, options),
    setClip: (clip) => {
      if (!getAnimatedImpostorClips(meta).includes(clip)) {
        throw new Error(`Unknown animated impostor clip: ${clip}`);
      }
      activeClip = clip;
    },
    getClip: () => activeClip,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requirePositiveNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = requireNonNegativeNumber(value, label);
  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be an integer.`);
  }
  return numberValue;
}