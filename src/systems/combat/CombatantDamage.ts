// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { Combatant, CombatantState, Squad, isBlufor, isPlayerTarget } from './types';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { copyNpcCenterMassPosition } from './CombatantBodyMetrics';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { Logger } from '../../utils/Logger';
import { KillAssistTracker } from './KillAssistTracker';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { GameEventBus } from '../../core/GameEventBus';
import { handleCombatantDeath, DeathBookkeepingHooks } from './CombatantDeathPipeline';

/**
 * Death bookkeeping wiring for the rifle path. Supplies the live squad registry
 * (so the player-rifle path, which calls applyDamage with squads: undefined,
 * still reconciles the victim's squad) plus the player-squad respawn hooks the
 * spawn manager owns. Set once by CombatantSystem; mirrors the hooks the
 * explosion path already passes in CombatantSystemDamage.
 *
 * Exported for a cross-file consumer that knip cannot trace: CombatantCombat
 * references it via an inline `import('./CombatantDamage').DeathBookkeeping`
 * type annotation, which the static export scan does not count as usage.
 * This is a documented knip false-positive — the export must stay.
 */
export interface DeathBookkeeping extends DeathBookkeepingHooks {
  getSquads(): Map<string, Squad>;
}

/**
 * Handles damage application and death processing for combatants.
 * Includes death animations, effects, kill feed, squad updates, and ticket system.
 */
export class CombatantDamage {
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;
  private hudSystem?: IHUDSystem;
  private combatantRenderer?: CombatantRenderer;
  private cameraShakeSystem?: CameraShakeSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private deathBookkeeping?: DeathBookkeeping;
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  // Module-level scratch vectors (do not share with other modules)
  private readonly scratchDeathDir = new THREE.Vector3();
  private readonly scratchBloodPos = new THREE.Vector3();
  private readonly scratchSplatterDir = new THREE.Vector3();

  setTicketSystem(system: TicketSystem): void {
    this.ticketSystem = system;
  }

  setAudioManager(manager: AudioManager): void {
    this.audioManager = manager;
  }

  setHUDSystem(system: import('../../types/SystemInterfaces').IHUDSystem): void {
    this.hudSystem = system;
  }

  setCombatantRenderer(renderer: CombatantRenderer): void {
    this.combatantRenderer = renderer;
  }

  setCameraShakeSystem(system: CameraShakeSystem): void {
    this.cameraShakeSystem = system;
  }

  setImpactEffectsPool(pool: ImpactEffectsPool): void {
    this.impactEffectsPool = pool;
  }

  /**
   * Wire the squad registry + player-squad respawn hooks the rifle death path
   * uses for squad bookkeeping. Without this the player-rifle path (squads:
   * undefined) silently skips reconciliation and player-squad rifle deaths never
   * queue a respawn — both previously load-borne by the deleted spawn-manager
   * sweep. (combat-death-body-persistence)
   */
  setDeathBookkeeping(bookkeeping: DeathBookkeeping): void {
    this.deathBookkeeping = bookkeeping;
  }

  updatePlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Apply damage to a combatant and handle death if health reaches zero.
   * Includes death animations, effects, camera shake, audio, kill feed, and squad updates.
   */
  applyDamage(
    target: Combatant,
    damage: number,
    attacker?: Combatant,
    squads?: Map<string, Squad>,
    isHeadshot: boolean = false,
    allCombatants?: Map<string, Combatant>
  ): void {
    // Check if target is valid before accessing properties
    if (!target) {
      Logger.warn('combat', 'applyDamage called with undefined target');
      return;
    }

    target.health -= damage;
    target.lastHitTime = Date.now();
    target.suppressionLevel = Math.min(1.0, target.suppressionLevel + 0.3);

    // Record the attacker position as a threat bearing so AI state handlers
    // (patrol/defend/engage) have a direction to orient toward on the next
    // tick, even when the attacker isn't currently visible.
    if (attacker) {
      if (target.lastKnownTargetPos) {
        target.lastKnownTargetPos.copy(attacker.position);
      } else {
        target.lastKnownTargetPos = attacker.position.clone();
      }
    }

    // Trigger damage flash effect in shader
    if (this.combatantRenderer) {
      this.combatantRenderer.setDamageFlash(target.id, 1.0);
    }

    // Track damage for assist system
    if (attacker) {
      KillAssistTracker.trackDamage(target, attacker.id, damage);
    }

    if (target.health <= 0) {
      this.handleDeath(target, attacker, squads, isHeadshot, allCombatants, damage);
    }
  }

