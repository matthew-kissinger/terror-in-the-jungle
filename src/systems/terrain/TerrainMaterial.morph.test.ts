import { describe, it, expect } from 'vitest';
import { TERRAIN_VERTEX_MAIN } from './TerrainMaterial';

/**
 * Pure-JS replica of the CDLOD vertex-shader snap+force-morph block in
 * TerrainMaterial.ts (cdlod-edge-morph cycle-2026-05-09). Locks the
 * geometry contract that closes LOD-transition T-junction cracks: the
 * `parentStep = 2/tileGridResolution` snap math + per-edge force-morph
 * keyed by `edgeMorphMask`.
 *
 * The replica is parameterised by `tileGridResolution` (the QUAD count,
 * not the vertex count). The wiring chain is:
 *   TerrainSystem.ts:114  -> passes (config.tileResolution - 1)
 *   TerrainSurfaceRuntime.ts:67 -> stores as `tileGridResolution` and
 *                                  feeds the shader uniform of the same
 *                                  name.
 * Default tileResolution = 33, so the runtime uniform value is 32.
 *
 * Behavioural tests against this contract; the shader-source contract
 * test below catches drift between the JS port and the actual GLSL
 * string in case anyone hand-edits one without the other.
 */

// GLSL bit layout: N=1, E=2, S=4, W=8.
const EDGE_N = 1, EDGE_E = 2, EDGE_S = 4, EDGE_W = 8;

interface MorphResult { x: number; y: number; }

/**
 * Tile-local morphed XZ before instanceMatrix; `px,pz` in [-0.5, 0.5].
 * `tileGridResolution` is the QUAD count (= vertexCount - 1), matching
 * the GLSL uniform.
 */
