// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { ICloudRuntime, IGameRenderer, ISkyRuntime } from '../../types/SystemInterfaces';
import type { ISkyBackend } from './atmosphere/ISkyBackend';
import { HosekWilkieSkyBackend } from './atmosphere/HosekWilkieSkyBackend';
import { SunDiscMesh } from './atmosphere/SunDiscMesh';
import { createLightingRigState, createRigSceneLightRadiance, deriveLightingRigState, isLightingRigEnabled, lightingRigBindings, publishLightingRigConfig, rigSceneLightRadiance } from './LightingRig';
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
import { isMobileGPU } from '../../utils/DeviceDetector';
import { getWorldBuilderState } from '../../dev/worldBuilder/WorldBuilderConsole';
import { performanceTelemetry } from '../debug/PerformanceTelemetry';

/** Distance from origin at which the directional "sun" light is placed. */
const SUN_LIGHT_DISTANCE = 500;
/**
 * Sky dome radius (mirrored from `HosekWilkieSkyBackend.DOME_RADIUS`). The
 * additive sun-disc sprite sits at this radius * 0.99 so it composites
 * on top of the dome's painted background.
 */
const SKY_DOME_RADIUS = 500;
/** Bootstrap fog fallback mirrored from GameRenderer before the live sky overwrites it. */
const ATMOSPHERE_SNAPSHOT_BOOT_FOG_COLOR = 0x7a8f88;
/**
 * The analytic sky backend stores HDR-ish radiance values. Those values are
 * fine for the baked sky texture, but fog and hemisphere lights need bounded
 * presentation colors or noon scenes collapse into a white fill under WebGPU.
 */
const SKY_LIGHT_MAX_COMPONENT = 0.84;
const SKY_FOG_MAX_COMPONENT = 0.74;
/** Scales horizon color to approximate ground bounce (not a pure mirror of horizon). */
const HEMISPHERE_GROUND_DARKEN = 0.55;
/** Minimum Y for the sun light position — prevents degenerate shadow camera when sun is at/below horizon. */
const MIN_SUN_Y = 20;
/** Cool directional fill used once the authored sun has dropped below the horizon. */
const NIGHT_DIRECTIONAL_LIGHT_COLOR = new THREE.Color(0.18, 0.20, 0.30);
const NIGHT_DIRECTIONAL_LIGHT_DIRECTION = new THREE.Vector3(-0.35, 0.55, 0.72).normalize();
const NIGHT_AMBIENT_LIGHT_COLOR = new THREE.Color(0.055, 0.070, 0.105);
const LOW_SUN_AMBIENT_BLEND_START_Y = 0.14;
const LOW_SUN_AMBIENT_BLEND_FULL_Y = -0.05;

export interface AtmosphereLightingSnapshot {
  /** Raw analytic sun direction. Used by the sky dome and visible sun disc. */
  sunDirection: THREE.Vector3;
  /** Direction used by scene lighting and shadow orientation. */
  directLightDirection: THREE.Vector3;
  /** Color used by the scene directional light and non-PBR impostor lighting. */
  directLightColor: THREE.Color;
  /** Compressed zenith color used by hemisphere/billboard sky fill. */
  skyColor: THREE.Color;
  /** Darkened horizon color used by hemisphere/billboard ground bounce. */
  groundColor: THREE.Color;
  /** Ambient fill color after low-sun/night tinting. */
  ambientColor: THREE.Color;
  /** Fog color after sky compression and weather darken. */
  fogColor: THREE.Color;
  /** Smooth day/night scalar for systems that need to dim authored highlights. */
  daylightFactor: number;
  nightBlend: number;
  sunAboveHorizon: boolean;
}

export function createAtmosphereLightingSnapshot(): AtmosphereLightingSnapshot {
  return {
    sunDirection: new THREE.Vector3(0, 1, 0),
    directLightDirection: new THREE.Vector3(0, 1, 0),
    directLightColor: new THREE.Color(1, 1, 1),
    skyColor: new THREE.Color(0.7, 0.8, 1.0),
    groundColor: new THREE.Color(0.3, 0.3, 0.25),
    ambientColor: new THREE.Color(1, 1, 1),
    fogColor: new THREE.Color(ATMOSPHERE_SNAPSHOT_BOOT_FOG_COLOR),
    daylightFactor: 1,
    nightBlend: 0,
    sunAboveHorizon: true,
  };
}

