// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import {
  branchNameFromRef,
  selectExistingWorkflowRun,
  workflowMayReuseExistingRun,
  type WorkflowRunSummary,
} from './github-workflow-run-utils';

const HEAD_SHA = '441c2ff01d8b9aebdb943eaa1d8cb8e0211d12b1';

function run(overrides: Partial<WorkflowRunSummary>): WorkflowRunSummary {
  return {
    databaseId: 1,
    status: 'completed',
    conclusion: 'success',
    headSha: HEAD_SHA,
    event: 'push',
    createdAt: '2026-06-13T23:52:17Z',
    url: 'https://github.com/matthew-kissinger/terror-in-the-jungle/actions/runs/1',
    ...overrides,
  };
}

describe('github workflow run utility helpers', () => {
  it('only enables same-head reuse for watched CI workflow runs', () => {
    expect(workflowMayReuseExistingRun('ci.yml', true)).toBe(true);
    expect(workflowMayReuseExistingRun('.github/workflows/ci.yml', true)).toBe(true);
    expect(workflowMayReuseExistingRun('deploy.yml', true)).toBe(false);
    expect(workflowMayReuseExistingRun('ci.yml', false)).toBe(false);
  });

  it('normalizes branch refs but leaves tags and commit SHAs out of branch-limited reuse', () => {
    expect(branchNameFromRef('master')).toBe('master');
    expect(branchNameFromRef('refs/heads/master')).toBe('master');
    expect(branchNameFromRef('task/ci-housekeeping')).toBe('task/ci-housekeeping');
    expect(branchNameFromRef('refs/tags/v1.0.0')).toBeNull();
    expect(branchNameFromRef(HEAD_SHA)).toBeNull();
  });

  it('watches an active exact-head run instead of dispatching a duplicate manual run', () => {
    const decision = selectExistingWorkflowRun(
      [
        run({ databaseId: 11, status: 'completed', conclusion: 'success', createdAt: '2026-06-13T23:52:17Z' }),
        run({ databaseId: 12, status: 'in_progress', conclusion: null, createdAt: '2026-06-13T23:52:31Z' }),
      ],
      HEAD_SHA,
    );

    expect(decision?.action).toBe('watch');
    expect(decision?.run.databaseId).toBe(12);
  });

  it('accepts the latest successful exact-head run without dispatching a duplicate', () => {
    const decision = selectExistingWorkflowRun(
      [
        run({ databaseId: 22, event: 'workflow_dispatch', createdAt: '2026-06-13T23:56:59Z' }),
        run({ databaseId: 21, status: 'completed', conclusion: 'cancelled', createdAt: '2026-06-13T23:52:36Z' }),
      ],
      HEAD_SHA,
    );

    expect(decision?.action).toBe('succeed');
    expect(decision?.run.databaseId).toBe(22);
  });

  it('fails on the latest terminal non-success exact-head run rather than masking it', () => {
    const decision = selectExistingWorkflowRun(
      [
        run({ databaseId: 31, status: 'completed', conclusion: 'success', createdAt: '2026-06-13T23:52:17Z' }),
        run({ databaseId: 32, status: 'completed', conclusion: 'cancelled', createdAt: '2026-06-13T23:52:36Z' }),
      ],
      HEAD_SHA,
    );

    expect(decision?.action).toBe('fail');
    expect(decision?.run.databaseId).toBe(32);
  });

  it('ignores workflow runs from other commits', () => {
    const decision = selectExistingWorkflowRun(
      [run({ databaseId: 41, headSha: '965f4fe5760896e57a40ffa46f571695403412e4' })],
      HEAD_SHA,
    );

    expect(decision).toBeNull();
  });
});
