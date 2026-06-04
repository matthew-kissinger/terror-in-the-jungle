// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import { summarizeFullTreeDrift, type Finding } from './doc-drift';

/**
 * Behavior proof for the advisory full-tree roll-up (`check:doc-drift:full`,
 * DEFEKT-2 "broaden coverage"). The advisory mode must surface the WHOLE repo's
 * broken-reference backlog as a count — including refs the CI gate deliberately
 * hides via grandfathering and the low-severity archive prefixes — without ever
 * affecting the gate. These tests drive the pure roll-up with synthetic
 * findings and assert the observable summary, not how it is computed.
 */

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'error',
    grandfathered: false,
    file: 'docs/SOME.md',
    line: 1,
    kind: 'missing_markdown_link',
    target: 'missing.md',
    message: 'broken',
    evidence: 'evidence',
    ...overrides,
  };
}

describe('summarizeFullTreeDrift', () => {
  it('reports zero broken references for a clean tree', () => {
    const summary = summarizeFullTreeDrift([]);
    expect(summary.totalBrokenRefs).toBe(0);
    expect(summary.docsWithDrift).toBe(0);
    expect(summary.suppressedFromGate).toBe(0);
  });

  it('counts every broken reference the scan produced, regardless of suppression', () => {
    // One live error (gate-visible), one grandfathered live ref, and one
    // low-severity archive ref. The gate would surface only the first; the
    // advisory roll-up must surface all three.
    const summary = summarizeFullTreeDrift([
      finding({ severity: 'error', file: 'docs/DIRECTIVES.md' }),
      finding({ severity: 'warning', grandfathered: true, file: 'docs/COMBAT.md' }),
      finding({ severity: 'warning', file: 'docs/archive/old.md' }),
    ]);
    expect(summary.totalBrokenRefs).toBe(3);
  });

  it('separates the gate-hidden backlog so its size is visible', () => {
    // Two suppressed (one grandfathered, one low-severity) + one live error.
    const summary = summarizeFullTreeDrift([
      finding({ severity: 'error' }),
      finding({ severity: 'warning', grandfathered: true }),
      finding({ severity: 'warning' }),
    ]);
    expect(summary.suppressedFromGate).toBe(2);
  });

  it('rolls broken references up by kind', () => {
    const summary = summarizeFullTreeDrift([
      finding({ kind: 'missing_markdown_link' }),
      finding({ kind: 'missing_markdown_link' }),
      finding({ kind: 'missing_code_path' }),
      finding({ kind: 'missing_package_script' }),
    ]);
    expect(summary.brokenByKind.missing_markdown_link).toBe(2);
    expect(summary.brokenByKind.missing_code_path).toBe(1);
    expect(summary.brokenByKind.missing_package_script).toBe(1);
  });

  it('counts distinct docs, not raw findings, for the affected-doc tally', () => {
    // Three findings but only two distinct files.
    const summary = summarizeFullTreeDrift([
      finding({ file: 'docs/A.md' }),
      finding({ file: 'docs/A.md' }),
      finding({ file: 'docs/B.md' }),
    ]);
    expect(summary.docsWithDrift).toBe(2);
    expect(summary.totalBrokenRefs).toBe(3);
  });
});
