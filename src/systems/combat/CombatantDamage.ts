import * as THREE from 'three';
import { Combatant, CombatantState, Squad, isBlufor } from './types';
import { PlayerHealthSystem } from '../player/PlayerHealthSystem';
import { TicketSystem } from '../world/TicketSystem';
import { AudioManager } from '../audio/AudioManager';
import { CombatantRenderer } from './CombatantRenderer';
import { CameraShakeSystem } from '../effects/CameraShakeSystem';
import { ImpactEffectsPool } from '../effects/ImpactEffectsPool';
import { Logger } from '../../utils/Logger';
import { KillAssistTracker } from './KillAssistTracker';
import { IHUDSystem } from '../../types/SystemInterfaces';
import { GameEventBus } from '../../core/GameEventBus';

/**
 * Handles damage application and death processing for combatants.
 * Includes death animations, effects, kill feed, squad updates, and ticket system.
 */
export class CombatantDamage {
  private playerHealthSystem?: PlayerHealthSystem;
  private ticketSystem?: TicketSystem;
  private audioManager?: AudioManager;
  private hudSystem?: IHUDSystem;
  private combatantRenderer?: CombatantRenderer;
  private cameraShakeSystem?: CameraShakeSystem;
  private impactEffectsPool?: ImpactEffectsPool;
  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  // Module-level scratch vectors (do not share with other modules)
  private readonly scratchDeathDir = new THREE.Vector3();
  private readonly scratchBloodPos = new THREE.Vector3();
  private readonly scratchSplatterDir = new THREE.Vector3();

  setPlayerHealthSystem(system: PlayerHealthSystem): void {
    this.playerHealthSystem = system;
  }

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

    // Increment kill count for attacker (if exists and is not player proxy)
    if (attacker) {
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

    // Add to kill feed (AI-on-AI kills)
    if (this.hudSystem && attacker) {
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

    // Emit typed event for subscribers (additive - existing direct calls remain)
    GameEventBus.emit('npc_killed', {
      killerId: attacker?.id ?? 'unknown',
      victimId: target.id,
      killerFaction: attacker?.faction ?? target.faction,
      victimFaction: target.faction,
      isHeadshot,
      weaponType: attacker ? 'rifle' : undefined,
      position: target.position,
    });

    // Update squad
    if (target.squadId && squads) {
      const squad = squads.get(target.squadId);
      if (squad) {
        const index = squad.members.indexOf(target.id);
        if (index > -1) {
          squad.members.splice(index, 1);
        }
      }
    }
  }

  /**
   * Spawn visual effects for death (blood splatter).
   */
  private spawnDeathEffects(target: Combatant): void {
    if (!this.impactEffectsPool) return;

    // Blood splatter at death position
    this.scratchBloodPos.copy(target.position);
    this.scratchBloodPos.y += 1.5; // Chest height
    if (target.deathDirection) {
      this.scratchSplatterDir.copy(target.deathDirection).negate();
    } else {
      this.scratchSplatterDir.set(0, 0, 1);
    }
    this.impactEffectsPool.spawn(this.scratchBloodPos, this.scratchSplatterDir);
  }
}
