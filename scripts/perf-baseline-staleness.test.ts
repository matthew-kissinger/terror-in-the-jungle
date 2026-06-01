import { describe, expect, it } from 'vitest';

import {
  computeAgeDays,
  evaluateStaleness,
  DEFAULT_MAX_AGE_DAYS,
  MS_PER_DAY,
  type StalenessConfig,
  type StalenessInput,
} from './perf-baseline-staleness';

const NOW = new Date('2026-05-31T12:00:00.000Z');
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * MS_PER_DAY).toISOString();
}

function input(overrides: Partial<StalenessInput> = {}): StalenessInput {
  const config: StalenessConfig = {
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    strict: false,
    ...(overrides.config ?? {}),
  };
  return {
    provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(1) },
    shaIsAncestorOfHead: true,
    now: NOW,
    ...overrides,
    config,
  };
}

describe('computeAgeDays', () => {
  it('returns null when capturedAt is missing', () => {
    expect(computeAgeDays(undefined, NOW)).toBeNull();
  });

  it('returns null for an unparseable timestamp', () => {
    expect(computeAgeDays('not-a-date', NOW)).toBeNull();
  });

  it('floors elapsed time to whole days', () => {
    expect(computeAgeDays(isoDaysAgo(0), NOW)).toBe(0);
    expect(computeAgeDays(isoDaysAgo(1), NOW)).toBe(1);
    // 29.5 days ago -> floor -> 29
    expect(computeAgeDays(new Date(NOW.getTime() - 29.5 * MS_PER_DAY).toISOString(), NOW)).toBe(29);
  });

  it('clamps a future timestamp (clock skew) to 0', () => {
    expect(computeAgeDays(isoDaysAgo(-5), NOW)).toBe(0);
  });
});

describe('evaluateStaleness — fresh baseline', () => {
  it('is ok when SHA is an ancestor of HEAD and within the age budget', () => {
    const result = evaluateStaleness(input());
    expect(result.level).toBe('ok');
    expect(result.missingProvenance).toBe(false);
    expect(result.ageDays).toBe(1);
    expect(result.message).toContain('fresh');
  });

  it('stays ok at exactly the age budget (boundary is strictly greater-than)', () => {
    const result = evaluateStaleness(
      input({ provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(DEFAULT_MAX_AGE_DAYS) } })
    );
    expect(result.level).toBe('ok');
    expect(result.ageDays).toBe(DEFAULT_MAX_AGE_DAYS);
  });

  it('is ok under strict mode too when fresh', () => {
    const result = evaluateStaleness(input({ config: { maxAgeDays: DEFAULT_MAX_AGE_DAYS, strict: true } }));
    expect(result.level).toBe('ok');
  });
});

describe('evaluateStaleness — stale lineage (SHA not an ancestor of HEAD)', () => {
  it('warns by default', () => {
    const result = evaluateStaleness(input({ shaIsAncestorOfHead: false }));
    expect(result.level).toBe('warn');
    expect(result.message).toContain('not an ancestor of HEAD');
    expect(result.message).toContain('abcdef12');
  });

  it('fails under strict mode', () => {
    const result = evaluateStaleness(
      input({ shaIsAncestorOfHead: false, config: { maxAgeDays: DEFAULT_MAX_AGE_DAYS, strict: true } })
    );
    expect(result.level).toBe('fail');
    expect(result.message).toContain('not an ancestor of HEAD');
  });

  it('takes precedence over a fresh age (lineage is the stronger signal)', () => {
    // Recent capturedAt but dead branch -> still flagged on lineage.
    const result = evaluateStaleness(
      input({ provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(0) }, shaIsAncestorOfHead: false })
    );
    expect(result.level).toBe('warn');
    expect(result.message).toContain('not an ancestor of HEAD');
  });
});

describe('evaluateStaleness — stale by age', () => {
  it('warns by default when older than the budget', () => {
    const result = evaluateStaleness(
      input({ provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(45) } })
    );
    expect(result.level).toBe('warn');
    expect(result.ageDays).toBe(45);
    expect(result.message).toContain('45d old');
    expect(result.message).toContain(`${DEFAULT_MAX_AGE_DAYS}d`);
  });

  it('fails under strict mode when older than the budget', () => {
    const result = evaluateStaleness(
      input({
        provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(45) },
        config: { maxAgeDays: DEFAULT_MAX_AGE_DAYS, strict: true },
      })
    );
    expect(result.level).toBe('fail');
    expect(result.message).toContain('45d old');
  });

  it('flags age even when ancestry is indeterminate (no SHA recorded)', () => {
    const result = evaluateStaleness(
      input({ provenance: { capturedAt: isoDaysAgo(60) }, shaIsAncestorOfHead: null })
    );
    expect(result.level).toBe('warn');
    expect(result.ageDays).toBe(60);
  });

  it('does not flag age when ancestry is indeterminate but SHA is fresh-lineage-unknown and age is fine', () => {
    // SHA present but git could not resolve ancestry (null) — fall through to
    // age, which is within budget -> ok. Guards against treating "unknown" as stale.
    const result = evaluateStaleness(
      input({ provenance: { capturedAtSha: SHA, capturedAt: isoDaysAgo(3) }, shaIsAncestorOfHead: null })
    );
    expect(result.level).toBe('ok');
  });
});

describe('evaluateStaleness — missing provenance (legacy baselines)', () => {
  it('soft-warns when both fields are absent, default mode', () => {
    const result = evaluateStaleness(
      input({ provenance: {}, shaIsAncestorOfHead: null })
    );
    expect(result.level).toBe('warn');
    expect(result.missingProvenance).toBe(true);
    expect(result.ageDays).toBeNull();
    expect(result.message).toContain('pre-dates staleness tracking');
  });

  it('NEVER hard-fails on missing provenance, even under strict mode', () => {
    const result = evaluateStaleness(
      input({ provenance: {}, shaIsAncestorOfHead: null, config: { maxAgeDays: DEFAULT_MAX_AGE_DAYS, strict: true } })
    );
    expect(result.level).toBe('warn');
    expect(result.missingProvenance).toBe(true);
  });
});
