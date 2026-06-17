import { describe, expect, it } from 'vitest';

import {
  terrainStageBufferVisibleChanged,
  terrainStageRecord,
} from './perf-terrain-stage-classification';

describe('terrain stage classification', () => {
  it('detects buffer-visible churn from current hyphenated presentation stage keys', () => {
    const terrainByStage = {
      'after-simulation': {
        tileIdentityHash: 'identity-a',
        edgeMaskHash: 'edge-a',
        tileCount: 12,
      },
      'before-render': {
        tileIdentityHash: 'identity-b',
        edgeMaskHash: 'edge-a',
        tileCount: 12,
      },
    };

    expect(terrainStageRecord(terrainByStage, 'after-simulation')).toMatchObject({
      tileIdentityHash: 'identity-a',
    });
    expect(terrainStageBufferVisibleChanged(terrainByStage)).toBe(true);
  });

  it('keeps legacy camelCase stage keys readable for old artifacts', () => {
    expect(terrainStageBufferVisibleChanged({
      afterSimulation: {
        tileIdentityHash: 'identity-a',
        edgeMaskHash: 'edge-a',
        tileCount: 12,
      },
      beforeRender: {
        tileIdentityHash: 'identity-a',
        edgeMaskHash: 'edge-b',
        tileCount: 12,
      },
    })).toBe(true);
  });

  it('does not classify morph-only churn as buffer-visible churn', () => {
    expect(terrainStageBufferVisibleChanged({
      'after-simulation': {
        tileHash: 'tile-a',
        tileIdentityHash: 'identity-a',
        morphHash: 'morph-a',
        edgeMaskHash: 'edge-a',
        tileCount: 12,
      },
      'before-render': {
        tileHash: 'tile-b',
        tileIdentityHash: 'identity-a',
        morphHash: 'morph-b',
        edgeMaskHash: 'edge-a',
        tileCount: 12,
      },
    })).toBe(false);
  });
});
