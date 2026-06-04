// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Simple noise generator for procedural terrain generation
 * Based on Perlin noise implementation
 */
export class NoiseGenerator {
  private seed: number;
  private permutation: number[] = [];
  
  constructor(seed: number = 0) {
    this.seed = seed;
    this.initializePermutation();
  }

  private initializePermutation(): void {
    // Create permutation table based on seed
    const p: number[] = [];
    
    // Fill with values 0-255
    for (let i = 0; i < 256; i++) {
      p[i] = i;
    }
    
    // Shuffle using seeded random
    let random = this.seedRandom(this.seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    
    // Duplicate permutation table
    this.permutation = [...p, ...p];
  }

  private seedRandom(seed: number): () => number {
    let x = Math.sin(seed) * 10000;
    return () => {
      x = Math.sin(x) * 10000;
      return x - Math.floor(x);
    };
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  /**
   * Generate 2D Perlin noise
   * @param x X coordinate
   * @param y Y coordinate
   * @returns Noise value between -1 and 1
   */
  noise(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    
    x -= Math.floor(x);
    y -= Math.floor(y);
    
    const u = this.fade(x);
    const v = this.fade(y);
    
    const A = this.permutation[X] + Y;
    const AA = this.permutation[A];
    const AB = this.permutation[A + 1];
    const B = this.permutation[X + 1] + Y;
    const BA = this.permutation[B];
    const BB = this.permutation[B + 1];
    
    return this.lerp(
      this.lerp(
        this.grad(this.permutation[AA], x, y),
        this.grad(this.permutation[BA], x - 1, y),
        u
      ),
      this.lerp(
        this.grad(this.permutation[AB], x, y - 1),
        this.grad(this.permutation[BB], x - 1, y - 1),
        u
      ),
      v
    );
  }

  /**
   * Generate fractal noise (multiple octaves)
   * @param x X coordinate
   * @param y Y coordinate
   * @param octaves Number of noise layers
   * @param persistence How much each octave contributes (0-1)
   * @param scale Base scale
   * @returns Noise value
   */
  fractalNoise(
    x: number, 
    y: number, 
    octaves: number = 4, 
    persistence: number = 0.5, 
    scale: number = 1
  ): number {
    let value = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return value / maxValue;
  }

  /**
   * Generate ridge noise (inverted absolute value)
   */
  ridgedNoise(x: number, y: number): number {
    return 1 - Math.abs(this.noise(x, y));
  }

  /**
   * Generate turbulence (absolute value of fractal noise)
   */
  turbulence(x: number, y: number, octaves: number = 4): number {
    return Math.abs(this.fractalNoise(x, y, octaves));
  }
}