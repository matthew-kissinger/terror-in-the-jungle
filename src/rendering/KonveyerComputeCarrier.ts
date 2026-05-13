import type * as THREE from 'three';

export type KonveyerComputeCarrierKind = 'effect-particle' | 'sensor-cover';

export interface KonveyerComputeCarrierLayout {
  kind: KonveyerComputeCarrierKind;
  strideFloats: number;
  fields: readonly string[];
}

export interface KonveyerComputeCarrier {
  layout: KonveyerComputeCarrierLayout;
  capacity: number;
  data: Float32Array;
}

export interface EffectParticleSample {
  position: readonly [number, number, number];
  radius: number;
  velocity: readonly [number, number, number];
  lifetimeSec: number;
}

export interface SensorCoverSample {
  position: readonly [number, number, number];
  queryRadius: number;
  coverNormal: readonly [number, number, number];
  coverScore: number;
}

export interface KonveyerComputeCarrierMetrics {
  kind: KonveyerComputeCarrierKind;
  capacity: number;
  strideFloats: number;
  byteLength: number;
  storageElementType: 'vec4-pair';
  storageVec4Count: number;
}

export const EFFECT_PARTICLE_LAYOUT: KonveyerComputeCarrierLayout = {
  kind: 'effect-particle',
  strideFloats: 8,
  fields: [
    'position.x',
    'position.y',
    'position.z',
    'radius',
    'velocity.x',
    'velocity.y',
    'velocity.z',
    'lifetimeSec',
  ],
};

export const SENSOR_COVER_LAYOUT: KonveyerComputeCarrierLayout = {
  kind: 'sensor-cover',
  strideFloats: 8,
  fields: [
    'position.x',
    'position.y',
    'position.z',
    'queryRadius',
    'coverNormal.x',
    'coverNormal.y',
    'coverNormal.z',
    'coverScore',
  ],
};

export function createKonveyerComputeCarrier(
  kind: KonveyerComputeCarrierKind,
  capacity: number,
): KonveyerComputeCarrier {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`KONVEYER compute carrier capacity must be a positive integer; got ${capacity}.`);
  }
  const layout = kind === 'effect-particle' ? EFFECT_PARTICLE_LAYOUT : SENSOR_COVER_LAYOUT;
  return {
    layout,
    capacity,
    data: new Float32Array(capacity * layout.strideFloats),
  };
}

export function writeEffectParticle(
  carrier: KonveyerComputeCarrier,
  index: number,
  sample: EffectParticleSample,
): void {
  assertCarrierKind(carrier, 'effect-particle');
  const offset = resolveOffset(carrier, index);
  carrier.data[offset] = sample.position[0];
  carrier.data[offset + 1] = sample.position[1];
  carrier.data[offset + 2] = sample.position[2];
  carrier.data[offset + 3] = sample.radius;
  carrier.data[offset + 4] = sample.velocity[0];
  carrier.data[offset + 5] = sample.velocity[1];
  carrier.data[offset + 6] = sample.velocity[2];
  carrier.data[offset + 7] = sample.lifetimeSec;
}

export function writeSensorCoverSample(
  carrier: KonveyerComputeCarrier,
  index: number,
  sample: SensorCoverSample,
): void {
  assertCarrierKind(carrier, 'sensor-cover');
  const offset = resolveOffset(carrier, index);
  carrier.data[offset] = sample.position[0];
  carrier.data[offset + 1] = sample.position[1];
  carrier.data[offset + 2] = sample.position[2];
  carrier.data[offset + 3] = sample.queryRadius;
  carrier.data[offset + 4] = sample.coverNormal[0];
  carrier.data[offset + 5] = sample.coverNormal[1];
  carrier.data[offset + 6] = sample.coverNormal[2];
  carrier.data[offset + 7] = sample.coverScore;
}

export function measureKonveyerComputeCarrier(
  carrier: KonveyerComputeCarrier,
): KonveyerComputeCarrierMetrics {
  return {
    kind: carrier.layout.kind,
    capacity: carrier.capacity,
    strideFloats: carrier.layout.strideFloats,
    byteLength: carrier.data.byteLength,
    storageElementType: 'vec4-pair',
    storageVec4Count: carrier.capacity * 2,
  };
}

export async function createKonveyerStorageBufferAttribute(
  carrier: KonveyerComputeCarrier,
): Promise<THREE.BufferAttribute> {
  const webgpu = await import('three/webgpu');
  return new webgpu.StorageBufferAttribute(carrier.data, 4);
}

function resolveOffset(carrier: KonveyerComputeCarrier, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= carrier.capacity) {
    throw new Error(`KONVEYER compute carrier index ${index} is outside capacity ${carrier.capacity}.`);
  }
  return index * carrier.layout.strideFloats;
}

function assertCarrierKind(
  carrier: KonveyerComputeCarrier,
  expected: KonveyerComputeCarrierKind,
): void {
  if (carrier.layout.kind !== expected) {
    throw new Error(`Expected ${expected} carrier, received ${carrier.layout.kind}.`);
  }
}
