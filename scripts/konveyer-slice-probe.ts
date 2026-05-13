#!/usr/bin/env tsx

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';
import {
  createTslInstancedImposterSlice,
  disposeKonveyerInstancedSlice,
  measureKonveyerInstancedSlice,
  populateKonveyerSliceMatrices,
  type KonveyerInstancedSliceSurface,
} from '../src/rendering/KonveyerInstancedSlice';

type SurfaceArg = 'vegetation' | 'combatant';

type SliceProbeResult = {
  createdAt: string;
  source: string;
  surfaceArg: SurfaceArg;
  surface: KonveyerInstancedSliceSurface;
  config: {
    maxInstances: number;
    activeInstances: number;
    width: number;
    height: number;
    alphaTest: number;
  };
  metrics: ReturnType<typeof measureKonveyerInstancedSlice>;
  nonClaims: string[];
};

const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'perf');

function timestampSlug(): string {
  return new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
}

function readSurfaceArg(): SurfaceArg {
  const surfaceIndex = process.argv.indexOf('--surface');
  const value = surfaceIndex >= 0 ? process.argv[surfaceIndex + 1] : 'vegetation';
  if (value === 'vegetation' || value === 'combatant') return value;
  throw new Error(`Unsupported KONVEYER slice surface: ${value ?? 'missing'}`);
}

function createProbeTexture(): THREE.DataTexture {
  const pixels = new Uint8Array([
    28, 84, 40, 255,
    58, 124, 60, 255,
    92, 142, 72, 180,
    10, 24, 12, 0,
  ]);
  const texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);
  texture.name = 'konveyer-probe-alpha-texture';
  texture.needsUpdate = true;
  return texture;
}

function resolveConfig(surfaceArg: SurfaceArg): {
  surface: KonveyerInstancedSliceSurface;
  maxInstances: number;
  activeInstances: number;
  width: number;
  height: number;
  alphaTest: number;
} {
  if (surfaceArg === 'combatant') {
    return {
      surface: 'combatant-impostor',
      maxInstances: 3_000,
      activeInstances: 120,
      width: 2.2,
      height: 4.2,
      alphaTest: 0.18,
    };
  }

  return {
    surface: 'vegetation-billboard',
    maxInstances: 16_384,
    activeInstances: 8_192,
    width: 5.5,
    height: 8.5,
    alphaTest: 0.25,
  };
}

async function main(): Promise<void> {
  const createdAt = new Date().toISOString();
  const surfaceArg = readSurfaceArg();
  const config = resolveConfig(surfaceArg);
  const slice = await createTslInstancedImposterSlice({
    surface: config.surface,
    maxInstances: config.maxInstances,
    width: config.width,
    height: config.height,
    texture: createProbeTexture(),
    alphaTest: config.alphaTest,
  });

  try {
    populateKonveyerSliceMatrices(slice, config.activeInstances);
    const metrics = measureKonveyerInstancedSlice(slice);
    const result: SliceProbeResult = {
      createdAt,
      source: 'scripts/konveyer-slice-probe.ts',
      surfaceArg,
      surface: config.surface,
      config,
      metrics,
      nonClaims: [
        'This probe constructs and measures a TSL instanced impostor slice; it does not claim full production visual parity.',
        'This probe does not replace headed WebGPU strict rendering proof.',
        'This probe keeps CPU authority for transforms and does not claim compute migration.',
      ],
    };

    const artifactDir = join(ARTIFACT_ROOT, timestampSlug(), `konveyer-${surfaceArg}-slice`);
    mkdirSync(artifactDir, { recursive: true });
    const artifactPath = join(artifactDir, 'slice.json');
    writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`);

    console.log(`KONVEYER ${surfaceArg} slice written to ${artifactPath}`);
    console.log(`surface=${metrics.surface}`);
    console.log(`capacity=${metrics.maxInstances}`);
    console.log(`activeInstances=${metrics.activeInstances}`);
    console.log(`estimatedGpuWritableBytes=${metrics.estimatedGpuWritableBytes}`);
    console.log(`nodeMaterial=${metrics.nodeMaterial}`);
    console.log(`shaderStringCount=${metrics.shaderStringCount}`);
  } finally {
    disposeKonveyerInstancedSlice(slice);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
