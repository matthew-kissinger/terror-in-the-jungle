import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ICloudRuntime, IGameRenderer, ISkyRuntime } from '../../types/SystemInterfaces';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import { HosekWilkieSkyBackend } from './atmosphere/HosekWilkieSkyBackend';
import { CloudLayer } from './atmosphere/CloudLayer';
import {
  SCENARIO_ATMOSPHERE_PRESETS,
  computeSunDirectionAtTime,
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

/** Distance from origin at which the directional "sun" light is placed. */
const SUN_LIGHT_DISTANCE = 500;
/** Scales horizon color to approximate ground bounce (not a pure mirror of horizon). */
const HEMISPHERE_GROUND_DARKEN = 0.55;
/** Minimum Y for the sun light position — prevents degenerate shadow camera when sun is at/below horizon. */
const MIN_SUN_Y = 20;

/**
 * Architectural seam for sky / sun / cloud state. See `docs/ATMOSPHERE.md`
 * for the design and roadmap (Hosek-Wilkie analytic, prebaked cubemap,
 * volumetric for fly-through).
 *
 * Cycle 2026-04-21 (`atmosphere-day-night-cycle`): preset-driven animated
 * sun direction. Presets carry an optional `todCycle` and, when present,
 * `update(dt)` advances `simulationTimeSeconds` and recomputes
 * `sunDirection` via `computeSunDirectionAtTime`. Presets without a
 * `todCycle` (e.g. `combat120`) stay static to preserve perf baselines.
 *
 * Cycle 2026-04-21 (`skybox-cutover-no-fallbacks`): single-authority
 * analytic dome. The `HosekWilkieSkyBackend` is instantiated in the
 * constructor and a sane bootstrap preset (`combat120` noon) is applied
 * immediately, so the very first rendered frame already shows a real sky.
 * `applyScenarioPreset(<scenario>)` at scenario boot then switches to the
 * per-scenario look. The legacy `Skybox` PNG dome and `NullSkyBackend`
 * fallback are gone.
 *
 * Prior cycles (kept here as history):
 * - Round 2 (`atmosphere-hosek-wilkie-sky`): introduced the analytic dome
 *   alongside the legacy `Skybox` PNG; switchover on `applyScenarioPreset`.
 * - Round 3 (`atmosphere-fog-tinted-by-sky`): owns `scene.fog.color`.
 *   `WeatherAtmosphere` forwards storm-darken + underwater-override intent
 *   here instead of writing `fog.color` directly, so the horizon seam
 *   disappears at every sun angle.
 * - Round 3 (`atmosphere-sun-hemisphere-coupling`): source of truth for
 *   directional sun light position + color, hemisphere sky/ground tint,
 *   and the water system's sun vector. Weather intensity multipliers
 *   layer on top in `WeatherAtmosphere`.
 *
 * Lives in the existing `World` tracked group in `SystemUpdater` (no new
 * budget group). `update()` forwards sun direction to the backend, then
 * pushes light + fog state onto the bound renderer.
 */
export class AtmosphereSystem implements GameSystem, ISkyRuntime, ICloudRuntime {
  /** Bootstrap preset applied at construction so the first frame has a real sky. */
  private static readonly BOOTSTRAP_PRESET: ScenarioAtmosphereKey = 'combat120';

  private backend: ISkyBackend;
  private hosekBackend: HosekWilkieSkyBackend;
  private scene?: THREE.Scene;
  private domeMesh: THREE.Mesh;
  private cloudLayer: CloudLayer;
  private cloudMesh: THREE.Mesh;
  private currentScenario?: ScenarioAtmosphereKey;
  private readonly sunDirection = new THREE.Vector3(0, 80, -50).normalize();
  /** Per-scenario cloud coverage baseline (preset-driven). Weather multiplies on top. */
  private presetCloudCoverage = 0;
  /** Weather-driven cloud coverage target (0..1). Blended into coverage each frame. */
  private weatherCloudCoverage = 0;
  /** True while a weather-override coverage target is active (STORM/RAIN). */
  private weatherCloudActive = false;

  // Animated sun direction is driven by `simulationTimeSeconds` via the
  // active preset's optional `todCycle`. Presets without a `todCycle` hold
  // the sun static at `(sunAzimuthRad, sunElevationRad)` — the v1 behaviour.
  // A fresh scenario resets simTime to 0, so `applyScenarioPreset()` is
  // idempotent and the boot frame matches the configured static angle.
  private simulationTimeSeconds = 0;

  // Renderer + (optional) follow target are bound post-construction so
  // AtmosphereSystem can drive `scene.fog.color` AND directional moonLight
  // + hemisphereLight directly each frame without GameRenderer needing to
  // know about backend internals.
  private renderer?: IGameRenderer;
  private followTarget?: THREE.Object3D;

  // Fog-tint plumbing (`atmosphere-fog-tinted-by-sky`). WeatherAtmosphere
  // forwards storm-darken + underwater-override intent here; this system
  // is the single authority that reconciles them with the sky-driven
  // horizon tint each frame.
  private fogDarkenFactor = 1.0;
  private fogUnderwaterOverride = false;
  private readonly underwaterFogColor = new THREE.Color(UNDERWATER_FOG_COLOR);

  // Scratch vectors/colors to avoid per-frame allocation.
  private readonly scratchSunColor = new THREE.Color();
  private readonly scratchZenith = new THREE.Color();
  private readonly scratchHorizon = new THREE.Color();
  private readonly scratchSunPosition = new THREE.Vector3();
  private readonly scratchCloudSunColor = new THREE.Color();
  private readonly cameraPosition = new THREE.Vector3();
  /** Local terrain Y at the camera; 0 if no follow target. */
  private terrainYAtCamera = 0;

  constructor() {
    this.hosekBackend = new HosekWilkieSkyBackend();
    this.backend = this.hosekBackend;
    this.domeMesh = this.hosekBackend.getMesh();
    this.cloudLayer = new CloudLayer();
    this.cloudMesh = this.cloudLayer.getMesh();
    // Apply bootstrap preset synchronously so the first render sees a real
    // sky — no NullSkyBackend flat-color frame, no legacy PNG fallback.
    this.applyScenarioPreset(AtmosphereSystem.BOOTSTRAP_PRESET);
  }

  async init(): Promise<void> {
    // No-op this cycle; backends with async resources (e.g. cubemap bake)
    // will hook in here.
  }

  update(deltaTime: number): void {
    // Advance simulated time and refresh the sun direction if the active
    // preset carries a `todCycle`. Without a cycle the sun stays at the
    // static preset angle (set in `applyScenarioPreset`).
    this.simulationTimeSeconds += deltaTime;
    const preset = this.getCurrentPreset();
    if (preset?.todCycle) {
      computeSunDirectionAtTime(preset, this.simulationTimeSeconds, this.sunDirection);
    }

    this.backend.update(deltaTime, this.sunDirection);
    this.applyToRenderer();
    this.applyFogColor();
    this.updateCloudLayer();
  }

  dispose(): void {
    if (this.scene && this.domeMesh) {
      this.scene.remove(this.domeMesh);
    }
    if (this.scene && this.cloudMesh) {
      this.scene.remove(this.cloudMesh);
    }
    this.cloudLayer.dispose();
    this.hosekBackend.dispose();
    this.renderer = undefined;
    this.followTarget = undefined;
  }

  /**
   * Bind a scene so the analytic sky dome can be installed. Safe to call
   * multiple times; the dome is reparented to the most recent scene.
   */
  attachScene(scene: THREE.Scene): void {
    if (this.scene === scene) return;
    if (this.scene) {
      this.scene.remove(this.domeMesh);
      this.scene.remove(this.cloudMesh);
    }
    this.scene = scene;
    this.scene.add(this.domeMesh);
    this.scene.add(this.cloudMesh);
  }

  /**
   * Apply a scenario preset (sun direction, turbidity, ground albedo,
   * exposure, fog density) to the analytic dome. Idempotent; calling with
   * the same key just reapplies the preset. Returns true when the preset
   * exists; false (with a warning) when the key is unknown — callers use
   * the boolean to fall back to the previously-active preset.
   */
  applyScenarioPreset(key: ScenarioAtmosphereKey): boolean {
    const preset = SCENARIO_ATMOSPHERE_PRESETS[key];
    if (!preset) {
      Logger.warn('atmosphere', `No scenario preset registered for key '${key}'; keeping current backend.`);
      return false;
    }

    this.hosekBackend.applyPreset(preset);
    // Reset sim time so the boot frame matches the preset's configured
    // static angle, even when a `todCycle` is set. `computeSunDirectionAtTime`
    // returns the static angle at t=0 by construction.
    this.simulationTimeSeconds = 0;
    sunDirectionFromPreset(preset, this.sunDirection);
    this.currentScenario = key;
    // Fog density tracks the preset alongside sky color
    // (`fog-density-rebalance`). Weather modulates this base per-frame
    // (x1.5 rain, x3.5 storm); `WaterSystem` overrides to 0.04 underwater.
    if (this.renderer?.fog) {
      this.renderer.fog.density = preset.fogDensity;
    }

    // Apply per-scenario cloud coverage default. Scenarios without an
    // explicit `cloudCoverageDefault` fall through to 0 (clear sky), which
    // preserves the pre-cloud-runtime baseline for perf-sensitive scenes.
    this.presetCloudCoverage = preset.cloudCoverageDefault ?? 0;
    this.weatherCloudActive = false;
    this.weatherCloudCoverage = 0;
    this.cloudLayer.setCoverage(this.presetCloudCoverage);

    Logger.info('atmosphere', `Applied scenario preset '${key}' (${preset.label})`);

    // Force LUT bake immediately so subsequent samples are consistent.
    this.hosekBackend.update(0, this.sunDirection);
    return true;
  }

  /**
   * Test hook: override the simulated time (in seconds) used to animate
   * the sun. Production code does not call this; it exists so behavior
   * tests can sweep the sun across a day without 10 minutes of real time.
   */
  setSimulationTimeSeconds(seconds: number): void {
    this.simulationTimeSeconds = seconds;
    const preset = this.getCurrentPreset();
    if (preset?.todCycle) {
      computeSunDirectionAtTime(preset, this.simulationTimeSeconds, this.sunDirection);
    }
  }

  /** Current simulated time in seconds since the last scenario boot. */
  getSimulationTimeSeconds(): number {
    return this.simulationTimeSeconds;
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
    this.domeMesh.position.copy(cameraPosition);
    this.cameraPosition.copy(cameraPosition);
  }

  /**
   * Optional local-terrain Y at the camera. When provided, the cloud
   * plane sits at `terrainY + baseAltitude` so the flight-envelope clearance
   * is measured above ground, not world origin. Defaults to 0 when unset.
   */
  setTerrainYAtCamera(y: number): void {
    if (Number.isFinite(y)) {
      this.terrainYAtCamera = y;
    }
  }

  /** Swap backends at runtime (used by future TOD presets and tests). */
  setBackend(backend: ISkyBackend): void {
    this.backend = backend;
  }

  /**
   * Cache the renderer so per-frame updates can drive `scene.fog.color`
   * (sky-tint + storm darken + underwater override) AND sun + hemisphere
   * light state directly. Applies once immediately so initial frames
   * (pre-gameStarted) show correct sky-derived lighting.
   */
  setRenderer(renderer: IGameRenderer): void {
    this.renderer = renderer;
    this.applyToRenderer();
  }

  /**
   * Bind a follow target (typically the player camera) for shadow frustum
   * recentering. Without a follow target, shadows stay centered on origin.
   */
  setShadowFollowTarget(target: THREE.Object3D | undefined): void {
    this.followTarget = target;
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

  private applyToRenderer(): void {
    const renderer = this.renderer;
    if (!renderer) return;

    // Sun direction + color drive the directional "moon" light.
    if (renderer.moonLight) {
      // Start with a sun-direction-scaled offset. Clamp Y so the light
      // stays above a minimum altitude even if the atmosphere model dips
      // the sun to/below the horizon — a degenerate near-horizontal
      // shadow frustum eats precision and can blank out shadows.
      this.scratchSunPosition
        .copy(this.sunDirection)
        .multiplyScalar(SUN_LIGHT_DISTANCE);
      if (this.scratchSunPosition.y < MIN_SUN_Y) {
        this.scratchSunPosition.y = MIN_SUN_Y;
      }

      // Recenter the shadow frustum on the follow target's XZ so shadows
      // stay sharp near the player regardless of sun angle. The frustum
      // extents (±100m or ±70m per GPU tier) stay fixed; only the origin
      // slides with the player. Target stays at terrain level so the
      // camera still points generally downward.
      if (this.followTarget) {
        const t = this.followTarget.position;
        renderer.moonLight.position.set(
          this.scratchSunPosition.x + t.x,
          this.scratchSunPosition.y,
          this.scratchSunPosition.z + t.z
        );
        renderer.moonLight.target.position.set(t.x, 0, t.z);
      } else {
        renderer.moonLight.position.copy(this.scratchSunPosition);
        renderer.moonLight.target.position.set(0, 0, 0);
      }
      renderer.moonLight.target.updateMatrixWorld();

      this.backend.getSun(this.scratchSunColor);
      renderer.moonLight.color.copy(this.scratchSunColor);

      // Matrix world must be updated manually; setupLighting() no longer
      // freezeTransform()s this light but without an explicit update here
      // the shadow-map machinery would read a stale world matrix on the
      // very next render pass.
      renderer.moonLight.updateMatrixWorld();
    }

    // Hemisphere sky + ground colors drive the indirect bounce fill. The
    // ground color is a darkened horizon sample — the horizon is the
    // dominant contributor to terrain-bounced light in the jungle scene.
    if (renderer.hemisphereLight) {
      this.backend.getZenith(this.scratchZenith);
      this.backend.getHorizon(this.scratchHorizon);
      renderer.hemisphereLight.color.copy(this.scratchZenith);
      renderer.hemisphereLight.groundColor
        .copy(this.scratchHorizon)
        .multiplyScalar(HEMISPHERE_GROUND_DARKEN);
      renderer.hemisphereLight.updateMatrixWorld();
    }
  }

  /**
   * Push the current sky-derived fog color onto the renderer's
   * `THREE.FogExp2` each frame. Kept separate from `applyToRenderer` so
   * tests can drive the fog path without a renderer reference.
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

  /**
   * Weather-state cloud coverage intent. Mirrors the `FogTintIntentReceiver`
   * pattern: `WeatherAtmosphere` computes a transitionProgress-blended
   * target and forwards it here each frame. `active === false` releases
   * the override and the layer returns to the per-scenario preset default.
   */
  setCloudCoverageIntent(active: boolean, target: number): void {
    this.weatherCloudActive = active;
    this.weatherCloudCoverage = Math.max(0, Math.min(1, target));
  }

  /**
   * Per-frame cloud-layer update. Pushes the authoritative sun direction
   * and sun color into the cloud shader and repositions the plane above
   * the camera at the configured base altitude. No-ops gracefully when
   * no scene has been attached (menu/test phase).
   */
  private updateCloudLayer(): void {
    if (!this.scene) return;

    // Reconcile preset default with weather override. The weather path
    // only raises coverage (storm overcasts the sky even at a "clear"
    // preset); it should never hide a heavily-clouded preset below its
    // baseline.
    const effective = this.weatherCloudActive
      ? Math.max(this.presetCloudCoverage, this.weatherCloudCoverage)
      : this.presetCloudCoverage;
    this.cloudLayer.setCoverage(effective);

    this.backend.getSun(this.scratchCloudSunColor);
    this.cloudLayer.update(
      this.cameraPosition,
      this.terrainYAtCamera,
      this.sunDirection,
      this.scratchCloudSunColor
    );
  }

  // --- ICloudRuntime ---

  getCoverage(): number {
    return this.cloudLayer.getCoverage();
  }

  setCoverage(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    // Direct `setCoverage` calls overwrite both the preset baseline and
    // any active weather override — callers bypassing the intent API are
    // typically tests or debug UI that want to see a specific coverage.
    this.presetCloudCoverage = clamped;
    this.weatherCloudActive = false;
    this.weatherCloudCoverage = 0;
    this.cloudLayer.setCoverage(clamped);
  }
}
