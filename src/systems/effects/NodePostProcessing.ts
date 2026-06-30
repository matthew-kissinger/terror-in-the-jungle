// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { RenderPipeline } from 'three/webgpu';
import { screenUV, texture as tslTexture, uniform as tslUniform, vec3 as tslVec3, vec4 as tslVec4 } from 'three/tsl';

import { Logger } from '../../utils/Logger';
import { estimateGPUTier, isMobileGPU, type GPUTier } from '../../utils/DeviceDetector';
import {
  buildColorGradeNode,
  DEFAULT_COLOR_GRADE_LUT,
  resolveColorGradeLut,
  type ColorGradeLut,
} from './post/ColorGradePass';
import { buildBloomNode } from './post/BloomPass';
import { applyHeightFogNode, heightFogFactorNode } from './HeightFogNode';
import type { TslNode } from '../../core/tsl/PostGradeNodes';

/**
 * P6 TSL node post-stack: filmic colour grade + tier-gated bloom + atmospheric
 * depth, composited over a captured scene render.
 *
 * SCOPE: this only attaches to the unified WebGPURenderer (and its internal
 * WebGL2 fallback). The pure `?renderer=webgl` legacy diagnostic path gets NO
 * post (the renderer is a plain `WebGLRenderer`, `isWebGPURenderer === false`),
 * and mobile is always off (the WebGL2 fallback is already fragment-bound on
 * phones — see `DeviceDetector.getMaxPixelRatio`). Both are checked at attach.
 *
 * CAPTURE MODEL (fits the existing `GameEngineLoop` `beginFrame`/`endFrame`
 * brackets WITHOUT changing the loop): `beginFrame()` redirects the renderer to
 * an offscreen RT, so the loop's `renderer.render(scene, camera)` AND the
 * `autoClear=false` weapon/grenade overlay both draw into the RT;
 * `endFrame()` restores the backbuffer and composites the graded + bloomed RT to
 * screen. Bloom therefore runs AFTER the weapon overlay (the overlay is already
 * in the captured texture), and the viewmodel is processed exactly once with the
 * scene — not double-processed.
 *
 * KILL-SWITCH: default-OFF behind {@link resolvePostEnabled}. The orchestrator
 * flips desktop default-on by setting {@link DEFAULT_POST_ENABLED_DESKTOP} to
 * `true` after the combat120 p99 neutrality proof passes.
 *
 * TONEMAP: the captured RT already holds the renderer's tonemapped + sRGB output,
 * so the composite pipeline runs with `outputColorTransform = false` (no second
 * tonemap). The filmic grade is therefore applied in display-referred space,
 * which is the correct space for a post-grade.
 */

/**
 * THE ONE-LINE FLIP. Flip this to `true` to make the post stack default-ON for
 * desktop (non-mobile WebGPU/WebGL2-fallback) after the orchestrator's combat120
 * p99 neutrality proof. Mobile and the `?renderer=webgl` path stay off
 * regardless. A `?post=off`/`window.__postProcessing = 'off'` override still
 * disables it.
 */
export const DEFAULT_POST_ENABLED_DESKTOP = false;

type WindowPostOverride = { __postProcessing?: string };
type WebGPUCapableRenderer = THREE.WebGLRenderer & { isWebGPURenderer?: boolean };

/**
 * Resolve whether the post stack should be enabled.
 *
 * Precedence: explicit override (`?post=` or `window.__postProcessing`) wins,
 * then mobile-off, then the {@link DEFAULT_POST_ENABLED_DESKTOP} kill-switch.
 * An override of `off`/`0`/`false`/`none` force-disables; any recognized LUT
 * name (or `on`/`1`) force-enables.
 */
export function resolvePostEnabled(mobile = isMobileGPU()): boolean {
  const override = readPostOverride();
  if (override !== null) {
    if (isDisableToken(override)) return false;
    // Any LUT name or an explicit enable token turns it on (even on mobile —
    // an explicit owner request is honored for A/B).
    if (resolveColorGradeLut(override) !== null || override === 'on' || override === '1' || override === 'true') {
      return true;
    }
  }
  if (mobile) return false;
  return DEFAULT_POST_ENABLED_DESKTOP;
}

/** Resolve the grade LUT from the override, falling back to the default. */
export function resolvePostLut(): ColorGradeLut {
  const override = readPostOverride();
  const fromOverride = override ? resolveColorGradeLut(override) : null;
  return fromOverride ?? DEFAULT_COLOR_GRADE_LUT;
}

