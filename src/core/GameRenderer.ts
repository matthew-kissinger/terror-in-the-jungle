// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import type { PostProcessingManager } from '../systems/effects/PostProcessingManager';
import { CrosshairSystem } from '../ui/hud/CrosshairSystem';
import type { CrosshairMode, HeliReticleWeapon, TraverseStopDir } from '../ui/hud/CrosshairSystem';
import { LoadingUI } from './LoadingUI';
import { Logger } from '../utils/Logger';
import { freezeTransform } from '../utils/SceneUtils';
import { estimateGPUTier, isMobileGPU, shouldEnableShadows, getShadowMapSize, getMaxPixelRatio } from '../utils/DeviceDetector';
import { ViewportInfo, ViewportManager } from '../ui/design/responsive';
import { WorldOverlayRegistry } from '../ui/debug/WorldOverlayRegistry';
import {
  createInitialRendererCapabilities,
  createWebGLRenderer,
  createWebGPURenderer,
  attachRendererDeviceLossHandler,
  initializeCommonRenderer,
  inspectResolvedRendererBackend,
  isWebGPURenderer,
  resolveRendererBackendMode,
  toErrorMessage,
  type CommonRenderer,
  type RendererBackendCapabilities,
  type RendererBackendMode,
} from './RendererBackend';
import {
  buildRendererFeatureProfile,
  type RendererFeatureProfile,
} from './RendererFeatureProfile';

/**
 * Default fog / scene-background colour applied before the analytic sky
 * backend overrides it each frame. Exported for tests so the GameRenderer
 * background-colour assertion can lock the constant against drift back to
 * a pure-white clear (which would amplify any residual CDLOD seam crack —
 * see `terrain-cdlod-seam`).
 */
export const INITIAL_FOG_COLOR = 0x7a8f88;

/**
 * Default tonemap applied at renderer init. AGX (Three.js r184) replaced
 * ACES Filmic in `cycle-sun-and-atmosphere-overhaul` because the per-fragment
 * Preetham sky R1 port needs AGX's softer rolloff to preserve horizon-zenith
 * variety + HDR sun-disc contrast. Exported for tests so the policy stays
 * locked against a silent revert. The WorldBuilder dev console exposes a
 * runtime A/B toggle back to ACES (`toneMapping = 'aces'`) for playtest.
 */
export const DEFAULT_TONE_MAPPING: THREE.ToneMapping = THREE.AgXToneMapping;
const BACKGROUND_SHADER_PRECOMPILE_RECENT_SKIP_MS = 5000;

export type ShaderPrecompileResult = 'complete' | 'failed' | 'skipped' | 'timeout';

interface ShaderPrecompileOptions {
  renderOnce?: boolean;
  timeoutMs?: number;
  reason?: string;
  skipIfCompletedWithinMs?: number;
}

/**
 * Determine whether the WebGLRenderer should preserve its drawing buffer.
 *
 * Required by PlaytestCaptureManager (F9) for `renderer.domElement.toBlob()`
 * to return a non-blank PNG — but retaining the back-buffer adds ~13 MB of
 * heap residual that retail players who never press F9 shouldn't pay.
 *
 * - On in dev builds (F9 + other debug tooling are active by default).
 * - Opt-in on retail via `?capture=1` URL param so Cloudflare testers can
 *   reach F9 without a local dev checkout.
 * - Off otherwise.
 *
 * Exported for tests only; do not import from other runtime modules.
 */
export function shouldPreserveDrawingBuffer(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('capture')) return false;
  return params.get('capture') !== '0';
}

export class GameRenderer {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public postProcessing?: PostProcessingManager;
  private readonly rendererBackendMode: RendererBackendMode;
  private rendererCapabilities: RendererBackendCapabilities;
  /**
   * Optional camera override. When set, the main render loop draws the scene
   * from this camera instead of `this.camera`. Used by FreeFlyCamera for
   * detached-spectator debug; clearing it restores the player/vehicle view.
   * See `src/ui/debug/FreeFlyCamera.ts`.
   */
  private overrideCamera: THREE.PerspectiveCamera | null = null;

