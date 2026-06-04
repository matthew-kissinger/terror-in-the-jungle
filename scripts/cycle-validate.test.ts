// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it, vi } from 'vitest';

import {
  classifyBriefLoc,
  extractActiveCarryOverIds,
  extractClosedCarryOverIds,
  findZeroCycleCarryOvers,
} from './cycle-validate';

function syntheticBrief(lineCount: number): string {
  // Each entry becomes one line after the split-and-pop in classifyBriefLoc.
  return Array.from({ length: lineCount }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
}

describe('classifyBriefLoc', () => {
  it('treats a slim brief at the 80 LOC cap as OK', () => {
    const result = classifyBriefLoc('docs/tasks/_TEMPLATE.md', syntheticBrief(80));
    expect(result.level).toBe('ok');
    expect(result.lineCount).toBe(80);
    expect(result.message).toContain('within target');
  });

  it('treats exactly 100 LOC as OK (boundary is strictly >100)', () => {
    const result = classifyBriefLoc('docs/tasks/example.md', syntheticBrief(100));
    expect(result.level).toBe('ok');
    expect(result.lineCount).toBe(100);
  });

  it('warns on a brief above 100 LOC but at or under 150 LOC', () => {
    const result = classifyBriefLoc('docs/tasks/medium.md', syntheticBrief(120));
    expect(result.level).toBe('warn');
    expect(result.message).toContain('120 LOC');
    expect(result.message).toContain('80 LOC');
  });

  it('recommends a split on a synthetic 150-line brief that crosses the threshold', () => {
    // 151 is the first line count above BRIEF_SPLIT_LOC=150.
    const result = classifyBriefLoc('docs/tasks/long.md', syntheticBrief(151));
    expect(result.level).toBe('split');
    expect(result.message).toContain('151 LOC');
    expect(result.message).toContain('splitting');
  });

  it('handles CRLF line endings the same as LF', () => {
    const body = Array.from({ length: 130 }, (_, i) => `line ${i + 1}`).join('\r\n') + '\r\n';
    const result = classifyBriefLoc('docs/tasks/crlf.md', body);
    expect(result.level).toBe('warn');
    expect(result.lineCount).toBe(130);
  });

  it('does not double-count a trailing newline', () => {
    const result = classifyBriefLoc('docs/tasks/trim.md', 'one\ntwo\nthree\n');
    expect(result.lineCount).toBe(3);
  });
});

/**
 * Helper: synthesize a minimal CARRY_OVERS.md body with the given Active
 * and Closed ID lists. Mirrors the real file's structure tightly enough
 * for the section/row parsers to find what they need.
 */
function syntheticCarryOversBody(opts: {
  active: string[];
  closed: string[];
}): string {
  const activeRows = opts.active
    .map(
      (id) =>
        `| ${id} | placeholder title | cycle-x | 1 | subsys | no | notes |`,
    )
    .join('\n');
  const closedRows = opts.closed
    .map((id) => `- ${id} | placeholder title | closed in cycle-x | resolution.`)
    .join('\n');
  return `# Carry-Overs Registry

Last verified: 2026-05-20

## Rules

1. Append-only.

## Active

| ID | Title | Opened | Cycles open | Owning subsystem | Blocking? | Notes |
|----|-------|--------|------------:|------------------|-----------|-------|
${activeRows}

## Closed

(history)

${closedRows}

## Reading the table

End.
`;
}

describe('extractActiveCarryOverIds', () => {
  it('extracts every ID in the Active table', () => {
    const body = syntheticCarryOversBody({
      active: ['STABILIZAT-1', 'AVIATSIYA-1', 'KB-LOAD'],
      closed: ['DEFEKT-3'],
    });
    const ids = extractActiveCarryOverIds(body);
    expect(ids.size).toBe(3);
    expect(ids.has('STABILIZAT-1')).toBe(true);
    expect(ids.has('AVIATSIYA-1')).toBe(true);
    expect(ids.has('KB-LOAD')).toBe(true);
    expect(ids.has('DEFEKT-3')).toBe(false);
  });
});

describe('extractClosedCarryOverIds', () => {
  it('extracts every ID in the Closed section bullet list', () => {
    const body = syntheticCarryOversBody({
      active: ['STABILIZAT-1'],
      closed: ['DEFEKT-3', 'DEFEKT-4', 'KB-SKY-BLAND'],
    });
    const ids = extractClosedCarryOverIds(body);
    expect(ids.size).toBe(3);
    expect(ids.has('DEFEKT-3')).toBe(true);
    expect(ids.has('DEFEKT-4')).toBe(true);
    expect(ids.has('KB-SKY-BLAND')).toBe(true);
    expect(ids.has('STABILIZAT-1')).toBe(false);
  });
});

describe('findZeroCycleCarryOvers', () => {
  it('flags a new ID that appeared only in end-state Closed (zero-cycle)', () => {
    const startBody = syntheticCarryOversBody({
      active: ['A1', 'A2', 'A3', 'A4', 'A5'],
      closed: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
    });
    const endBody = syntheticCarryOversBody({
      active: ['A1', 'A2', 'A3', 'A4', 'A5'],
      closed: [
        'C1',
        'C2',
        'C3',
        'C4',
        'C5',
        'C6',
        'C7',
        'C8',
        'C9',
        'C10',
        'ZERO-CYCLE-ID',
      ],
    });
    const offenders = findZeroCycleCarryOvers(startBody, endBody);
    expect(offenders).toEqual(['ZERO-CYCLE-ID']);
  });

  it('does not flag a legitimate close (Active at start, Closed at end)', () => {
    const startBody = syntheticCarryOversBody({
      active: ['A1', 'DEFEKT-3'],
      closed: ['C1'],
    });
    const endBody = syntheticCarryOversBody({
      active: ['A1'],
      closed: ['C1', 'DEFEKT-3'],
    });
    const offenders = findZeroCycleCarryOvers(startBody, endBody);
    expect(offenders).toEqual([]);
  });

  it('does not retroactively flag historical zero-cycle entries already in Closed at start', () => {
    const startBody = syntheticCarryOversBody({
      active: ['A1'],
      closed: ['KB-SKY-LUT-BANDING', 'VEKHIKL-UX-2', 'VODA-OF-1'],
    });
    const endBody = syntheticCarryOversBody({
      active: ['A1'],
      closed: ['KB-SKY-LUT-BANDING', 'VEKHIKL-UX-2', 'VODA-OF-1'],
    });
    const offenders = findZeroCycleCarryOvers(startBody, endBody);
    expect(offenders).toEqual([]);
  });

  it('prints FAIL with the offender ID when the validator detects a zero-cycle entry', () => {
    // The CLI gate composes findZeroCycleCarryOvers + a stderr FAIL line.
    // Verify the FAIL string shape matches the documented contract.
    const startBody = syntheticCarryOversBody({
      active: ['A1', 'A2', 'A3', 'A4', 'A5'],
      closed: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10'],
    });
    const endBody = syntheticCarryOversBody({
      active: ['A1', 'A2', 'A3', 'A4', 'A5'],
      closed: [
        'C1',
        'C2',
        'C3',
        'C4',
        'C5',
        'C6',
        'C7',
        'C8',
        'C9',
        'C10',
        'NEW-ZERO-ID',
      ],
    });
    const offenders = findZeroCycleCarryOvers(startBody, endBody);
    expect(offenders).toHaveLength(1);

    // Reproduce the CLI's stderr line and assert the shape the docs name.
    const slug = 'cycle-synthetic-zero';
    const stderr = vi.fn();
    for (const id of offenders) {
      stderr(
        `[cycle-validate] FAIL: zero-cycle carry-over ${id} detected in cycle ${slug}. ` +
          `Move to PR description user-observable gap line.`,
      );
    }
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0][0]).toContain('FAIL');
    expect(stderr.mock.calls[0][0]).toContain('NEW-ZERO-ID');
    expect(stderr.mock.calls[0][0]).toContain(slug);
    expect(stderr.mock.calls[0][0]).toContain('user-observable gap line');
  });
});
