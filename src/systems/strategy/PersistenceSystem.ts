import { Logger } from '../../utils/Logger';
import { WarState } from './types';

const STORAGE_PREFIX = 'titj-war-save-';
const MAX_SLOTS = 3; // 0 = auto-save, 1-2 = manual

interface SaveEnvelope {
  schemaVersion: number;
  savedAt: number;
  gameMode: string;
  elapsedTime: number;
  state: WarState;
}

export interface SaveMetadata {
  slot: number;
  gameMode: string;
  elapsedTime: number;
  savedAt: number;
  agentCount: number;
  exists: boolean;
}

/**
 * Persistence System for WarSimulator state.
 *
 * Saves/loads WarState to localStorage. ~360KB per save for 3000 agents.
 * 3 slots (auto + 2 manual) = ~1.1MB, well under 5MB localStorage limit.
 *
 * Auto-save runs every 60s when WarSimulator is active.
 */
export class PersistenceSystem {
  private autoSaveInterval = 60; // seconds
  private lastAutoSaveTime = 0;

  /**
   * Save war state to a slot.
   */
  save(slot: number, state: WarState): boolean {
    if (slot < 0 || slot >= MAX_SLOTS) return false;

    const envelope: SaveEnvelope = {
      schemaVersion: state.schemaVersion,
      savedAt: Date.now(),
      gameMode: state.gameMode,
      elapsedTime: state.elapsedTime,
      state
    };

    try {
      const json = JSON.stringify(envelope);
      localStorage.setItem(`${STORAGE_PREFIX}${slot}`, json);
      Logger.info('persistence', `Saved to slot ${slot}: ${state.agents.length} agents, ${(json.length / 1024).toFixed(0)}KB`);
      return true;
    } catch (e) {
      Logger.error('persistence', `Failed to save slot ${slot}:`, e);
      return false;
    }
  }

  /**
   * Load war state from a slot.
   */
  load(slot: number): WarState | null {
    if (slot < 0 || slot >= MAX_SLOTS) return null;

    try {
      const json = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
      if (!json) return null;

      const envelope: SaveEnvelope = JSON.parse(json);
      Logger.info('persistence', `Loaded slot ${slot}: ${envelope.state.agents.length} agents, ${envelope.state.elapsedTime.toFixed(0)}s elapsed`);
      return envelope.state;
    } catch (e) {
      Logger.error('persistence', `Failed to load slot ${slot}:`, e);
      return null;
    }
  }

  /**
   * List metadata for all save slots.
   */
  listSaves(): SaveMetadata[] {
    const saves: SaveMetadata[] = [];

    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      try {
        const json = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
        if (!json) {
          saves.push({ slot, gameMode: '', elapsedTime: 0, savedAt: 0, agentCount: 0, exists: false });
          continue;
        }

        const envelope: SaveEnvelope = JSON.parse(json);
        saves.push({
          slot,
          gameMode: envelope.gameMode,
          elapsedTime: envelope.elapsedTime,
          savedAt: envelope.savedAt,
          agentCount: envelope.state.agents.length,
          exists: true
        });
      } catch {
        saves.push({ slot, gameMode: '', elapsedTime: 0, savedAt: 0, agentCount: 0, exists: false });
      }
    }

    return saves;
  }

  /**
   * Check if a save exists for a specific game mode.
   */
  hasSaveForMode(gameMode: string): boolean {
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      try {
        const json = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
        if (!json) continue;
        const envelope: SaveEnvelope = JSON.parse(json);
        if (envelope.gameMode === gameMode) return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  /**
   * Get the auto-save for a specific game mode.
   */
  getAutoSave(gameMode: string): WarState | null {
    const state = this.load(0);
    if (state && state.gameMode === gameMode) return state;
    return null;
  }

  /**
   * Delete a save slot.
   */
  deleteSave(slot: number): void {
    if (slot < 0 || slot >= MAX_SLOTS) return;
    localStorage.removeItem(`${STORAGE_PREFIX}${slot}`);
    Logger.info('persistence', `Deleted save slot ${slot}`);
  }

  /**
   * Auto-save check. Call every frame; only actually saves on interval.
   */
  checkAutoSave(elapsedTime: number, getState: () => WarState): void {
    if (elapsedTime - this.lastAutoSaveTime < this.autoSaveInterval) return;
    this.lastAutoSaveTime = elapsedTime;
    this.save(0, getState());
  }
}