  // Exposed environment properties for WeatherSystem
  public fog?: THREE.FogExp2;
  public ambientLight?: THREE.AmbientLight;
  public moonLight?: THREE.DirectionalLight;
  public hemisphereLight?: THREE.HemisphereLight;

  private crosshairSystem = new CrosshairSystem();
  private loadingUI = new LoadingUI();
  private viewportUnsubscribe?: () => void;
  private lastShaderPrecompileCompletedAtMs = -Infinity;
  /**
   * Registry hosting 3D debug overlays (navmesh wireframe, LOS rays, LOD tier
   * markers, etc.). Overlay content lives in its own `THREE.Group` under the
   * main scene so the main render pass picks it up without a second RT.
   */
  public worldOverlays!: WorldOverlayRegistry;

  constructor() {
    this.rendererBackendMode = resolveRendererBackendMode();
    this.rendererCapabilities = createInitialRendererCapabilities(this.rendererBackendMode);
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    this.renderer = createWebGLRenderer(shouldPreserveDrawingBuffer());

    this.setupRenderer();
    this.setupLighting();
    this.setupPostProcessing();
    this.worldOverlays = new WorldOverlayRegistry(this.scene);
    // Master hidden by default — Shift+\ reveals overlays the same way the
    // debug HUD is gated behind the backtick toggle.
    this.worldOverlays.setMasterVisible(false);
  }

  private setupRenderer(): void {
    const gpuTier = estimateGPUTier();
    const isMobile = isMobileGPU();

    Logger.info(
      'Renderer',
      `Initializing renderer (Tier: ${gpuTier}, Mobile: ${isMobile}, Requested: ${this.rendererBackendMode})`
    );

    this.applyCommonRendererSettings(this.renderer);

    document.body.appendChild(this.renderer.domElement);

    // Hide renderer initially
    this.renderer.domElement.style.display = 'none';

    this.viewportUnsubscribe = ViewportManager.getInstance().subscribe((info) => {
      this.applyViewport(info);
    });
  }

  private applyCommonRendererSettings(renderer: THREE.WebGLRenderer): void {
    // Aggregate stats across the whole frame; the loop resets once before rendering.
    renderer.info.autoReset = false;

    // Device-adaptive pixel ratio
    renderer.setPixelRatio(getMaxPixelRatio());

    const initialViewport = ViewportManager.getInstance().info;
    renderer.setSize(initialViewport.width, initialViewport.height);

    // Device-adaptive shadow settings
    renderer.shadowMap.enabled = shouldEnableShadows();
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // See `DEFAULT_TONE_MAPPING` for the AGX rationale. The WorldBuilder
    // dev console exposes a runtime A/B toggle back to ACES for owner
    // playtest; per-scenario `preset.exposure` recalibration is the R2
    // task `per-scenario-exposure-recalibration`, so the default
    // `toneMappingExposure` stays at 1.0.
    renderer.toneMapping = DEFAULT_TONE_MAPPING;
    renderer.toneMappingExposure = 1.0;
  }

