import { Combatant } from './types';
import { Logger } from '../../utils/Logger';

const ASSIST_WINDOW_MS = 10000;
const MAX_ENTRIES = 10;

export class KillAssistTracker {
  static trackDamage(target: Combatant, attackerId: string, damage: number): void {
    if (!target.damageHistory) target.damageHistory = [];
    target.damageHistory.push({
      attackerId,
      damage,
      timestamp: performance.now()
    });

    if (target.damageHistory.length > MAX_ENTRIES) {
      target.damageHistory.shift();
    }
  }

  static processKillAssists(victim: Combatant, killerId?: string): Set<string> {
    const history = victim.damageHistory ?? [];
    const now = performance.now();
    const assists = history.filter(entry =>
      now - entry.timestamp < ASSIST_WINDOW_MS && (!killerId || entry.attackerId !== killerId)
    );

    const uniqueAssisters = new Set(assists.map(entry => entry.attackerId));
    if (uniqueAssisters.size > 0) {
      Logger.info('combat', `${uniqueAssisters.size} assists recorded for kill on ${victim.id}`);
    }

    victim.damageHistory = [];
    return uniqueAssisters;
  }
}
