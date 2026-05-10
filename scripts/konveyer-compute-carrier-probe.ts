#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  createKonveyerComputeCarrier,
  createKonveyerStorageBufferAttribute,
  measureKonveyerComputeCarrier,
  writeEffectParticle,
  writeSensorCoverSample,
  type KonveyerComputeCarrier,
  type KonveyerComputeCarrierKind,
} from '../src/rendering/KonveyerComputeCarrier';

type ProbeKind = KonveyerComputeCarrierKind | 'all';

type CarrierProbeSummary = {
  kind: KonveyerComputeCarrierKind;
  activeSamples: number;
  metrics: ReturnType<typeof measureKonveyerComputeCarrier>;
  storageAttribute: {
    itemSize: number;
    count: number;
    isStorageBufferAttribute: boolean;
  };
};

type ComputeCarrierProbeResult = {
  createdAt: string;
  source: string;
  carriers: CarrierProbeSummary[];
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readKind(): ProbeKind {
  const kindIndex = process.argv.indexOf('--kind');
  const value = kindIndex >= 0 ? process.argv[kindIndex + 1] : 'all';
  if (value === 'all' || value === 'effect-particle' || value === 'sensor-cover') return value;
  throw new Error(`Unsupported KONVEYER compute carrier kind: ${value ?? 'missing'}`);
}

function populateEffectCarrier(carrier: KonveyerComputeCarrier, activeSamples: number): void {
  for (let index = 0; index < activeSamples; index++) {
    writeEffectParticle(carrier, index, {
      position: [index % 32, (index % 7) * 0.4, Math.floor(index / 32)],
      radius: 0.8 + (index % 5) * 0.15,
      velocity: [0.1 * (index % 3), 1.2, -0.05 * (index % 4)],
      lifetimeSec: 0.25 + (index % 12) * 0.04,
    });
  }
}

function populateSensorCarrier(carrier: KonveyerComputeCarrier, activeSamples: number): void {
  for (let index = 0; index < activeSamples; index++) {
    writeSensorCoverSample(carrier, index, {
      position: [(index % 60) * 2, 1.6, Math.floor(index / 60) * 2],
      queryRadius: 18 + (index % 4) * 3,
      coverNormal: [0, 1, 0],
      coverScore: (index % 100) / 100,
    });
  }
}

async function summarizeCarrier(kind: KonveyerComputeCarrierKind): Promise<CarrierProbeSummary> {
  const capacity = kind === 'effect-particle' ? 4_096 : 3_000;
  const activeSamples = kind === 'effect-particle' ? 512 : 120;
  const carrier = createKonveyerComputeCarrier(kind, capacity);

  if (kind === 'effect-particle') {
    populateEffectCarrier(carrier, activeSamples);
  } else {
    populateSensorCarrier(carrier, activeSamples);
  }

  const storageAttribute = await createKonveyerStorageBufferAttribute(carrier);
  return {
    kind,
    activeSamples,
    metrics: measureKonveyerComputeCarrier(carrier),
    storageAttribute: {
      itemSize: storageAttribute.itemSize,
      count: storageAttribute.count,
      isStorageBufferAttribute: 'isStorageBufferAttribute' in storageAttribute,
    },
  };
}

async function main(): Promise<void> {
  const kind = readKind();
  const kinds: KonveyerComputeCarrierKind[] = kind === 'all'
    ? ['effect-particle', 'sensor-cover']
    : [kind];
  const carriers = [];
  for (const carrierKind of kinds) {
    carriers.push(await summarizeCarrier(carrierKind));
  }

  const result: ComputeCarrierProbeResult = {
    createdAt: new Date().toISOString(),
    source: 'scripts/konveyer-compute-carrier-probe.ts',
    carriers,
    nonClaims: [
      'This probe validates CPU-authored storage-buffer-ready layouts; it does not dispatch a GPU compute shader.',
      'This probe does not replace strict headed WebGPU adapter proof.',
      'Gameplay authority remains CPU-side until a later compute acceptance gate proves determinism and readback policy.',
    ],
  };

  const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), 'konveyer-compute-carriers');
  mkdirSync(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, 'carriers.json');
  writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`KONVEYER compute carriers written to ${artifactPath}`);
  for (const carrier of carriers) {
    console.log(
      `${carrier.kind}: capacity=${carrier.metrics.capacity} active=${carrier.activeSamples} bytes=${carrier.metrics.byteLength} storageVec4=${carrier.metrics.storageVec4Count}`,
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
