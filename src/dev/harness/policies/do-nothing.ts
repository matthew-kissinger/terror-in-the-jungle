/**
 * do-nothing — null policy. Useful for baseline-idle perf captures and
 * acceptance tests against the runner.
 */

import type { ActionPolicy, ActionPolicyConfig } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DoNothingConfig = Extract<ActionPolicyConfig, { kind: 'do-nothing' }>;

export function createDoNothingPolicy(): ActionPolicy {
  return {
    id: 'do-nothing',
    tick() {
      return null;
    },
  };
}