/**
 * Mobile GPUs pay an outsized cost for the per-fire 8192-pixel sky LUT
 * composite — the `cycle-2026-05-16` emulation capture clocked
 * `World.Atmosphere.SkyTexture` at ~31.6 ms avg EMA under 4x CPU
 * throttle. Stretching the cadence 4x cuts the bucket roughly 4x while
 * leaving cloud / TOD motion visibly smooth (cloud advection samples
 * `cloudTimeSeconds` per refresh; LUT rebakes still fire at the
 * 0.5° sun-direction threshold so dawn/dusk keeps tracking).
 * Desktop default stays at the backend's 2 s constant.
 * See docs/rearch/MOBILE_WEBGPU_AND_SKY_SPIKE_2026-05-16/mobile-startup-and-frame-budget.md.
 */
const MOBILE_SKY_REFRESH_SECONDS = 8;

type RendererBackendProbe = {
  getRendererBackendCapabilities?: () => { resolvedBackend?: string };
};

function compressSkyRadianceForRenderer(color: THREE.Color, maxComponent: number): THREE.Color {
  const peak = Math.max(color.r, color.g, color.b);
  if (peak > maxComponent && peak > 1e-6) {
    color.multiplyScalar(maxComponent / peak);
  }
  color.r = Math.max(0, Math.min(maxComponent, color.r));
  color.g = Math.max(0, Math.min(maxComponent, color.g));
  color.b = Math.max(0, Math.min(maxComponent, color.b));
  return color;
}

function lowSunAmbientBlend(sunY: number): number {
  const raw = (LOW_SUN_AMBIENT_BLEND_START_Y - sunY)
    / (LOW_SUN_AMBIENT_BLEND_START_Y - LOW_SUN_AMBIENT_BLEND_FULL_Y);
  const t = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
  return t * t * (3 - 2 * t);
}

/**
 * Architectural seam for sky / sun / cloud state. See `docs/ATMOSPHERE.md`
 * for the design and roadmap (Hosek-Wilkie analytic, prebaked cubemap,
 * volumetric for fly-through).
 *
 * Presets can carry an optional `todCycle`; otherwise the sun remains static
 * for stable perf baselines. The analytic backend owns fog, hemisphere, cloud,
 * and sky-dome state, while `SunDiscMesh` owns the SOL-1 visible hot body.
 * Lives in the existing `World` tracked group in `SystemUpdater`.
 */
export class AtmosphereSystem implements GameSystem, ISkyRuntime, ICloudRuntime {
  /** Bootstrap preset applied at construction so the first frame has a real sky. */
  private static readonly BOOTSTRAP_PRESET: ScenarioAtmosphereKey = 'combat120';

  private backend: ISkyBackend;
  private hosekBackend: HosekWilkieSkyBackend;
  private scene?: THREE.Scene;
  private domeMesh: THREE.Mesh;
  /** SOL-1 visible hot-body owner; the TSL dome keeps sky glow/scatter only. */
  private sunDisc: SunDiscMesh;
  private sunDiscMesh: THREE.Mesh;
  private currentScenario?: ScenarioAtmosphereKey;
  private readonly sunDirection = new THREE.Vector3(0, 80, -50).normalize();
  /** Per-scenario cloud coverage baseline (preset-driven). Weather multiplies on top. */
  private presetCloudCoverage = 0;
  /** Effective coverage currently applied to the sky-dome cloud pass. */
  private effectiveCloudCoverage = 0;
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
  // forwards storm-darken intent here; this system is the single authority
  // that reconciles it with the sky-driven horizon tint each frame.
  private fogDarkenFactor = 1.0;

  // Scratch vectors/colors to avoid per-frame allocation.
  private readonly scratchSunColor = new THREE.Color();
  private readonly scratchAmbient = new THREE.Color();
  private readonly scratchSunPosition = new THREE.Vector3();
  private readonly cameraPosition = new THREE.Vector3();
  private readonly lightingSnapshot = createAtmosphereLightingSnapshot();
  /** Unified lighting-rig state, derived once per frame from the uncompressed
   * Hosek backend at the LightFog marker alongside the legacy snapshot.
   * Consumed only when the rig flag is ON; legacy path untouched OFF. */
  private readonly lightingRig = createLightingRigState();
  /** The rig's projection into the four scene-light colors; copied into the
   * renderer lights when the flag is ON so GLB + terrain PBR track the curve. */
  private readonly rigSceneLights = createRigSceneLightRadiance();

