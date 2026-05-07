import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildReport,
  computeNpcSpeedSegments,
} from '../projekt-143-npc-speed-diagnostic';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tij-npc-speed-diagnostic-'));
  tempRoots.push(root);
  return root;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('projekt-143 NPC speed diagnostic', () => {
  it('computes NPC segment speed from movement artifact tracks', () => {
    const segments = computeNpcSpeedSegments({
      tracks: [
        {
          id: 'combatant_1',
          subject: 'npc',
          lodLevel: 'high',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 3, z: 4, tMs: 2000, intent: 'route_follow' },
          ],
        },
      ],
    });

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      id: 'combatant_1',
      lodLevel: 'high',
      segmentIndex: 1,
      firstTrackedSegment: true,
      distanceMeters: 5,
      speedMps: 5,
      intent: 'route_follow',
    });
  });

  it('passes when non-initial NPC segments stay inside the review envelope', () => {
    const root = makeTempRoot();
    const path = join(root, 'movement-artifacts.json');
    writeJson(path, {
      tracks: [
        {
          id: 'combatant_2',
          subject: 'npc',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 6, z: 0, tMs: 2000, intent: 'route_follow' },
            { x: 10, z: 0, tMs: 3000, intent: 'route_follow' },
          ],
        },
      ],
    });

    const report = buildReport(path);

    expect(report.status).toBe('pass');
    expect(report.summary.nonInitialReviewSpikeCount).toBe(0);
    expect(report.findings).toEqual([]);
  });

  it('warns when only review-threshold non-initial spikes are present', () => {
    const root = makeTempRoot();
    const path = join(root, 'movement-artifacts.json');
    writeJson(path, {
      tracks: [
        {
          id: 'combatant_3',
          subject: 'npc',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 1, z: 0, tMs: 2000, intent: 'route_follow' },
            { x: 15, z: 0, tMs: 3000, intent: 'route_follow' },
          ],
        },
      ],
    });

    const report = buildReport(path);

    expect(report.status).toBe('warn');
    expect(report.summary.nonInitialReviewSpikeCount).toBe(1);
    expect(report.summary.nonInitialHardSpikeCount).toBe(0);
    expect(report.findings.some((finding) => finding.includes('review speed envelope'))).toBe(true);
  });

  it('fails hard-speed non-initial spikes but ignores first tracked relocation spikes', () => {
    const root = makeTempRoot();
    const path = join(root, 'movement-artifacts.json');
    writeJson(path, {
      tracks: [
        {
          id: 'combatant_4',
          subject: 'npc',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 100, z: 0, tMs: 2000, intent: 'route_follow' },
            { x: 125, z: 0, tMs: 3000, intent: 'route_follow' },
          ],
        },
      ],
    });

    const report = buildReport(path);

    expect(report.status).toBe('fail');
    expect(report.summary.initialHardSpikeCount).toBe(1);
    expect(report.summary.nonInitialHardSpikeCount).toBe(1);
    expect(report.findings.some((finding) => finding.includes('hard speed envelope'))).toBe(true);
  });

  it('passes first-segment-only relocation spikes while recording that they were ignored', () => {
    const root = makeTempRoot();
    const path = join(root, 'movement-artifacts.json');
    writeJson(path, {
      tracks: [
        {
          id: 'combatant_5',
          subject: 'npc',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 100, z: 0, tMs: 2000, intent: 'route_follow' },
            { x: 104, z: 0, tMs: 3000, intent: 'route_follow' },
          ],
        },
      ],
    });

    const report = buildReport(path);

    expect(report.status).toBe('pass');
    expect(report.summary.initialHardSpikeCount).toBe(1);
    expect(report.summary.nonInitialHardSpikeCount).toBe(0);
    expect(report.findings.some((finding) => finding.includes('first tracked NPC segments'))).toBe(true);
  });

  it('ignores short-dt non-initial segments as sampling jitter', () => {
    const root = makeTempRoot();
    const path = join(root, 'movement-artifacts.json');
    writeJson(path, {
      tracks: [
        {
          id: 'combatant_6',
          subject: 'npc',
          points: [
            { x: 0, z: 0, tMs: 1000, intent: 'route_follow' },
            { x: 1, z: 0, tMs: 2000, intent: 'route_follow' },
            { x: 10, z: 0, tMs: 2100, intent: 'route_follow' },
          ],
        },
      ],
    });

    const report = buildReport(path);

    expect(report.status).toBe('pass');
    expect(report.summary.ignoredShortDtSegmentCount).toBe(1);
    expect(report.summary.nonInitialHardSpikeCount).toBe(0);
  });
});
