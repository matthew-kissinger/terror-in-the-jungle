import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ICloudRuntime, IGameRenderer, ISkyRuntime } from '../../types/SystemInterfaces';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import { NullSkyBackend } from './atmosphere/NullSkyBackend';
import { HosekWilkieSkyBackend } from './atmosphere/HosekWilkieSkyBackend';
import {
  SCENARIO_ATMOSPHERE_PRESETS,
  scenarioKeyForMode,
  sunDirectionFromPreset,
  type AtmospherePreset,
  type ScenarioAtmosphereKey,
} from './atmosphere/ScenarioAtmospherePresets';
import { GameMode } from '../../config/gameModeTypes';
import { Logger } from '../../utils/Logger';

/**
 * Hard-override color for the submerged fog path. Matches the legacy
 * `WeatherAtmosphere.updateAtmosphere` underwater branch so surfacing
 * and submerging look identical before and after atmosphere-driven fog.
 */
const UNDERWATER_FOG_COLOR = 0x003344;

/**
 * Architectural seam for sky / sun / cloud state. See `docs/ATMOSPHERE.md`
 * for the design and roadmap (Hosek-Wilkie analytic, prebaked cubemap,
 * volumetric for fly-through).
 *
 * Cycle 2026-04-20-atmosphere-foundation, round 2: this system now owns
 * the analytic Hosek-Wilkie sky dome (replacing the legacy `Skybox`'s
 * static equirectangular PNG) and exposes a per-scenario preset switch
 * via `applyScenarioPreset`. The legacy `Skybox` still exists but logs a
 * deprecation warning on construction; the engine wires the dome here
 * once at boot.
 *
 * Lives in the existing `World` tracked group in `SystemUpdater` (no new
 * budget group). `update()` forwards the current sun direction to the
 * backend so it can re-bake its CPU-side LUT when needed.
 */
export class AtmosphereSystem implements GameSystem, ISkyRuntime, ICloudRuntime {
  private backend: ISkyBackend;
  private hosekBackend?: HosekWilkieSkyBackend;
  private scene?: THREE.Scene;
  private domeMesh?: THREE.Mesh;
  private currentScenario?: ScenarioAtmosphereKey;
  private readonly sunDirection = new THREE.Vector3(0, 80, -50).normalize();
  private cloudCoverage = 0;

  // Fog-tint plumbing (see `atmosphere-fog-tinted-by-sky`). The atmosphere
  // system owns the single source of truth for `scene.fog.color` so the
  // horizon seam disappears at every sun angle. `WeatherAtmosphere`
  // forwards its intent (storm darken + underwater override) here instead
  // of writing `fog.color` directly.
  private renderer?: IGameRenderer;
  private fogDarkenFactor = 1.0;
  private fogUnderwaterOverride = false;
  private readonly scratchHorizon = new THREE.Color();
  private readonly underwaterFogColor = new THREE.Color(UNDERWATER_FOG_COLOR);

  constructor(backend?: ISkyBackend) {
    this.backend = backend ?? new NullSkyBackend();
  }

  async init(): Promise<void> {
    // No-op this cycle; backends with async resources (e.g. cubemap bake)
    // will hook in here.
  }

  update(deltaTime: number): void {
    this.backend.update(deltaTime, this.sunDirection);
    this.applyFogColor();
  }

  dispose(): void {
    if (this.scene && this.domeMesh) {
      this.scene.remove(this.domeMesh);
    }
    this.hosekBackend?.dispose();
    this.hosekBackend = undefined;
    this.domeMesh = undefined;
  }

  /**
   * Bind a scene so the analytic sky dome can be installed when a
   * Hosek-Wilkie scenario preset is applied. Safe to call multiple times;
   * the dome is reparented to the most recent scene.
   */
  attachScene(scene: THREE.Scene): void {
    if (this.scene === scene) return;
    if (this.scene && this.domeMesh) {
      this.scene.remove(this.domeMesh);
    }
    this.scene = scene;
    if (this.domeMesh) {
      this.scene.add(this.domeMesh);
    }
  }

