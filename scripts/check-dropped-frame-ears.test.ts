// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  evaluateDroppedFrameEars,
  evaluateDroppedFrameEarsArtifact,
} from './check-dropped-frame-ears';

type ArtifactOptions = {
  scenario: 'open_frontier' | 'a_shau_valley';
  validationOverall?: 'pass' | 'warn' | 'fail';
  measurementTrust?: 'pass' | 'fail';
  status?: 'ok' | 'failed';
  runtimeOverrides?: Record<string, unknown>;
  presentationTerrainOverrides?: Record<string, unknown>;
  presentationGapCount?: number;
  harnessWarnings?: boolean;
  lowCombat?: boolean;
  burstyCombatContact?: boolean;
  thinMaterializationPressure?: boolean;
  burstyMaterializationContact?: boolean;
  liveCloseModelPoolLoads?: boolean;
  missingMaterializationEvents?: boolean;
  transitionWindowMaterializationEvents?: boolean;
  quietSnapshotStatus?: 'pass' | 'warn' | 'fail';
};

const REQUIRED_PLACEHOLDER_FILES = [
  'presentation-epochs.json',
  'runtime-render-submission-samples.json',
  'final-frame.png',
] as const;

function tempArtifact(options: ArtifactOptions): string {
  const dir = mkdtempSync(join(tmpdir(), 'tij-st4-ears-'));
  const validationOverall = options.validationOverall ?? 'pass';
  const measurementTrust = options.measurementTrust ?? 'pass';
  const status = options.status ?? 'ok';
  const harnessWarningStatus = options.harnessWarnings ? 'warn' : 'pass';
  const materializationPeakCandidates = options.thinMaterializationPressure ? 1 : 5;
  const materializationPeakRendered = options.thinMaterializationPressure ? 1 : 4;
  const materializationSampleCount = options.burstyMaterializationContact ? 40 : 8;
  const materializationSamplesWithCandidates = options.thinMaterializationPressure
    ? 1
    : options.burstyMaterializationContact
      ? 2
      : 3;
  const transitionWindowEvents = options.transitionWindowMaterializationEvents
    ? Math.max(1, materializationSamplesWithCandidates)
    : 0;
  const materializationStatus = options.thinMaterializationPressure ? 'warn' : 'pass';
  const combatStatus = options.lowCombat ? 'fail' : 'pass';
  const shotCount = options.lowCombat ? 0 : 80;
  const hitCount = options.lowCombat ? 0 : 9;
  const runtimeShotCounts = options.lowCombat
    ? [0, 0, 0, 0, 0, 0, 0, 0]
    : options.burstyCombatContact
      ? [0, 0, 0, shotCount, shotCount, shotCount, shotCount, shotCount]
      : [0, 4, 12, 24, 36, 48, 64, shotCount];
  const checks = [
    { id: 'raf_stutter_25ms_percent', status: 'pass', value: 0.1, message: 'ok' },
    { id: 'raf_hitch_33ms_percent', status: 'pass', value: 0.1, message: 'ok' },
    { id: 'raf_estimated_dropped_60hz_frames_per_second', status: 'pass', value: 0.01, message: 'ok' },
    { id: 'raf_dropped_frame_time_60hz_ms_per_second', status: 'pass', value: 0.2, message: 'ok' },
    { id: 'harness_min_shots_fired', status: combatStatus, value: shotCount, message: 'ok' },
    { id: 'harness_min_hits_recorded', status: combatStatus, value: hitCount, message: 'ok' },
    { id: 'npc_materialization_pressure', status: materializationStatus, value: materializationPeakCandidates, message: 'ok' },
    { id: 'harness_route_snap_trust', status: harnessWarningStatus, value: 0, message: 'ok' },
    { id: 'harness_frontline_compression_equivalence', status: harnessWarningStatus, value: 0, message: 'ok' },
    { id: 'harness_movement_mode_equivalence', status: harnessWarningStatus, value: 0, message: 'ok' },
    { id: 'harness_view_slew_request_equivalence', status: harnessWarningStatus, value: 0, message: 'ok' },
    { id: 'harness_shot_presentation_context_equivalence', status: harnessWarningStatus, value: 0, message: 'ok' },
  ];
  const validation = { overall: validationOverall, checks };
  const summary = {
    status,
    scenario: { mode: options.scenario, requestedMode: options.scenario },
    captureEnvironment: {
      quietMachineAttested: true,
      quietMachineSnapshot: {
        checkedAt: 'fixture',
        status: options.quietSnapshotStatus ?? 'pass',
        cpu: {
          source: 'fixture',
          avgPercent: 3,
          maxPercent: 8,
          samples: [2, 3, 4, 8],
        },
        gpu: {
          source: 'fixture',
          available: true,
          loadClass: options.quietSnapshotStatus === 'fail'
            ? 'busy'
            : options.quietSnapshotStatus === 'warn'
              ? 'background'
              : 'idle',
          utilizationPercent: options.quietSnapshotStatus === 'fail'
            ? 48
            : options.quietSnapshotStatus === 'warn'
              ? 18
              : 2,
          memoryUtilizationPercent: 1,
          memoryUsedMiB: 512,
        },
        warnings: options.quietSnapshotStatus === 'fail'
          ? ['GPU was busy during quiet snapshot: utilization=48%']
          : options.quietSnapshotStatus === 'warn'
            ? ['GPU background activity during quiet snapshot: utilization=18%']
          : [],
      },
    },
    url: 'http://127.0.0.1:9100/?perf=1&renderer=webgpu-strict',
    validation,
    measurementTrust: {
      status: measurementTrust,
      rendererBackend: { resolvedBackend: 'webgpu', strictWebGPU: true },
    },
    rendererBackend: { resolvedBackend: 'webgpu', strictWebGPU: true },
    closeModelEnvelope: {
      sampleCount: materializationSampleCount,
      samplesWithCandidates: materializationSamplesWithCandidates,
      samplesWithRenderedCloseModels: materializationSamplesWithCandidates,
      peakCandidatesWithinCloseRadius: materializationPeakCandidates,
      peakRenderedCloseModels: materializationPeakRendered,
      peakActiveCloseModels: materializationPeakRendered,
      peakFallbackCount: 1,
      peakPromotionsThisFrame: 2,
      peakReplacementsThisFrame: 1,
      promotionBudgetPerFrame: 2,
    },
    materializationTierMetrics: {
      sampleCount: runtimeShotCounts.length,
      totalEvents: options.missingMaterializationEvents ? 0 : Math.max(1, materializationSamplesWithCandidates),
      byTransition: options.missingMaterializationEvents ? {} : { 'impostor->close-glb': 1 },
      byReason: options.missingMaterializationEvents ? {} : { 'close-glb:active': 1 },
      byToRender: options.missingMaterializationEvents ? {} : { 'close-glb': 1 },
      transitionWindowTotalEvents: transitionWindowEvents,
      transitionWindowByTransition: transitionWindowEvents > 0 ? { 'impostor->close-glb': transitionWindowEvents } : {},
      transitionWindowByReason: transitionWindowEvents > 0 ? { 'close-glb:active': transitionWindowEvents } : {},
      peakSample: options.missingMaterializationEvents ? undefined : {
        ts: 'fixture',
        frameCount: 1,
        eventCount: 1,
        byTransition: { 'impostor->close-glb': 1 },
        byReason: { 'close-glb:active': 1 },
      },
      peakTransitionWindowSample: transitionWindowEvents > 0 ? {
        ts: 'fixture',
        frameCount: 1,
        eventCount: transitionWindowEvents,
        byTransition: { 'impostor->close-glb': transitionWindowEvents },
        byReason: { 'close-glb:active': transitionWindowEvents },
      } : undefined,
    },
    perfRuntime: {
      presentationContextCapture: true,
      frontlineCompressionRequested: false,
      victoryConditionsDisabled: false,
      npcCloseModelsDisabled: false,
      terrainShadowsDisabled: false,
      terrainShadowPassMode: 'bounded-default',
      terrainFullShadowPassEnabled: false,
      boundedTerrainShadowPassRequested: false,
      terrainForceInstanceUploadEnabled: false,
      terrainHeightAwareFrustumRequested: false,
      terrainHeightAwareFrustumDisabled: false,
      terrainPlayableWorldSize: 3200,
      terrainVisualWorldSize: 3600,
      terrainVisualMargin: 200,
      terrainMaxLODLevels: 6,
      terrainLodRange0: 225,
      terrainLodRangeLast: 7200,
      terrainLod0VertexSpacing: 3600 / 2 ** 6 / 32,
      terrainFullSkirtsRequested: false,
      terrainSparseSkirtsRequested: false,
      terrainSkirtsDisabled: false,
      terrainFarCanopyTintDisabled: false,
      terrainLowSunOcclusionDisabled: false,
      wildlifeDisabled: false,
      ...(options.runtimeOverrides ?? {}),
    },
    presentationGapContexts: {
      gapCount: options.presentationGapCount ?? 3,
      terrain: {
        gapCount: 3,
        terrainStageHashChangedCount: 0,
        terrainStageIdentityHashChangedCount: 0,
        terrainStageMorphHashChangedCount: 0,
        terrainStageEdgeMaskHashChangedCount: 0,
        terrainStageTileCountChangedCount: 0,
        terrainStageBufferVisibleChangedCount: 0,
        terrainStageBufferVisibleChangedWithoutSubmissionCount: 0,
        terrainSelectionSaturatedCount: 0,
        ...(options.presentationTerrainOverrides ?? {}),
      },
    },
  };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary), 'utf-8');
  writeFileSync(join(dir, 'validation.json'), JSON.stringify(validation), 'utf-8');
  writeFileSync(join(dir, 'measurement-trust.json'), JSON.stringify(summary.measurementTrust), 'utf-8');
  writeFileSync(join(dir, 'runtime-samples.json'), JSON.stringify(runtimeShotCounts.map((shotsThisSession, index) => ({
    shotsThisSession,
    hitsThisSession: shotsThisSession > 0 ? Math.min(hitCount, Math.max(1, Math.floor(shotsThisSession / 10))) : 0,
    harnessDriver: {
      engineShotsFired: shotsThisSession,
      engineShotsHit: shotsThisSession > 0 ? Math.min(hitCount, Math.max(1, Math.floor(shotsThisSession / 10))) : 0,
    },
    closeModelStats: {
      candidatesWithinCloseRadius: materializationSamplesWithCandidates > index ? materializationPeakCandidates : 0,
      renderedCloseModels: materializationSamplesWithCandidates > index ? materializationPeakRendered : 0,
      activeCloseModels: materializationSamplesWithCandidates > index ? materializationPeakRendered : 0,
      poolLoads: options.liveCloseModelPoolLoads && index === 2 ? 1 : 0,
      transitionWindow: {
        total: options.transitionWindowMaterializationEvents && index === 1 ? 1 : 0,
        firstObservation: options.transitionWindowMaterializationEvents && index === 1 ? 1 : 0,
        toCloseGlb: options.transitionWindowMaterializationEvents && index === 1 ? 1 : 0,
        toImpostor: 0,
        toCulled: 0,
        fromCloseGlb: 0,
        byTransition: options.transitionWindowMaterializationEvents && index === 1 ? { 'impostor->close-glb': 1 } : {},
        byReason: options.transitionWindowMaterializationEvents && index === 1 ? { 'close-glb:active': 1 } : {},
      },
    },
    materializationTierEvents: options.missingMaterializationEvents || index !== 1
      ? []
      : [{
          combatantId: 'fixture-npc',
          fromRender: 'impostor',
          toRender: 'close-glb',
          reason: 'close-glb:active',
          distanceMeters: 20,
        }],
    pagePerformanceNowMs: index * 1500,
  }))), 'utf-8');
  for (const file of REQUIRED_PLACEHOLDER_FILES) {
    writeFileSync(join(dir, file), file.endsWith('.png') ? '' : '[]', 'utf-8');
  }
  return dir;
}