  constructor() {
    this.hosekBackend = new HosekWilkieSkyBackend();
    this.backend = this.hosekBackend;
    this.domeMesh = this.hosekBackend.getMesh();
    this.sunDisc = new SunDiscMesh(SKY_DOME_RADIUS);
    this.sunDiscMesh = this.sunDisc.getMesh();
    // Mobile GPUs get a 4x-stretched sky-texture refresh cadence so the
    // per-fire compositing cost does not dominate the frame budget on the
    // WebGL2-fallback path. Desktop keeps the backend's 2 s default.
    if (isMobileGPU()) {
      this.hosekBackend.setRefreshCadenceSeconds(MOBILE_SKY_REFRESH_SECONDS);
    }
    // Apply bootstrap preset synchronously so the first render sees a real
    // sky — no NullSkyBackend flat-color frame, no legacy PNG fallback.
    this.applyScenarioPreset(AtmosphereSystem.BOOTSTRAP_PRESET);
    // Mirror the rig runtime flag onto window so a headless capture harness can
    // flip the Phase 0 prototype on for the A/B sweep. No-op outside a browser.
    publishLightingRigConfig();
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
    // WorldBuilder force-time-of-day override (dev-only, gated by Vite DCE in
    // retail). When the flag is in [0,1] and the active preset carries a
    // `todCycle`, snap simulated time to that fraction of the day so the sun
    // pin-locks at dawn / noon / dusk regardless of natural advance.
    if (import.meta.env.DEV && preset?.todCycle) {
      const wb = getWorldBuilderState();
      if (wb && wb.forceTimeOfDay >= 0 && wb.forceTimeOfDay <= 1) {
        this.simulationTimeSeconds = wb.forceTimeOfDay * preset.todCycle.dayLengthSeconds;
      }
    }
    if (preset?.todCycle) {
      computeSunDirectionAtTime(preset, this.simulationTimeSeconds, this.sunDirection);
    }

    this.trackAtmosphereTiming('World.Atmosphere.SkyTexture', () => {
      this.backend.update(deltaTime, this.sunDirection);
    });
    this.trackAtmosphereTiming('World.Atmosphere.LightFog', () => {
      // Unified lighting rig: derive + mirror the bindings FIRST (one authority,
      // one update point) so the scene lights + scene fog below read this frame's
      // terms. The scenario's bounded rig trim is applied here on the rig path;
      // legacy stacks stay authoritative OFF (rig state unused → order is a no-op).
      deriveLightingRigState(this.backend, this.sunDirection, this.fogDarkenFactor, this.lightingRig, preset?.rigTrim);
      this.applyToRenderer();
      this.applyFogColor();
      this.updateSunDisc();
    });
    this.trackAtmosphereTiming('World.Atmosphere.Clouds', () => {
      this.updateCloudCoverage(deltaTime);
    });
  }

  dispose(): void {
    if (this.scene) {
      if (this.domeMesh) this.scene.remove(this.domeMesh);
      if (this.sunDiscMesh) this.scene.remove(this.sunDiscMesh);
    }
    this.hosekBackend.dispose();
    this.sunDisc.dispose();
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
      this.scene.remove(this.sunDiscMesh);
    }
    this.scene = scene;
    this.scene.add(this.domeMesh);
    this.scene.add(this.sunDiscMesh);
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
    // (x1.5 rain, x3.5 storm).
    if (this.renderer?.fog) {
      this.renderer.fog.density = preset.fogDensity;
    }

