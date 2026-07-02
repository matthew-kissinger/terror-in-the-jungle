// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import {
  classifyAll,
  classifyCount,
  countExportSurface,
  type ExportSurfaceCounts,
} from './check-export-surface-ratchet';

const snapshot: ExportSurfaceCounts = {
  flaggedFiles: 121,
  unusedFiles: 0,
  unusedExports: 73,
  unusedExportedTypes: 156,
};

describe('countExportSurface — reduces knip issues to the four counts', () => {
  it('counts distinct flagged files, exports, and types', () => {
    const counts = countExportSurface([
      { file: 'a.ts', exports: [{}, {}], types: [{}] },
      { file: 'b.ts', exports: [{}], types: [] },
      // second issue on the same file must not double-count the file
      { file: 'a.ts', exports: [], types: [{}, {}] },
    ]);
    expect(counts.flaggedFiles).toBe(2);
    expect(counts.unusedExports).toBe(3);
    expect(counts.unusedExportedTypes).toBe(3);
    expect(counts.unusedFiles).toBe(0);
  });

  it('counts a wholly-unused file whether knip marks it true or as an array', () => {
    const counts = countExportSurface([
      { file: 'dead-a.ts', files: true },
      { file: 'dead-b.ts', files: ['dead-b.ts'] },
      { file: 'live.ts', files: [], exports: [{}] },
    ]);
    expect(counts.unusedFiles).toBe(2);
    expect(counts.flaggedFiles).toBe(3);
  });

  it('handles an empty issues array', () => {
    expect(countExportSurface([])).toEqual({
      flaggedFiles: 0,
      unusedFiles: 0,
      unusedExports: 0,
      unusedExportedTypes: 0,
    });
  });
});

describe('classifyCount — one-way ratchet verdict', () => {
  it('flags growth as "grew"', () => {
    expect(classifyCount('unusedExports', 74, 73).verdict).toBe('grew');
  });

  it('reports a shrink as "shrank"', () => {
    expect(classifyCount('unusedExports', 70, 73).verdict).toBe('shrank');
  });

  it('is "ok" when the count is unchanged', () => {
    expect(classifyCount('unusedExports', 73, 73).verdict).toBe('ok');
  });
});

describe('classifyAll — all four dimensions against the snapshot', () => {
  it('passes when the measured tree equals the snapshot', () => {
    const results = classifyAll(snapshot, snapshot);
    expect(results.every((r) => r.verdict === 'ok')).toBe(true);
  });

  it('fails only the dimension that grew, independent of the others', () => {
    const measured: ExportSurfaceCounts = { ...snapshot, unusedExportedTypes: 157 };
    const results = classifyAll(measured, snapshot);
    const grew = results.filter((r) => r.verdict === 'grew');
    expect(grew).toHaveLength(1);
    expect(grew[0].key).toBe('unusedExportedTypes');
  });

  it('surfaces a shrink on one axis while another holds steady', () => {
    const measured: ExportSurfaceCounts = { ...snapshot, unusedExports: 60 };
    const results = classifyAll(measured, snapshot);
    expect(results.find((r) => r.key === 'unusedExports')?.verdict).toBe('shrank');
    expect(results.find((r) => r.key === 'flaggedFiles')?.verdict).toBe('ok');
  });
});
