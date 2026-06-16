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
  harnessWarnings?: boolean;
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
  const checks = [
    { id: 'raf_stutter_25ms_percent', status: 'pass', value: 0.1, message: 'ok' },
    { id: 'raf_hitch_33ms_percent', status: 'pass', value: 0.1, message: 'ok' },
    { id: 'raf_estimated_dropped_60hz_frames_per_second', status: 'pass', value: 0.01, message: 'ok' },
    { id: 'raf_dropped_frame_time_60hz_ms_per_second', status: 'pass', value: 0.2, message: 'ok' },
    { id: 'harness_min_shots_fired', status: 'pass', value: 80, message: 'ok' },
    { id: 'harness_min_hits_recorded', status: 'pass', value: 9, message: 'ok' },
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
    captureEnvironment: { quietMachineAttested: true },
    url: 'http://127.0.0.1:9100/?perf=1&renderer=webgpu-strict',
    validation,
    measurementTrust: {
      status: measurementTrust,
      rendererBackend: { resolvedBackend: 'webgpu', strictWebGPU: true },
    },
    rendererBackend: { resolvedBackend: 'webgpu', strictWebGPU: true },
    perfRuntime: {
      victoryConditionsDisabled: false,
      npcCloseModelsDisabled: false,
      terrainShadowsDisabled: false,
      terrainShadowPassMode: 'bounded-default',
      terrainFullShadowPassEnabled: false,
      boundedTerrainShadowPassRequested: false,
      terrainForceInstanceUploadEnabled: false,
      terrainHeightAwareFrustumRequested: false,
      terrainHeightAwareFrustumDisabled: false,
      terrainFullSkirtsRequested: false,
      terrainSkirtsDisabled: false,
      terrainFarCanopyTintDisabled: false,
      terrainLowSunOcclusionDisabled: false,
      wildlifeDisabled: false,
      ...(options.runtimeOverrides ?? {}),
    },
  };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary), 'utf-8');
  writeFileSync(join(dir, 'validation.json'), JSON.stringify(validation), 'utf-8');
  writeFileSync(join(dir, 'measurement-trust.json'), JSON.stringify(summary.measurementTrust), 'utf-8');
  for (const file of REQUIRED_PLACEHOLDER_FILES) {
    writeFileSync(join(dir, file), file.endsWith('.png') ? '' : '[]', 'utf-8');
  }
  return dir;
}

describe('evaluateDroppedFrameEarsArtifact', () => {
  it('classifies a trusted same-experience artifact as proven', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({ scenario: 'a_shau_valley' }));
    expect(artifact.classification).toBe('proven');
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

  it('rejects content-reduction runtime variants even when frame metrics pass', () => {
    const artifact = evaluateDroppedFrameEarsArtifact(tempArtifact({
      scenario: 'open_frontier',
      runtimeOverrides: { wildlifeDisabled: true },
    }));
    expect(artifact.classification).toBe('rejected');
    expect(artifact.checks.some((check) => check.id === 'forbidden_wildlife_disabled' && check.status === 'fail')).toBe(true);
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
