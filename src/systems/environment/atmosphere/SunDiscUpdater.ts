// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { ITerrainRuntime } from '../../../types/SystemInterfaces';
import { SunDiscMesh } from './SunDiscMesh';
import { publishSunDiscConfig } from './SunDiscConfig';
import {
  sampleTerrainHorizonOcclusion,
  type HorizonSample,
} from './SunDiscHorizonOcclusion';

type SunDiscRendererBackend = 'webgpu' | 'webgl' | 'webgpu-webgl-fallback' | 'unknown';

/**
 * Owns the visible sun-disc sprite and its per-frame drive, keeping that concern
 * out of `AtmosphereSystem` (which is at its source budget). Wraps
 * {@link SunDiscMesh} and adds the terrain-horizon occlusion fade so the body no
 * longer shines through ridgelines: a cheap CPU horizon march
 * (`sampleTerrainHorizonOcclusion`) reduces disc opacity as the sun drops behind
 * a sampled ridge. Terrain is optional (read-only height queries only); without
 * it the disc keeps the plain below-horizon hide.
 */
export class SunDiscUpdater {
  private readonly disc: SunDiscMesh;
  private terrain?: ITerrainRuntime;
  /** Reused sample buffer so the per-frame horizon march allocates nothing. */
  private readonly samples: HorizonSample[] = [];

  constructor(domeRadius: number) {
    this.disc = new SunDiscMesh(domeRadius);
    // Mirror the V2 rebuild kill-switch onto `window.__sunDisc` (headless A/B).
    publishSunDiscConfig();
  }

  /** The disc mesh, so `AtmosphereSystem` can attach it to the scene once. */
  getMesh(): THREE.Mesh {
    return this.disc.getMesh();
  }

  /** Swap the disc material to the explicit WebGL2 fallback (or back to TSL). */
  setRendererBackend(backend: SunDiscRendererBackend): void {
    this.disc.setRendererBackend(backend);
  }

  /** Bind (or clear) the read-only terrain-height query used by the horizon march. */
  setTerrainRuntime(terrain: ITerrainRuntime | undefined): void {
    this.terrain = terrain;
  }

  /**
   * Per-frame drive. `enabled` lets a dev A/B toggle hide the sprite; `sunColor`
   * is the backend's elevation-keyed chromaticity. Computes the terrain-horizon
   * occlusion fade and forwards everything to the disc.
   */
  update(
    enabled: boolean,
    cameraPosition: THREE.Vector3,
    sunDirection: THREE.Vector3,
    sunColor: THREE.Color,
  ): void {
    this.disc.setEnabled(enabled);
    const occlusion = this.terrain
      ? sampleTerrainHorizonOcclusion(this.terrain, cameraPosition, sunDirection, this.samples)
      : 1;
    this.disc.update(cameraPosition, sunDirection, sunColor, occlusion);
  }

  dispose(): void {
    this.disc.dispose();
  }
}
