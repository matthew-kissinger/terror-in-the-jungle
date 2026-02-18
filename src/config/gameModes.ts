import { getSandboxConfig, isSandboxMode } from '../core/SandboxModeDetector';
import { GameMode, GameModeConfig } from './gameModeTypes';
import { ZONE_CONTROL_CONFIG } from './ZoneControlConfig';
import { OPEN_FRONTIER_CONFIG } from './OpenFrontierConfig';
import { TEAM_DEATHMATCH_CONFIG } from './TeamDeathmatchConfig';
import { AI_SANDBOX_CONFIG } from './AiSandboxConfig';
import { A_SHAU_VALLEY_CONFIG } from './AShauValleyConfig';

// Re-export all types and configs for backward compatibility
export * from './gameModeTypes';
export * from './ZoneControlConfig';
export * from './OpenFrontierConfig';
export * from './TeamDeathmatchConfig';
export * from './AiSandboxConfig';
export * from './AShauValleyConfig';

/**
 * Helper function to get config by mode.
 * This function orchestrates the selection of game mode configurations,
 * including dynamic overrides for sandbox mode.
 */
export function getGameModeConfig(mode: GameMode): GameModeConfig {
  switch (mode) {
    case GameMode.ZONE_CONTROL:
      return ZONE_CONTROL_CONFIG;
    case GameMode.OPEN_FRONTIER:
      return OPEN_FRONTIER_CONFIG;
    case GameMode.TEAM_DEATHMATCH:
      return TEAM_DEATHMATCH_CONFIG;
    case GameMode.AI_SANDBOX: {
      if (isSandboxMode()) {
        const sandboxConfig = getSandboxConfig();
        return {
          ...AI_SANDBOX_CONFIG,
          maxCombatants: sandboxConfig.npcCount
        };
      }
      return AI_SANDBOX_CONFIG;
    }
    case GameMode.A_SHAU_VALLEY:
      return A_SHAU_VALLEY_CONFIG;
    default:
      return ZONE_CONTROL_CONFIG;
  }
}