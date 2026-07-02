// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Runtime kill-switches for the single-shadow-map truth pass
 * (`shadow-single-map-truth`).
 *
 * Two independent flags, both default ON — owner sign-off recorded in
 * `docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md` (defaults row: new
 * behavior default-ON with kill-switch flags per AGENTS.md U3):
 *
 *  - {@link ShadowTruthConfig.cameraTruth}: the elevation-aware shadow-camera
 *    frustum + slope-scaled bias fix (see `ShadowCameraFit`). Flip OFF
 *    (`window.__shadowTruth.cameraTruth = false`) to restore the legacy fixed
 *    ortho box (far 300, no bias). This is the camera/precision workstream.
 *
 *  - {@link ShadowTruthConfig.billboardProxies}: near-field vegetation billboard
 *    shadow proxies (see `NearFieldShadowProxies`). Flip OFF
 *    (`window.__shadowTruth.billboardProxies = false`) to stop casting proxy
 *    shadows for nearby foliage. **This is the flag the orchestrator flips at
 *    close if the MAIN-worktree combat120 perf proof regresses the p99 band** —
 *    it is a one-line change of the default below (`billboardProxies: true` ->
 *    `false`). The two flags are separate so a proxy-cost regression never
 *    reverts the camera/bias fix.
 *
 * The object is shared by reference so a headless-capture harness write is read
 * on the next frame. No-op outside a browser (tests / SSR).
 */
export const ShadowTruthConfig = {
  /** Elevation-aware shadow camera + bias. Default ON. */
  cameraTruth: true,
  /** Near-field billboard shadow proxies. Default ON (orchestrator may flip at close). */
  billboardProxies: true,
};

/** Window key the runtime flags are mirrored onto for headless-capture A/B toggling. */
export const SHADOW_TRUTH_GLOBAL_KEY = '__shadowTruth';

/**
 * Publish the runtime flag object onto `window` (idempotent). Called once from
 * AtmosphereSystem construction. The SAME object is shared by reference.
 */
export function publishShadowTruthConfig(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, typeof ShadowTruthConfig>)[SHADOW_TRUTH_GLOBAL_KEY] =
    ShadowTruthConfig;
}

/** True when the elevation-aware shadow camera/bias fix is active. */
export function isShadowCameraTruthEnabled(): boolean {
  return ShadowTruthConfig.cameraTruth;
}

/** True when near-field billboard shadow proxies are active. */
export function areBillboardShadowProxiesEnabled(): boolean {
  return ShadowTruthConfig.billboardProxies;
}
