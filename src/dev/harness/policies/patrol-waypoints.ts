/**
 * patrol-waypoints — walk a fixed waypoint list.
 *
 * Each tick, if within tolerance of the current waypoint, advance to the
 * next. If `loop` is true, wraps; otherwise stops at the last waypoint.
 */

import type { AgentAction, AgentObservation } from '../../../systems/agent/AgentTypes';
import type { ActionPolicy, ActionPolicyConfig } from '../types';

type PatrolConfig = Extract<ActionPolicyConfig, { kind: 'patrol-waypoints' }>;
const WP_TOLERANCE_M = 4;

export function createPatrolWaypointsPolicy(cfg: PatrolConfig): ActionPolicy {
  const waypoints = cfg.waypoints;
  const loop = cfg.loop ?? true;
  let idx = 0;

  return {
    id: 'patrol-waypoints',
    reset() { idx = 0; },
    tick(obs: AgentObservation): AgentAction | null {
      if (waypoints.length === 0) return { kind: 'stop-moving' };
      const wp = waypoints[idx];
      const pos = obs.ownState.position;
      const dx = wp.x - pos.x;
      const dz = wp.z - pos.z;
      if (Math.hypot(dx, dz) <= WP_TOLERANCE_M) {
        idx++;
        if (idx >= waypoints.length) {
          if (loop) idx = 0;
          else return { kind: 'stop-moving' };
        }
      }
      return { kind: 'move-to', target: waypoints[idx], stance: 'walk', tolerance: WP_TOLERANCE_M };
    },
  };
}
