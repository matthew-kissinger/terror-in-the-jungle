// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Combatant, CombatantState, Faction, isAlly } from './types';
import { SquadManager } from './SquadManager';
import { TicketSystem } from '../world/TicketSystem';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { Logger } from '../../utils/Logger';
import { KillAssistTracker } from './KillAssistTracker';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { isWorldBuilderFlagActive } from '../../dev/worldBuilder/WorldBuilderConsole';
import { GameEventBus } from '../../core/GameEventBus';
import { handleCombatantDeath } from './CombatantDeathPipeline';
import { spatialGridManager } from './SpatialGridManager';
import type { IVehicle } from '../vehicle/IVehicle';
import { Tank, type TankDamageType } from '../vehicle/Tank';
import type { AudioManager } from '../audio/AudioManager';
import type { PlayerStatsTracker } from '../player/PlayerStatsTracker';

// Module-level scratch vector to avoid per-call allocations
const _deathDir = new THREE.Vector3();

// Player-attributed explosions surface the same crosshair hit/kill feedback as
// direct fire. Kills always punch through (discrete); non-kill hits are
// coalesced on this cooldown so a damage-over-time source (napalm burn ticks at
// 0.5s across 6 zones) does not strobe the marker.
const PLAYER_HIT_FEEDBACK_COOLDOWN_MS = 200;

interface ExplosionHitFeedback {
  position: THREE.Vector3;
  damage: number;
}

export interface VehicleExplosionDamageQuery {
  getVehiclesInRadius(center: THREE.Vector3, radius: number): readonly IVehicle[];
  forEachVehicleInRadius?(
    center: THREE.Vector3,
    radius: number,
    visitor: (vehicle: IVehicle) => void,
  ): void;
}

interface GenericVehicleDamageTarget extends IVehicle {
  applyDamage(amount: number, hitPoint: THREE.Vector3): unknown;
}

/**
 * Handles explosion damage application to combatants
 * Extracted from CombatantSystem for better organization
 */
export class CombatantSystemDamage {
  private ticketSystem?: TicketSystem;
  private hudSystem?: IHUDSystem;
  private audioManager?: AudioManager;
  private vehicleDamageQuery?: VehicleExplosionDamageQuery;
  private lastPlayerHitFeedbackAt = 0;
  private playerFaction: Faction = Faction.US;
  private playerStatsTracker?: PlayerStatsTracker;

  constructor(
    private combatants: Map<string, Combatant>,
    private squadManager: SquadManager,
    private spawnManager: CombatantSpawnManager,
    ticketSystem?: TicketSystem,
    hudSystem?: IHUDSystem
  ) {
    this.ticketSystem = ticketSystem;
    this.hudSystem = hudSystem;
  }

  setTicketSystem(ticketSystem: TicketSystem): void {
    this.ticketSystem = ticketSystem;
  }

  setHUDSystem(hudSystem: IHUDSystem): void {
    this.hudSystem = hudSystem;
  }

  setAudioManager(audioManager: AudioManager): void {
    this.audioManager = audioManager;
  }

  setPlayerFaction(faction: Faction): void {
    this.playerFaction = faction;
  }

  setPlayerStatsTracker(tracker: PlayerStatsTracker): void {
    this.playerStatsTracker = tracker;
  }

  setVehicleDamageQuery(query: VehicleExplosionDamageQuery | null): void {
    this.vehicleDamageQuery = query ?? undefined;
  }

