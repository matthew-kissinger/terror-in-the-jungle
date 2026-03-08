import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ChunkVegetationGenerator } from './ChunkVegetationGenerator';
import { MathUtils } from '../../utils/Math';
import type { VegetationTypeConfig } from '../../config/vegetationTypes';
import type { BiomeVegetationEntry } from '../../config/biomes';

const coconutOnly: VegetationTypeConfig[] = [
  {
    id: 'coconut',
    textureName: 'CoconutPalm',
    size: 10,
    maxInstances: 1000,
    yOffset: 4,
    fadeDistance: 350,
    maxDistance: 400,
    baseDensity: 8,
    placement: 'poisson',
    poissonMinDistance: 12,
    tier: 'midLevel',
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

  it('reuses cached Poisson templates for repeated generation profiles', () => {
    const poissonSpy = vi.spyOn(MathUtils, 'poissonDiskSampling');

    const getHeight = () => 5;
    ChunkVegetationGenerator.generateVegetation(0, 0, 64, getHeight, coconutOnly, palette);
    ChunkVegetationGenerator.generateVegetation(1, 0, 64, getHeight, coconutOnly, palette);

    expect(poissonSpy).toHaveBeenCalledTimes(1);
  });

  it('applies deterministic per-cell offsets on top of cached Poisson templates', () => {
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

    const firstLocal = firstInstances[0].position.x % 64;
    const secondLocal = secondInstances[0].position.x % 64;
    expect(secondLocal).not.toBeCloseTo(firstLocal, 5);
  });
});
