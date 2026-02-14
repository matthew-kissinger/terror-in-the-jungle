import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from './types';
import { SquadManager } from './SquadManager';
import { TicketSystem } from '../world/TicketSystem';
import { CombatantSpawnManager } from './CombatantSpawnManager';
import { Logger } from '../../utils/Logger';
import { KillAssistTracker } from './KillAssistTracker';
import { IHUDSystem } from '../../types/SystemInterfaces';

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
   * Apply explosion damage to all combatants within radius
   */
  applyExplosionDamage(center: THREE.Vector3, radius: number, maxDamage: number, attackerId?: string): void {
    let hitCount = 0;
    const killedCombatants: Combatant[] = [];

    this.combatants.forEach(combatant => {
      if (combatant.state === CombatantState.DEAD) return;

      const distance = combatant.position.distanceTo(center);

      if (distance <= radius) {
        const damagePercent = 1.0 - (distance / radius);
        const damage = maxDamage * damagePercent;
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
            if (attacker && !attacker.isPlayerProxy) {
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

          if (this.ticketSystem && typeof (this.ticketSystem as any).onCombatantKilled === 'function') {
            (this.ticketSystem as any).onCombatantKilled(combatant.faction);
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
    // Report grenade kills to kill feed (grenades are player-thrown)
    if (hudSystem && killedCombatants.length > 0) {
      killedCombatants.forEach(victim => {
        const victimName = `${victim.faction}-${victim.id.slice(-4)}`;
        hudSystem.addKillToFeed(
          'PLAYER',
          Faction.US,
          victimName,
          victim.faction,
          false, // Explosions don't have headshot tracking
          'grenade'
        );
      });
    }

    if (hitCount > 0) {
      Logger.debug('Combat', `Explosion hit ${hitCount} combatants`);
    }
  }
}