  /**
   * Switch the active backend to the analytic Hosek-Wilkie dome and apply
   * the given scenario preset (sun direction, turbidity, ground albedo,
   * exposure). Idempotent; calling with the same key just reapplies the
   * preset. Returns true if the dome was installed (which signals the
   * caller to skip the legacy `Skybox` PNG load).
   */
  applyScenarioPreset(key: ScenarioAtmosphereKey): boolean {
    const preset = SCENARIO_ATMOSPHERE_PRESETS[key];
    if (!preset) {
      Logger.warn('atmosphere', `No scenario preset registered for key '${key}'; keeping current backend.`);
      return false;
    }

    if (!this.hosekBackend) {
      this.hosekBackend = new HosekWilkieSkyBackend();
      this.backend = this.hosekBackend;
      this.domeMesh = this.hosekBackend.getMesh();
      if (this.scene) this.scene.add(this.domeMesh);
    }

    this.hosekBackend.applyPreset(preset);
    sunDirectionFromPreset(preset, this.sunDirection);
    this.currentScenario = key;
    Logger.info('atmosphere', `Applied scenario preset '${key}' (${preset.label})`);

    // Force LUT bake immediately so subsequent samples are consistent.
    this.hosekBackend.update(0, this.sunDirection);
    return true;
  }

  /** Convenience for callers holding a `GameMode`. */
  applyScenarioPresetForMode(mode: GameMode): boolean {
    return this.applyScenarioPreset(scenarioKeyForMode(mode));
  }

  /** Returns the currently-active preset key, or undefined if none applied. */
  getCurrentScenario(): ScenarioAtmosphereKey | undefined {
    return this.currentScenario;
  }

  /** Returns the currently-active preset, or undefined. */
  getCurrentPreset(): AtmospherePreset | undefined {
    return this.currentScenario ? SCENARIO_ATMOSPHERE_PRESETS[this.currentScenario] : undefined;
  }

  /**
   * Per-frame hook called from the engine loop so the dome stays glued to
   * the camera (no clipping when pilots climb past the dome radius).
   */
  syncDomePosition(cameraPosition: THREE.Vector3): void {
    if (this.domeMesh) {
      this.domeMesh.position.copy(cameraPosition);
    }
  }

  /** Swap backends at runtime (used by future TOD presets and tests). */
  setBackend(backend: ISkyBackend): void {
    this.backend = backend;
  }

  /**
   * Cache the renderer so `update()` can drive `scene.fog.color` from the
   * sky horizon sample each frame. Safe to call multiple times.
   */
  setRenderer(renderer: IGameRenderer): void {
    this.renderer = renderer;
  }

  /**
   * Forward weather-driven fog darkening (STORM dims the horizon tint).
   * Clamped to [0, 1]; the atmosphere system multiplies the sky-horizon
   * color by this factor each frame.
   */
  setFogDarkenFactor(factor: number): void {
    this.fogDarkenFactor = Math.max(0, Math.min(1, factor));
  }

  /**
   * Forward the underwater override. When active, the atmosphere system
   * snaps `scene.fog.color` to `UNDERWATER_FOG_COLOR` regardless of sky
   * state (matches the legacy `0x003344` underwater branch).
   */
  setFogUnderwaterOverride(active: boolean): void {
    this.fogUnderwaterOverride = active;
  }

  /**
   * Push the current sky-derived fog color onto the renderer's
   * `THREE.FogExp2` each frame. Kept separate from backend update so tests
   * can drive the fog path without a renderer reference.
   *
   * The horizon-ring average is the match that kills the seam at every
   * camera yaw: ground-level framings render fog at the same color the
   * analytic dome paints along `view.y ≈ 0`, so the terrain edge no
   * longer punches a hard line through the sky.
   */
  private applyFogColor(): void {
    const fog = this.renderer?.fog;
    if (!fog) return;

    if (this.fogUnderwaterOverride) {
      fog.color.copy(this.underwaterFogColor);
      return;
    }

    this.backend.getHorizon(this.scratchHorizon);
    const f = this.fogDarkenFactor;
    fog.color.setRGB(
      this.scratchHorizon.r * f,
      this.scratchHorizon.g * f,
      this.scratchHorizon.b * f
    );
  }

  /** True when the analytic dome owns the sky (Skybox PNG should be skipped). */
  ownsSkyDome(): boolean {
    return this.domeMesh !== undefined;
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
