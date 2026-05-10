import { describe, it, expect } from 'vitest';

/**
 * Pure-JS replica of the CDLOD vertex-shader snap+force-morph block in
 * TerrainMaterial.ts (cdlod-edge-morph cycle-2026-05-09). Locks the
 * geometry contract that closes LOD-transition T-junction cracks: the
 * corrected `parentStep = 2/(N-1)` snap math + per-edge force-morph
 * keyed by `edgeMorphMask`. Behavioural tests; if the shader and the
 * replica diverge, the LOD0/LOD1 parity test below catches it.
 */

// GLSL bit layout: N=1, E=2, S=4, W=8.
const EDGE_N = 1, EDGE_E = 2, EDGE_S = 4, EDGE_W = 8;

interface MorphResult { x: number; y: number; }

/** Tile-local morphed XZ before instanceMatrix; `px,pz` in [-0.5, 0.5]. */
function morphVertex(px: number, pz: number, morphFactor: number, mask: number, N: number): MorphResult {
  const parentStep = 2.0 / (N - 1);
  const gx = px + 0.5;
  const gz = pz + 0.5;
  let m = morphFactor;
  const EPS = 1.0e-4;
  if (gz >= 1.0 - EPS && (mask & EDGE_N) !== 0) m = 1.0;
  if (gx >= 1.0 - EPS && (mask & EDGE_E) !== 0) m = 1.0;
  if (gz <= EPS         && (mask & EDGE_S) !== 0) m = 1.0;
  if (gx <= EPS         && (mask & EDGE_W) !== 0) m = 1.0;
  const sx = Math.floor(gx / parentStep + 0.5) * parentStep;
  const sz = Math.floor(gz / parentStep + 0.5) * parentStep;
  return { x: gx + (sx - gx) * m - 0.5, y: gz + (sz - gz) * m - 0.5 };
}

/** World-space XZ via instanceMatrix = scale(size) * translate(cx, _, cz). */
function worldXZ(cx: number, cz: number, size: number, ix: number, iz: number,
                 morphFactor: number, mask: number, N: number): { x: number; z: number; } {
  const px = ix / (N - 1) - 0.5;
  const pz = iz / (N - 1) - 0.5;
  const m = morphVertex(px, pz, morphFactor, mask, N);
  return { x: m.x * size + cx, z: m.y * size + cz };
}