  private setupLighting(): void {
    const gpuTier = estimateGPUTier();

    // === ATMOSPHERE ===
    // Fog re-enabled with matching support in GPU billboard shader
    // Both terrain and vegetation now fade consistently to fog color.
    //
    // Fog color is initialised to a neutral horizon-ish grey so the first
    // pre-atmosphere frame (before `AtmosphereSystem.update` runs) still
    // reads as "daytime haze" rather than magenta. Each frame the
    // analytic sky backend overwrites `this.fog.color` with the live
    // horizon sample via `AtmosphereSystem.applyFogColor()`, so the
    // horizon seam between terrain and sky vanishes at every sun angle.
    // `scene.background` is a static fallback only — the analytic
    // `HosekWilkieSkyBackend` dome renders in front of it each frame.
    this.scene.background = new THREE.Color(INITIAL_FOG_COLOR);

    // Exponential fog. Bootstrap density only — per-scenario fog density
    // is stamped onto `this.fog.density` by `AtmosphereSystem.applyScenarioPreset`
    // at scenario boot (`fog-density-rebalance`, cycle-2026-04-21) so the
    // density stays tuned alongside the preset's sun angle / horizon color.
    // Weather modulates this base per-frame (x1.5 rain, x3.5 storm).
    this.fog = new THREE.FogExp2(INITIAL_FOG_COLOR, 0.0022);
    this.scene.fog = this.fog;

    this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(this.ambientLight);
    freezeTransform(this.ambientLight);

    this.moonLight = new THREE.DirectionalLight(0xfffacd, 2.0);
    this.moonLight.position.set(0, 80, -50);
    this.moonLight.castShadow = shouldEnableShadows();

    // Device-adaptive shadow map size
    const shadowMapSize = getShadowMapSize();
    this.moonLight.shadow.mapSize.width = shadowMapSize;
    this.moonLight.shadow.mapSize.height = shadowMapSize;

    this.moonLight.shadow.camera.near = 0.5;
    this.moonLight.shadow.camera.far = 300;

    // Smaller shadow frustum on weaker devices to keep resolution up
    const shadowRange = gpuTier === 'high' ? 100 : 70;
    this.moonLight.shadow.camera.left = -shadowRange;
    this.moonLight.shadow.camera.right = shadowRange;
    this.moonLight.shadow.camera.top = shadowRange;
    this.moonLight.shadow.camera.bottom = -shadowRange;

    // Softer shadows for night time
    this.moonLight.shadow.radius = gpuTier === 'high' ? 4 : 2;
    this.moonLight.shadow.blurSamples = gpuTier === 'high' ? 25 : 10;

    // The directional light's target drives shadow-camera orientation.
    // Three.js only renders the target into the scene graph when it is
    // added explicitly; without this, shadow updates against the target
    // position are silently ignored.
    this.moonLight.target.position.set(0, 0, 0);
    this.scene.add(this.moonLight.target);
    this.scene.add(this.moonLight);
    // NOTE: moonLight is intentionally NOT freezeTransform'd. AtmosphereSystem
    // drives its position + color + shadow-follow origin each frame.

    // Hemisphere light for atmosphere
    // Sky: filtered light from above
    // Ground: dark ground bounce light
    this.hemisphereLight = new THREE.HemisphereLight(
      0x87ceeb, // Sky blue — overwritten per-frame from AtmosphereSystem zenith
      0x4a6b3a, // Green ground bounce — overwritten per-frame from AtmosphereSystem horizon
      0.8
    );
    this.scene.add(this.hemisphereLight);
    // NOTE: hemisphereLight is intentionally NOT freezeTransform'd so its
    // color + groundColor can be updated from the atmosphere model per frame.

    Logger.info('Renderer', 'Atmosphere initialized');
  }

  private setupPostProcessing(): void {
    // Pixel Forge NPCs now render as close skinned meshes plus mid/far impostors.
    // The old low-res quantized post pass made flat GLBs and vegetation harder
    // to read, so runtime rendering goes directly to the backbuffer for now.
    this.postProcessing = undefined;
  }