  /**
   * Apply explosion damage to all combatants within radius.
   *
   * `shooterFaction` (optional, additive 2026-05-17 alongside the
   * `tank-ai-gunner-route` cycle) filters out same-alliance combatants
   * from radial damage. Callers that should never friendly-fire (tank
   * main cannon, AT weapons) pass the shooter's faction; existing
   * callers (grenades, air-support, mortars) keep their current
   * un-filtered semantics by omitting the parameter.
   */
  applyExplosionDamage(
    center: THREE.Vector3,
    radius: number,
    maxDamage: number,
    attackerId?: string,
    weaponType = 'grenade',
    shooterFaction?: Faction,
  ): void {
    let hitCount = 0;
    const killedCombatants: Combatant[] = [];
    const playerOneShotActive = attackerId === 'PLAYER'
      && import.meta.env.DEV
      && isWorldBuilderFlagActive('oneShotKills');

    // Crosshair hit/kill feedback for explosions the player caused (thrown
    // grenades, the M79, and player-called air support all arrive as
    // `attackerId === 'PLAYER'`). Only enemies of the player count; friendlies
    // caught in a blast never raise a marker.
    const playerAttributed = attackerId === 'PLAYER';
    const playerKills: ExplosionHitFeedback[] = [];
    let bestNonKillHit: ExplosionHitFeedback | null = null;

    // Query the spatial grid for combatants near the blast instead of an O(N)
    // scan over every combatant. The octree returns a (possibly conservative)
    // set of in-radius ids; the exact `distance <= radius` test below keeps the
    // damage falloff identical to the old full scan. (combat-death-unification)
    const candidateIds = spatialGridManager.queryRadius(center, radius);
    const radiusSq = radius * radius;
    candidateIds.forEach(id => {
      const combatant = this.combatants.get(id);
      if (!combatant) return;
      if (combatant.state === CombatantState.DEAD) return;
      // Friendly-fire exclusion when a shooter faction is provided.
      // Same-alliance combatants are immune to the radial wave.
      if (shooterFaction !== undefined && isAlly(combatant.faction, shooterFaction)) return;

      const distanceSq = combatant.position.distanceToSquared(center);

      if (distanceSq <= radiusSq) {
        const distance = Math.sqrt(distanceSq);
        const damagePercent = 1.0 - (distance / radius);
        const baseDamage = maxDamage * damagePercent;
        const damage = playerOneShotActive && baseDamage > 0
          ? Math.max(baseDamage, combatant.health)
          : baseDamage;
        const wasAlive = combatant.health > 0;

        // Track damage for assist system
        if (attackerId) {
          KillAssistTracker.trackDamage(combatant, attackerId, damage);
        }

        combatant.health -= damage;

        if (combatant.health <= 0) {
          combatant.health = 0;
          combatant.state = CombatantState.DEAD;

          // Increment death count for killed combatant
          combatant.deaths++;

          // Increment kill count for attacker (if exists and is not player proxy)
          if (attackerId) {
            const attacker = this.combatants.get(attackerId);
            if (attacker) {
              attacker.kills++;
            }
          }

          // Process kill assists
          if (combatant.damageHistory && combatant.damageHistory.length > 0) {
            KillAssistTracker.processKillAssists(combatant, attackerId);
          }

          // Explosions use the arcade shatter profile for stronger readability.
          combatant.isDying = true;
          combatant.deathProgress = 0;
          combatant.deathStartTime = performance.now();
          combatant.deathAnimationType = 'shatter';

          // Calculate death direction (away from explosion center)
          _deathDir.subVectors(combatant.position, center).normalize();
          _deathDir.y = 0; // Keep horizontal
          combatant.deathDirection = _deathDir.clone();

          if (this.ticketSystem) {
            this.ticketSystem.onCombatantDeath(combatant.faction);
          }

          // Squad bookkeeping (member removal, leader promotion, empty-squad
          // deletion) + player-squad respawn queueing run through the unified
          // death pipeline so explosion kills match rifle kills exactly.
          // (combat-death-unification)
          handleCombatantDeath(combatant, this.squadManager.getAllSquads(), 'explosion', {
            isPlayerControlledSquad: (squadId) => !!this.squadManager.getSquad(squadId)?.isPlayerControlled,
            queueRespawn: (squadId, memberId) => {
              Logger.info('Combat', `Player squad member ${memberId} will respawn in 5 seconds...`);
              this.spawnManager.queueRespawn(squadId, memberId);
            },
          });

          // Track killed combatants for kill feed
          if (wasAlive) {
            killedCombatants.push(combatant);
            if (playerAttributed && !isAlly(combatant.faction, this.playerFaction)) {
              playerKills.push({ position: combatant.position.clone(), damage });
            }
          }

          Logger.info('Combat', `${combatant.faction} soldier killed by explosion (${damage.toFixed(0)} damage)`);
        } else {
          combatant.lastHitTime = Date.now();
          if (playerAttributed && damage > 0 && !isAlly(combatant.faction, this.playerFaction)
            && (!bestNonKillHit || damage > bestNonKillHit.damage)) {
            bestNonKillHit = { position: combatant.position.clone(), damage };
          }
          Logger.debug('Combat', `${combatant.faction} soldier hit by explosion (${damage.toFixed(0)} damage, ${combatant.health.toFixed(0)} HP left)`);
        }

        hitCount++;
      }
    });

    if (playerAttributed) {
      this.showPlayerExplosionFeedback(playerKills, bestNonKillHit, weaponType);
    }

    const hudSystem = this.hudSystem;
    // Report kills to kill feed + emit `npc_killed` so subscribers
    // (objectives, telemetry, audio) react identically to rifle-pipeline
    // deaths. Player-thrown explosions come in as `attackerId === 'PLAYER'`
    // — the player's separate `player_kill` emission covers those, so we
    // skip `npc_killed` for the proxy to avoid double-counting (mirrors
    // CombatantDamage.handleDeath). NPC-attributed explosions (tank
    // cannon, mortar) carry the attacker's combatant id so we resolve
    // their faction for both surfaces.
    if (killedCombatants.length > 0) {
      const attackerIsPlayerProxy = attackerId === 'PLAYER';
      const attackerCombatant = attackerId && !attackerIsPlayerProxy
        ? this.combatants.get(attackerId)
        : undefined;
      const killerName = attackerIsPlayerProxy
        ? 'PLAYER'
        : (attackerCombatant
          ? `${attackerCombatant.faction}-${attackerCombatant.id.slice(-4)}`
          : 'PLAYER');
      // Resolve killer faction: attacker combatant if known, else fall back
      // to the explicit shooterFaction param (tank cannon supplies this),
      // else default to US to preserve the historical kill-feed behaviour.
      const killerFaction = attackerCombatant?.faction
        ?? shooterFaction
        ?? Faction.US;

      killedCombatants.forEach(victim => {
        const victimName = `${victim.faction}-${victim.id.slice(-4)}`;
        if (hudSystem) {
          hudSystem.addKillToFeed(
            killerName,
            killerFaction,
            victimName,
            victim.faction,
            false, // Explosions don't have headshot tracking
            weaponType
          );
        }
        if (!attackerIsPlayerProxy) {
          GameEventBus.emit('npc_killed', {
            killerId: attackerCombatant?.id ?? attackerId ?? 'unknown',
            victimId: victim.id,
            killerFaction,
            victimFaction: victim.faction,
            isHeadshot: false,
            weaponType,
            position: victim.position,
          });
        }
      });
    }

    if (hitCount > 0) {
      Logger.debug('Combat', `Explosion hit ${hitCount} combatants`);
    }

    this.applyExplosionDamageToVehicles(center, radius, maxDamage, weaponType, shooterFaction);
  }

