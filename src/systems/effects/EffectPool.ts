import * as THREE from 'three';

/**
 * Abstract base class for pooled visual effect systems.
 *
 * Manages two arrays (pool + active) with the pop-or-shift spawn pattern
 * and swap-and-pop expiry removal that all effect pools share.
 *
 * Subclasses define what an effect looks like and how it behaves by
 * implementing the abstract methods.
 */
export abstract class EffectPool<T> {
  protected readonly scene: THREE.Scene;
  protected readonly pool: T[] = [];
  protected readonly active: T[] = [];
  protected readonly maxEffects: number;

  constructor(scene: THREE.Scene, maxEffects: number) {
    this.scene = scene;
    this.maxEffects = maxEffects;
  }

  /** Create and return a new effect instance. Called during pool pre-allocation. */
  protected abstract createEffect(): T;

  /** Return true when this effect has expired and should be deactivated. */
  protected abstract isExpired(effect: T, now: number): boolean;

  /** Hide / reset an effect so it can be returned to the pool. */
  protected abstract deactivateEffect(effect: T): void;

  /** Permanently clean up GPU resources for an effect (geometry, materials). */
  protected abstract disposeEffect(effect: T): void;

  /**
   * Acquire an effect from the pool. Returns the oldest active effect
   * if the pool is empty (graceful recycling, never returns null).
   */
  protected acquire(): T | undefined {
    const effect = this.pool.pop() || this.active.shift();
    return effect;
  }

  /**
   * Push a newly-activated effect onto the active list.
   */
  protected pushActive(effect: T): void {
    this.active.push(effect);
  }

  /**
   * Sweep active effects: deactivate expired ones via swap-and-pop
   * and return them to the pool.
   */
  protected sweep(now: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const effect = this.active[i];
      if (this.isExpired(effect, now)) {
        this.deactivateEffect(effect);
        // Swap-and-pop removal
        const last = this.active[this.active.length - 1];
        this.active[i] = last;
        this.active.pop();
        if (this.pool.length < this.maxEffects) {
          this.pool.push(effect);
        }
      }
    }
  }

  /**
   * Dispose all effects (active + pooled) and clear arrays.
   * Subclasses should call super.dispose() after disposing their own
   * shared resources (materials, textures).
   */
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
}
