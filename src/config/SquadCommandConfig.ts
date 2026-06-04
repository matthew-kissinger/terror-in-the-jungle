// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Live-tunable feel knobs for the player-squad command persistence leash
 * (SVYAZ-4 Stage 2). The leash makes a standing order (HOLD / ATTACK / PATROL)
 * survive contact: a commanded NPC engages threats near its order anchor but
 * will not chase a bait enemy far past it, then drifts back to the anchor.
 *
 * Plain mutable object so the live-tuning Tweakpane panel can write through
 * directly (mirrors `NpcLodConfig` in `CombatantConfig.ts`). Do NOT freeze.
 *
 * Off-the-commanded-path behavior is byte-identical: these values are only ever
 * read when an NPC is in a player-controlled squad with an active HOLD / ATTACK
 * / PATROL order, so NPC-vs-NPC combat never touches them.
 *
 * Sizing rationale (see docs/rearch/SQUAD_COMMAND_SVYAZ4_SPIKE_2026-06-03.md
 * §"Decisions"): the leash sits above patrol arrival (15 m) and below crowd
 * dispersal (18 m) so it does not trip dispersal; the engage band equals the
 * engagement distance (30 m).
 */
export const SquadCommandConfig = {
  /**
   * Radius (metres) around a HOLD anchor inside which a commanded NPC freely
   * acquires and engages. Defending the point: hold here, fire here, but do not
   * advance past the leash to chase.
   */
  holdLeashRadius: 18,

  /**
   * Radius (metres) around an ATTACK anchor treated as the "objective taken"
   * footprint. The NPC pushes onto the anchor and holds it, engaging en route;
   * larger than HOLD because an assault posture leans forward.
   */
  attackLeashRadius: 22,

  /**
   * Radius (metres) the squad roams around a PATROL anchor. Matches the existing
   * patrol roam radius so the leash gate and the roam wander agree on the area
   * the squad is responsible for.
   */
  patrolRoamRadius: 20,

  /**
   * Distance (metres) from an ATTACK anchor within which a unit is treated as
   * "arrived" and no longer routed through ADVANCING (SVYAZ-4 Stage 3). Above
   * this, a not-yet-arrived non-combat unit pushes onto the anchor via the
   * existing ADVANCING state; ADVANCING itself self-terminates at its own ~3m
   * arrival, so this only governs whether the push is (re)issued.
   */
  attackArriveRadius: 5,

  /**
   * Extra band (metres) added past the leash radius before an enemy is
   * considered "out of reach". An NPC engages anything within
   * (leashRadius + engageBandPastLeash) of the anchor but will not acquire or
   * chase past that. Equals the engagement distance so the NPC can shoot a
   * threat at the edge of its leash without being baited into a chase.
   */
  engageBandPastLeash: 30,

  /**
   * When true, a FALL BACK order with no explicit marked point rallies the squad
   * to the live player position. When a marked point is supplied it is honored
   * instead. (Consumed by Stage 3 posture; surfaced here so the rally policy is
   * one live-tunable switch.)
   */
  fallBackRallyToPlayer: true,

  /**
   * Panic window (seconds) within which a FALL BACK NPC may still re-acquire and
   * fire on a threat (SVYAZ-4 Stage 3, "fire only if pinned"). FALL BACK breaks
   * contact and runs to rally with acquisition suppressed; this window is the one
   * exception — a unit that was hit (its `lastHitTime`) inside this many seconds
   * is pinned and may shoot back rather than be cut down while fleeing. Matched to
   * the engage-state panic window so a pinned NPC behaves consistently.
   */
  fallBackPinnedWindowSeconds: 3,
};
