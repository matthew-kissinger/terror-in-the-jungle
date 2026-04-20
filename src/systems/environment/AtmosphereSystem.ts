import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ICloudRuntime, ISkyRuntime } from '../../types/SystemInterfaces';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import { NullSkyBackend } from './atmosphere/NullSkyBackend';

/**
 * Architectural seam for sky / sun / cloud state. See `docs/ATMOSPHERE.md`
 * for the design and roadmap (Hosek-Wilkie analytic, prebaked cubemap,
 * volumetric for fly-through).
 *
 * This cycle (2026-04-20-atmosphere-foundation) is shell-only: the system
 * holds a swappable `ISkyBackend` (defaulting to `NullSkyBackend`, which
 * mirrors the legacy `Skybox` + `setupLighting()` constants) and exposes
 * the `ISkyRuntime` + `ICloudRuntime` surface. `Skybox` keeps rendering;
 * `WeatherSystem` keeps mutating lights directly. No visible change.
 *
 * Lives in the existing `World` tracked group in `SystemUpdater` (no new
 * budget group). `update()` is a thin pass-through to the backend so future
 * backends can wake up here.
 */
export class AtmosphereSystem implements GameSystem, ISkyRuntime, ICloudRuntime {
  private backend: ISkyBackend;
  private readonly sunDirection = new THREE.Vector3(0, 80, -50).normalize();
  private cloudCoverage = 0;

  constructor(backend?: ISkyBackend) {
    this.backend = backend ?? new NullSkyBackend();
  }

  async init(): Promise<void> {
    // No-op this cycle; backends with async resources (e.g. cubemap bake)
    // will hook in here.
  }

  update(deltaTime: number): void {
    this.backend.update(deltaTime, this.sunDirection);
  }

  dispose(): void {
    // No owned GPU resources yet.
  }

  /** Swap backends at runtime (used by future TOD presets and tests). */
  setBackend(backend: ISkyBackend): void {
    this.backend = backend;
  }

  // --- ISkyRuntime ---

  getSunDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.sunDirection);
  }

  getSunColor(out: THREE.Color): THREE.Color {
    return this.backend.getSun(out);
  }

  getSkyColorAtDirection(dir: THREE.Vector3, out: THREE.Color): THREE.Color {
    return this.backend.sample(dir, out);
  }

  getZenithColor(out: THREE.Color): THREE.Color {
    return this.backend.getZenith(out);
  }

  getHorizonColor(out: THREE.Color): THREE.Color {
    return this.backend.getHorizon(out);
  }

  // --- ICloudRuntime ---

  getCoverage(): number {
    return this.cloudCoverage;
  }

  setCoverage(v: number): void {
    this.cloudCoverage = Math.max(0, Math.min(1, v));
  }
}
