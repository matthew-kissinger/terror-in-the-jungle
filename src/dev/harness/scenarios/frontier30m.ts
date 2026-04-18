/**
 * frontier30m — long 30-minute open-frontier soak. Used for heap regression
 * investigations. Declares a looser shot budget given the long runtime; main
 * intent is to keep the player active enough to exercise combat systems.
 */

import { Faction } from '../../../systems/combat/types';
import type { ScenarioConfig } from '../types';

export const frontier30m: ScenarioConfig = {
  id: 'frontier30m',
  map: 'open_frontier',
  npcCount: 120,
  durationSec: 1800,
  warmupSec: 30,
  player: {
    spawn: { kind: 'within-engagement-range', targetFaction: Faction.NVA, minDistM: 80, maxDistM: 180 },
    policy: {
      kind: 'engage-nearest-hostile',
      fireMode: 'hold',
      reengageCooldownMs: 500,
      sprintBeyondM: 160,
      minStandoffM: 18,
    },
    seed: 'frontier30m-default',
  },
  observe: { frameTimes: true, aiBudgetOverruns: true, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 200 },
    { kind: 'min-engagements', count: 10 },
    { kind: 'min-distance-traversed-m', meters: 500 },
    { kind: 'max-stuck-seconds', seconds: 30 },
  ],
};
