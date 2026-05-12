import * as THREE from 'three';
import { createEventBus } from '@game-field-kits/event-bus';
import type { Faction } from '../systems/combat/types';

/**
 * Typed game event definitions. Each key maps to a payload type.
 */
interface GameEvents extends Record<string, unknown> {
  npc_killed: {
    killerId: string; victimId: string;
    killerFaction: Faction; victimFaction: Faction;
    isHeadshot: boolean; weaponType?: string;
    position: THREE.Vector3;
  };
  player_killed: { killerId: string; killerFaction: Faction; position: THREE.Vector3 };
  player_kill: { victimId: string; victimFaction: Faction; isHeadshot: boolean; weaponType?: string };
  zone_captured: { zoneId: string; zoneName: string; faction: Faction };
  zone_lost: { zoneId: string; zoneName: string; faction: Faction };
  explosion: { position: THREE.Vector3; radius: number; source: string };
  grenade_thrown: { position: THREE.Vector3; faction: Faction };
  match_phase_change: { phase: 'loading' | 'playing' | 'ended'; mode: string };
  recon_reveal: { position: THREE.Vector3; radius: number; enemyCount: number };
  air_support_inbound: { type: string; targetPosition: THREE.Vector3; eta: number };
  air_support_active: { type: string; missionId: string };
  air_support_complete: { type: string; missionId: string };
  mode_load_progress: { phase: string; progress: number; label: string };
  /**
   * Phase F materialization tier transition: fires when a combatant's render
   * mode changes between updateBillboards frames. Subscribers (minimap,
   * audio, perception, fog-of-war) can react without polling the renderer.
   *
   * - `fromRender`: previous mode (`'close-glb'` / `'impostor'` / `'culled'`),
   *   or `null` for first observation.
   * - `toRender`: new mode this frame.
   * - `reason`: parseable render-lane reason from the materialization profile
   *   (`'close-glb:active'`, `'impostor:total-cap'`, etc.).
   * - `distanceMeters`: combatant distance to player at the moment of
   *   transition.
   */
  materialization_tier_changed: {
    combatantId: string;
    fromRender: 'close-glb' | 'impostor' | 'culled' | null;
    toRender: 'close-glb' | 'impostor' | 'culled';
    reason: string;
    distanceMeters: number;
  };
}

/**
 * Singleton typed event bus. Events are queued during a frame and delivered
 * in batch via flush() at the end of the frame to avoid per-event overhead.
 */
class GameEventBusImpl {
  private bus = createEventBus<GameEvents>();

  subscribe<K extends keyof GameEvents & string>(type: K, callback: (event: GameEvents[K]) => void): () => void {
    return this.bus.subscribe(type, callback);
  }

  emit<K extends keyof GameEvents & string>(type: K, event: GameEvents[K]): void {
    this.bus.emit(type, event);
  }

  flush(): void {
    this.bus.flush();
  }

  clear(): void {
    this.bus.clear();
  }
}

/** Singleton instance. */
export const GameEventBus = new GameEventBusImpl();

