// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';
import { summarizeVegetationDebugInfo } from './RuntimeDebugStats';

describe('summarizeVegetationDebugInfo', () => {
  it('summarizes vegetation active and reserved counts from debug keys', () => {
    expect(summarizeVegetationDebugInfo({
      bambooActive: 7,
      palmActive: 3,
      grassHighWater: 11,
      fernHighWater: 13,
      chunksTracked: 4,
      badActive: Number.NaN,
      stringHighWater: '5',
    })).toEqual({
      active: 10,
      reserved: 24,
    });
  });
});
