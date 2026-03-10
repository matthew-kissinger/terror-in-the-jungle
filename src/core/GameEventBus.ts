import * as THREE from 'three';
import type { Faction } from '../systems/combat/types';

/**
 * Typed game event definitions. Each key maps to a payload type.
 */
interface GameEvents {
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
}

type Callback<K extends keyof GameEvents> = (event: GameEvents[K]) => void;

interface QueuedEvent { type: keyof GameEvents; payload: GameEvents[keyof GameEvents] }

/**
 * Singleton typed event bus. Events are queued during a frame and delivered
 * in batch via flush() at the end of the frame to avoid per-event overhead.
 */
class GameEventBusImpl {
  private listeners = new Map<keyof GameEvents, Callback<any>[]>();
  private queue: QueuedEvent[] = [];

  subscribe<K extends keyof GameEvents>(type: K, callback: Callback<K>): () => void {
    let list = this.listeners.get(type);
    if (!list) { list = []; this.listeners.set(type, list); }
    list.push(callback);
    return () => {
      const arr = this.listeners.get(type);
      if (!arr) return;
      const idx = arr.indexOf(callback);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  emit<K extends keyof GameEvents>(type: K, event: GameEvents[K]): void {
    this.queue.push({ type, payload: event });
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    for (const { type, payload } of batch) {
      const list = this.listeners.get(type);
      if (!list) continue;
      for (const cb of list) {
        cb(payload);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.queue.length = 0;
  }
}

/** Singleton instance. */
export const GameEventBus = new GameEventBusImpl();