function readPostOverride(): string | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowPostOverride;
  if (typeof w.__postProcessing === 'string' && w.__postProcessing.length > 0) {
    return w.__postProcessing.toLowerCase();
  }
  try {
    const param = new URLSearchParams(window.location.search).get('post');
    return param ? param.toLowerCase() : null;
  } catch {
    return null;
  }
}

function isDisableToken(value: string): boolean {
  return value === 'off' || value === '0' || value === 'false' || value === 'none';
}

/** True when the live renderer is the unified WebGPU renderer (or its WebGL2 fallback). */
export function isPostEligibleRenderer(renderer: THREE.WebGLRenderer): boolean {
  return (renderer as WebGPUCapableRenderer).isWebGPURenderer === true;
}

interface RenderPipelineLike {
  outputNode: TslNode;
  outputColorTransform: boolean;
  needsUpdate: boolean;
  render(): void;
  dispose(): void;
}

/**
 * Minimal renderer surface this stack drives. At runtime the renderer is the
 * unified `WebGPURenderer` (or its WebGL2 fallback), but the repo types it as
 * `THREE.WebGLRenderer`; the `three` vs `three/webgpu` `RenderTarget`/`Renderer`
 * generics do not line up, so — following the repo's TSL-boundary convention
 * (`TslNode = any` with thin casts) — we cast to this `any`-typed surface at the
 * webgpu-specific call sites only.
 */
type RendererLike = {
  setRenderTarget(target: unknown | null): void;
  clear(): void;
  getSize(target: THREE.Vector2): THREE.Vector2;
  getPixelRatio(): number;
};

/**
 * The live TSL post stack bound to one renderer. Rebuilds its pipeline + render
 * target on resize, and tears down cleanly on device loss / backend swap so a
 * caller can rebuild against the new renderer.
 */
export class NodePostProcessing {
  private renderer: THREE.WebGLRenderer;
  private readonly tier: GPUTier;
  private lut: ColorGradeLut;