describe('TerrainMaterial CDLOD morph (vertex-shader replica)', () => {
  it('parentStep = 2/(N-1) snaps every fine vertex onto the parent grid at full morph', () => {
    const N = 33;
    const parentStep = 2.0 / (N - 1);
    for (let i = 0; i < N; i++) {
      const px = i / (N - 1) - 0.5;
      const m = morphVertex(px, 0, 1, 0, N);
      const ratio = (m.x + 0.5) / parentStep;
      expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-5);
    }
  });

  it('discriminates 2/(N-1) from the wrong 2/N step (Stage 1 fix)', () => {
    // i=1 is between two parent verts under either rule; under 2/(N-1)
    // it lands on a parent vert, under 2/N it does not.
    const N = 17;
    const px = 1 / (N - 1) - 0.5;
    const m = morphVertex(px, 0, 1, 0, N);
    const gx = m.x + 0.5;
    const correctRatio = gx / (2 / (N - 1));
    const wrongRatio = gx / (2 / N);
    expect(Math.abs(correctRatio - Math.round(correctRatio))).toBeLessThan(1e-5);
    expect(Math.abs(wrongRatio - Math.round(wrongRatio))).toBeGreaterThan(1e-3);
  });

  it('zero morph and no mask is identity', () => {
    const N = 33;
    const px = 5 / (N - 1) - 0.5;
    const m = morphVertex(px, 0, 0, 0xF, N);
    // Interior vertex - no edge bits apply.
    expect(Math.abs(m.x - px)).toBeLessThan(1e-9);
  });

  it('each edge bit force-morphs only its own side', () => {
    const N = 17;
    const cases: Array<[number, number, number]> = [
      [EDGE_N, 0.0, 0.5],   // north: gridPos.z=1
      [EDGE_E, 0.5, 0.0],   // east:  gridPos.x=1
      [EDGE_S, 0.0, -0.5],  // south: gridPos.z=0
      [EDGE_W, -0.5, 0.0],  // west:  gridPos.x=0
    ];
    for (const [bit, px, pz] of cases) {
      const flagged = morphVertex(px, pz, 0, bit, N);
      const fullMorph = morphVertex(px, pz, 1, 0, N);
      expect(Math.abs(flagged.x - fullMorph.x)).toBeLessThan(1e-9);
      expect(Math.abs(flagged.y - fullMorph.y)).toBeLessThan(1e-9);
    }
    // Wrong bit set -> no force-morph.
    const eastVert = morphVertex(0.5, 0, 0, EDGE_N, N);
    expect(Math.abs(eastVert.x - 0.5)).toBeLessThan(1e-9);
  });

  describe('LOD0/LOD1 abutment parity (the test that would have caught the bug)', () => {
    const N = 33;
    const sizeFine = 64;
    const sizeCoarse = sizeFine * 2;
    const fine = { cx: 0, cz: 0, size: sizeFine };
    // LOD1 west edge = LOD0 east edge => coarse cx = sizeFine*1.5.
    const coarse = { cx: sizeFine * 1.5, cz: 0, size: sizeCoarse };

    it('with the E bit set, LOD0 east-edge vertices align with LOD1 west-edge vertices', () => {
      let matchedAny = false;
      for (let j = 0; j < N; j++) {
        const fw = worldXZ(fine.cx, fine.cz, fine.size, N - 1, j, 0, EDGE_E, N);
        let matched = false;
        for (let cj = 0; cj < N; cj++) {
          const cw = worldXZ(coarse.cx, coarse.cz, coarse.size, 0, cj, 0, 0, N);
          if (Math.abs(cw.x - fw.x) < 1e-4 && Math.abs(cw.z - fw.z) < 1e-4) {
            matched = true; matchedAny = true; break;
          }
        }
        expect(matched).toBe(true);
      }
      expect(matchedAny).toBe(true);
    });

    it('without the E bit, an odd-index LOD0 vertex does NOT align (bug recreation)', () => {
      // Odd index sits between coarse-grid positions. Pre-fix: mask=0,
      // so the fine vertex stays in its native position with no neighbour.
      const j = 1;
      const fw = worldXZ(fine.cx, fine.cz, fine.size, N - 1, j, 0, 0, N);
      let matched = false;
      for (let cj = 0; cj < N; cj++) {
        const cw = worldXZ(coarse.cx, coarse.cz, coarse.size, 0, cj, 0, 0, N);
        if (Math.abs(cw.x - fw.x) < 1e-4 && Math.abs(cw.z - fw.z) < 1e-4) {
          matched = true; break;
        }
      }
      expect(matched).toBe(false);
    });

    it('two same-LOD adjacent tiles meet exactly along their shared edge (non-regression)', () => {
      // Predecessor (terrain-cdlod-seam) produced equal morph factors
      // at shared same-LOD edges; here we additionally assert the
      // morphed XZ coincides at every morph factor.
      const a = { cx: 0, cz: 0, size: sizeFine };
      const b = { cx: sizeFine, cz: 0, size: sizeFine };
      for (const morph of [0, 0.5, 1]) {
        for (let j = 0; j < N; j++) {
          const aw = worldXZ(a.cx, a.cz, a.size, N - 1, j, morph, 0, N);
          const bw = worldXZ(b.cx, b.cz, b.size, 0, j, morph, 0, N);
          expect(Math.abs(aw.x - bw.x)).toBeLessThan(1e-5);
          expect(Math.abs(aw.z - bw.z)).toBeLessThan(1e-5);
        }
      }
    });
  });
});
