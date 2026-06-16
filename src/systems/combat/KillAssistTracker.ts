// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Combatant } from './types';
import { Logger } from '../../utils/Logger';

const ASSIST_WINDOW_MS = 10000;
const MAX_ENTRIES = 10;

type DamageHistory = NonNullable<Combatant['damageHistory']>;

export class KillAssistTracker {
  static trackDamage(target: Combatant, attackerId: string, damage: number): void {
    if (!target.damageHistory) target.damageHistory = [];
    this.appendDamageHistory(target.damageHistory, attackerId, damage, performance.now());
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

  private static appendDamageHistory(
    history: DamageHistory,
    attackerId: string,
    damage: number,
    timestamp: number,
  ): void {
    if (history.length < MAX_ENTRIES) {
      history.push({
        attackerId,
        damage,
        timestamp,
      });
      return;
    }

    for (let index = 1; index < history.length; index++) {
      const source = history[index];
      const target = history[index - 1];
      target.attackerId = source.attackerId;
      target.damage = source.damage;
      target.timestamp = source.timestamp;
    }

    const target = history[history.length - 1];
    target.attackerId = attackerId;
    target.damage = damage;
    target.timestamp = timestamp;
  }
}
