import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { MathUtils } from '../../utils/Math';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { BiomeVegetationEntry } from '../../config/biomes';

const coconutOnly: VegetationTypeConfig[] = [
  {
    id: 'coconut',
    textureName: 'PixelForge.Vegetation.coconut.color',
    normalTextureName: 'PixelForge.Vegetation.coconut.normal',
    size: 10,
    maxInstances: 1000,
    yOffset: 4,
    fadeDistance: 350,
    maxDistance: 400,
    baseDensity: 8,
    placement: 'poisson',
    poissonMinDistance: 12,
    tier: 'midLevel',
    representation: 'imposter',
    atlasProfile: 'mid-balanced',
    shaderProfile: 'normal-lit',
    imposterAtlas: {
      tilesX: 4,
      tilesY: 4,
      layout: 'latlon',
      tileSize: 512,
    },
    normalSpace: 'capture-view',
  },
];

const palette: BiomeVegetationEntry[] = [
  { typeId: 'coconut', densityMultiplier: 1 },
];

describe('ChunkVegetationGenerator', () => {
  beforeEach(() => {
    ((ChunkVegetationGenerator as any).poissonTemplateCache as Map<string, unknown>).clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces different vegetation placements for different chunks (per-cell offsets on top of cached templates)', () => {
    const template = [
      new THREE.Vector2(10, 10),
      new THREE.Vector2(20, 20),
      new THREE.Vector2(30, 30),
    ];
    vi.spyOn(MathUtils, 'poissonDiskSampling').mockReturnValue(template);

    const getHeight = () => 5;
    const first = ChunkVegetationGenerator.generateVegetation(0, 0, 64, getHeight, coconutOnly, palette);
    const second = ChunkVegetationGenerator.generateVegetation(1, 0, 64, getHeight, coconutOnly, palette);

    const firstInstances = first.get('coconut') ?? [];
    const secondInstances = second.get('coconut') ?? [];

    expect(firstInstances.length).toBeGreaterThan(0);
    expect(secondInstances.length).toBeGreaterThan(0);

    // Positions in adjacent chunks should not land on identical local coordinates -
    // otherwise neighboring chunks would show a visible tiled pattern.
    const firstLocal = firstInstances[0].position.x % 64;
    const secondLocal = secondInstances[0].position.x % 64;
    expect(secondLocal).not.toBeCloseTo(firstLocal, 5);
  });
});