function morphVertex(
  px: number, pz: number, morphFactor: number, mask: number, tileGridResolution: number,
): MorphResult {
  const parentStep = 2.0 / tileGridResolution;
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

/**
 * World-space XZ via instanceMatrix = scale(size) * translate(cx, _, cz).
 * Vertex spacing in tile-local gridPos units is 1/tileGridResolution, so
 * the i-th vertex along an axis sits at `i / tileGridResolution - 0.5`.
 */
function worldXZ(
  cx: number, cz: number, size: number, ix: number, iz: number,
  morphFactor: number, mask: number, tileGridResolution: number,
): { x: number; z: number; } {
  const px = ix / tileGridResolution - 0.5;
  const pz = iz / tileGridResolution - 0.5;
  const m = morphVertex(px, pz, morphFactor, mask, tileGridResolution);
  return { x: m.x * size + cx, z: m.y * size + cz };
}

describe('TerrainMaterial CDLOD morph (vertex-shader replica)', () => {
  // Default runtime uniform value (TerrainConfig.tileResolution = 33,
  // shader uniform = tileResolution - 1).
  const DEFAULT_GRID_RES = 32;
  const VERTEX_COUNT = DEFAULT_GRID_RES + 1;

  it('shader parentStep formula matches the JS port contract', () => {
    // Drift guard: if anyone changes the GLSL formula without updating the
    // JS port (or vice versa), the LOD0/LOD1 parity test below silently
    // diverges. This regex catches the change at the source.
    expect(TERRAIN_VERTEX_MAIN).toMatch(/parentStep\s*=\s*2\.0\s*\/\s*tileGridResolution\s*;/);
  });

  it('snaps every fine vertex onto the parent grid at full morph', () => {
    const parentStep = 2.0 / DEFAULT_GRID_RES;
    for (let i = 0; i < VERTEX_COUNT; i++) {
      const px = i / DEFAULT_GRID_RES - 0.5;
      const m = morphVertex(px, 0, 1, 0, DEFAULT_GRID_RES);
      const ratio = (m.x + 0.5) / parentStep;
      // Snapped position must be an exact multiple of parentStep
      // (== the parent LOD grid hits every other fine vertex).
      expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(1e-5);
    }
  });

  it('zero morph and no mask is identity', () => {
    const px = 5 / DEFAULT_GRID_RES - 0.5;
    const m = morphVertex(px, 0, 0, 0xF, DEFAULT_GRID_RES);
    // Interior vertex - no edge bits apply.
    expect(Math.abs(m.x - px)).toBeLessThan(1e-9);
  });

  it('each edge bit force-morphs only its own side', () => {
    const cases: Array<[number, number, number]> = [
      [EDGE_N, 0.0, 0.5],   // north: gridPos.z=1
      [EDGE_E, 0.5, 0.0],   // east:  gridPos.x=1
      [EDGE_S, 0.0, -0.5],  // south: gridPos.z=0
      [EDGE_W, -0.5, 0.0],  // west:  gridPos.x=0
    ];
    for (const [bit, px, pz] of cases) {
      const flagged = morphVertex(px, pz, 0, bit, DEFAULT_GRID_RES);
      const fullMorph = morphVertex(px, pz, 1, 0, DEFAULT_GRID_RES);
      expect(Math.abs(flagged.x - fullMorph.x)).toBeLessThan(1e-9);
      expect(Math.abs(flagged.y - fullMorph.y)).toBeLessThan(1e-9);
    }
    // Wrong bit set -> no force-morph (east vertex with N bit stays put).
    const eastVert = morphVertex(0.5, 0, 0, EDGE_N, DEFAULT_GRID_RES);
    expect(Math.abs(eastVert.x - 0.5)).toBeLessThan(1e-9);
  });

  describe('LOD0/LOD1 abutment parity (the test that would have caught the seam bug)', () => {
    const sizeFine = 64;
    const sizeCoarse = sizeFine * 2;
    const fine = { cx: 0, cz: 0, size: sizeFine };
    // LOD1 west edge = LOD0 east edge => coarse cx = sizeFine*1.5.
    const coarse = { cx: sizeFine * 1.5, cz: 0, size: sizeCoarse };

    it('with the E bit set, LOD0 east-edge vertices align with LOD1 west-edge vertices', () => {
      // After full morph on the east edge, every fine east-edge vertex
      // should sit exactly on a coarse west-edge vertex. This is the
      // direct geometric statement of "no T-junction crack".
      let matchedAny = false;
      for (let j = 0; j < VERTEX_COUNT; j++) {
        const fw = worldXZ(
          fine.cx, fine.cz, fine.size,
          DEFAULT_GRID_RES, j, 0, EDGE_E, DEFAULT_GRID_RES,
        );
        let matched = false;
        for (let cj = 0; cj < VERTEX_COUNT; cj++) {
          const cw = worldXZ(
            coarse.cx, coarse.cz, coarse.size,
            0, cj, 0, 0, DEFAULT_GRID_RES,
          );
          if (Math.abs(cw.x - fw.x) < 1e-4 && Math.abs(cw.z - fw.z) < 1e-4) {
            matched = true; matchedAny = true; break;
          }
        }
        expect(matched).toBe(true);
      }
      expect(matchedAny).toBe(true);
    });

    it('without the E bit, an odd-index LOD0 vertex does NOT align (bug recreation)', () => {
      // Odd index sits between coarse-grid positions. Without the E
      // force-morph, the fine vertex stays at its un-morphed gridPos
      // (morphFactor=0, mask=0), which doesn't coincide with any coarse
      // west-edge vertex - exactly the T-junction crack we ship.
      const j = 1;
      const fw = worldXZ(
        fine.cx, fine.cz, fine.size,
        DEFAULT_GRID_RES, j, 0, 0, DEFAULT_GRID_RES,
      );
      let matched = false;
      for (let cj = 0; cj < VERTEX_COUNT; cj++) {
        const cw = worldXZ(
          coarse.cx, coarse.cz, coarse.size,
          0, cj, 0, 0, DEFAULT_GRID_RES,
        );
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
        for (let j = 0; j < VERTEX_COUNT; j++) {
          const aw = worldXZ(a.cx, a.cz, a.size, DEFAULT_GRID_RES, j, morph, 0, DEFAULT_GRID_RES);
          const bw = worldXZ(b.cx, b.cz, b.size, 0, j, morph, 0, DEFAULT_GRID_RES);
          expect(Math.abs(aw.x - bw.x)).toBeLessThan(1e-5);
          expect(Math.abs(aw.z - bw.z)).toBeLessThan(1e-5);
        }
      }
    });
  });
});