  /**
   * Surface crosshair feedback for a player-caused explosion, mirroring the
   * direct-fire path (`WeaponShotExecutor`): a damage number per victim, one
   * marker, and the matching hit/kill sound. Kills always show; a non-kill hit
   * is gated by {@link PLAYER_HIT_FEEDBACK_COOLDOWN_MS} so damage-over-time
   * sources (napalm) do not strobe the marker.
   */
  private showPlayerExplosionFeedback(
    kills: ExplosionHitFeedback[],
    bestNonKillHit: ExplosionHitFeedback | null,
    weaponType: string,
  ): void {
    const hudSystem = this.hudSystem;
    if (!hudSystem) return;

    if (kills.length > 0) {
      for (const kill of kills) {
        hudSystem.spawnDamageNumber(kill.position, kill.damage, false, true);
        // Credit the kill exactly as a rifle kill does (CombatantCombat →
        // hudSystem.addKill): increments the kill counter + player streak
        // (PlayerStatsTracker.addKill), fires the kill marker, and spawns the
        // score popup. This is what wires explosive / air-strike kills into the
        // scoreboard. Explosions carry no headshot, so isHeadshot = false.
        hudSystem.addKill(false);
        // 'grenade' covers both thrown frags and the M79 launcher (the only
        // callers that leave weaponType at its default); mortar/air-support
        // kills route through the same addKill above but stay out of this
        // sub-stat, matching the "Grenade Expert" award's intent.
        if (weaponType === 'grenade') this.playerStatsTracker?.addGrenadeKill();
      }
      this.audioManager?.playHitFeedback('kill');
      this.lastPlayerHitFeedbackAt = performance.now();
      return;
    }

    if (!bestNonKillHit) return;

    const now = performance.now();
    if (now - this.lastPlayerHitFeedbackAt < PLAYER_HIT_FEEDBACK_COOLDOWN_MS) return;
    this.lastPlayerHitFeedbackAt = now;

    hudSystem.spawnDamageNumber(bestNonKillHit.position, bestNonKillHit.damage, false, false);
    hudSystem.showHitMarker('hit');
    this.audioManager?.playHitFeedback('hit');
  }

