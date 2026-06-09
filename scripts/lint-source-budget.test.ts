// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import {
  classifyDimension,
  MAX_LOC,
  MAX_METHODS,
  type GrandfatherEntry,
} from './lint-source-budget';

/** Build a synthetic grandfather entry with the given snapshot floor. */
function entry(loc: number, methods: number): GrandfatherEntry {
  return { round: 'TEST', reason: 'synthetic fixture', loc, methods };
}

describe('classifyDimension — non-grandfathered files (the original hard rule)', () => {
  it('passes a file at or under the base LOC limit', () => {
    expect(classifyDimension('x.ts', 'loc', MAX_LOC, MAX_LOC, null)).toBeNull();
  });

  it('fails a file that exceeds the base LOC limit', () => {
    const f = classifyDimension('x.ts', 'loc', MAX_LOC + 1, MAX_LOC, null);
    expect(f?.level).toBe('fail');
    expect(f?.grandfathered).toBe(false);
    expect(f?.ratchetRegression).toBe(false);
  });

  it('fails a file that exceeds the base method limit', () => {
    const f = classifyDimension('x.ts', 'methods', MAX_METHODS + 5, MAX_METHODS, null);
    expect(f?.level).toBe('fail');
    expect(f?.value).toBe(MAX_METHODS + 5);
  });
});

describe('classifyDimension — grandfathered ratchet', () => {
  it('FAILs a grandfathered file that grew past its snapshot', () => {
    // Snapshot is 1000 LOC; the file is now 1001 — a backslide.
    const f = classifyDimension('god.ts', 'loc', 1001, MAX_LOC, entry(1000, 0));
    expect(f?.level).toBe('fail');
    expect(f?.grandfathered).toBe(true);
    expect(f?.ratchetRegression).toBe(true);
    expect(f?.limit).toBe(1000); // ceiling is the snapshot, not the base limit
  });

  it('passes (WARN, not FAIL) a grandfathered file exactly at its snapshot', () => {
    const f = classifyDimension('god.ts', 'loc', 1000, MAX_LOC, entry(1000, 0));
    expect(f?.level).toBe('warn');
    expect(f?.ratchetRegression).toBe(false);
  });

  it('passes (WARN) a grandfathered file that shrank below its snapshot but is still over base', () => {
    const f = classifyDimension('god.ts', 'loc', 850, MAX_LOC, entry(1000, 0));
    expect(f?.level).toBe('warn');
    expect(f?.ratchetRegression).toBe(false);
  });

  it('emits NO finding when a grandfathered file shrinks under the base limit', () => {
    // It earned its way back under budget — no longer a god module on this axis.
    const f = classifyDimension('god.ts', 'loc', MAX_LOC - 50, MAX_LOC, entry(1000, 0));
    expect(f).toBeNull();
  });

  it('applies the ratchet on the methods axis independently of the LOC axis', () => {
    // Snapshot methods = 60. Growth to 61 is a regression even though LOC is fine.
    const f = classifyDimension('god.ts', 'methods', 61, MAX_METHODS, entry(0, 60));
    expect(f?.level).toBe('fail');
    expect(f?.ratchetRegression).toBe(true);
    expect(f?.rule).toBe('methods');
  });

  it('treats a snapshot under the base limit as bound by the base limit, not the snapshot', () => {
    // A grandfathered file whose method snapshot is under the base limit (e.g.
    // it is grandfathered on LOC only) must still be allowed to use the full
    // base method budget — the ceiling is max(base, snapshot).
    const e = entry(1000, 10); // grandfathered for LOC; methods snapshot well under base
    // Method count rising to the base limit must NOT fail.
    expect(classifyDimension('god.ts', 'methods', MAX_METHODS, MAX_METHODS, e)).toBeNull();
    // Method count past the base limit (and past snapshot) is a regression.
    const over = classifyDimension('god.ts', 'methods', MAX_METHODS + 1, MAX_METHODS, e);
    expect(over?.level).toBe('fail');
    expect(over?.ratchetRegression).toBe(true);
    expect(over?.limit).toBe(MAX_METHODS); // ceiling = max(base, 10) = base
  });
});