    // Apply per-scenario cloud coverage default. Scenarios without an
    // explicit `cloudCoverageDefault` fall through to 0 (clear sky), which
    // preserves the pre-cloud-runtime baseline for perf-sensitive scenes.
    this.presetCloudCoverage = preset.cloudCoverageDefault ?? 0;
    this.effectiveCloudCoverage = this.presetCloudCoverage;
    this.weatherCloudActive = false;
    this.weatherCloudCoverage = 0;
    if (preset.cloudScaleMetersPerFeature !== undefined) {
      this.hosekBackend.setCloudFeatureScaleMeters(preset.cloudScaleMetersPerFeature);
    } else {
      this.hosekBackend.resetCloudFeatureScale();
    }
    this.hosekBackend.setCloudCoverage(this.presetCloudCoverage);

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
    this.hosekBackend.setCloudWorldAnchor(cameraPosition);
    this.updateSunDisc();
  }

  /**
   * Slice 14 diagnostic: surface the sky-backend refresh activity
   * counter so the crop probe can compare real refresh cost against the
   * `World.Atmosphere.SkyTexture` EMA.
   */
  getSkyRefreshStatsForDebug(): { fireCount: number; totalMs: number; lastMs: number; avgMs: number } {
    return this.hosekBackend.getRefreshStatsForDebug();
  }

  resetSkyRefreshStatsForDebug(): void {
    this.hosekBackend.resetRefreshStatsForDebug();
  }

  getCloudAnchorDebug(): {
    model: 'camera-followed-dome-world-altitude-clouds';
    anchorX: number;
    anchorZ: number;
    refreshMeters: number;
    deckAltitudeMeters: number;
    maxTraceMeters: number;
    horizonFadeStartY: number;
    horizonFadeFullY: number;
    cloudNoiseScale: number;
  } {
    return this.hosekBackend.getCloudAnchorDebug();
  }

  /**
   * Retained for loop compatibility after the retired planar cloud path.
   * The current sky-dome cloud pass does not need local terrain height.
   */
  setTerrainYAtCamera(_y: number): void {
    // No-op.
  }

  /** Swap backends at runtime (used by future TOD presets and tests). */
  setBackend(backend: ISkyBackend): void {
    this.backend = backend;
  }

  /**
   * Cache the renderer so per-frame updates can drive `scene.fog.color`
   * (sky-tint + storm darken) AND sun + hemisphere light state directly.
   * Applies once immediately so initial frames (pre-gameStarted) show
   * correct sky-derived lighting.
   */
  setRenderer(renderer: IGameRenderer): void {
    this.renderer = renderer;
    const resolvedBackend = (renderer as IGameRenderer & RendererBackendProbe)
      .getRendererBackendCapabilities?.()
      ?.resolvedBackend;
    if (
      resolvedBackend === 'webgpu'
      || resolvedBackend === 'webgl'
      || resolvedBackend === 'webgpu-webgl-fallback'
      || resolvedBackend === 'unknown'
    ) {
      this.sunDisc.setRendererBackend(resolvedBackend);
    }
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
   * Base construction intensities of the renderer scene lights, mirrored from
   * `GameRenderer` (ambient 1.0, directional 2.0, hemisphere 0.8). The rig path
   * divides these out so `color × intensity == rigRadiance × exposure`, leaving
   * `.intensity` to weather (AtmosphereSystem never writes intensity).
   */
  private static readonly SCENE_LIGHT_BASE_INTENSITIES = {
    ambient: 1.0, directional: 2.0, hemisphere: 0.8,
  } as const;

  private applyToRenderer(): void {
    const renderer = this.renderer;
    if (!renderer) return;

    // Rig path: the three PBR scene lights take rig radiance (exposure folded
    // in, base intensity divided out) so terrain + GLB PBR track the curve the
    // unlit foliage reads. Terrain stops self-lighting on this path so sun/sky
    // energy applies exactly once. Direction / shadow / `.intensity` untouched.
    const rigOn = isLightingRigEnabled();
    if (rigOn) {
      rigSceneLightRadiance(this.lightingRig, AtmosphereSystem.SCENE_LIGHT_BASE_INTENSITIES, this.rigSceneLights);
    }

    const lighting = this.refreshLightingSnapshot();

    // Sun direction + color drive the directional "moon" light while the
    // sun is above the horizon. Below the horizon, use a separate cool
    // moonlight direction/color instead of clamping the sub-horizon sun into
    // an above-ground light that makes terrain read red or wrongly backlit.
    if (renderer.moonLight) {
      // Start with a sun-direction-scaled offset. Clamp Y so the light
      // stays above a minimum altitude even if the atmosphere model dips
      // the sun to/below the horizon — a degenerate near-horizontal
      // shadow frustum eats precision and can blank out shadows.
      this.scratchSunPosition
        .copy(lighting.directLightDirection)
        .multiplyScalar(SUN_LIGHT_DISTANCE);
      if (lighting.sunAboveHorizon && this.scratchSunPosition.y < MIN_SUN_Y) {
        this.scratchSunPosition.y = MIN_SUN_Y;
      }

      // Recenter the shadow frustum on the follow target so shadows stay
      // sharp near the player regardless of sun angle. Preserve the target's
      // altitude too: A Shau terrain can sit hundreds of meters above world
      // origin, and pinning the target to Y=0 makes low sun lights aim through
      // the wrong elevation plane.
      if (this.followTarget) {
        const t = this.followTarget.position;
        renderer.moonLight.position.set(
          this.scratchSunPosition.x + t.x,
          this.scratchSunPosition.y + t.y,
          this.scratchSunPosition.z + t.z
        );
        renderer.moonLight.target.position.set(t.x, t.y, t.z);
      } else {
        renderer.moonLight.position.copy(this.scratchSunPosition);
        renderer.moonLight.target.position.set(0, 0, 0);
      }
      renderer.moonLight.target.updateMatrixWorld();

      renderer.moonLight.color.copy(rigOn ? this.rigSceneLights.sunColor : lighting.directLightColor);

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
      renderer.hemisphereLight.color.copy(rigOn ? this.rigSceneLights.skyColor : lighting.skyColor);
      renderer.hemisphereLight.groundColor.copy(rigOn ? this.rigSceneLights.groundColor : lighting.groundColor);
      renderer.hemisphereLight.updateMatrixWorld();
    }

    if (renderer.ambientLight) {
      renderer.ambientLight.color.copy(rigOn ? this.rigSceneLights.ambientColor : lighting.ambientColor);
    }
  }

  private trackAtmosphereTiming(name: string, updateFn: () => void): void {
    performanceTelemetry.beginSystem(name);
    try {
      updateFn();
    } finally {
      performanceTelemetry.endSystem(name);
    }
  }

  /**
   * Per-frame sun-disc placement + intensity. The additive sprite sits
   * just inside the sky dome at the current sun direction and pulls its
   * chromaticity from the backend's `getSun` transmittance path (warm at
   * dawn, white-hot at noon). The disc hides itself when the sun drops
   * below the horizon. Kept separate from `applyToRenderer` so the
   * fog/light path stays usable without a sun-disc scene attachment.
   */
  private updateSunDisc(): void {
    // SOL-1 / SDS alignment: the additive sprite owns the visible hot body.
    // The dome owns only atmospheric glow / horizon scatter so the scene does
    // not render a double hard sun. WorldBuilder can still disable the sprite
    // for explicit dev A/B comparison.
    const wb = import.meta.env.DEV ? getWorldBuilderState() : undefined;
    this.sunDisc.setEnabled(wb?.useAdditiveSunSprite !== false);
    this.backend.getSun(this.scratchSunColor);
    this.sunDisc.update(this.cameraPosition, this.sunDirection, this.scratchSunColor);
  }

  private applyFogColor(): void {
    const fog = this.renderer?.fog;
    if (!fog) return;
    // Rig path: scene fog reads the SINGLE rig fog color (same horizon source
    // the foliage fog binding reads) → one authority, horizon matches the Hosek
    // sky with no dawn/dusk seam. OFF path: byte-identical legacy snapshot fog.
    fog.color.copy(
      isLightingRigEnabled()
        ? lightingRigBindings.fogColor.value
        : this.refreshLightingSnapshot().fogColor,
    );
  }

  private refreshLightingSnapshot(): AtmosphereLightingSnapshot {
    const snapshot = this.lightingSnapshot;
    const sunAboveHorizon = this.sunDirection.y >= 0;
    const nightBlend = lowSunAmbientBlend(this.sunDirection.y);

    snapshot.sunDirection.copy(this.sunDirection);
    snapshot.sunAboveHorizon = sunAboveHorizon;
    snapshot.nightBlend = nightBlend;
    snapshot.daylightFactor = 1 - nightBlend;
    snapshot.directLightDirection.copy(
      sunAboveHorizon ? this.sunDirection : NIGHT_DIRECTIONAL_LIGHT_DIRECTION,
    );
    if (sunAboveHorizon) {
      // Direct sun color for the kill-switch legacy path. The `shapeDirectLightForRenderer`
      // compression (the dawn white-out HACK) was deleted in `legacy-path-deletion`;
      // the raw backend sun is bounded here by the same component ceiling used for
      // the sky/ground terms so the OFF fallback stays a usable presentation color.
      this.backend.getSun(snapshot.directLightColor);
      compressSkyRadianceForRenderer(snapshot.directLightColor, SKY_LIGHT_MAX_COMPONENT);
    } else {
      snapshot.directLightColor.copy(NIGHT_DIRECTIONAL_LIGHT_COLOR);
    }

    this.backend.getZenith(snapshot.skyColor);
    compressSkyRadianceForRenderer(snapshot.skyColor, SKY_LIGHT_MAX_COMPONENT);
    this.backend.getHorizon(snapshot.groundColor);
    compressSkyRadianceForRenderer(snapshot.groundColor, SKY_LIGHT_MAX_COMPONENT);
    snapshot.groundColor.multiplyScalar(HEMISPHERE_GROUND_DARKEN);

    this.scratchAmbient.setRGB(1, 1, 1);
    snapshot.ambientColor
      .copy(NIGHT_AMBIENT_LIGHT_COLOR)
      .lerp(this.scratchAmbient, 1 - nightBlend);

    this.backend.getHorizon(snapshot.fogColor);
    compressSkyRadianceForRenderer(snapshot.fogColor, SKY_FOG_MAX_COMPONENT);
    snapshot.fogColor.multiplyScalar(this.fogDarkenFactor);

    return snapshot;
  }

  // --- ISkyRuntime ---

  getSunDirection(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.sunDirection);
  }

  getSunColor(out: THREE.Color): THREE.Color {
    return this.backend.getSun(out);
  }

  getSkyColorAtDirection(dir: THREE.Vector3, out: THREE.Color): THREE.Color {
    this.backend.sample(dir, out);
    return compressSkyRadianceForRenderer(out, SKY_LIGHT_MAX_COMPONENT);
  }

  getZenithColor(out: THREE.Color): THREE.Color {
    this.backend.getZenith(out);
    return compressSkyRadianceForRenderer(out, SKY_LIGHT_MAX_COMPONENT);
  }

  getHorizonColor(out: THREE.Color): THREE.Color {
    this.backend.getHorizon(out);
    return compressSkyRadianceForRenderer(out, SKY_LIGHT_MAX_COMPONENT);
  }

  getLightingSnapshot(out: AtmosphereLightingSnapshot): AtmosphereLightingSnapshot {
    const snapshot = this.refreshLightingSnapshot();
    out.sunDirection.copy(snapshot.sunDirection);
    out.directLightDirection.copy(snapshot.directLightDirection);
    out.directLightColor.copy(snapshot.directLightColor);
    out.skyColor.copy(snapshot.skyColor);
    out.groundColor.copy(snapshot.groundColor);
    out.ambientColor.copy(snapshot.ambientColor);
    out.fogColor.copy(snapshot.fogColor);
    out.daylightFactor = snapshot.daylightFactor;
    out.nightBlend = snapshot.nightBlend;
    out.sunAboveHorizon = snapshot.sunAboveHorizon;
    return out;
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
   * Per-frame sky-dome cloud update. Reconciles scenario and weather
   * coverage and forwards the effective value to the active sky backend.
   */
  private updateCloudCoverage(_deltaTime: number): void {
    if (!this.scene) return;

    // Reconcile preset default with weather override. The weather path
    // only raises coverage (storm overcasts the sky even at a "clear"
    // preset); it should never hide a heavily-clouded preset below its
    // baseline.
    const effective = this.weatherCloudActive
      ? Math.max(this.presetCloudCoverage, this.weatherCloudCoverage)
      : this.presetCloudCoverage;
    this.effectiveCloudCoverage = effective;
    this.hosekBackend.setCloudCoverage(effective);
  }

  // --- ICloudRuntime ---

  getCoverage(): number {
    return this.effectiveCloudCoverage;
  }

  setCoverage(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    // Direct `setCoverage` calls overwrite both the preset baseline and
    // any active weather override — callers bypassing the intent API are
    // typically tests or debug UI that want to see a specific coverage.
    this.presetCloudCoverage = clamped;
    this.effectiveCloudCoverage = clamped;
    this.weatherCloudActive = false;
    this.weatherCloudCoverage = 0;
    this.hosekBackend.setCloudCoverage(clamped);
  }
}
