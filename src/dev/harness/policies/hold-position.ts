/**
 * hold-position — stand still and optionally aim at nearest hostile.
 */

import type { AgentAction, AgentObservation, VisibleEntity } from '../../../systems/agent/AgentTypes';
import { getAlliance, getEnemyAlliance } from '../../../systems/combat/types';
import type { ActionPolicy, ActionPolicyConfig } from '../types';

type HoldConfig = Extract<ActionPolicyConfig, { kind: 'hold-position' }>;

export function createHoldPositionPolicy(cfg: HoldConfig): ActionPolicy {
  const face = cfg.faceNearestHostile ?? false;

  function selectTarget(obs: AgentObservation): VisibleEntity | null {
    if (!face) return null;
    const enemyAlliance = getEnemyAlliance(getAlliance(obs.ownState.faction));
    let best: VisibleEntity | null = null;
    for (let i = 0; i < obs.visibleEntities.length; i++) {
      const e = obs.visibleEntities[i];
      if (e.kind !== 'combatant') continue;
      if (!e.faction || getAlliance(e.faction) !== enemyAlliance) continue;
      if (!best || e.distance < best.distance) best = e;
    }
    return best;
  }

  let first = true;
  return {
    id: 'hold-position',
    reset() { first = true; },
    tick(obs): AgentAction | null {
      if (first) {
        first = false;
        return { kind: 'stop-moving' };
      }
      const t = selectTarget(obs);
      if (t) return { kind: 'look-at', target: t.position };
      return null;
    },
  };
}
