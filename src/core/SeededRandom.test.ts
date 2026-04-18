import { afterEach, describe, expect, it } from 'vitest';
import { SeededRandom } from './SeededRandom';

describe('SeededRandom', () => {
  afterEach(() => {
    SeededRandom.endSession();
  });

  it('produces the same sequence for the same seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 50 }, () => a.random());
    const seqB = Array.from({ length: 50 }, () => b.random());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(99999);
    const seqA = Array.from({ length: 50 }, () => a.random());
    const seqB = Array.from({ length: 50 }, () => b.random());
    expect(seqA).not.toEqual(seqB);
  });

  it('stays in [0, 1) over a large sample', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('randomInt returns values in [0, max)', () => {
    const rng = new SeededRandom(42);
    const bucket = new Array(6).fill(0);
    for (let i = 0; i < 10_000; i++) {
      const n = rng.randomInt(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      bucket[n]++;
    }
    // Every bucket should see at least one hit — sanity, not uniformity assertion.
    expect(bucket.every((count) => count > 0)).toBe(true);
  });

  it('pick returns undefined for empty arrays and an element for non-empty', () => {
    const rng = new SeededRandom(1);
    expect(rng.pick([])).toBeUndefined();
    const result = rng.pick(['a', 'b', 'c']);
    expect(['a', 'b', 'c']).toContain(result);
  });

  it('shuffle preserves element set and is deterministic given a seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new SeededRandom(100).shuffle(input);
    const b = new SeededRandom(100).shuffle(input);
    expect(a).toEqual(b);
    expect(a.slice().sort()).toEqual(input);
  });

  it('state can be saved and restored to resume the sequence', () => {
    const rng = new SeededRandom(5);
    rng.random();
    rng.random();
    const saved = rng.getState();
    const next = rng.random();

    const resumed = new SeededRandom(5);
    resumed.setState(saved);
    expect(resumed.random()).toBe(next);
  });

  describe('ambient session', () => {
    it('falls back to Math.random when no session is active', () => {
      expect(SeededRandom.hasActiveSession()).toBe(false);
      // With no session, static random just wraps Math.random — assert in [0, 1).
      for (let i = 0; i < 10; i++) {
        const v = SeededRandom.random();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });

    it('routes static random through the active session', () => {
      SeededRandom.beginSession(2024);
      const staticSeq = Array.from({ length: 20 }, () => SeededRandom.random());
      SeededRandom.endSession();

      const expected = new SeededRandom(2024);
      const directSeq = Array.from({ length: 20 }, () => expected.random());
      expect(staticSeq).toEqual(directSeq);
    });

    it('replays identically from the same seed across sessions', () => {
      SeededRandom.beginSession(777);
      const first = Array.from({ length: 25 }, () => SeededRandom.random());
      SeededRandom.endSession();

      SeededRandom.beginSession(777);
      const second = Array.from({ length: 25 }, () => SeededRandom.random());
      SeededRandom.endSession();

      expect(first).toEqual(second);
    });

    it('endSession restores fallback behavior', () => {
      SeededRandom.beginSession(1);
      expect(SeededRandom.hasActiveSession()).toBe(true);
      SeededRandom.endSession();
      expect(SeededRandom.hasActiveSession()).toBe(false);
      expect(SeededRandom.getActiveSession()).toBeNull();
    });
  });
});
