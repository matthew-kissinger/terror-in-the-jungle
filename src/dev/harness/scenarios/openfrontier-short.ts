/**
 * openfrontier-short — 120 NPCs on the open_frontier scenario, 180 s.
 * Longer range, sparser contact. Same action policy as combat120.
 */

import { Faction } from '../../../systems/combat/types';
import type { ScenarioConfig } from '../types';

export const openFrontierShort: ScenarioConfig = {
  id: 'openfrontier-short',
  map: 'open_frontier',
  npcCount: 120,
  durationSec: 180,
  warmupSec: 20,
  player: {
    spawn: { kind: 'within-engagement-range', targetFaction: Faction.NVA, minDistM: 80, maxDistM: 180 },
    policy: {
      kind: 'engage-nearest-hostile',
      fireMode: 'hold',
      reengageCooldownMs: 500,
      sprintBeyondM: 160,
      minStandoffM: 18,
    },
    seed: 'openfrontier-short-default',
  },
  observe: { frameTimes: true, aiBudgetOverruns: true, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 40 },
    { kind: 'min-engagements', count: 3 },
    { kind: 'min-distance-traversed-m', meters: 40 },
    { kind: 'max-stuck-seconds', seconds: 12 },
  ],
};
