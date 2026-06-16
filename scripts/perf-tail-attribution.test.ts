// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  computeTailAttribution,
  type TailAttributionSample,
} from './perf-tail-attribution';

/**
 * Unit proof for combat-p99-tail-attribution (DEFEKT-3, L1). Drives the pure
 * attribution function with synthetic capture samples modeled on the spike's
 * superposition finding (Combat + named non-combat systems + residual frame
 * time; cover timers ≈0) and asserts the attribution localizes the tail
 * correctly from a single run, no baseline.
 */
describe('computeTailAttribution', () => {
  // A "good" steady-state sample (low p99) plus a "tail" sample (high p99) that
  // reproduces the spike: the Combat phase total is dominated by an UNATTRIBUTED
  // residual (the contour terrain-stall movement cost, which is not a named
  // aiMethodMs timer) and state.advancing, while the cover-search timers are ~0.
  function tailSample(): TailAttributionSample {
    return {
      ts: '2026-06-03T00:00:10.000Z',
      frameCount: 5000,
      avgFrameMs: 16.6,
      p99FrameMs: 45.0,
      maxFrameMs: 49.5,
      // Frame-level: Combat top at 18ms but named non-combat/residual work is
      // the larger half. Player is intentionally present so the report cannot
      // hide it behind a renderer-only "Other" bucket.
      systemTop: [
        { name: 'SystemUpdater.Combat', emaMs: 18.0, peakMs: 22.0 },
        { name: 'Player', emaMs: 12.0, peakMs: 16.0 },
        { name: 'Other', emaMs: 6.0, peakMs: 9.0 },
      ],
      combatBreakdown: {
        totalMs: 18.0,
        aiUpdateMs: 6.0,
        spatialSyncMs: 1.0,
        billboardUpdateMs: 0.5,
        effectPoolsMs: 0.3,
        influenceMapMs: 0.2,
        // -> namedChildren = 8.0; unattributed = 10.0 (the movement stall storm).
        aiStateMs: {
          'state.advancing': 4.5,
          'state.engaging': 1.0,
          'state.patrolling': 0.4,
        },
        aiMethodMs: {
          // Cover-search timers: negligible, as the spike predicts.
          'engage.suppression.initiate.coverGridQuery': 0.02,
          'engage.suppression.initiate.coverSearch': 0.01,
          'engage.cover.findBestCover': 0.03,
          'engage.suppression.initiate.computeFlankDestination': 0.05,
          // A non-cover AI method that costs more than the cover search.
          'engage.targetAcquisition': 0.8,
        },
        aiMethodCounts: {
          'engage.suppression.initiate.coverSearch': 2,
          'engage.targetAcquisition': 40,
        },
        closeEngagement: {
          engagement: {
            suppressionFlankCoverSearches: 2,
            suppressionFlankCoverSearchCapSkips: 1,
          },
        },
      },
    };
  }

  function goodSample(): TailAttributionSample {
    return {
      ts: '2026-06-03T00:00:05.000Z',
      frameCount: 2500,
      avgFrameMs: 14.0,
      p99FrameMs: 31.0,
      maxFrameMs: 33.0,
      systemTop: [{ name: 'SystemUpdater.Combat', emaMs: 12.0, peakMs: 14.0 }],
      combatBreakdown: {
        totalMs: 12.0,
        aiUpdateMs: 8.0,
        spatialSyncMs: 1.0,
        billboardUpdateMs: 0.5,
        effectPoolsMs: 0.3,
        influenceMapMs: 0.2,
        aiStateMs: { 'state.advancing': 1.0 },
        aiMethodMs: { 'engage.suppression.initiate.coverSearch': 0.01 },
      },
    };
  }

  it('returns undefined when no sample carries a combatBreakdown', () => {
    expect(computeTailAttribution([])).toBeUndefined();
    expect(
      computeTailAttribution([
        { ts: 't', frameCount: 1, p99FrameMs: 50 } as TailAttributionSample,
      ])
    ).toBeUndefined();
  });

  it('selects the highest-p99 sample as the tail window', () => {
    const attribution = computeTailAttribution([goodSample(), tailSample()]);
    expect(attribution).toBeDefined();
    // The 45ms-p99 sample wins over the 31ms one.
    expect(attribution!.p99FrameMs).toBe(45.0);
    expect(attribution!.sampleFrameCount).toBe(5000);
  });

  it('proves the cover search is NOT the tail driver (cover timers ~0)', () => {
    const a = computeTailAttribution([tailSample()])!;
    expect(a.coverSearch.coverGridQueryMs).toBeCloseTo(0.02, 5);
    expect(a.coverSearch.coverSearchMs).toBeCloseTo(0.01, 5);
    expect(a.coverSearch.totalCoverMs).toBeLessThan(0.1);
    // The headline verdict: cover does not dominate the ~45ms tail frame.
    expect(a.coverDominatesTail).toBe(false);
    expect(a.conclusion).toContain('cover is NOT the driver');
  });

  it('localizes the movement-stall cost as the Combat-phase unattributed residual', () => {
    const a = computeTailAttribution([tailSample()])!;
    // totalMs 18 - namedChildren 8 = 10ms unattributed (the contour stall storm),
    // which dwarfs the entire cover search (<0.1ms).
    expect(a.combat.unattributedMs).toBeCloseTo(10.0, 5);
    expect(a.combat.unattributedMs).toBeGreaterThan(a.coverSearch.totalCoverMs * 50);
    // state.advancing is the top AI-state cost (where stalled NPCs accrue time).
    expect(a.topAiStates[0]?.name).toBe('state.advancing');
  });

  it('exposes named non-combat systems instead of hiding them as renderer-only Other', () => {
    const a = computeTailAttribution([tailSample()])!;
    // Combat system EMA 18ms vs a ~45ms frame -> >half the frame is
    // non-combat/residual, and the named Player cost is preserved.
    expect(a.combatVsOther.combatSystemMs).toBe(18.0);
    expect(a.combatVsOther.frameMs).toBe(45.0);
    expect(a.combatVsOther.otherMs).toBeCloseTo(27.0, 5);
    expect(a.combatVsOther.topNonCombatSystems[0]).toMatchObject({
      name: 'Player',
      ms: 12.0,
    });
    expect(a.combatVsOther.sampledSystemResidualMs).toBeCloseTo(9.0, 5);
    expect(a.conclusion).toContain('top non-combat sampled: Player 12.0ms');
    expect(a.conclusion).not.toContain('render/Other');
    // Combat is the top *system*, but it is NOT >half the frame, so the tail is a
    // superposition -> a combat-only fix is not guaranteed to clear it.
    expect(a.combatDominatesTail).toBe(false);
    expect(a.conclusion).toContain('superposition');
  });

  it('does not double-count child buckets when estimating sampled residual', () => {
    const a = computeTailAttribution([{
      ts: '2026-06-14T00:00:00.000Z',
      frameCount: 1200,
      p99FrameMs: 30.0,
      maxFrameMs: 34.0,
      systemTop: [
        { name: 'SystemUpdater.Player', emaMs: 10.0, peakMs: 27.0 },
        { name: 'Player.Controller', emaMs: 8.0, peakMs: 25.0 },
        { name: 'RenderMain', emaMs: 5.0, peakMs: 8.0 },
        { name: 'Combat', emaMs: 2.0, peakMs: 4.0 },
      ],
      combatBreakdown: {
        totalMs: 2.0,
        aiUpdateMs: 1.5,
      },
    }])!;

    expect(a.combatVsOther.topSystem).toBe('Player');
    expect(a.combatVsOther.topNonCombatSystems.map((s) => s.name)).toContain('Player.Controller');
    // Parent Player already includes Player.Controller. Sampled residual should
    // count Player + RenderMain + Combat, not Player + Player.Controller.
    expect(a.combatVsOther.sampledSystemMs).toBeCloseTo(17.0, 5);
    expect(a.combatVsOther.sampledSystemResidualMs).toBeCloseTo(13.0, 5);
  });

  it('carries slow-loop callback breakdown when the perf harness records it', () => {
    const sample = tailSample();
    sample.loopFrameBreakdown = [
      {
        frameCount: 5000,
        timestampDeltaMs: 45,
        callbackDurationMs: 34,
        segmentTotalMs: 24,
        unmeasuredCallbackMs: 10,
        segments: {
          'RenderMain.renderer.render': 14,
          'Simulation.updateSystems': 6,
          'FrameTail.runtimeMetrics': 1,
        },
        systemTimings: [
          { name: 'Combat', lastMs: 11, emaMs: 5, budgetMs: 4, overBudget: true },
          { name: 'Player', lastMs: 3, emaMs: 2, budgetMs: 4, overBudget: false },
        ],
        telemetryTimings: [
          {
            name: 'CombatAI.method.patrol.canSeeTarget',
            lastMs: 7,
            emaMs: 3,
            peakMs: 9,
            budgetMs: 4,
            overBudget: true,
          },
          {
            name: 'Player.Weapon.Firing',
            lastMs: 5,
            emaMs: 2,
            peakMs: 6,
            budgetMs: 4,
            overBudget: true,
          },
        ],
      },
    ];

    const a = computeTailAttribution([sample])!;

    expect(a.loopFrameBreakdown).toMatchObject({
      entryCount: 1,
      slowestCallbackMs: 34,
      slowestTimestampDeltaMs: 45,
      segmentTotalMs: 24,
      unmeasuredCallbackMs: 10,
    });
    expect(a.loopFrameBreakdown?.topSegments[0]).toMatchObject({
      name: 'RenderMain.renderer.render',
      ms: 14,
    });
    expect(a.loopFrameBreakdown?.topSystemTimings[0]).toMatchObject({
      name: 'Combat',
      lastMs: 11,
      overBudget: true,
    });
    expect(a.loopFrameBreakdown?.topTelemetryTimings[0]).toMatchObject({
      name: 'CombatAI.method.patrol.canSeeTarget',
      lastMs: 7,
      overBudget: true,
    });
    expect(a.conclusion).toContain('slow-loop callback 34.0ms');
    expect(a.conclusion).toContain('top SystemUpdater timings: Combat 11.0ms');
    expect(a.conclusion).toContain('top telemetry timings: CombatAI.method.patrol.canSeeTarget 7.0ms');
    expect(a.conclusion).toContain('unmeasured callback 10.0ms');
  });

  it('joins the selected tail to nearest render, scene, and presentation context', () => {
    const sample = tailSample();
    sample.renderSubmissions = {
      mode: 'summary',
      frameCountStart: 4980,
      frameCountEnd: 5020,
      frames: [
        {
          frameCount: 4970,
          drawSubmissions: 200,
          triangles: 100_000,
          instances: 300,
          categories: [
            {
              category: 'wildlife',
              drawSubmissions: 80,
              triangles: 8_000,
              instances: 20,
              meshes: 20,
              materials: 4,
              geometries: 4,
            },
          ],
        },
        {
          frameCount: 5002,
          drawSubmissions: 180,
          triangles: 1_600_000,
          instances: 340,
          passTypes: { main: 90, shadow: 90 },
          categories: [
            {
              category: 'terrain',
              drawSubmissions: 3,
              triangles: 1_580_000,
              instances: 3,
              meshes: 3,
              materials: 1,
              geometries: 3,
              passTypes: { main: 2, shadow: 1 },
            },
            {
              category: 'wildlife',
              drawSubmissions: 48,
              triangles: 12_000,
              instances: 24,
              meshes: 24,
              materials: 6,
              geometries: 6,
              passTypes: { main: 24, shadow: 24 },
            },
          ],
        },
      ],
      totals: [],
    };
    sample.sceneAttribution = [
      {
        category: 'terrain',
        visibleDrawCallLike: 6,
        visibleTriangles: 1_580_000,
        visibleInstances: 3,
        visibleMeshes: 3,
      },
      {
        category: 'wildlife',
        visibleDrawCallLike: 48,
        visibleTriangles: 12_000,
        visibleInstances: 24,
        visibleMeshes: 24,
      },
    ];
    sample.browserStalls = {
      recent: {
        rafCadence: {
          entries: [
            {
              gapMs: 61,
              estimatedDropped60HzFrames: 3,
              presentationContext: { engineFrameCount: 4998, terrainTileHash: 'near' },
              harnessContext: { shotsFired: 4 },
            },
            {
              gapMs: 90,
              estimatedDropped60HzFrames: 5,
              presentationContext: { engineFrameCount: 4700, terrainTileHash: 'far' },
            },
          ],
        },
      },
    };

    const a = computeTailAttribution([sample], {
      presentationEpochs: [
        {
          gapMs: 55,
          estimatedDropped60HzFrames: 2,
          overBudget60HzMs: 38.33,
          droppedFrameTime60HzMs: 38.33,
          engineFrameCount: 5001,
          presentationContext: {
            terrainTileHash: 'final-ring',
            terrain: {
              tileSelectionSaturated: true,
              cameraSample: {
                terrainHeightAtCamera: 125.25,
                effectiveHeightAtCamera: 126.5,
                clearanceMeters: -0.75,
                effectiveClearanceMeters: -2,
                hasTerrain: true,
                areaReady: false,
              },
            },
            terrainSync: {
              tileSelectionSaturated: false,
              selectionRechecked: true,
              poseWasStale: false,
              projectionChanged: true,
              terrainBufferSubmitted: true,
              submissionClassification: 'dynamics-changed',
            },
            terrainByStage: {
              'after-simulation': {
                tileHash: 'aaa11111',
                tileCount: 19,
              },
              'before-render': {
                tileHash: 'bbb22222',
                tileCount: 21,
              },
            },
          },
          harnessContext: {
            lastViewStepYawDeg: 11.8,
            lastViewStepPitchDeg: 3.7,
            lastViewYawClamped: true,
            lastViewPitchClamped: false,
            lastViewTargetKind: 'aim_target',
            lastViewAnchorResyncChanged: true,
            lastAimDot: 0.92,
            lastFireIntent: true,
            lastAimGatePassed: true,
            lastAimGateReason: 'ok',
            lastFireLosGatePassed: false,
            lastFireProbe: {
              losReason: 'terrain_hit_before_target',
            },
          },
        },
      ],
    })!;

    expect(a.renderSubmissionContext?.nearestFrame).toMatchObject({
      frameCount: 5002,
      frameCountDelta: 2,
      drawSubmissions: 180,
      triangles: 1_600_000,
      passTypes: { main: 90, shadow: 90 },
    });
    expect(a.renderSubmissionContext?.nearestFrame?.topCategories[0]).toMatchObject({
      category: 'wildlife',
      drawSubmissions: 48,
    });
    expect(a.renderSubmissionContext?.nearestFrame?.topCategories[1]).toMatchObject({
      category: 'terrain',
      triangles: 1_580_000,
    });
    expect(a.renderSubmissionContext?.nearestFrame?.topTriangleCategories[0]).toMatchObject({
      category: 'terrain',
      triangles: 1_580_000,
      drawSubmissions: 3,
    });
    expect(a.sceneAttributionContext).toMatchObject({
      available: true,
      categoryCount: 2,
      visibleDrawCallLikeTotal: 54,
      visibleTrianglesTotal: 1_592_000,
    });
    expect(a.presentationGapContext).toMatchObject({
      source: 'finalPresentationEpochs',
      gapMs: 55,
      estimatedDropped60HzFrames: 2,
      overBudget60HzMs: 38.33,
      droppedFrameTime60HzMs: 38.33,
      engineFrameCount: 5001,
      frameCountDelta: 1,
      terrainTileSelectionSaturated: true,
      terrainSyncTileSelectionSaturated: false,
      terrainSyncSelectionRechecked: true,
      terrainSyncPoseWasStale: false,
      terrainSyncProjectionChanged: true,
      terrainSyncBufferSubmitted: true,
      terrainSyncSubmissionClassification: 'dynamics-changed',
      terrainAfterSimulationTileHash: 'aaa11111',
      terrainBeforeRenderTileHash: 'bbb22222',
      terrainStageTileHashChanged: true,
      terrainAfterSimulationTileCount: 19,
      terrainBeforeRenderTileCount: 21,
      cameraTerrainHeightAtCamera: 125.25,
      cameraEffectiveHeightAtCamera: 126.5,
      cameraTerrainClearanceMeters: -0.75,
      cameraEffectiveClearanceMeters: -2,
      cameraTerrainHasTerrain: true,
      cameraTerrainAreaReady: false,
      driverViewStepYawDeg: 11.8,
      driverViewStepPitchDeg: 3.7,
      driverViewYawClamped: true,
      driverViewPitchClamped: false,
      driverViewTargetKind: 'aim_target',
      driverViewAnchorResyncChanged: true,
      driverAimDot: 0.92,
      driverFireIntent: true,
      driverAimGatePassed: true,
      driverAimGateReason: 'ok',
      driverFireLosGatePassed: false,
      driverFireLosReason: 'terrain_hit_before_target',
    });
    expect(a.conclusion).toContain('tail render frame 5002');
    expect(a.conclusion).toContain('top render triangles: terrain 1580000 tris/3 submissions');
    expect(a.conclusion).toContain('visible scene categories: wildlife 48 visible draw-like');
    expect(a.conclusion).toContain('nearest presentation gap 55.0ms');
    expect(a.conclusion).toContain('dropped-frame time 38.3ms');
    expect(a.conclusion).toContain('over-budget 38.3ms');
    expect(a.conclusion).toContain('terrain saturation terrain=true terrainSync=false');
    expect(a.conclusion).toContain('terrain sync rechecked=true poseStale=false projectionChanged=true');
    expect(a.conclusion).toContain('submitted=true class=dynamics-changed');
    expect(a.conclusion).toContain('terrain stage afterSim=19/aaa11111 beforeRender=21/bbb22222 changed=true');
    expect(a.conclusion).toContain('camera terrain clearance terrain=-0.75m effective=-2.00m');
    expect(a.conclusion).toContain('hasTerrain=true areaReady=false');
    expect(a.conclusion).toContain('driver view step 11.8/3.7deg');
    expect(a.conclusion).toContain('clamped=true/false');
    expect(a.conclusion).toContain('aimGate=true/ok');
    expect(a.conclusion).toContain('fireLOS=false/terrain_hit_before_target');
  });

  it('falls back to final scene attribution when tail samples lack frame-local scene context', () => {
    const a = computeTailAttribution([tailSample()], {
      finalSceneAttribution: [
        {
          category: 'terrain',
          visibleDrawCallLike: 4,
          visibleTriangles: 696_000,
          visibleInstances: 2,
          visibleMeshes: 2,
        },
        {
          category: 'vegetation_imposters',
          visibleDrawCallLike: 102,
          visibleTriangles: 101_000,
          visibleInstances: 50,
          visibleMeshes: 50,
        },
      ],
    })!;

    expect(a.sceneAttributionContext).toMatchObject({
      available: true,
      source: 'finalSceneAttribution',
      correlation: 'run-final-uncorrelated',
      categoryCount: 2,
      visibleDrawCallLikeTotal: 106,
      visibleTrianglesTotal: 797_000,
    });
    expect(a.conclusion).toContain('final visible scene categories: vegetation_imposters 102 visible draw-like');
    expect(a.conclusion).toContain('(run-final uncorrelated)');
  });

  it('ranks named AI methods and carries call counts', () => {
    const a = computeTailAttribution([tailSample()])!;
    // The non-cover AI method outranks every cover timer.
    expect(a.topAiMethods[0]?.name).toBe('engage.targetAcquisition');
    expect(a.topAiMethods[0]?.calls).toBe(40);
    // The cover timers are present but ranked below.
    const coverEntry = a.topAiMethods.find(
      (m) => m.name === 'engage.suppression.initiate.coverSearch'
    );
    expect(coverEntry?.calls).toBe(2);
  });

  it('carries the flank-cover activity counters for context', () => {
    const a = computeTailAttribution([tailSample()])!;
    expect(a.coverSearch.flankCoverSearches).toBe(2);
    expect(a.coverSearch.flankCoverSearchCapSkips).toBe(1);
  });

  it('flags cover as a factor when the cover timers genuinely dominate a frame', () => {
    // Counter-case: if a regression made the cover search expensive, the verdict
    // must flip. This guards against a vacuous "always says cover is innocent".
    const heavyCover: TailAttributionSample = {
      ts: 't',
      frameCount: 10,
      p99FrameMs: 20.0,
      systemTop: [{ name: 'SystemUpdater.Combat', emaMs: 19.0, peakMs: 20.0 }],
      combatBreakdown: {
        totalMs: 19.0,
        aiUpdateMs: 19.0,
        aiMethodMs: {
          'engage.suppression.initiate.coverSearch': 9.0,
          'engage.cover.findBestCover': 6.0,
        },
      },
    };
    const a = computeTailAttribution([heavyCover])!;
    expect(a.coverSearch.totalCoverMs).toBeGreaterThan(a.combatVsOther.frameMs * 0.1);
    expect(a.coverDominatesTail).toBe(true);
    expect(a.combatDominatesTail).toBe(true);
    expect(a.conclusion).toContain('COVER IS A FACTOR');
  });

  it('falls back to maxFrameMs then avgFrameMs when p99 is absent', () => {
    const noP99: TailAttributionSample = {
      ts: 't',
      frameCount: 1,
      maxFrameMs: 40.0,
      systemTop: [{ name: 'Combat', emaMs: 10, peakMs: 12 }],
      combatBreakdown: { totalMs: 10, aiUpdateMs: 5 },
    };
    const a = computeTailAttribution([noP99])!;
    // frameMs derives from maxFrameMs (40) when p99 is missing.
    expect(a.combatVsOther.frameMs).toBe(40.0);
  });
});