describe('evaluateDroppedFrameEarsArtifact', () => {
  it('classifies a trusted same-experience artifact as proven', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({ scenario: 'a_shau_valley' }));
    expect(artifact.classification).toBe('proven');
    expect(artifact.contactQualified).toBe(true);
    expect(artifact.materializationQualified).toBe(true);
    expect(artifact.completionLaneQualified).toBe(true);
    expect(artifact.failCount).toBe(0);
    expect(artifact.warnCount).toBe(1);
  });

  it('keeps failed trust or harness equivalence artifacts diagnostic', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      measurementTrust: 'fail',
      validationOverall: 'fail',
      status: 'failed',
      harnessWarnings: true,
    }));
    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => check.id === 'measurement_trust_pass' && check.status === 'fail')).toBe(true);
    expect(artifact.checks.some((check) => check.id === 'harness_route_snap_trust' && check.status === 'fail')).toBe(true);
  });

  it('keeps busy quiet-machine snapshots diagnostic even when attested', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      quietSnapshotStatus: 'fail',
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => (
      check.id === 'quiet_machine_snapshot_idle'
      && check.status === 'fail'
      && check.value === 'fail'
    ))).toBe(true);
  });

  it('allows warning-band quiet-machine GPU activity as non-failing evidence', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      quietSnapshotStatus: 'warn',
    }));

    expect(artifact.classification).toBe('proven');
    expect(artifact.warnCount).toBeGreaterThan(1);
    expect(artifact.checks.some((check) => (
      check.id === 'quiet_machine_snapshot_idle'
      && check.status === 'warn'
      && check.value === 'warn'
      && check.message.includes('background')
    ))).toBe(true);
  });

  it('keeps low-contact artifacts diagnostic for materialization claims', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      thinMaterializationPressure: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => (
      check.id === 'npc_materialization_pressure'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('keeps burst-only materialization artifacts diagnostic even when peak pressure passes', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      burstyMaterializationContact: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.materializationQualified).toBe(false);
    expect(artifact.checks.some((check) => (
      check.id === 'npc_materialization_pressure'
      && check.status === 'pass'
    ))).toBe(true);
    expect(artifact.checks.some((check) => (
      check.id === 'npc_materialization_sustained_contact'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('keeps live close-model pool-load artifacts diagnostic even when materialization pressure passes', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      liveCloseModelPoolLoads: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.materializationQualified).toBe(false);
    expect(artifact.checks.some((check) => (
      check.id === 'npc_close_model_runtime_pool_loads_clear'
      && check.status === 'fail'
      && check.value === 1
    ))).toBe(true);
  });

  it('keeps active close-model artifacts diagnostic when tier-transition telemetry is missing', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      missingMaterializationEvents: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.materializationQualified).toBe(false);
    expect(artifact.checks.some((check) => (
      check.id === 'npc_materialization_transition_telemetry'
      && check.status === 'fail'
      && check.value === 0
    ))).toBe(true);
  });

  it('accepts drained transition-window telemetry when the event ring is empty', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      missingMaterializationEvents: true,
      transitionWindowMaterializationEvents: true,
    }));

    expect(artifact.materializationQualified).toBe(true);
    expect(artifact.checks.some((check) => (
      check.id === 'npc_materialization_transition_telemetry'
      && check.status === 'pass'
      && Number(check.value) > 0
    ))).toBe(true);
  });

  it('marks low-combat artifacts as contact-unqualified diagnostics', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      lowCombat: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.contactQualified).toBe(false);
    expect(artifact.completionLaneQualified).toBe(false);
    expect(artifact.checks.some((check) => (
      check.id === 'active_combat_shots'
      && check.status === 'fail'
      && check.value === 0
    ))).toBe(true);
    expect(artifact.checks.some((check) => (
      check.id === 'active_combat_sustained_contact'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('keeps burst-only combat artifacts diagnostic even when aggregate shots pass', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      burstyCombatContact: true,
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.contactQualified).toBe(false);
    expect(artifact.checks.some((check) => (
      check.id === 'active_combat_shots'
      && check.status === 'pass'
    ))).toBe(true);
    expect(artifact.checks.some((check) => (
      check.id === 'active_combat_sustained_contact'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('rejects content-reduction runtime variants even when frame metrics pass', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      runtimeOverrides: { wildlifeDisabled: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_wildlife_disabled' && check.status === 'fail')).toBe(true);
  });

  it('rejects frontline-compressed artifacts even when movement warnings are absent', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      runtimeOverrides: { frontlineCompressionRequested: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_frontline_compression_requested' && check.status === 'fail')).toBe(true);
  });

  it('rejects thin presentation-context diagnostic captures', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      runtimeOverrides: { presentationContextCapture: false },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_presentation_context_capture_disabled' && check.status === 'fail')).toBe(true);
  });

  it('rejects forced weather-state diagnostic captures', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: { weatherStateOverride: 'clear' },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_weather_state_override' && check.status === 'fail')).toBe(true);
  });

  it('rejects explicit adaptive terrain-skirt diagnostic captures as flag-driven coverage', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: { terrainSparseSkirtsRequested: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_terrain_sparse_skirts_requested' && check.status === 'fail')).toBe(true);
  });

  it('rejects legacy full terrain-skirt diagnostic captures as non-production terrain coverage', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: { terrainFullSkirtsRequested: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_terrain_full_skirts_requested' && check.status === 'fail')).toBe(true);
  });

  it('rejects heuristic height-aware terrain frustum diagnostic captures', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: { terrainHeightAwareFrustumRequested: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_terrain_height_aware_frustum_requested' && check.status === 'fail')).toBe(true);
  });

  it('accepts production baked-grid terrain height bounds as same-experience evidence', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: {
        terrainHeightAwareFrustumEnabled: true,
        terrainHeightBoundsSource: 'baked-grid',
        terrainHeightBoundsTests: 120,
        terrainHeightBoundsFallbacks: 0,
      },
    }));
    expect(artifact.checks.some((check) => check.id === 'forbidden_terrain_height_bounds_heuristic_enabled' && check.status === 'fail')).toBe(false);
    expect(artifact.checks.some((check) => check.id === 'terrain_height_bounds_baked_grid_trust' && check.status === 'pass')).toBe(true);
    expect(artifact.classification).toBe('proven');
  });

  it('keeps incomplete baked-grid terrain height bounds diagnostic', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: {
        terrainHeightAwareFrustumEnabled: true,
        terrainHeightBoundsSource: 'baked-grid',
        terrainHeightBoundsTests: 120,
        terrainHeightBoundsFallbacks: 6,
      },
    }));
    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => check.id === 'terrain_height_bounds_baked_grid_trust' && check.status === 'fail')).toBe(true);
  });

  it('rejects legacy heuristic height bounds even when the request flag is absent', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: {
        terrainHeightAwareFrustumEnabled: true,
        terrainHeightBoundsSource: 'heuristic-samples',
      },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_terrain_height_bounds_heuristic_enabled' && check.status === 'fail')).toBe(true);
  });

  it('keeps playable-only terrain LOD range captures diagnostic', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      runtimeOverrides: {
        terrainPlayableWorldSize: 3200,
        terrainVisualWorldSize: 3600,
        terrainVisualMargin: 200,
        terrainMaxLODLevels: 6,
        terrainLodRange0: 200,
        terrainLodRangeLast: 6400,
        terrainLod0VertexSpacing: 3600 / 2 ** 6 / 32,
      },
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => check.id === 'terrain_lod_ranges_visual_extent_alignment' && check.status === 'fail')).toBe(true);
  });

  it('keeps unsynced buffer-visible CDLOD stage changes diagnostic', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      presentationTerrainOverrides: {
        terrainStageHashChangedCount: 4,
        terrainStageIdentityHashChangedCount: 1,
        terrainStageMorphHashChangedCount: 3,
        terrainStageEdgeMaskHashChangedCount: 1,
        terrainStageTileCountChangedCount: 1,
        terrainStageBufferVisibleChangedCount: 2,
        terrainStageBufferVisibleChangedWithoutSubmissionCount: 1,
      },
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => (
      check.id === 'terrain_stage_buffer_submission_integrity'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('keeps saturated CDLOD selection captures diagnostic', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'a_shau_valley',
      presentationTerrainOverrides: {
        terrainSelectionSaturatedCount: 1,
      },
    }));

    expect(artifact.classification).toBe('diagnostic');
    expect(artifact.checks.some((check) => (
      check.id === 'terrain_cdlod_selection_capacity'
      && check.status === 'fail'
    ))).toBe(true);
  });

  it('allows morph-only CDLOD stage churn when buffer-visible terrain data is stable', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      presentationTerrainOverrides: {
        terrainStageHashChangedCount: 4,
        terrainStageMorphHashChangedCount: 4,
        terrainStageBufferVisibleChangedCount: 0,
        terrainStageBufferVisibleChangedWithoutSubmissionCount: 0,
      },
    }));

    expect(artifact.classification).toBe('proven');
    expect(artifact.checks.some((check) => (
      check.id === 'terrain_stage_buffer_submission_integrity'
      && check.status === 'pass'
    ))).toBe(true);
  });

  it('does not require dropped-frame terrain context when no presentation gaps were captured', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      presentationGapCount: 0,
      presentationTerrainOverrides: {
        gapCount: undefined,
        terrainStageBufferVisibleChangedWithoutSubmissionCount: undefined,
        terrainSelectionSaturatedCount: undefined,
      },
    }));

    expect(artifact.classification).toBe('proven');
    expect(artifact.checks.some((check) => (
      check.id === 'terrain_stage_buffer_submission_integrity'
      && check.status === 'pass'
    ))).toBe(true);
    expect(artifact.checks.some((check) => (
      check.id === 'terrain_cdlod_selection_capacity'
      && check.status === 'pass'
    ))).toBe(true);
  });
});

describe('evaluateDroppedFrameEars', () => {
  it('requires a passing Open Frontier and A Shau pair', () => {
    const aShau = tempArtifact({ scenario: 'a_shau_valley' });
    const single = evaluateDroppedFrameEars([aShau]);
    expect(single.status).toBe('fail');
    expect(single.missingScenarios).toEqual(['open_frontier']);

    const pair = evaluateDroppedFrameEars([
      aShau,
      tempArtifact({ scenario: 'open_frontier' }),
    ]);
    expect(pair.status).toBe('pass');
    expect(pair.missingScenarios).toEqual([]);
  });
});
