// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EffectPool, createEffectPool } from './index';

interface TestEffect {
  id: number;
  visible: boolean;
  aliveUntil: number;
  disposed: boolean;
}

class TestPool extends EffectPool<TestEffect> {
  nextId = 0;

  constructor() {
    super(new THREE.Scene(), 2);
    for (let i = 0; i < 2; i++) {
      this.pool.push(this.createEffect());
    }
  }

  protected createEffect(): TestEffect {
    return { id: this.nextId++, visible: false, aliveUntil: 0, disposed: false };
  }

  protected isExpired(effect: TestEffect, now: number): boolean {
    return effect.aliveUntil <= now;
  }

  protected deactivateEffect(effect: TestEffect): void {
    effect.visible = false;
  }

  protected disposeEffect(effect: TestEffect): void {
    effect.disposed = true;
  }

  spawn(aliveUntil: number): TestEffect {
    const effect = this.acquire();
    if (!effect) {
      throw new Error('no effect');
    }
    effect.visible = true;
    effect.aliveUntil = aliveUntil;
    this.pushActive(effect);
    return effect;
  }

  update(now: number): void {
    this.sweep(now);
  }
}

describe('EffectPool', () => {
  it('reuses pooled effects and sweeps expired active effects', () => {
    const pool = new TestPool();
    const effect = pool.spawn(10);

    expect(effect.visible).toBe(true);
    expect(pool.getStats()).toMatchObject({ active: 1, pooled: 1 });
    pool.update(11);
    expect(effect.visible).toBe(false);
    expect(pool.getStats()).toMatchObject({ active: 0, pooled: 2 });
  });

  it('recycles the oldest active effect when full', () => {
    const pool = new TestPool();
    const first = pool.spawn(100);
    pool.spawn(100);
    const recycled = pool.spawn(100);

    expect(recycled).toBe(first);
    expect(pool.getStats().recycled).toBe(1);
  });

  it('disposes active and pooled effects once', () => {
    const pool = new TestPool();
    const active = pool.spawn(100);
    pool.dispose();

    expect(active.disposed).toBe(true);
    expect(pool.getStats()).toMatchObject({ active: 0, pooled: 0 });
  });
});

describe('createEffectPool', () => {
  it('offers a factory API for non-subclass callers', () => {
    const pool = createEffectPool<TestEffect>({
      capacity: 1,
      create: () => ({ id: 1, visible: false, aliveUntil: 0, disposed: false }),
      activate: (effect) => { effect.visible = true; },
      deactivate: (effect) => { effect.visible = false; },
      dispose: (effect) => { effect.disposed = true; },
      isExpired: (effect, now) => effect.aliveUntil <= now,
    });

    const effect = pool.spawn((item) => { item.aliveUntil = 5; });
    pool.sweep(6);

    expect(effect.visible).toBe(false);
    expect(pool.getStats()).toMatchObject({ active: 0, pooled: 1 });
  });
});