  async initializeRendererBackend(): Promise<void> {
    if (this.rendererBackendMode === 'webgl') {
      this.rendererCapabilities = {
        ...this.rendererCapabilities,
        resolvedBackend: 'webgl',
        initStatus: 'ready',
      };
      return;
    }

    const previousRenderer = this.renderer;
    const previousDisplay = previousRenderer.domElement.style.display;

    try {
      const { renderer, capabilities } = await createWebGPURenderer(this.rendererBackendMode);
      this.applyCommonRendererSettings(renderer);
      renderer.domElement.style.display = previousDisplay;
      await initializeCommonRenderer(renderer);
      const deviceLoss = attachRendererDeviceLossHandler(renderer, (state) => {
        this.rendererCapabilities = {
          ...this.rendererCapabilities,
          deviceLoss: state,
          notes: [
            ...this.rendererCapabilities.notes,
            `WebGPU device loss reported (${state.reason ?? 'unknown'}).`,
          ],
        };
        Logger.warn(
          'Renderer',
          `WebGPU device lost (${state.reason ?? 'unknown'}): ${state.message ?? 'no message'}`
        );
      });
      const resolvedBackend = inspectResolvedRendererBackend(renderer);

      if (resolvedBackend !== 'webgpu') {
        if (capabilities.strictWebGPU) {
          renderer.dispose();
          throw new Error(
            `Strict WebGPU mode resolved ${resolvedBackend}; refusing WebGL fallback.`,
          );
        }
        // Non-strict mode (default 'webgpu' or 'webgpu-force-webgl'): accept
        // Three.js's automatic WebGL2 fallback. Since r171 the WebGPURenderer
        // from `three/webgpu` falls back to a WebGL2 backend when navigator.gpu
        // is unavailable, and TSL node materials work on both backends. This
        // path is what production users on macOS Sonoma + Safari, iOS 17,
        // older Firefox, or any swiftshader/GPU-less environment hit.
        Logger.warn(
          'Renderer',
          `WebGPU unavailable; rendering on ${resolvedBackend} backend.`,
        );
      }

      const previousParent = previousRenderer.domElement.parentElement;
      if (previousParent) {
        previousParent.replaceChild(renderer.domElement, previousRenderer.domElement);
      } else {
        document.body.appendChild(renderer.domElement);
      }
      previousRenderer.dispose();

      this.renderer = renderer;
      this.rendererCapabilities = {
        ...capabilities,
        resolvedBackend,
        initStatus: 'ready',
        deviceLoss,
        notes: [
          ...capabilities.notes,
          `Renderer initialized as ${resolvedBackend}.`,
        ],
      };

      Logger.info(
        'Renderer',
        `Renderer backend initialized (${this.rendererCapabilities.resolvedBackend})`
      );
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      this.rendererCapabilities = {
        ...this.rendererCapabilities,
        resolvedBackend: 'unknown',
        initStatus: 'failed',
        error: errorMessage,
        notes: [
          ...this.rendererCapabilities.notes,
          'WebGPU renderer initialization failed; refusing to keep the WebGL bootstrap renderer.',
        ],
      };
      Logger.warn(
        'Renderer',
        `WebGPU init failed: ${this.rendererCapabilities.error}`
      );
      throw error instanceof Error ? error : new Error(errorMessage);
    }
  }

  getRendererBackendCapabilities(): RendererBackendCapabilities {
    return {
      ...this.rendererCapabilities,
      adapterFeatures: [...this.rendererCapabilities.adapterFeatures],
      adapterLimits: { ...this.rendererCapabilities.adapterLimits },
      deviceLoss: { ...this.rendererCapabilities.deviceLoss },
      notes: [...this.rendererCapabilities.notes],
    };
  }

  getRendererFeatureProfile(): RendererFeatureProfile {
    return buildRendererFeatureProfile(this.rendererCapabilities);
  }

  /**
   * Adjust camera, fog, and shadow parameters for a given world size and elevation range.
   * Called during game mode initialization for modes that need non-default values.
   */
  configureForWorldSize(options: {
    cameraFar?: number;
    fogDensity?: number;
    shadowFar?: number;
  }): void {
    if (options.cameraFar !== undefined) {
      this.camera.far = options.cameraFar;
      this.camera.updateProjectionMatrix();
    }
    if (options.fogDensity !== undefined && this.fog) {
      this.fog.density = options.fogDensity;
    }
    if (options.shadowFar !== undefined && this.moonLight) {
      this.moonLight.shadow.camera.far = options.shadowFar;
      this.moonLight.shadow.camera.updateProjectionMatrix();
    }
  }

  /** Camera currently driving the main scene render (override if set). */
  getActiveCamera(): THREE.PerspectiveCamera {
    return this.overrideCamera ?? this.camera;
  }

