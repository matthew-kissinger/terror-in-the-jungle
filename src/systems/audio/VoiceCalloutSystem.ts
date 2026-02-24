import { Logger } from '../../utils/Logger';
import * as THREE from 'three';
import { Combatant, CombatantState, Faction } from '../combat/types';
import { GameSystem } from '../../types';

/**
 * Voice callout types for combat events
 */
export enum CalloutType {
  CONTACT = 'contact',              // Spotted an enemy
  TAKING_FIRE = 'taking_fire',      // Under fire
  GRENADE = 'grenade',              // Grenade warning
  MAN_DOWN = 'man_down',            // Teammate killed
  RELOADING = 'reloading',          // Reloading weapon
  TARGET_DOWN = 'target_down',      // Kill confirmed
  SUPPRESSING = 'suppressing',      // Laying down suppressive fire
  MOVING = 'moving',                // Moving to new position
  IN_COVER = 'in_cover'             // Reached cover
}

/**
 * Voice callout cooldown per combatant
 */
interface CalloutCooldown {
  combatantId: string;
  lastCalloutTime: number;
  lastCalloutType: CalloutType | null;
}

/**
 * VoiceCalloutSystem - Tactical audio feedback when NPCs take actions.
 */
export class VoiceCalloutSystem implements GameSystem {
  private readonly CALLOUT_AUDIO_ENABLED = false;
  private listener: THREE.AudioListener;
  private scene: THREE.Scene;
  private audioLoader = new THREE.AudioLoader();
  private calloutBuffers: Partial<Record<Faction, AudioBuffer>> = {};

  // Cooldown tracking
  private cooldowns: Map<string, CalloutCooldown> = new Map();
  private readonly GLOBAL_COOLDOWN_MS = 5000; // 5 seconds minimum between callouts per combatant
  private readonly TYPE_COOLDOWN_MS = 10000; // 10 seconds between same type of callout

  private playerPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly MAX_CALLOUT_DISTANCE = 50; // Only play callouts from NPCs within 50m of player

  constructor(scene: THREE.Scene, listener: THREE.AudioListener) {
    this.scene = scene;
    this.listener = listener;
  }

  async init(): Promise<void> {
    if (!this.CALLOUT_AUDIO_ENABLED) {
      Logger.info('audio', '[VoiceCalloutSystem] Disabled (awaiting authored assets)');
      return;
    }

    await this.loadCalloutBuffers();
    Logger.info('audio', '[VoiceCalloutSystem] Initialized');
  }

  /**
   * Update player position for distance-based callout filtering
   */
  setPlayerPosition(position: THREE.Vector3): void {
    this.playerPosition.copy(position);
  }

  /**
   * Trigger a voice callout from a combatant
   */
  triggerCallout(combatant: Combatant, type: CalloutType, position: THREE.Vector3): void {
    // TODO(audio): Re-enable when faction-specific voice assets are authored.
    if (!this.CALLOUT_AUDIO_ENABLED) return;

    // Only trigger for living combatants
    if (combatant.state === CombatantState.DEAD) return;

    // Check distance to player - only play nearby callouts
    const distanceToPlayer = position.distanceTo(this.playerPosition);
    if (distanceToPlayer > this.MAX_CALLOUT_DISTANCE) return;

    // Check cooldowns
    if (!this.canTriggerCallout(combatant.id, type)) return;

    // Update cooldown
    this.cooldowns.set(combatant.id, {
      combatantId: combatant.id,
      lastCalloutTime: Date.now(),
      lastCalloutType: type
    });

    // Play positional callout
    this.playCallout(type, position, combatant.faction, distanceToPlayer);

    // Debug logging for nearby callouts
    if (distanceToPlayer < 20) {
      Logger.info('audio', `${combatant.faction} callout: ${type} at ${Math.floor(distanceToPlayer)}m`);
    }
  }

  /**
   * Check if combatant can trigger a callout (cooldown check)
   */
  private canTriggerCallout(combatantId: string, type: CalloutType): boolean {
    const cooldown = this.cooldowns.get(combatantId);
    if (!cooldown) return true;

    const now = Date.now();
    const timeSinceLastCallout = now - cooldown.lastCalloutTime;

    // Global cooldown check
    if (timeSinceLastCallout < this.GLOBAL_COOLDOWN_MS) return false;

    // Type-specific cooldown check
    if (cooldown.lastCalloutType === type && timeSinceLastCallout < this.TYPE_COOLDOWN_MS) {
      return false;
    }

    return true;
  }

  private playCallout(
    type: CalloutType,
    position: THREE.Vector3,
    faction: Faction,
    _distanceToPlayer: number
  ): void {
    const buffer = this.calloutBuffers[faction];
    if (!buffer) return;

    // Create positional audio source
    const sound = new THREE.PositionalAudio(this.listener);
    sound.setRefDistance(8);
    sound.setMaxDistance(this.MAX_CALLOUT_DISTANCE);
    sound.setRolloffFactor(2);
    sound.setDistanceModel('linear');
    sound.setBuffer(buffer);
    sound.setVolume(0.5);
    sound.setPlaybackRate(type === CalloutType.GRENADE ? 1.08 : 1.0);

    // Create temporary object at position
    const tempObj = new THREE.Object3D();
    tempObj.position.copy(position);
    tempObj.add(sound);
    this.scene.add(tempObj);

    sound.play();

    // Clean up after sound finishes
    setTimeout(() => {
      tempObj.remove(sound);
      this.scene.remove(tempObj);
    }, 1200);
  }

  private async loadCalloutBuffers(): Promise<void> {
    if (!this.CALLOUT_AUDIO_ENABLED) return;

    const byFaction: Array<[Faction, string]> = [
      [Faction.US, 'assets/optimized/voiceCalloutUS.wav'],
      [Faction.NVA, 'assets/optimized/voiceCalloutOPFOR.wav']
    ];
    await Promise.all(byFaction.map(async ([faction, path]) => {
      try {
        const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
          this.audioLoader.load(path, resolve, undefined, reject);
        });
        this.calloutBuffers[faction] = buffer;
      } catch {
        Logger.warn('audio', `[VoiceCalloutSystem] Missing callout asset: ${path}`);
      }
    }));
  }

  update(_deltaTime: number): void {
    // Decay suppression levels and clean up old cooldowns
    const now = Date.now();
    const staleTime = 60000; // Remove cooldowns older than 1 minute

    this.cooldowns.forEach((cooldown, id) => {
      if (now - cooldown.lastCalloutTime > staleTime) {
        this.cooldowns.delete(id);
      }
    });
  }

  dispose(): void {
    this.cooldowns.clear();
    Logger.info('audio', '[VoiceCalloutSystem] Disposed');
  }
}
