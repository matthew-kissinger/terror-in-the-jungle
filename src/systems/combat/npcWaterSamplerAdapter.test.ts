import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  createNpcWaterSamplerAdapter,
  type WaterInteractionSource,
} from './npcWaterSamplerAdapter';

function stubSource(
  resolve: (position: THREE.Vector3) => { immersion01: number },
): { source: WaterInteractionSource; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn((position: THREE.Vector3) => resolve(position));
  return {
    source: { sampleWaterInteraction: spy },
    spy,
  };
}

describe('createNpcWaterSamplerAdapter', () => {
  it('forwards the XZ + surfaceY into the source position vector', () => {
    const { source, spy } = stubSource(() => ({ immersion01: 0 }));
    const adapter = createNpcWaterSamplerAdapter(source);

    adapter.sampleImmersion01(123, 456, 78);

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0][0];
    expect(arg.x).toBe(123);
    expect(arg.y).toBe(78);
    expect(arg.z).toBe(456);
  });

  it('returns the immersion scalar reported by the source', () => {
    const { source } = stubSource(() => ({ immersion01: 0.42 }));
    const adapter = createNpcWaterSamplerAdapter(source);

    expect(adapter.sampleImmersion01(0, 0, 0)).toBe(0.42);
  });

  it('reports 0 when the position is dry', () => {
    const { source } = stubSource(() => ({ immersion01: 0 }));
    const adapter = createNpcWaterSamplerAdapter(source);

    expect(adapter.sampleImmersion01(10, 10, 5)).toBe(0);
  });

  it('clamps non-finite or out-of-range immersion readings into [0, 1]', () => {
    const adapter = createNpcWaterSamplerAdapter({
      sampleWaterInteraction: () => ({ immersion01: Number.NaN }),
    });
    expect(adapter.sampleImmersion01(0, 0, 0)).toBe(0);

    const overSaturated = createNpcWaterSamplerAdapter({
      sampleWaterInteraction: () => ({ immersion01: 5 }),
    });
    expect(overSaturated.sampleImmersion01(0, 0, 0)).toBe(1);

    const negative = createNpcWaterSamplerAdapter({
      sampleWaterInteraction: () => ({ immersion01: -0.3 }),
    });
    expect(negative.sampleImmersion01(0, 0, 0)).toBe(0);
  });

  it('reuses a single Vector3 across calls so per-tick NPC sampling does not allocate', () => {
    const observedVectors: THREE.Vector3[] = [];
    const adapter = createNpcWaterSamplerAdapter({
      sampleWaterInteraction: (position) => {
        observedVectors.push(position);
        return { immersion01: 0 };
      },
    });

    for (let i = 0; i < 8; i++) {
      adapter.sampleImmersion01(i, i, i);
    }

    expect(observedVectors.length).toBe(8);
    const first = observedVectors[0];
    for (const v of observedVectors) {
      expect(v).toBe(first);
    }
  });
});
