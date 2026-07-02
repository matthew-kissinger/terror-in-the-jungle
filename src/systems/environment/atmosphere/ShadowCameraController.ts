// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Logger } from '../../../utils/Logger';
import { computeShadowCameraFit, type ShadowCameraFit } from './ShadowCameraFit';
import { isShadowCameraTruthEnabled } from './ShadowTruthConfig';

export interface ShadowPlacement {
  /**
   * Sun-direction-scaled offset from the follow target to the light
   * (`direction * lightDistance`). Its Y may be clamped up (see `clampMinY`).
   * The vector is mutated in place — pass a scratch vector.
   */
  offset: THREE.Vector3;
  /**
   * Minimum world-Y the light offset is clamped to (keeps a low sun from dipping
   * the caster to ground level). `undefined` disables the clamp (sub-horizon).
   */
  clampMinY?: number;
  /** Follow target (player camera) the shadow frustum recenters on; may be undefined. */
  followTarget?: THREE.Object3D;
  /** Distance the light sits from the follow target (for the depth fit). */
  lightDistance: number;
  /** When true, emit a throttled effective-frustum log (dev only). */
  devLog: boolean;
}

/**
 * Drives the single directional shadow camera each frame
 * (`shadow-single-map-truth`): places the light on the player follow origin AND
 * fits the ortho depth range + bias to the ACTUAL light-to-target elevation.
 *
 * Extracted from `AtmosphereSystem` because that file sits at the 700-LOC budget
 * ceiling. The controller captures the legacy (pre-fix) camera config the first
 * time it runs so flipping `__shadowTruth.cameraTruth = false` at runtime
 * restores the exact old frustum. The horizontal ortho half-extent is left as
 * `GameRenderer` set it per GPU tier — only near/far + bias are elevation-driven.
 * Renderer-agnostic: three.js runs the same depth pass for the WebGPU and
 * WebGL2-fallback backends, so this fit feeds both identically.
 */
export class ShadowCameraController {
  private legacyCamera: {
    near: number; far: number; bias: number; normalBias: number;
  } | null = null;
  private active = false;
  private lastFit: ShadowCameraFit | null = null;
  private logAtMs = -Infinity;

  /**
   * Position the light on the follow origin, then re-fit its shadow camera.
   * `p.offset` is clamped in place, so on return it is the post-clamp
   * target->light offset the fit was computed from.
   */
  placeAndFit(light: THREE.DirectionalLight, p: ShadowPlacement): void {
    if (p.clampMinY !== undefined && p.offset.y < p.clampMinY) {
      p.offset.y = p.clampMinY;
    }

    // Recenter on the follow target so shadows stay sharp near the player; keep
    // the target altitude so a low sun aims through the right elevation plane.
    if (p.followTarget) {
      const t = p.followTarget.position;
      light.position.set(p.offset.x + t.x, p.offset.y + t.y, p.offset.z + t.z);
      light.target.position.set(t.x, t.y, t.z);
    } else {
      light.position.copy(p.offset);
      light.target.position.set(0, 0, 0);
    }
    light.target.updateMatrixWorld();

    this.fit(light, p.offset, p.lightDistance, p.devLog);

    // Matrix world must be updated manually — setupLighting() no longer
    // freezeTransform()s this light, and the shadow pass reads a stale matrix
    // otherwise.
    light.updateMatrixWorld();
  }

  /**
   * Re-fit the shadow camera's depth range + bias to the light-to-target
   * `offset`. Restores the legacy box exactly when the kill-switch is OFF.
   */
  private fit(
    light: THREE.DirectionalLight,
    offset: THREE.Vector3,
    lightDistance: number,
    devLog: boolean,
  ): void {
    const shadow = light.shadow;
    const cam = shadow.camera;

    // Capture the legacy config once so a runtime kill-switch flip is exact.
    if (!this.legacyCamera) {
      this.legacyCamera = {
        near: cam.near, far: cam.far, bias: shadow.bias, normalBias: shadow.normalBias,
      };
    }

    if (!isShadowCameraTruthEnabled()) {
      // Restore the pre-fix box the first frame after the flag goes OFF.
      if (this.active) {
        cam.near = this.legacyCamera.near;
        cam.far = this.legacyCamera.far;
        shadow.bias = this.legacyCamera.bias;
        shadow.normalBias = this.legacyCamera.normalBias;
        cam.updateProjectionMatrix();
        this.active = false;
        this.lastFit = null;
      }
      return;
    }

    const len = Math.hypot(offset.x, offset.y, offset.z) || 1;
    const elevationSin = offset.y / len;

    // Ortho half-extent GameRenderer set per GPU tier; read it back so the depth
    // fit matches the footprint we actually cover.
    const halfExtent = Math.max(cam.top, cam.right, -cam.bottom, -cam.left, 1);
    const mapSize = shadow.mapSize.width || 2048;

    const f = computeShadowCameraFit({
      groundHalfExtent: halfExtent,
      sunElevationSin: elevationSin,
      lightDistance,
      mapSize,
    });

    cam.near = f.near;
    cam.far = f.far;
    cam.updateProjectionMatrix();
    shadow.bias = f.bias;
    shadow.normalBias = f.normalBias;
    this.active = true;
    this.lastFit = f;

    if (devLog) this.maybeLog(f);
  }

  /**
   * Read-only snapshot of the last applied fit (or null when the `cameraTruth`
   * kill-switch is OFF). For the owner walk / debug HUD to confirm the effective
   * frustum stays sane across sun angles.
   */
  getFit(): Readonly<ShadowCameraFit> | null {
    return this.lastFit;
  }

  private maybeLog(fit: ShadowCameraFit): void {
    const now = performance.now();
    if (now - this.logAtMs < 4000) return;
    this.logAtMs = now;
    Logger.info(
      'ShadowFit',
      `elevSin=${fit.effectiveElevationSin.toFixed(3)} near=${fit.near.toFixed(1)} ` +
        `far=${fit.far.toFixed(1)} bias=${fit.bias.toExponential(2)} ` +
        `normalBias=${fit.normalBias.toFixed(2)}`,
    );
  }
}
