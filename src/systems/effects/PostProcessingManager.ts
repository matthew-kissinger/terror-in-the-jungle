// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type * as THREE from 'three';

import { Logger } from '../../utils/Logger';
import {
  isPostEligibleRenderer,
  NodePostProcessing,
  resolvePostEnabled,
  resolvePostLut,
} from './NodePostProcessing';
import type { ColorGradeLut } from './post/ColorGradePass';

/**
 * Compatibility shim that owns the P6 TSL node post-stack ({@link NodePostProcessing})
 * and exposes the `beginFrame`/`endFrame`/`setSize` surface the main render loop
 * (`GameEngineLoop`) already calls. Keeping this shim's shape stable means the
 * loop needs no change: when the stack is active, `beginFrame` redirects to the
 * capture target and `endFrame` composites the graded + bloomed result.
 *
 * Default-OFF behind the {@link resolvePostEnabled} kill-switch; the orchestrator
 * flips desktop default-on via `DEFAULT_POST_ENABLED_DESKTOP` in
 * `NodePostProcessing.ts` after the combat120 p99 neutrality proof. The stack is
 * NEVER built on mobile or on the `?renderer=webgl` legacy path (those return
 * `false` from `resolvePostEnabled` / `isPostEligibleRenderer`), so this shim is
 * a true no-op there.
 */
export class PostProcessingManager {
  private stack: NodePostProcessing | null = null;
  private enabled = false;
  private pixelScale = 1;

  constructor(
    private renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    _camera: THREE.Camera,
  ) {
    this.tryBuildStack();
  }

  /**
   * (Re)build the node stack against the LIVE renderer. Called at construction
   * and after a backend swap / device loss, where the renderer instance changes.
   */
  attachRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.tryBuildStack();
  }

  private tryBuildStack(): void {
    this.teardownStack();
    if (!resolvePostEnabled() || !isPostEligibleRenderer(this.renderer)) {
      this.enabled = false;
      return;
    }
    try {
      this.stack = new NodePostProcessing(this.renderer, resolvePostLut());
      this.enabled = true;
      Logger.info('PostProcessing', `TSL post stack active (LUT: ${this.stack.getLut()}).`);
    } catch (error) {
      this.stack = null;
      this.enabled = false;
      Logger.warn(
        'PostProcessing',
        `Post stack build failed; rendering straight to backbuffer: ${toMessage(error)}`,
      );
    }
  }

  private teardownStack(): void {
    this.stack?.dispose();
    this.stack = null;
  }

  /** True only when the stack is built AND enabled. The loop gates on this. */
  isActive(): boolean {
    return this.enabled && this.stack !== null;
  }

  /** Live grade LUT, or null when the stack is inactive. */
  getLut(): ColorGradeLut | null {
    return this.stack?.getLut() ?? null;
  }

  /** Swap the grade LUT live (WorldBuilder A/B). No-op when inactive. */
  setLut(lut: ColorGradeLut): void {
    this.stack?.setLut(lut);
  }

  /** Push live atmospheric-depth inputs from the projected atmosphere state. */
  setAtmosphere(fogColor: THREE.Color, density: number, start: number): void {
    this.stack?.setAtmosphere(fogColor, density, start);
  }

  beginFrame(): void {
    if (!this.isActive()) return;
    this.stack?.beginFrame();
  }

  endFrame(): void {
    if (!this.isActive()) return;
    this.stack?.endFrame();
  }

  setSize(width: number, height: number): void {
    this.stack?.setSize(width, height);
  }

  setPixelSize(size: number): void {
    this.pixelScale = Math.max(1, size);
  }

  getPixelSize(): number {
    return this.pixelScale;
  }

  setEnabled(enabled: boolean): void {
    // Honor an explicit runtime disable, but never force-enable a stack that
    // failed to build or was gated off (mobile / legacy / kill-switch).
    if (!enabled) {
      this.enabled = false;
      return;
    }
    this.enabled = this.stack !== null;
  }

  isEnabled(): boolean {
    return this.isActive();
  }

  dispose(): void {
    this.teardownStack();
    this.enabled = false;
  }
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
