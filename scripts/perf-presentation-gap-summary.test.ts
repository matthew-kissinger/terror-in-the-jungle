import { describe, expect, it } from 'vitest';

import { summarizePresentationGapContexts } from './perf-presentation-gap-summary';

describe('summarizePresentationGapContexts', () => {
  it('aggregates terrain sync and CDLOD context across final presentation gaps', () => {
    const summary = summarizePresentationGapContexts(
      [],
      [
        {
          seq: 1,
          startAtMs: 100,
          endAtMs: 132,
          gapMs: 32,
          estimatedDropped60HzFrames: 1,
          overBudget60HzMs: 15.3,
          droppedFrameTime60HzMs: 15.3,
          presentationContext: {
            terrain: {
              tileCount: 10,
              tileSelectionSaturated: false,
              lodCounts: { 0: 6, 1: 4 },
              morphingTiles: 8,
              edgeMorphTiles: 2,
              maxMorphFactor: 0.75,
              cameraSample: {
                clearanceMeters: 1.8,
                hasTerrain: true,
                areaReady: true,
              },
            },
            terrainSync: {
              terrainBufferSubmitted: true,
              selectionRechecked: true,
              poseWasStale: true,
              projectionChanged: false,
              positionDeltaMeters: 0.4,
              rotationDeltaDeg: 0.1,
              submissionClassification: 'dynamics-changed',
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'aaa111',
                tileCount: 10,
              },
              'before-render': {
                tileHash: 'bbb222',
                tileCount: 10,
              },
            },
          },
          harnessContext: {
            lastFireIntent: true,
          },
        },
        {
          seq: 2,
          startAtMs: 132,
          endAtMs: 180,
          gapMs: 48,
          estimatedDropped60HzFrames: 2,
          overBudget60HzMs: 31.3,
          droppedFrameTime60HzMs: 31.3,
          presentationContext: {
            terrain: {
              tileCount: 14,
              tileSelectionSaturated: true,
              lodCounts: { 0: 8, 1: 6 },
              morphingTiles: 12,
              edgeMorphTiles: 4,
              maxMorphFactor: 1,
              cameraSample: {
                clearanceMeters: 3.2,
                hasTerrain: true,
                areaReady: false,
              },
            },
            terrainSync: {
              terrainBufferSubmitted: true,
              selectionRechecked: true,
              poseWasStale: false,
              projectionChanged: true,
              positionDeltaMeters: 1.2,
              rotationDeltaDeg: 0.25,
              submissionClassification: 'tile-set-changed',
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'ccc333',
                tileCount: 12,
              },
              'before-render': {
                tileHash: 'ddd444',
                tileCount: 14,
              },
            },
          },
          harnessContext: {
            lastFireIntent: false,
          },
        },
        {
          seq: 3,
          startAtMs: 180,
          endAtMs: 210,
          gapMs: 30,
          estimatedDropped60HzFrames: 1,
          overBudget60HzMs: 13.3,
          droppedFrameTime60HzMs: 13.3,
          presentationContext: {},
          harnessContext: {},
        },
      ],
    );

    expect(summary).toBeDefined();
    expect(summary?.gapCount).toBe(3);
    expect(summary?.maxGapMs).toBe(48);
    expect(summary?.totalDroppedFrameTime60HzMs).toBeCloseTo(59.9, 5);
    expect(summary?.terrain).toMatchObject({
      gapCount: 3,
      byTerrainSyncSubmission: {
        'dynamics-changed': 1,
        'tile-set-changed': 1,
        missing: 1,
      },
      terrainBufferSubmittedCount: 2,
      terrainSyncRecheckedCount: 2,
      terrainSyncPoseStaleCount: 1,
      terrainSyncProjectionChangedCount: 1,
      terrainStageHashChangedCount: 2,
      terrainStageTileCountChangedCount: 1,
      terrainSelectionSaturatedCount: 1,
      terrainNotReadyCount: 1,
      lowClearanceCount: 1,
      fireIntentCount: 1,
      nonFireIntentCount: 1,
      unknownFireIntentCount: 1,
    });
    expect(summary?.terrain?.droppedFrameTimeByTerrainSyncSubmission).toMatchObject({
      'dynamics-changed': 15.3,
      'tile-set-changed': 31.3,
      missing: 13.3,
    });
    expect(summary?.terrain?.tileCount).toMatchObject({
      count: 2,
      total: 24,
      avg: 12,
      min: 10,
      max: 14,
    });
    expect(summary?.terrain?.avgLodCounts).toMatchObject({
      0: 14 / 3,
      1: 10 / 3,
    });
    expect(summary?.terrain?.maxLodCounts).toMatchObject({
      0: 8,
      1: 6,
    });
    expect(summary?.latest.map((gap) => gap.seq)).toEqual([1, 2, 3]);
  });

  it('falls back to runtime rAF entries when final presentation epochs are absent', () => {
    const summary = summarizePresentationGapContexts(
      [
        {
          ts: 'sample-1',
          frameCount: 42,
          browserStalls: {
            recent: {
              rafCadence: {
                entries: [
                  {
                    atMs: 1200,
                    gapMs: 36,
                    estimatedDropped60HzFrames: 1,
                    overBudget60HzMs: 19.3,
                    droppedFrameTime60HzMs: 19.3,
                    presentationContext: {
                      terrainSync: {
                        terrainBufferSubmitted: false,
                        submissionClassification: null,
                      },
                    },
                    harnessContext: {
                      lastFireIntent: false,
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    );

    expect(summary).toBeDefined();
    expect(summary?.sampleCount).toBe(1);
    expect(summary?.latest[0]).toMatchObject({
      atMs: 1200,
      gapMs: 36,
      sampleTs: 'sample-1',
      sampleFrameCount: 42,
    });
    expect(summary?.terrain?.byTerrainSyncSubmission).toMatchObject({
      none: 1,
    });
    expect(summary?.terrain?.nonFireIntentCount).toBe(1);
  });
});
