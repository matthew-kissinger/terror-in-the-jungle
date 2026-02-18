import { GameSystem } from '../../types';
import { Faction } from '../combat/types';
import { Logger } from '../../utils/Logger';
import { WarEvent } from './types';
import type { WarSimulator } from './WarSimulator';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import type { AudioManager } from '../audio/AudioManager';

/**
 * StrategicFeedback - makes the war feel alive beyond the player's immediate area.
 *
 * Subscribes to WarSimulator events and drives:
 * - HUD messages for zone captures, reinforcements, major battles
 * - Distant battle audio (low-volume gunfire/explosions)
 * - Map indicators (handled by minimap/fullmap reading WarSimulator directly)
 *
 * All feedback is disabled when WarSimulator is inactive.
 */
export class StrategicFeedback implements GameSystem {
  private warSimulator: WarSimulator | null = null;
  private hudSystem: HUDSystem | null = null;
  private audioManager: AudioManager | null = null;

  // Cooldowns to prevent message spam
  private lastMessageTime: Record<string, number> = {};
  private readonly MESSAGE_COOLDOWN_MS = 8000;
  private readonly DISTANT_AUDIO_COOLDOWN_MS = 5000;
  private lastDistantAudioTime = 0;

  // Unsubscribe handle
  private unsubscribe: (() => void) | null = null;

  private playerX = 0;
  private playerZ = 0;

  async init(): Promise<void> {
    Logger.info('strategic-feedback', 'Initialized (dormant until WarSimulator active)');
  }

  update(_deltaTime: number): void {
    // Feedback is event-driven via subscription, no per-frame work needed.
    // Player position is updated from SystemUpdater.
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // -- Dependency setters --

  setWarSimulator(simulator: WarSimulator): void {
    this.warSimulator = simulator;

    // Subscribe to war events
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = simulator.events.subscribe((events) => {
      this.handleEvents(events);
    });
  }

  setHUDSystem(hud: HUDSystem): void {
    this.hudSystem = hud;
  }

  setAudioManager(audio: AudioManager): void {
    this.audioManager = audio;
  }

  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  // -- Event handling --

  private handleEvents(events: WarEvent[]): void {
    const now = performance.now();

    for (const event of events) {
      switch (event.type) {
        case 'zone_captured':
          this.showThrottledMessage(
            `zone_${event.zoneId}`,
            event.faction === Faction.US
              ? `${event.zoneName} secured by US forces!`
              : `${event.zoneName} captured by NVA!`,
            now, 5000
          );
          break;

        case 'zone_contested':
          this.showThrottledMessage(
            `contested_${event.zoneId}`,
            `${event.zoneName} is under attack!`,
            now, 4000
          );
          break;

        case 'zone_lost':
          this.showThrottledMessage(
            `lost_${event.zoneId}`,
            event.faction === Faction.US
              ? `US forces lost ${event.zoneName}!`
              : `NVA lost control of ${event.zoneName}`,
            now, 5000
          );
          break;

        case 'reinforcements_arriving':
          this.showThrottledMessage(
            `reinforce_${event.faction}`,
            event.faction === Faction.US
              ? `${event.count} US reinforcements deploying to ${event.zoneName}`
              : `NVA reinforcements spotted near ${event.zoneName}`,
            now, 5000
          );
          break;

        case 'major_battle': {
          // Show message if within 5km
          const dx = event.x - this.playerX;
          const dz = event.z - this.playerZ;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (dist < 5000) {
            // Distant battle audio
            this.playDistantBattle(dist, event.intensity, now);

            if (dist < 3000) {
              const dir = this.getCompassDirection(dx, dz);
              this.showThrottledMessage(
                'major_battle',
                `Heavy fighting reported to the ${dir}`,
                now, 5000
              );
            }
          }
          break;
        }

        case 'squad_engaged': {
          // Play distant gunfire for nearby engagements
          const dx = event.x - this.playerX;
          const dz = event.z - this.playerZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 3000 && dist > 200) {
            this.playDistantBattle(dist, 0.3, now);
          }
          break;
        }

        case 'faction_advantage':
          if (event.ratio > 1.5) {
            this.showThrottledMessage(
              'faction_advantage',
              event.faction === Faction.US
                ? 'US forces gaining the upper hand!'
                : 'NVA forces pressing the advantage!',
              now, 4000
            );
          }
          break;
      }
    }
  }

  private showThrottledMessage(key: string, message: string, now: number, duration: number): void {
    if (!this.hudSystem) return;

    const lastTime = this.lastMessageTime[key] || 0;
    if (now - lastTime < this.MESSAGE_COOLDOWN_MS) return;

    this.lastMessageTime[key] = now;
    this.hudSystem.showMessage(message, duration);
  }

  private playDistantBattle(distance: number, intensity: number, now: number): void {
    if (!this.audioManager) return;
    if (now - this.lastDistantAudioTime < this.DISTANT_AUDIO_COOLDOWN_MS) return;

    this.lastDistantAudioTime = now;

    // Volume attenuates with distance
    const maxDist = 5000;
    const volume = Math.max(0.02, (1 - distance / maxDist) * 0.15 * intensity);

    // Use existing weapon sounds at low volume for distant battle effect
    // AudioManager may not have playDistantCombat - cast to any for optional call
    const mgr = this.audioManager as unknown as Record<string, unknown>;
    if (typeof mgr.playDistantCombat === 'function') {
      (mgr.playDistantCombat as (v: number) => void)(volume);
    }
  }

  private getCompassDirection(dx: number, dz: number): string {
    const angle = Math.atan2(dx, -dz) * (180 / Math.PI);
    if (angle >= -22.5 && angle < 22.5) return 'north';
    if (angle >= 22.5 && angle < 67.5) return 'northeast';
    if (angle >= 67.5 && angle < 112.5) return 'east';
    if (angle >= 112.5 && angle < 157.5) return 'southeast';
    if (angle >= 157.5 || angle < -157.5) return 'south';
    if (angle >= -157.5 && angle < -112.5) return 'southwest';
    if (angle >= -112.5 && angle < -67.5) return 'west';
    return 'northwest';
  }
}
