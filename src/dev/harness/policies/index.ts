/**
 * Policy registry.
 *
 * id → constructor. Matches the "typed registry" pattern (XState setup) the
 * task brief points at. The runner calls `createPolicy(config)`; any new
 * policy lands here and becomes selectable from `ScenarioConfig.player.policy`.
 */

import type { ActionPolicy, ActionPolicyConfig } from '../types';
import { createEngageNearestHostilePolicy } from './engage-nearest-hostile';
import { createHoldPositionPolicy } from './hold-position';
import { createPatrolWaypointsPolicy } from './patrol-waypoints';
import { createDoNothingPolicy } from './do-nothing';

export function createPolicy(cfg: ActionPolicyConfig): ActionPolicy {
  switch (cfg.kind) {
    case 'engage-nearest-hostile':
      return createEngageNearestHostilePolicy(cfg);
    case 'hold-position':
      return createHoldPositionPolicy(cfg);
    case 'patrol-waypoints':
      return createPatrolWaypointsPolicy(cfg);
    case 'do-nothing':
      return createDoNothingPolicy();
    default: {
      const _exhaustive: never = cfg;
      throw new Error(`Unknown policy kind: ${String((_exhaustive as { kind?: string }).kind)}`);
    }
  }
}

export { createEngageNearestHostilePolicy } from './engage-nearest-hostile';
export { createHoldPositionPolicy } from './hold-position';
export { createPatrolWaypointsPolicy } from './patrol-waypoints';
export { createDoNothingPolicy } from './do-nothing';
