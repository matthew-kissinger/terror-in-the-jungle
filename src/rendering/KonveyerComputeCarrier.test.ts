import { describe, expect, it } from 'vitest';
import {
  createKonveyerComputeCarrier,
  createKonveyerStorageBufferAttribute,
  measureKonveyerComputeCarrier,
  writeEffectParticle,
  writeSensorCoverSample,
} from './KonveyerComputeCarrier';

describe('KonveyerComputeCarrier', () => {
  it('packs effect particles into a vec4-pair storage layout', async () => {
    const carrier = createKonveyerComputeCarrier('effect-particle', 4);
    writeEffectParticle(carrier, 2, {
      position: [10, 20, 30],
      radius: 4,
      velocity: [1, 2, 3],
      lifetimeSec: 0.75,
    });

    const offset = 2 * carrier.layout.strideFloats;
    expect(Array.from(carrier.data.slice(offset, offset + 8))).toEqual([10, 20, 30, 4, 1, 2, 3, 0.75]);

    const metrics = measureKonveyerComputeCarrier(carrier);
    expect(metrics.byteLength).toBe(4 * 8 * Float32Array.BYTES_PER_ELEMENT);
    expect(metrics.storageVec4Count).toBe(8);

    const storageAttribute = await createKonveyerStorageBufferAttribute(carrier);
    expect(storageAttribute.itemSize).toBe(4);
    expect(storageAttribute.count).toBe(8);
    expect('isStorageBufferAttribute' in storageAttribute).toBe(true);
  });

  it('packs sensor cover samples into the same vec4-pair storage layout', () => {
    const carrier = createKonveyerComputeCarrier('sensor-cover', 2);
    writeSensorCoverSample(carrier, 1, {
      position: [100, 4, 200],
      queryRadius: 28,
      coverNormal: [0, 1, 0],
      coverScore: 0.875,
    });

    const offset = carrier.layout.strideFloats;
    expect(Array.from(carrier.data.slice(offset, offset + 8))).toEqual([100, 4, 200, 28, 0, 1, 0, 0.875]);

    const metrics = measureKonveyerComputeCarrier(carrier);
    expect(metrics.kind).toBe('sensor-cover');
    expect(metrics.storageElementType).toBe('vec4-pair');
  });

  it('rejects writes outside the fixed capacity', () => {
    const carrier = createKonveyerComputeCarrier('effect-particle', 1);
    expect(() => writeEffectParticle(carrier, 1, {
      position: [0, 0, 0],
      radius: 1,
      velocity: [0, 0, 0],
      lifetimeSec: 1,
    })).toThrow(/outside capacity/);
  });
});
