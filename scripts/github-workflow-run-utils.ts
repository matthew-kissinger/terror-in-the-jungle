// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export type WorkflowRunSummary = {
  databaseId: number;
  status: string;
  conclusion: string | null;
  headSha: string;
  event: string;
  createdAt: string;
  url: string;
};

export type ExistingWorkflowRunDecision =
  | {
      action: 'watch';
      run: WorkflowRunSummary;
      reason: string;
    }
  | {
      action: 'succeed';
      run: WorkflowRunSummary;
      reason: string;
    }
  | {
      action: 'fail';
      run: WorkflowRunSummary;
      reason: string;
    };

export function branchNameFromRef(ref: string): string | null {
  if (ref.startsWith('refs/tags/')) {
    return null;
  }

  if (/^[0-9a-f]{7,40}$/i.test(ref)) {
    return null;
  }

  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }

  return ref;
}

export function workflowMayReuseExistingRun(workflow: string, watch: boolean): boolean {
  if (!watch) {
    return false;
  }

  const normalized = workflow.replaceAll('\\', '/');
  return normalized.split('/').at(-1) === 'ci.yml';
}

export function selectExistingWorkflowRun(
  runs: readonly WorkflowRunSummary[],
  headSha: string,
): ExistingWorkflowRunDecision | null {
  const sameHead = runs
    .filter((run) => run.headSha === headSha)
    .sort((left, right) => compareRunRecency(right, left));

  const active = sameHead.find((run) => run.status !== 'completed');
  if (active) {
    return {
      action: 'watch',
      run: active,
      reason: `${active.event} run is still ${active.status}`,
    };
  }

  const latest = sameHead.at(0);
  if (!latest) {
    return null;
  }

  if (latest.conclusion === 'success') {
    return {
      action: 'succeed',
      run: latest,
      reason: `${latest.event} run already succeeded`,
    };
  }

  return {
    action: 'fail',
    run: latest,
    reason: `${latest.event} run already completed with ${latest.conclusion ?? 'no conclusion'}`,
  };
}

function compareRunRecency(left: WorkflowRunSummary, right: WorkflowRunSummary): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
  const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
  if (safeLeftTime !== safeRightTime) {
    return safeLeftTime - safeRightTime;
  }
  return left.databaseId - right.databaseId;
}