  private renderTarget: THREE.RenderTarget | null = null;
  private pipeline: RenderPipelineLike | null = null;
  private readonly fogColorUniform = tslUniform(tslVec3(0.48, 0.56, 0.53));
  private readonly fogDensityUniform = tslUniform(0.0);
  private readonly fogStartUniform = tslUniform(40.0);

  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private capturing = false;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, lut: ColorGradeLut = resolvePostLut()) {
    this.renderer = renderer;
    this.tier = estimateGPUTier();
    this.lut = lut;
    const rendererLike = renderer as unknown as RendererLike;
    const size = rendererLike.getSize(new THREE.Vector2());
    this.pixelRatio = rendererLike.getPixelRatio();
    this.width = Math.max(1, Math.floor(size.x));
    this.height = Math.max(1, Math.floor(size.y));
    this.build();
  }

  /** Current grade LUT (owner picks the final one in playtest). */
  getLut(): ColorGradeLut {
    return this.lut;
  }

  /** Swap the grade LUT live (WorldBuilder A/B). Rebuilds the output graph. */
  setLut(lut: ColorGradeLut): void {
    if (lut === this.lut || this.disposed) return;
    this.lut = lut;
    this.rebuildPipeline();
  }

  /**
   * Push the live atmospheric-depth inputs (fog tint + density + onset) from the
   * caller's projected atmosphere state. Density 0 makes the fog term a no-op.
   */
  setAtmosphere(fogColor: THREE.Color, density: number, start: number): void {
    this.fogColorUniform.value.set(fogColor.r, fogColor.g, fogColor.b);
    this.fogDensityUniform.value = Math.max(0, density);
    this.fogStartUniform.value = Math.max(0, start);
  }

  private get rendererLike(): RendererLike {
    return this.renderer as unknown as RendererLike;
  }

  /** Redirect rendering to the offscreen capture target (loop `beginFrame`). */
  beginFrame(): void {
    if (this.disposed || !this.renderTarget) return;
    this.rendererLike.setRenderTarget(this.renderTarget);
    this.rendererLike.clear();
    this.capturing = true;
  }

  /** Composite the graded + bloomed capture to the backbuffer (loop `endFrame`). */
  endFrame(): void {
    if (this.disposed || !this.capturing || !this.pipeline) {
      this.rendererLike.setRenderTarget(null);
      this.capturing = false;
      return;
    }
    this.rendererLike.setRenderTarget(null);
    try {
      this.pipeline.render();
    } catch (error) {
      // A failed composite (e.g. mid-backend-swap) must never wedge the frame
      // loop — fall back to disabling post until the caller rebuilds.
      Logger.warn('PostProcessing', `Post composite failed; disabling stack: ${toMessage(error)}`);
      this.teardown();
    }
    this.capturing = false;
  }

  setSize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const ratio = this.rendererLike.getPixelRatio();
    if (w === this.width && h === this.height && ratio === this.pixelRatio) return;
    this.width = w;
    this.height = h;
    this.pixelRatio = ratio;
    this.renderTarget?.setSize(Math.floor(w * ratio), Math.floor(h * ratio));
  }

  /** Tear down GPU resources. Safe to call repeatedly. */
  dispose(): void {
    this.teardown();
    this.disposed = true;
  }

  private teardown(): void {
    if (this.capturing) {
      try {
        this.rendererLike.setRenderTarget(null);
      } catch {
        // Renderer may already be gone on device loss — ignore.
      }
      this.capturing = false;
    }
    this.pipeline?.dispose();
    this.pipeline = null;
    this.renderTarget?.dispose();
    this.renderTarget = null;
  }

  private build(): void {
    const ratio = this.pixelRatio;
    this.renderTarget = new THREE.RenderTarget(
      Math.floor(this.width * ratio),
      Math.floor(this.height * ratio),
      {
        // The scene is rendered with the renderer's tonemapping + sRGB output,
        // so the capture holds display-referred colour; the composite reads it
        // straight (no second tonemap). HalfFloat keeps bloom highlights clean.
        type: THREE.HalfFloatType,
        depthBuffer: true,
        stencilBuffer: false,
      },
    );
    this.rebuildPipeline();
  }

  private rebuildPipeline(): void {
    if (!this.renderTarget) return;
    this.pipeline?.dispose();
    this.pipeline = this.createPipeline(this.renderTarget);
  }

  private createPipeline(renderTarget: THREE.RenderTarget): RenderPipelineLike {
    const RenderPipelineCtor = RenderPipeline as unknown as new (renderer: unknown) => RenderPipelineLike;
    const pipeline = new RenderPipelineCtor(this.renderer);
    // The capture is already tonemapped + sRGB; do not transform again.
    pipeline.outputColorTransform = false;
    pipeline.outputNode = this.buildOutputNode(renderTarget);
    return pipeline;
  }

  private buildOutputNode(renderTarget: THREE.RenderTarget): TslNode {
    const sceneColorRgba = tslTexture(renderTarget.texture, screenUV) as TslNode;
    const sceneColor = sceneColorRgba.rgb as TslNode;

    // 1. Filmic colour grade (selectable LUT, identity at 'neutral').
    let graded = buildColorGradeNode(sceneColor, this.lut) as TslNode;

    // 2. Tier-gated additive bloom (null on low-tier → skipped).
    const bloomNode = buildBloomNode(sceneColor, this.tier);
    if (bloomNode) {
      graded = graded.add(bloomNode) as TslNode;
    }

    // 3. Atmospheric depth — density 0 (default) makes this an identity blend.
    const fogFactor = heightFogFactorNode(
      screenDepthProxy(),
      this.fogDensityUniform,
      this.fogStartUniform,
    ) as TslNode;
    const withFog = applyHeightFogNode(graded, this.fogColorUniform, fogFactor) as TslNode;

    return tslVec4(withFog, sceneColorRgba.a) as TslNode;
  }
}

/**
 * Screen-vertical depth proxy for the atmospheric-depth term. The capture is a
 * plain colour render (no MRT depth attachment), so the haze grows toward the
 * lower screen (ground / distant valley floor), which reads as believable valley
 * haze without a depth buffer. Density 0 (default) makes the whole term inert,
 * so this proxy only matters once atmospheric depth is dialed up.
 */
function screenDepthProxy(): TslNode {
  // (1 - screenUV.y) is 0 at the top of the screen, ~1 at the bottom; scale into
  // a pseudo-distance so the fog onset/density read in world-ish units.
  return ((screenUV as TslNode).y.oneMinus().mul(120.0)) as TslNode;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
