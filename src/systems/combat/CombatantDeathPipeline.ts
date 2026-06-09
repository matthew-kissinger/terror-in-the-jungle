// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { Combatant, Squad } from './types';

/**
 * What killed a combatant. Routed through the unified death pipeline so the
 * rifle path (CombatantDamage) and the explosion path (CombatantSystemDamage)
 * produce identical squad bookkeeping. Before combat-death-unification the two
 * paths diverged: the explosion path went through SquadManager.removeSquadMember
 * (which promotes a new leader and deletes empty squads) while the rifle path
 * spliced the member array directly and did neither — leaving squads with a
 * dead leaderId and ghost squads that never got removed.
 */
export type DeathCause = 'rifle' | 'explosion';

/**
 * Optional hooks the unified handler invokes after squad membership is
 * reconciled. `queueRespawn` lets a caller that owns respawn scheduling
 * (the spawn manager) re-enqueue a player-squad member without this module
 * depending on the spawn manager directly.
 */
export interface DeathBookkeepingHooks {
  isPlayerControlledSquad?(squadId: string): boolean;
  queueRespawn?(squadId: string, memberId: string): void;
}

/**
 * Single owner of squad bookkeeping for a combatant death. Both death routes
 * (rifle and explosion) call this so squad state is reconciled identically:
 *
 *   1. Remove the dead member from its squad's `members` list.
 *   2. If the squad is now empty, delete it (no ghost squads).
 *   3. Otherwise, if the dead member was the leader, promote a survivor so the
 *      squad is never left leaderless.
 *   4. If the squad is player-controlled, queue a respawn via the hook.
 *
 * This intentionally does NOT touch combatant state, death animation, effects,
 * audio, kill feed, tickets, or events. Those legitimately differ between the
 * rifle and explosion routes (different death animations, headshot tracking,
 * friendly-fire filtering) and stay with their respective callers. The shared
 * concern — and the only thing that was racing/diverging — is squad bookkeeping.
 *
 * @param target the combatant that just died (already marked DEAD by the caller)
 * @param squads the live squad registry (SquadManager.getAllSquads()), or
 *               undefined when the caller has no squad context (e.g. the player
 *               proxy shot path passes no squads)
 * @param _cause death source; recorded for callers/telemetry symmetry
 * @param hooks optional respawn / player-squad hooks
 */
export function handleCombatantDeath(
  target: Combatant,
  squads: Map<string, Squad> | undefined,
  _cause: DeathCause,
  hooks?: DeathBookkeepingHooks
): void {
  if (!target.squadId || !squads) {
    return;
  }

  const squad = squads.get(target.squadId);
  if (!squad) {
    return;
  }

  // Player-controlled squads queue a replacement before membership changes so
  // the respawn is scheduled even if this was the squad's last living member.
  if (hooks?.queueRespawn && (hooks.isPlayerControlledSquad?.(target.squadId) ?? squad.isPlayerControlled)) {
    hooks.queueRespawn(target.squadId, target.id);
  }

  const index = squad.members.indexOf(target.id);
  if (index > -1) {
    squad.members.splice(index, 1);
  }

  if (squad.members.length === 0) {
    // Last member died — remove the empty squad so it stops being scheduled,
    // assigned objectives, or counted as a live formation.
    squads.delete(target.squadId);
    return;
  }

  if (squad.leaderId === target.id) {
    // Leader died — promote a survivor so the squad is never leaderless.
    squad.leaderId = squad.members[0];
  }
}
