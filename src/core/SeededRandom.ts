/**
 * SeededRandom — deterministic PRNG + ambient session for seeded replay.
 *
 * Two usage shapes:
 *
 *   1. **Direct instance.** Construct with a seed and call `random()` for a
 *      reproducible sequence. Use this when you can thread a seeded instance
 *      through constructors (the principled path).
 *
 *   2. **Ambient session.** Call `SeededRandom.beginSession(seed)` once at
 *      the start of a replay, then `SeededRandom.random()` as a drop-in
 *      for `Math.random()`. When no session is active, `SeededRandom.random()`
 *      falls back to `Math.random()`, so production code is unchanged off the
 *      replay path. This is the pragmatic path for the C2 top-20 surgery
 *      where constructor threading is out of scope.
 *
 * Algorithm: mulberry32. ~2^32 period, sub-ns per call. Proven in the codebase
 * already (AirfieldLayoutGenerator, FirebaseLayoutGenerator).
 *
 * See docs/rearch/E5-deterministic-sim.md for the E5 spike memo and
 * docs/rearch/C2-determinism-open-sources.md for the list of remaining
 * non-determinism sources not touched in this pass.
 */

export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    // Mulberry32 expects a 32-bit seed. Non-zero seeds behave better; guard
    // against 0 to avoid degenerate short cycles.
    this.state = (seed | 0) === 0 ? 1 : seed | 0;
  }

  /** Uniform float in [0, 1). Matches Math.random() shape. */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, max). Returns 0 if max <= 0. */
  randomInt(max: number): number {
    if (max <= 0) return 0;
    return Math.floor(this.random() * max);
  }

  /** Pick a random element from a non-empty array. Returns undefined for empty. */
  pick<T>(arr: readonly T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[this.randomInt(arr.length)];
  }

  /** Fisher-Yates shuffle. Returns a new array; does not mutate input. */
  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.randomInt(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Fork a child RNG deterministically from this stream. */
  fork(): SeededRandom {
    return new SeededRandom(this.state ^ 0x9e3779b9);
  }

  /** Expose current state for snapshot/resume. */
  getState(): number {
    return this.state;
  }

  /** Restore state captured by getState(). */
  setState(state: number): void {
    this.state = (state | 0) === 0 ? 1 : state | 0;
  }

  // -------------------------------------------------------------------------
  // Ambient session mode
  // -------------------------------------------------------------------------

  private static activeSession: SeededRandom | null = null;

  /**
   * Open an ambient session. Subsequent calls to the static `random()` et al.
   * will draw from this stream until `endSession()` is called.
   */
  static beginSession(seed: number): SeededRandom {
    SeededRandom.activeSession = new SeededRandom(seed);
    return SeededRandom.activeSession;
  }

  static endSession(): void {
    SeededRandom.activeSession = null;
  }

  static hasActiveSession(): boolean {
    return SeededRandom.activeSession !== null;
  }

  static getActiveSession(): SeededRandom | null {
    return SeededRandom.activeSession;
  }

  /**
   * Drop-in for `Math.random()`. Returns seeded value if a session is active,
   * otherwise falls back to `Math.random()`.
   *
   * This is the seam used for the C2 top-20 surgical replacements.
   */
  static random(): number {
    return SeededRandom.activeSession !== null
      ? SeededRandom.activeSession.random()
      : Math.random();
  }

  static randomInt(max: number): number {
    return SeededRandom.activeSession !== null
      ? SeededRandom.activeSession.randomInt(max)
      : Math.floor(Math.random() * Math.max(0, max));
  }
}
