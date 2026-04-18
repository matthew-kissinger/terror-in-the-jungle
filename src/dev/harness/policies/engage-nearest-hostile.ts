/**
 * engage-nearest-hostile — close with the nearest hostile and fire.
 *
 * Per-tick logic (pure):
 *  - Pick the nearest hostile visible entity (opposing alliance).
 *  - If the target is beyond the fire range, request move-to with sprint/walk
 *    stance per config; if it's within standoff distance, fall back to a
 *    "hold ground and fire" state.
 *  - Always request fire-at on a visible target. Cooldown between re-engagement
 *    transitions is honoured via `reengageCooldownMs`.
 *
 * No access to the engine; operates entirely on `AgentObservation`.
 */

import type { AgentAction, AgentObservation, VisibleEntity } from '../../../systems/agent/AgentTypes';
import { getAlliance, getEnemyAlliance } from '../../../systems/combat/types';
import type { ActionPolicy, ActionPolicyConfig } from '../types';

type EngageConfig = Extract<ActionPolicyConfig, { kind: 'engage-nearest-hostile' }>;

export function createEngageNearestHostilePolicy(cfg: EngageConfig): ActionPolicy {
  const fireMode = cfg.fireMode ?? 'hold';
  const reengageCooldownMs = cfg.reengageCooldownMs ?? 400;
  const minStandoffM = cfg.minStandoffM ?? 18;
  const sprintBeyondM = cfg.sprintBeyondM ?? 120;
  let lastTargetId: string | null = null;
  let lastEngageAtMs = 0;
  let toggle = 0; // alternates fire vs move when both are needed

  function selectTarget(obs: AgentObservation): VisibleEntity | null {
    const me = obs.ownState.faction;
    const enemyAlliance = getEnemyAlliance(getAlliance(me));
    let best: VisibleEntity | null = null;
    for (let i = 0; i < obs.visibleEntities.length; i++) {
      const e = obs.visibleEntities[i];
      if (e.kind !== 'combatant') continue;
      if (!e.faction || getAlliance(e.faction) !== enemyAlliance) continue;
      if ((e.healthFrac ?? 1) <= 0) continue;
      if (!best || e.distance < best.distance) best = e;
    }
    return best;
  }

  return {
    id: 'engage-nearest-hostile',
    reset() {
      lastTargetId = null;
      lastEngageAtMs = 0;
      toggle = 0;
    },
    tick(obs, nowMs): AgentAction | null {
      if (obs.ownState.isDead) return null;
      const target = selectTarget(obs);
      if (!target) {
        // No hostile visible; stop firing so the weapon can cool.
        return { kind: 'cease-fire' };
      }

      // Track engagement transitions for reengage cooldown; lastEngageAtMs
      // gates how quickly the runner counts a new engagement.
      if (lastTargetId !== target.id) {
        if (nowMs - lastEngageAtMs >= reengageCooldownMs) {
          lastTargetId = target.id;
          lastEngageAtMs = nowMs;
        }
      }

      // Alternate fire / move so each tick applies only one action to the
      // AgentController (it dispatches one action per apply() anyway). The
      // runner calls apply() + step() per tick; fire-at also sets view
      // angles toward the target, so alternation is safe.
      toggle = (toggle + 1) % 2;
      const action: AgentAction = toggle === 0
        ? { kind: 'fire-at', target: target.id, mode: fireMode }
        : target.distance > minStandoffM
          ? {
              kind: 'move-to',
              target: target.position,
              stance: target.distance > sprintBeyondM ? 'sprint' : 'walk',
              tolerance: Math.max(2, minStandoffM - 2),
            }
          : { kind: 'fire-at', target: target.id, mode: fireMode };

      return action;
    },
  };
}
