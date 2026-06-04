// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Shared startup-stage helper extracted from the ModeStartupPreparer facade
 * (cycle phase4-godfiles split). Behavior-identical to the original
 * module-private `yieldToRenderer`.
 */

/** Yield to the browser so it can repaint (progress bar, etc.) between heavy sync phases. */
export function yieldToRenderer(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}
