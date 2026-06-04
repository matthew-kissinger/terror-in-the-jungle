// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Perf-baseline staleness guard (pure decision core).
 *
 * `scripts/perf-compare.ts` compares a fresh capture against thresholds in
 * `perf-baselines.json`. Those thresholds and the recorded `lastMeasured`
 * numbers are only meaningful if the baseline was captured against a commit
 * that is still in the current history. A baseline captured weeks ago, on a
 * commit that has since been rebased away, can silently pass a regression
 * compare against code it never actually measured.
 *
 * This module holds the *pure* staleness decision so it can be unit-tested
 * without spawning git or touching the filesystem. The impure parts
 * (`git rev-parse HEAD`, `git merge-base --is-ancestor`, reading the clock)
 * live in `perf-compare.ts`, which feeds their results in here.
 *
 * Backward compatibility: baselines written before provenance tracking lack
 * `capturedAtSha` / `capturedAt`. Those produce a soft warning, never a hard
 * failure, so existing baselines keep working.
 */

/**
 * Provenance recorded when a baseline is written. Both fields are optional so
 * that baselines predating staleness tracking parse cleanly.
 */
export interface BaselineProvenance {
  /** Git commit SHA that was HEAD when the baseline was captured. */
  capturedAtSha?: string;
  /** ISO-8601 timestamp of when the baseline was captured. */
  capturedAt?: string;
}

export interface StalenessConfig {
  /**
   * Maximum age (in days) before a baseline is considered stale on the basis
   * of its `capturedAt` timestamp. Defaults to 30.
   */
  maxAgeDays: number;
  /**
   * When true (the strict path, e.g. `perf:compare:strict`), a definitively
   * stale baseline yields a `fail` verdict. When false (default), it yields a
   * `warn` verdict and does not block.
   */
  strict: boolean;
}

export const DEFAULT_MAX_AGE_DAYS = 30;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Inputs to the pure decision. The caller is responsible for resolving the
 * git ancestry relationship and supplying "now"; this keeps the function
 * deterministic and side-effect free.
 */
export interface StalenessInput {
  provenance: BaselineProvenance;
  /**
   * Result of `git merge-base --is-ancestor <capturedAtSha> HEAD`:
   *   - `true`  : the captured SHA is an ancestor of (or equal to) HEAD -> fresh
   *   - `false` : the captured SHA is NOT an ancestor of HEAD -> stale lineage
   *   - `null`  : ancestry could not be determined (no SHA recorded, git
   *               unavailable, or the SHA is unknown to this clone)
   */
  shaIsAncestorOfHead: boolean | null;
  /** Current time, injected for determinism in tests. */
  now: Date;
  config: StalenessConfig;
}

export type StalenessLevel = 'ok' | 'warn' | 'fail';

export interface StalenessResult {
  level: StalenessLevel;
  /** Human-readable, single-line explanation suitable for console output. */
  message: string;
  /** Whole-day age derived from `capturedAt`, or null when unavailable. */
  ageDays: number | null;
  /** True when neither provenance field was present. */
  missingProvenance: boolean;
}

/**
 * Parse an ISO timestamp into whole elapsed days relative to `now`.
 * Returns null when the value is absent or unparseable. A negative raw age
 * (clock skew / future timestamp) is clamped to 0 so it never reads as stale.
 */
export function computeAgeDays(capturedAt: string | undefined, now: Date): number | null {
  if (!capturedAt) return null;
  const capturedMs = Date.parse(capturedAt);
  if (Number.isNaN(capturedMs)) return null;
  const rawDays = (now.getTime() - capturedMs) / MS_PER_DAY;
  if (rawDays <= 0) return 0;
  return Math.floor(rawDays);
}

/**
 * Pure staleness verdict.
 *
 * Decision order:
 *   1. No provenance at all -> soft `warn` ("pre-dates staleness tracking"),
 *      never a hard fail, regardless of strict mode.
 *   2. SHA recorded but NOT an ancestor of HEAD -> stale lineage. `fail` under
 *      strict, otherwise `warn`.
 *   3. `capturedAt` older than the age budget -> stale by age. `fail` under
 *      strict, otherwise `warn`.
 *   4. Otherwise -> `ok`.
 *
 * Lineage (2) is checked before age (3): a baseline on a dead branch is the
 * stronger signal, and its message is the more actionable one.
 */
export function evaluateStaleness(input: StalenessInput): StalenessResult {
  const { provenance, shaIsAncestorOfHead, now, config } = input;
  const { capturedAtSha, capturedAt } = provenance;
  const ageDays = computeAgeDays(capturedAt, now);
  const missingProvenance = !capturedAtSha && !capturedAt;

  if (missingProvenance) {
    return {
      level: 'warn',
      message:
        'baseline pre-dates staleness tracking (no capturedAtSha/capturedAt); '
        + 're-run perf:update-baseline to stamp provenance',
      ageDays: null,
      missingProvenance: true,
    };
  }

  const staleVerdict: StalenessLevel = config.strict ? 'fail' : 'warn';

  // (2) Lineage check — only meaningful when we have a SHA AND a definitive
  // ancestry answer. `null` means "couldn't determine"; fall through to age.
  if (capturedAtSha && shaIsAncestorOfHead === false) {
    return {
      level: staleVerdict,
      message:
        `baseline commit ${shortSha(capturedAtSha)} is not an ancestor of HEAD `
        + '(captured on a branch no longer in history); re-run perf:update-baseline',
      ageDays,
      missingProvenance: false,
    };
  }

  // (3) Age check.
  if (ageDays !== null && ageDays > config.maxAgeDays) {
    return {
      level: staleVerdict,
      message:
        `baseline is ${ageDays}d old (budget ${config.maxAgeDays}d); `
        + 're-run perf:update-baseline to refresh',
      ageDays,
      missingProvenance: false,
    };
  }

  return {
    level: 'ok',
    message:
      capturedAtSha
        ? `baseline fresh (commit ${shortSha(capturedAtSha)}`
          + (ageDays !== null ? `, ${ageDays}d old)` : ')')
        : `baseline fresh${ageDays !== null ? ` (${ageDays}d old)` : ''}`,
    ageDays,
    missingProvenance: false,
  };
}

function shortSha(sha: string): string {
  return sha.length > 8 ? sha.slice(0, 8) : sha;
}