  private applyExplosionDamageToVehicles(
    center: THREE.Vector3,
    radius: number,
    maxDamage: number,
    weaponType: string,
    shooterFaction?: Faction,
  ): void {
    if (!this.vehicleDamageQuery || radius <= 0 || maxDamage <= 0) return;

    const damageType = tankDamageTypeForWeapon(weaponType);
    let hitCount = 0;
    const radiusSq = radius * radius;
    const applyDamageToVehicle = (vehicle: IVehicle): void => {
      if (vehicle.isDestroyed()) return;
      if (shooterFaction !== undefined && isAlly(vehicle.faction, shooterFaction)) return;

      const vehiclePosition = vehicle.getPosition();
      const distanceSq = vehiclePosition.distanceToSquared(center);
      if (distanceSq > radiusSq) return;
      const distance = Math.sqrt(distanceSq);
      const damage = maxDamage * (1.0 - distance / radius);
      if (damage <= 0) return;

      if (vehicle instanceof Tank) {
        vehicle.applyDamage(damage, center, damageType);
      } else if (isGenericVehicleDamageTarget(vehicle)) {
        vehicle.applyDamage(damage, center);
      } else {
        return;
      }
      hitCount++;
    };

    if (this.vehicleDamageQuery.forEachVehicleInRadius) {
      this.vehicleDamageQuery.forEachVehicleInRadius(center, radius, applyDamageToVehicle);
    } else {
      for (const vehicle of this.vehicleDamageQuery.getVehiclesInRadius(center, radius)) {
        applyDamageToVehicle(vehicle);
      }
    }

    if (hitCount > 0) {
      Logger.debug('Combat', `Explosion hit ${hitCount} vehicles`);
    }
  }
}

function isGenericVehicleDamageTarget(vehicle: IVehicle): vehicle is GenericVehicleDamageTarget {
  return typeof (vehicle as { applyDamage?: unknown }).applyDamage === 'function';
}

function tankDamageTypeForWeapon(weaponType: string): TankDamageType {
  if (weaponType === 'tank_cannon') return 'AP';
  if (weaponType.includes('rocket') || weaponType.includes('heat')) return 'HEAT';
  return 'HE';
}
