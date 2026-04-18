/**
 * combat120 — 120 NPCs on `ai_sandbox` for 90 s. Reference scenario for the
 * declarative runner. The validators below auto-detect the A4-class regression
 * (driver inversion → player walks away → zero engagements). A sign-flipped
 * `move-to` in the adapter makes `min-engagements` fail loudly.
 */

import { Faction } from '../../../systems/combat/types';
import type { ScenarioConfig } from '../types';

export const combat120: ScenarioConfig = {
  id: 'combat120',
  map: 'ai_sandbox',
  npcCount: 120,
  durationSec: 90,
  warmupSec: 15,
  player: {
    spawn: { kind: 'within-engagement-range', targetFaction: Faction.NVA, minDistM: 30, maxDistM: 60 },
    policy: { kind: 'engage-nearest-hostile', fireMode: 'hold', reengageCooldownMs: 400 },
    seed: 'combat120-default',
  },
  observe: { frameTimes: true, aiBudgetOverruns: true, shotsFired: true, engagements: true },
  validators: [
    { kind: 'min-shots', count: 30 },
    { kind: 'min-engagements', count: 3 },
    { kind: 'max-stuck-seconds', seconds: 8 },
  ],
};
