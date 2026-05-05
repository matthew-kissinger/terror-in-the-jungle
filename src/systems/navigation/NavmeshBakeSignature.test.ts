import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeNavmeshBakeSignature,
  stableStringifyForNavmeshSignature,
} from './NavmeshBakeSignature';

describe('NavmeshBakeSignature', () => {
  it('normalizes object key order and vector-like objects deterministically', () => {
    const a = {
      feature: {
        position: new THREE.Vector3(1, 2, 3),
        kind: 'airfield',
      },
      seed: 42,
    };
    const b = {
      seed: 42,
      feature: {
        kind: 'airfield',
        position: { z: 3, y: 2, x: 1 },
      },
    };

    expect(stableStringifyForNavmeshSignature(a)).toBe(stableStringifyForNavmeshSignature(b));
    expect(computeNavmeshBakeSignature(a)).toBe(computeNavmeshBakeSignature(b));
  });

  it('changes when terrain-affecting feature placement changes', () => {
    const base = computeNavmeshBakeSignature({
      modeId: 'open_frontier',
      seed: 42,
      worldSize: 3200,
      features: [{ id: 'airfield', position: new THREE.Vector3(0, 0, 0) }],
    });
    const moved = computeNavmeshBakeSignature({
      modeId: 'open_frontier',
      seed: 42,
      worldSize: 3200,
      features: [{ id: 'airfield', position: new THREE.Vector3(100, 0, 0) }],
    });

    expect(moved).not.toBe(base);
  });
});

