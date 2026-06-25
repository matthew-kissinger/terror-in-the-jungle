// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';

export interface EffectPoolStats {
  active: number;
  pooled: number;
  capacity: number;
  recycled: number;
}

export abstract class EffectPool<T> {
  protected readonly scene: THREE.Scene;
  protected readonly pool: T[] = [];
  protected readonly active: T[] = [];
  protected readonly maxEffects: number;
  private recycledCount = 0;

  constructor(scene: THREE.Scene, maxEffects: number) {
    if (maxEffects < 1) {
      throw new Error('EffectPool maxEffects must be at least 1');
    }
    this.scene = scene;
    this.maxEffects = maxEffects;
  }

  protected abstract createEffect(): T;
  protected abstract isExpired(effect: T, now: number): boolean;
  protected abstract deactivateEffect(effect: T): void;
  protected abstract disposeEffect(effect: T): void;

  protected acquire(): T | undefined {
    const pooled = this.pool.pop();
    if (pooled) {
      return pooled;
    }
    const recycled = this.active.shift();
    if (recycled) {
      this.deactivateEffect(recycled);
      this.recycledCount++;
    }
    return recycled;
  }

  protected pushActive(effect: T): void {
    this.active.push(effect);
  }

  protected sweep(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      if (effect !== undefined && this.isExpired(effect, now)) {
        this.releaseAt(i, effect);
      }
    }
  }

  protected release(effect: T): void {
    const index = this.active.indexOf(effect);
    if (index >= 0) {
      this.releaseAt(index, effect);
    }
  }

  getStats(): EffectPoolStats {
    return {
      active: this.active.length,
      pooled: this.pool.length,
      capacity: this.maxEffects,
      recycled: this.recycledCount,
    };
  }

  dispose(): void {
    for (const effect of this.active) {
      this.disposeEffect(effect);
    }
    for (const effect of this.pool) {
      this.disposeEffect(effect);
    }
    this.active.length = 0;
    this.pool.length = 0;
  }

  private releaseAt(index: number, effect: T): void {
    this.deactivateEffect(effect);
    const last = this.active[this.active.length - 1];
    if (last !== undefined) {
      this.active[index] = last;
    }
    this.active.pop();
    if (this.pool.length < this.maxEffects) {
      this.pool.push(effect);
    }
  }
}

export interface EffectPoolFactoryOptions<T> {
  capacity: number;
  create: () => T;
  activate?: (effect: T) => void;
  deactivate: (effect: T) => void;
  dispose: (effect: T) => void;
  isExpired: (effect: T, now: number) => boolean;
}

export interface FactoryEffectPool<T> {
  spawn(configure?: (effect: T) => void): T;
  sweep(now: number): void;
  release(effect: T): void;
  dispose(): void;
  getStats(): EffectPoolStats;
}

export function createEffectPool<T>(options: EffectPoolFactoryOptions<T>): FactoryEffectPool<T> {
  class FactoryPool extends EffectPool<T> {
    constructor() {
      super(new THREE.Scene(), options.capacity);
      for (let i = 0; i < options.capacity; i++) {
        this.pool.push(options.create());
      }
    }

    protected createEffect(): T {
      return options.create();
    }

    protected isExpired(effect: T, now: number): boolean {
      return options.isExpired(effect, now);
    }

    protected deactivateEffect(effect: T): void {
      options.deactivate(effect);
    }

    protected disposeEffect(effect: T): void {
      options.dispose(effect);
    }

    spawn(configure?: (effect: T) => void): T {
      const effect = this.acquire() ?? this.createEffect();
      configure?.(effect);
      options.activate?.(effect);
      this.pushActive(effect);
      return effect;
    }

    sweepPublic(now: number): void {
      this.sweep(now);
    }

    releasePublic(effect: T): void {
      this.release(effect);
    }
  }

  const pool = new FactoryPool();
  return {
    spawn: (configure) => pool.spawn(configure),
    sweep: (now) => pool.sweepPublic(now),
    release: (effect) => pool.releasePublic(effect),
    dispose: () => pool.dispose(),
    getStats: () => pool.getStats(),
  };
}