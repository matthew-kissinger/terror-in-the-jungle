/**
 * E5 spike: a seeded PRNG for the determinism prototype.
 *
 * This is throwaway code. It lives on the spike branch only. The purpose is to
 * demonstrate what a replacement for `Math.random()` in sim code would look
 * like, not to land a production RNG.
 *
 * Algorithm: mulberry32. ~2^32 period (fine for 30-second replay).
 */
export type SeededRng = () => number;

export function createRng(seed: number): SeededRng {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
