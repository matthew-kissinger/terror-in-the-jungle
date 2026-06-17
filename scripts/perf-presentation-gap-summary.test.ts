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
              edgeMorphMaskCounts: { 0: 8, 5: 2 },
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
            terrainRender: {
              boundedShadowPassEnabled: true,
              shadowPrefixInstances: 24,
              lastMainPassInstances: 96,
              lastShadowPassInstances: 24,
              shadowPrefixRatio: 0.25,
              lastSelectionMs: 0.2,
              lastUpdateInstancesMs: 0.4,
              tileInteriorTriangles: 2048,
              tileSkirtTriangles: 512,
              tileSkirtTrianglesPerEdge: 128,
              tileTotalTriangles: 2560,
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'aaa111',
                tileIdentityHash: 'identity-a',
                morphHash: 'morph-a',
                edgeMaskHash: 'edge-a',
                tileCount: 10,
              },
              'before-render': {
                tileHash: 'bbb222',
                tileIdentityHash: 'identity-a',
                morphHash: 'morph-b',
                edgeMaskHash: 'edge-a',
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
              edgeMorphMaskCounts: { 0: 10, 1: 4 },
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
            terrainRender: {
              boundedShadowPassEnabled: false,
              shadowPrefixInstances: 14,
              lastMainPassInstances: 14,
              lastShadowPassInstances: 14,
              shadowPrefixRatio: 1,
              lastSelectionMs: 0.6,
              lastUpdateInstancesMs: 0.8,
              tileInteriorTriangles: 2048,
              tileSkirtTriangles: 512,
              tileSkirtTrianglesPerEdge: 128,
              tileTotalTriangles: 2560,
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'ccc333',
                tileIdentityHash: 'identity-c',
                morphHash: 'morph-c',
                edgeMaskHash: 'edge-c',
                tileCount: 12,
              },
              'before-render': {
                tileHash: 'ddd444',
                tileIdentityHash: 'identity-d',
                morphHash: 'morph-d',
                edgeMaskHash: 'edge-d',
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
      terrainStageIdentityHashChangedCount: 1,
      terrainStageMorphHashChangedCount: 2,
      terrainStageEdgeMaskHashChangedCount: 1,
      terrainStageTileCountChangedCount: 1,
      terrainStageBufferVisibleChangedCount: 1,
      terrainStageBufferVisibleChangedWithoutSubmissionCount: 0,
      terrainSelectionSaturatedCount: 1,
      terrainNotReadyCount: 1,
      lowClearanceCount: 1,
      fireIntentCount: 1,
      nonFireIntentCount: 1,
      unknownFireIntentCount: 1,
      terrainRenderObservedCount: 2,
      boundedShadowPassCount: 1,
      byShadowPrefixCoverage: {
        low: 1,
        unbounded: 1,
        missing: 1,
      },
    });
    expect(summary?.terrain?.droppedFrameTimeByTerrainSyncSubmission).toMatchObject({
      'dynamics-changed': 15.3,
      'tile-set-changed': 31.3,
      missing: 13.3,
    });
    expect(summary?.terrain?.droppedFrameTimeByShadowPrefixCoverage).toMatchObject({
      low: 15.3,
      unbounded: 31.3,
      missing: 13.3,
    });
    expect(summary?.terrain?.tileCount).toMatchObject({
      count: 2,
      total: 24,
      avg: 12,
      min: 10,
      max: 14,
    });
    expect(summary?.terrain?.shadowPrefixRatio).toMatchObject({
      count: 2,
      total: 1.25,
      avg: 0.625,
      min: 0.25,
      max: 1,
    });
    expect(summary?.terrain?.renderUpdateInstancesMs).toMatchObject({
      count: 2,
      min: 0.4,
      max: 0.8,
    });
    expect(summary?.terrain?.renderUpdateInstancesMs?.total).toBeCloseTo(1.2, 5);
    expect(summary?.terrain?.renderUpdateInstancesMs?.avg).toBeCloseTo(0.6, 5);
    expect(summary?.terrain?.mainTerrainTriangleEstimate).toMatchObject({
      count: 2,
      total: 61440,
      avg: 30720,
      min: 25600,
      max: 35840,
    });
    expect(summary?.terrain?.mainTerrainInteriorTriangleEstimate?.total).toBe(49152);
    expect(summary?.terrain?.mainTerrainFullSkirtTriangleEstimate?.total).toBe(12288);
    expect(summary?.terrain?.edgeTransitionSkirtTriangleEstimate?.total).toBe(1024);
    expect(summary?.terrain?.potentialSkirtTriangleSavingsEstimate?.total).toBe(11264);
    expect(summary?.terrain?.potentialSkirtTriangleSavingsRatio?.avg).toBeCloseTo(
      (4608 / 25600 + 6656 / 35840) / 2,
      5,
    );
    expect(summary?.terrain?.shadowTerrainTriangleEstimate).toMatchObject({
      count: 2,
      total: 97280,
      avg: 48640,
      min: 35840,
      max: 61440,
    });
    expect(summary?.terrain?.avgLodCounts).toMatchObject({
      0: 14 / 3,
      1: 10 / 3,
    });
    expect(summary?.terrain?.maxLodCounts).toMatchObject({
      0: 8,
      1: 6,
    });
    expect(summary?.terrain?.avgEdgeMorphMaskCounts).toMatchObject({
      0: 18 / 3,
      1: 4 / 3,
      5: 2 / 3,
    });
    expect(summary?.terrain?.maxEdgeMorphMaskCounts).toMatchObject({
      0: 10,
      1: 4,
      5: 2,
    });
    expect(summary?.latest.map((gap) => gap.seq)).toEqual([1, 2, 3]);
  });

  it('separates morph-only stage churn from unsynced buffer-visible terrain changes', () => {
    const summary = summarizePresentationGapContexts(
      [],
      [
        {
          gapMs: 30,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 13.3,
          presentationContext: {
            terrainSync: {
              terrainBufferSubmitted: false,
              submissionClassification: 'same-identity',
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'hash-a',
                tileIdentityHash: 'identity-a',
                morphHash: 'morph-a',
                edgeMaskHash: 'edge-a',
                tileCount: 12,
              },
              'before-render': {
                tileHash: 'hash-b',
                tileIdentityHash: 'identity-a',
                morphHash: 'morph-b',
                edgeMaskHash: 'edge-a',
                tileCount: 12,
              },
            },
          },
        },
        {
          gapMs: 34,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 17.3,
          presentationContext: {
            terrainSync: {
              terrainBufferSubmitted: false,
              submissionClassification: 'same-identity',
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'hash-c',
                tileIdentityHash: 'identity-c',
                morphHash: 'morph-c',
                edgeMaskHash: 'edge-c',
                tileCount: 12,
              },
              'before-render': {
                tileHash: 'hash-d',
                tileIdentityHash: 'identity-d',
                morphHash: 'morph-c',
                edgeMaskHash: 'edge-d',
                tileCount: 13,
              },
            },
          },
        },
      ],
    );

    expect(summary?.terrain).toMatchObject({
      terrainStageHashChangedCount: 2,
      terrainStageMorphHashChangedCount: 1,
      terrainStageIdentityHashChangedCount: 1,
      terrainStageEdgeMaskHashChangedCount: 1,
      terrainStageTileCountChangedCount: 1,
      terrainStageBufferVisibleChangedCount: 1,
      terrainStageBufferVisibleChangedWithoutSubmissionCount: 1,
    });
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

  it('surfaces final scene attribution as an explicitly uncorrelated fallback', () => {
    const summary = summarizePresentationGapContexts(
      [],
      [
        {
          seq: 1,
          gapMs: 40,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 23.3,
          presentationContext: {},
        },
      ],
      {
        finalSceneAttribution: [
          {
            category: 'terrain',
            visibleDrawCallLike: 1,
            visibleTriangles: 714240,
            visibleInstances: 279,
            visibleMeshes: 1,
          },
          {
            category: 'wildlife',
            visibleDrawCallLike: 40,
            visibleTriangles: 23460,
            visibleInstances: 40,
            visibleMeshes: 40,
          },
        ],
      },
    );

    expect(summary?.scene).toMatchObject({
      source: 'final-scene-attribution',
      correlation: 'run-final-uncorrelated',
      sceneSampleCount: 1,
      categoryCount: 2,
      visibleDrawCallLikeTotal: 41,
      visibleTrianglesTotal: 737700,
    });
    expect(summary?.scene?.topVisibleDrawCallLike[0]).toMatchObject({
      category: 'wildlife',
      visibleDrawCallLike: 40,
    });
    expect(summary?.scene?.topVisibleTriangles[0]).toMatchObject({
      category: 'terrain',
      visibleTriangles: 714240,
    });
  });

  it('prefers runtime scene attribution samples over the final fallback', () => {
    const summary = summarizePresentationGapContexts(
      [
        {
          frameCount: 10,
          sceneAttribution: [
            {
              category: 'terrain',
              visibleDrawCallLike: 1,
              visibleTriangles: 500000,
              visibleInstances: 200,
            },
          ],
        },
        {
          frameCount: 20,
          sceneAttribution: [
            {
              category: 'vegetation_imposters',
              visibleDrawCallLike: 6,
              visibleTriangles: 100000,
              visibleInstances: 50000,
            },
          ],
        },
      ],
      [
        {
          seq: 1,
          gapMs: 36,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 19.3,
          presentationContext: {},
        },
      ],
      {
        finalSceneAttribution: [
          {
            category: 'terrain',
            visibleDrawCallLike: 1,
            visibleTriangles: 900000,
          },
        ],
      },
    );

    expect(summary?.scene).toMatchObject({
      source: 'runtime-scene-attribution',
      correlation: 'runtime-sampled',
      sceneSampleCount: 2,
      categoryCount: 1,
      visibleDrawCallLikeTotal: 6,
      visibleTrianglesTotal: 100000,
    });
    expect(summary?.scene?.topVisibleDrawCallLike[0]?.category).toBe('vegetation_imposters');
  });

  it('correlates presentation gaps with close-model and render-submission pressure', () => {
    const summary = summarizePresentationGapContexts(
      [
        {
          pagePerformanceNowMs: 1010,
          frameCount: 120,
          closeModelStats: {
            candidatesWithinCloseRadius: 18,
            renderedCloseModels: 12,
            activeCloseModels: 12,
            fallbackCount: 6,
            poolLoads: 0,
          },
          materializationTierEvents: [
            { fromRender: 'impostor', toRender: 'close-glb' },
            { fromRender: 'culled', toRender: 'impostor' },
          ],
          combatBreakdown: {
            billboardProfile: {
              closeModelMs: 1.2,
              materializationEventsMs: 0.06,
            },
          },
          renderSubmissions: {
            frames: [
              {
                firstAtMs: 1008,
                lastAtMs: 1012,
                drawSubmissions: 150,
                triangles: 410000,
                categories: [
                  {
                    category: 'npc_close_glb',
                    drawSubmissions: 84,
                    triangles: 9800,
                    instances: 12,
                    materials: 84,
                    geometries: 12,
                  },
                  {
                    category: 'terrain',
                    drawSubmissions: 10,
                    triangles: 300000,
                    instances: 140,
                    materials: 10,
                    geometries: 2,
                  },
                ],
              },
            ],
          },
        },
        {
          pagePerformanceNowMs: 2605,
          frameCount: 240,
          closeModelStats: {
            candidatesWithinCloseRadius: 0,
            renderedCloseModels: 0,
            activeCloseModels: 0,
            fallbackCount: 0,
            poolLoads: 0,
          },
          materializationTierEvents: [],
          combatBreakdown: {
            billboardProfile: {
              closeModelMs: 0.1,
              materializationEventsMs: 0.02,
            },
          },
          renderSubmissions: {
            frames: [
              {
                firstAtMs: 2603,
                lastAtMs: 2607,
                drawSubmissions: 72,
                triangles: 320000,
                categories: [
                  {
                    category: 'terrain',
                    drawSubmissions: 10,
                    triangles: 310000,
                    instances: 130,
                    materials: 10,
                    geometries: 2,
                  },
                ],
              },
            ],
          },
        },
      ],
      [
        {
          seq: 1,
          endAtMs: 1000,
          gapMs: 34,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 17.3,
          presentationContext: {},
        },
        {
          seq: 2,
          endAtMs: 2600,
          gapMs: 28,
          estimatedDropped60HzFrames: 1,
          droppedFrameTime60HzMs: 11.3,
          presentationContext: {},
        },
      ],
    );

    expect(summary?.materialization).toMatchObject({
      gapCount: 2,
      correlatedGapCount: 2,
      closeModelStatsObservedCount: 2,
      closeModelActiveGapCount: 1,
      materializationEventGapCount: 1,
      totalMaterializationEvents: 2,
      renderSubmissionCorrelatedGapCount: 2,
      droppedFrameTimeWithCloseModels60HzMs: 17.3,
      droppedFrameTimeWithMaterializationEvents60HzMs: 17.3,
      droppedFrameTimeByCloseModelActivity: {
        active: 17.3,
        inactive: 11.3,
        missing: 0,
      },
    });
    expect(summary?.materialization?.activeCloseModels).toMatchObject({
      count: 2,
      total: 12,
      avg: 6,
      min: 0,
      max: 12,
    });
    expect(summary?.materialization?.materializationEventsPerGap).toMatchObject({
      count: 2,
      total: 2,
      avg: 1,
      min: 0,
      max: 2,
    });
    expect(summary?.materialization?.closeModelMs?.total).toBeCloseTo(1.3, 5);
    expect(summary?.materialization?.renderFrameDrawSubmissions?.total).toBe(222);
    expect(summary?.materialization?.topRenderCategoriesByDrawSubmissions[0]).toMatchObject({
      category: 'npc_close_glb',
      drawSubmissions: 84,
    });
    expect(summary?.materialization?.topRenderCategoriesByTriangles[0]).toMatchObject({
      category: 'terrain',
      triangles: 610000,
    });
  });
});
