// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Runtime kill-switch for the rebuilt sun-disc renderer (`sun-disc-scorch-rebuild`).
 *
 * The V2 disc adds physically-motivated limb darkening, an elevation-keyed
 * extinction/color consume from the analytic backend sun, a small forward-scatter
 * halo, and a CPU terrain-horizon occlusion fade so the body no longer shines
 * through ridgelines. All of that is gated on {@link SunDiscConfig.v2}.
 *
 * Default ON — owner sign-off recorded in
 * `docs/CAMPAIGN_2026-07-02-lighting-truth-and-shadows.md` (defaults row: new
 * behavior default-ON with kill-switch flags per AGENTS.md U3). Flip to `false`
 * (e.g. `window.__sunDisc.v2 = false`) to fall back to the flat legacy body with
 * a plain smoothstep edge, no halo, and no terrain-horizon fade — the same shape
 * the disc had before this rebuild. The object is shared by reference so a
 * headless-capture harness write is read on the next frame.
 */
export const SunDiscConfig = {
  /** Master flag, default ON. The documented one-release runtime kill-switch. */
  v2: true,
};

/** Window key the runtime flag is mirrored onto for headless-capture A/B toggling. */
export const SUN_DISC_GLOBAL_KEY = '__sunDisc';

/**
 * Publish the runtime flag object onto `window` (idempotent). Called once from
 * AtmosphereSystem construction. The SAME object is shared by reference, so a
 * write through `window.__sunDisc.v2` is read by {@link isSunDiscV2Enabled} on
 * the next frame. No-op outside a browser (tests / SSR).
 */
export function publishSunDiscConfig(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as Record<string, typeof SunDiscConfig>)[SUN_DISC_GLOBAL_KEY] = SunDiscConfig;
}

/** True when the rebuilt (V2) disc path is active. Read each frame by `update()`. */
export function isSunDiscV2Enabled(): boolean {
  return SunDiscConfig.v2;
}
