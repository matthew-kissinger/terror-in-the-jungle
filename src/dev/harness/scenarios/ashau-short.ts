/**
 * ashau-short — 60 NPCs on the A Shau Valley real-terrain scenario, 180 s.
 * Terrain-streaming-heavy capture; long engagement ranges.
 */

import { Faction } from '../../../systems/combat/types';
import type { ScenarioConfig } from '../types';

export const aShauShort: ScenarioConfig = {
  id: 'ashau-short',
  map: 'a_shau_valley',
  npcCount: 60,
  durationSec: 180,
  warmupSec: 20,
  player: {
    spawn: { kind: 'within-engagement-range', targetFaction: Faction.NVA, minDistM: 60, maxDistM: 150 },
    policy: {
      kind: 'engage-nearest-hostile',
      fireMode: 'hold',
      reengageCooldownMs: 500,
      sprintBeyondM: 150,
      minStandoffM: 18,
    },
    seed: 'ashau-short-default',
  },
  observe: { frameTimes: true, aiBudgetOverruns: true, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 25 },
    { kind: 'min-engagements', count: 2 },
    { kind: 'max-stuck-seconds', seconds: 15 },
  ],
};