  /**
   * Handle death processing: animations, effects, audio, kill feed, squad updates.
   */
  private handleDeath(
    target: Combatant,
    attacker: Combatant | undefined,
    squads: Map<string, Squad> | undefined,
    isHeadshot: boolean,
    allCombatants: Map<string, Combatant> | undefined,
    damage: number
  ): void {
    target.state = CombatantState.DEAD;

    // Increment death count for target
    target.deaths++;

    const attackerIsPlayerProxy = isPlayerTarget(attacker);

    // Increment kill count for attacker (if exists and is not player proxy).
    // Player kills are tracked separately via HUDSystem.addKill in
    // CombatantCombat.handlePlayerShot, so we skip the proxy here.
    if (attacker && !attackerIsPlayerProxy) {
      attacker.kills++;
    }

    // Process kill assists
    if (target.damageHistory && target.damageHistory.length > 0) {
      const assisters = KillAssistTracker.processKillAssists(target, attacker?.id);
      
      // Check if player gets an assist
      if (this.hudSystem && assisters.has('PLAYER')) {
        this.hudSystem.addAssist();
      }
    }

    // Initialize death animation
    target.isDying = true;
    target.deathProgress = 0;
    target.deathStartTime = performance.now();

    // Choose death animation type based on damage source
    if (isHeadshot) {
      // Arcade readability: headshots shatter aggressively.
      target.deathAnimationType = 'shatter';
    } else if (damage > 100) {
      // Very high damage gets the same arcade breakup profile.
      target.deathAnimationType = 'shatter';
    } else if (damage > 80) {
      // High damage causes a heavier spin-fall.
      target.deathAnimationType = 'spinfall';
    } else {
      // Normal damage causes crumple
      target.deathAnimationType = 'crumple';
    }

    // Calculate death direction (direction from attacker to target)
    if (attacker && attacker.position) {
      this.scratchDeathDir.subVectors(target.position, attacker.position).normalize();
      this.scratchDeathDir.y = 0; // Keep horizontal
      // Clone for storage since this persists on the combatant
      target.deathDirection = this.scratchDeathDir.clone();
    } else {
      // Default to falling backward
      this.scratchDeathDir.set(
        Math.cos(target.rotation),
        0,
        Math.sin(target.rotation)
      ).multiplyScalar(-1);
      target.deathDirection = this.scratchDeathDir.clone();
    }

    Logger.info('combat', `${target.faction} soldier eliminated${attacker ? ` by ${attacker.faction}` : ''}`);

    // Death visual effects
    this.spawnDeathEffects(target);

    // Camera shake for nearby deaths
    if (this.cameraShakeSystem) {
      this.cameraShakeSystem.shakeFromNearbyDeath(target.position, this.playerPosition);
    }

    // Audio
    if (this.audioManager) {
      const isAllyDeath = isBlufor(target.faction);
      this.audioManager.playDeathSound(target.position, isAllyDeath);
    }

    // Ticket system
    if (this.ticketSystem) {
      this.ticketSystem.onCombatantDeath(target.faction);
    }

    // Add to kill feed (AI-on-AI kills). Player-proxy kills are routed
    // through CombatantCombat.handlePlayerShot via addKillToFeed('PLAYER',...)
    // so we skip this path to avoid duplicate feed entries.
    if (this.hudSystem && attacker && !attackerIsPlayerProxy) {
      const killerName = `${attacker.faction}-${attacker.id.slice(-4)}`;
      const victimName = `${target.faction}-${target.id.slice(-4)}`;
      this.hudSystem.addKillToFeed(
        killerName,
        attacker.faction,
        victimName,
        target.faction,
        isHeadshot,
        'rifle' // AI combatants use rifles
      );
    }

    // Emit typed event for subscribers. Player kills emit 'player_kill'
    // from CombatantCombat.handlePlayerShot; skip 'npc_killed' for the proxy
    // to avoid double-counting.
    if (!attackerIsPlayerProxy) {
      GameEventBus.emit('npc_killed', {
        killerId: attacker?.id ?? 'unknown',
        victimId: target.id,
        killerFaction: attacker?.faction ?? target.faction,
        victimFaction: target.faction,
        isHeadshot,
        weaponType: attacker ? 'rifle' : undefined,
        position: target.position,
      });
    }

    // Update squad bookkeeping through the unified death pipeline so rifle
    // kills produce the same squad state as explosion kills: member removal,
    // leader promotion, empty-squad deletion, and player-squad respawn queueing.
    // (combat-death-unification + combat-death-body-persistence)
    //
    // The player-rifle path (CombatantCombat.handlePlayerShot) calls applyDamage
    // with squads: undefined, so fall back to the wired squad registry — without
    // it the victim's squad would never be reconciled (the deleted spawn-manager
    // sweep used to). The respawn hooks queue player-squad replacements, which
    // also previously load-bore on that sweep.
    const resolvedSquads = squads ?? this.deathBookkeeping?.getSquads();
    const hooks: DeathBookkeepingHooks | undefined = this.deathBookkeeping
      ? {
          isPlayerControlledSquad: (squadId) => this.deathBookkeeping!.isPlayerControlledSquad?.(squadId) ?? false,
          queueRespawn: (squadId, memberId) => this.deathBookkeeping!.queueRespawn?.(squadId, memberId),
        }
      : undefined;
    handleCombatantDeath(target, resolvedSquads, 'rifle', hooks);
  }

  /**
   * Spawn visual effects for death (blood splatter).
   */
  private spawnDeathEffects(target: Combatant): void {
    if (!this.impactEffectsPool) return;

    copyNpcCenterMassPosition(this.scratchBloodPos, target.position);
    if (target.deathDirection) {
      this.scratchSplatterDir.copy(target.deathDirection).negate();
    } else {
      this.scratchSplatterDir.set(0, 0, 1);
    }
    this.impactEffectsPool.spawn(this.scratchBloodPos, this.scratchSplatterDir);
  }
}
