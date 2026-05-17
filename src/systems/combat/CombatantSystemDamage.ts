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

// Module-level scratch vector to avoid per-call allocations
const _deathDir = new THREE.Vector3();

/**
 * Handles explosion damage application to combatants
 * Extracted from CombatantSystem for better organization
 */
export class CombatantSystemDamage {
  private ticketSystem?: TicketSystem;
  private hudSystem?: IHUDSystem;

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

    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;
      // Friendly-fire exclusion when a shooter faction is provided.
      // Same-alliance combatants are immune to the radial wave.
      if (shooterFaction !== undefined && isAlly(combatant.faction, shooterFaction)) return;

      const distance = combatant.position.distanceTo(center);

      if (distance <= radius) {
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

          // Queue respawn for player squad members
          if (combatant.squadId) {
            const squad = this.squadManager.getSquad(combatant.squadId);
            if (squad?.isPlayerControlled) {
              Logger.info('Combat', `Player squad member ${combatant.id} will respawn in 5 seconds...`);
              this.spawnManager.queueRespawn(combatant.squadId, combatant.id);
            }
            this.squadManager.removeSquadMember(combatant.squadId, combatant.id);
          }

          // Track killed combatants for kill feed
          if (wasAlive) {
            killedCombatants.push(combatant);
          }

          Logger.info('Combat', `${combatant.faction} soldier killed by explosion (${damage.toFixed(0)} damage)`);
        } else {
          combatant.lastHitTime = Date.now();
          Logger.debug('Combat', `${combatant.faction} soldier hit by explosion (${damage.toFixed(0)} damage, ${combatant.health.toFixed(0)} HP left)`);
        }

        hitCount++;
      }
    });

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
  }
}