  /** Install/clear a debug camera override. Pass `null` to restore. */
  setOverrideCamera(cam: THREE.PerspectiveCamera | null): void {
    this.overrideCamera = cam;
    if (cam) {
      const info = ViewportManager.getInstance().info;
      const aspect = Math.max(1, info.width) / Math.max(1, info.height);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
  }

  showRenderer(): void {
    this.renderer.domElement.style.display = 'block';
  }

  hideRenderer(): void {
    this.renderer.domElement.style.display = 'none';
  }

  onWindowResize(): void {
    this.applyViewport(ViewportManager.getInstance().info);
  }

  showCrosshair(): void {
    if (!this.crosshairSystem.mounted) {
      this.crosshairSystem.mount(document.body);
    }
    this.crosshairSystem.showCrosshair();
  }

  hideCrosshair(): void {
    this.crosshairSystem.hideCrosshair();
  }

  showCrosshairAgain(): void {
    this.crosshairSystem.showCrosshairAgain();
  }

  setCrosshairMode(mode: CrosshairMode): void {
    this.crosshairSystem.setMode(mode);
  }

  setCrosshairSpread(radius: number): void {
    this.crosshairSystem.setSpread(radius);
  }

  /**
   * Select which attack-helicopter weapon reticle is prominent (gun pipper vs
   * rocket-fall cue). Concrete passthrough, not on the fenced `IGameRenderer` —
   * the attack-heli adapter duck-types it, mirroring the fixed-wing ammo seam.
   */
  setCrosshairHelicopterWeapon(weapon: HeliReticleWeapon): void {
    this.crosshairSystem.setHelicopterWeapon(weapon);
  }

  /**
   * Drop the CCIP rocket-fall cue this many pixels below the boresight pipper.
   * Concrete passthrough (not fenced); pushed per-frame by the attack-heli
   * adapter from the live rocket-lead solution.
   */
  setCrosshairRocketCueOffset(offsetPx: number): void {
    this.crosshairSystem.setRocketCueOffset(offsetPx);
  }

  /**
   * Light the active gunsight's edge tick for the arc/traverse stop the barrel
   * is pinned against (or clear it with `null`). Concrete passthrough, not on the
   * fenced `IGameRenderer` — the emplacement-MG and helicopter door-gun adapters
   * duck-type it, mirroring the attack-heli cue seams. Only the visible reticle
   * mode (emplacement_mg / door_gun) shows the tick, so the call is a harmless
   * no-op in any other mode.
   */
  setCrosshairTraverseStop(stop: TraverseStopDir): void {
    this.crosshairSystem.setTraverseStop(stop);
  }

  showSpawnLoadingIndicator(): void {
    this.loadingUI.showSpawnLoadingIndicator();
  }

  setSpawnLoadingStatus(status: string, detail?: string): void {
    this.loadingUI.setSpawnLoadingStatus(status, detail);
  }

  hideSpawnLoadingIndicator(): void {
    this.loadingUI.hideSpawnLoadingIndicator();
  }

  beginFrameStats(): void {
    this.renderer.info.reset();
  }

  getPerformanceStats(): {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  } {
    const info = this.renderer.info as typeof this.renderer.info & { programs?: unknown[] };
    const memory = info.memory as { geometries: number; textures: number; programs?: number };
    const render = this.renderer.info.render;
    const programs = Array.isArray(info.programs)
      ? info.programs.length
      : memory.programs ?? 0;
    return {
      fps: 0, // Will be calculated externally with clock
      drawCalls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      programs
    };
  }

  /**
   * Pre-compile scene pipelines to prevent first-visible frame drops.
   * Call this after mode systems have populated the scene. WebGPU also exposes
   * `compileAsync`; skipping it leaves first-use material/shadow pipelines cold.
   */
  async precompileShadersAsync(options: ShaderPrecompileOptions = {}): Promise<ShaderPrecompileResult> {
    const startTime = performance.now();
    const reason = options.reason ? ` (${options.reason})` : '';
    const recentSkipMs = Math.max(0, Number(options.skipIfCompletedWithinMs ?? 0));
    if (recentSkipMs > 0 && startTime - this.lastShaderPrecompileCompletedAtMs < recentSkipMs) {
      Logger.info('Renderer', `Skipping renderer pipeline prewarm${reason}; completed recently`);
      return 'skipped';
    }
    const rendererAny = this.renderer as CommonRenderer & {
      compileAsync?: (scene: THREE.Object3D, camera: THREE.Camera) => Promise<unknown>;
      extensions?: { has: (name: string) => boolean };
    };
    const webGpuRenderer = isWebGPURenderer(this.renderer);
    const supportsParallelCompile = rendererAny.extensions?.has('KHR_parallel_shader_compile') === true;
    const timeoutMs = Math.max(0, Number(options.timeoutMs ?? 0));

    if (typeof rendererAny.compileAsync !== 'function') {
      Logger.warn('Renderer', `compileAsync unavailable; skipping shader pre-compilation${reason}`);
      return 'skipped';
    }

    if (!webGpuRenderer && !supportsParallelCompile) {
      Logger.warn('Renderer', `KHR_parallel_shader_compile unavailable; skipping async shader pre-compilation${reason}`);
      return 'skipped';
    }

    Logger.info('Renderer', `Pre-compiling renderer pipelines${reason}...`);
    let compilePromise: Promise<unknown>;
    try {
      compilePromise = rendererAny.compileAsync(this.scene, this.camera);
    } catch (error) {
      Logger.warn('Renderer', `Async shader pre-compilation threw synchronously; skipping fallback compile: ${error}`);
      return 'failed';
    }

    compilePromise.catch(() => undefined);

    const completed = timeoutMs > 0
      ? await Promise.race([
          compilePromise.then(() => true, () => false),
          new Promise<'timeout'>((resolve) => {
            globalThis.setTimeout(() => resolve('timeout'), timeoutMs);
          }),
        ])
      : await compilePromise.then(() => true, () => false);

    if (completed === 'timeout') {
      Logger.warn('Renderer', `Async shader pre-compilation exceeded ${timeoutMs}ms${reason}; continuing without sync fallback`);
      return 'timeout';
    }

    const elapsed = performance.now() - startTime;
    if (!completed) {
      Logger.warn('Renderer', `Async shader pre-compilation failed${reason}; skipping fallback compile (${elapsed.toFixed(1)}ms)`);
      return 'failed';
    }

    if (options.renderOnce === true) {
      const canvas = this.renderer.domElement;
      const previousDisplay = canvas.style.display;
      const previousOpacity = canvas.style.opacity;
      const needsHiddenWarmupLayout = previousDisplay === 'none';
      if (needsHiddenWarmupLayout) {
        canvas.style.display = 'block';
        canvas.style.opacity = '0';
      }
      try {
        this.renderer.render(this.scene, this.camera);
      } finally {
        if (needsHiddenWarmupLayout) {
          canvas.style.display = previousDisplay;
          canvas.style.opacity = previousOpacity;
        }
      }
    }
    this.lastShaderPrecompileCompletedAtMs = performance.now();
    Logger.info('Renderer', `Shader pre-compilation complete async${reason} (${elapsed.toFixed(1)}ms)`);
    return 'complete';
  }

  /**
   * Fire-and-forget compatibility wrapper for background warmup callers.
   */
  precompileShaders(): void {
    void this.precompileShadersAsync({
      renderOnce: true,
      reason: 'background',
      skipIfCompletedWithinMs: BACKGROUND_SHADER_PRECOMPILE_RECENT_SKIP_MS,
    });
  }

  dispose(): void {
    this.viewportUnsubscribe?.();

    // Clean up UI modules
    this.loadingUI.dispose();
    this.crosshairSystem.dispose();
    this.worldOverlays?.dispose();

    // Clean up Three.js resources
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      document.body.removeChild(this.renderer.domElement);
    }
  }

  private applyViewport(info: ViewportInfo): void {
    const width = Math.max(1, info.width);
    const height = Math.max(1, info.height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.overrideCamera) {
      this.overrideCamera.aspect = width / height;
      this.overrideCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(width, height);
    if (this.postProcessing) {
      this.postProcessing.setSize(width, height);
    }
  }
}
