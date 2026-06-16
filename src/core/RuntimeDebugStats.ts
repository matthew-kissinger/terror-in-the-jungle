// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export interface VegetationDebugSummary {
  active: number;
  reserved: number;
}

export function summarizeVegetationDebugInfo(debugInfo: Record<string, unknown>): VegetationDebugSummary {
  let active = 0;
  let reserved = 0;

  for (const key in debugInfo) {
    const value = debugInfo[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (key.endsWith('Active')) {
      active += value;
    } else if (key.endsWith('HighWater')) {
      reserved += value;
    }
  }

  return { active, reserved };
}
