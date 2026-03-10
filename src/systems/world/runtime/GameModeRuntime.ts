import {
  GameMode,
  GameModeConfig,
  GameModeDefinition,
  MapIntelPolicyConfig
} from '../../../config/gameModeTypes';
import { Logger } from '../../../utils/Logger';
import type { InfluenceMapSystem } from '../../combat/InfluenceMapSystem';
import type { CombatantSystem } from '../../combat/CombatantSystem';
import { isOpfor } from '../../combat/types';
import type { HUDSystem } from '../../../ui/hud/HUDSystem';
import type { PlayerController } from '../../player/PlayerController';
import type { PlayerRespawnManager } from '../../player/PlayerRespawnManager';
import type { WarSimulator } from '../../strategy/WarSimulator';
import type { ITerrainRuntimeController } from '../../../types/SystemInterfaces';
import type { MinimapSystem } from '../../../ui/minimap/MinimapSystem';
import type { TicketSystem } from '../TicketSystem';
import type { ZoneManager } from '../ZoneManager';

export interface GameModeRuntimeSystems {
  zoneManager?: ZoneManager;
  combatantSystem?: CombatantSystem;
  ticketSystem?: TicketSystem;
  terrainSystem?: ITerrainRuntimeController;
  minimapSystem?: MinimapSystem;
  influenceMapSystem?: InfluenceMapSystem;
  warSimulator?: WarSimulator;
  hudSystem?: HUDSystem;
  playerController?: PlayerController;
  playerRespawnManager?: PlayerRespawnManager;
}

export interface GameModeRuntimeServices {
  applyMapIntelPolicy(policy: MapIntelPolicyConfig): void;
}

export interface GameModeRuntimeContext extends GameModeRuntimeSystems {
  definition: GameModeDefinition;
  mode: GameMode;
  config: GameModeConfig;
  previousDefinition?: GameModeDefinition;
  previousMode?: GameMode;
  previousConfig?: GameModeConfig;
  nextDefinition?: GameModeDefinition;
  nextMode?: GameMode;
  nextConfig?: GameModeConfig;
  services: GameModeRuntimeServices;
}

export interface GameModeRuntime {
  readonly definition: GameModeDefinition;
  onEnter?(context: GameModeRuntimeContext): void;
  onExit?(context: GameModeRuntimeContext): void;
  onReapply?(context: GameModeRuntimeContext): void;
  update?(context: GameModeRuntimeContext, deltaTime: number, gameStarted: boolean): void;
}

class PolicyBackedGameModeRuntime implements GameModeRuntime {
  constructor(public readonly definition: GameModeDefinition) {}

  onEnter(context: GameModeRuntimeContext): void {
    context.services.applyMapIntelPolicy(this.definition.policies.mapIntel);
  }

  onReapply(context: GameModeRuntimeContext): void {
    context.services.applyMapIntelPolicy(this.definition.policies.mapIntel);
  }
}

class AShauValleyRuntime extends PolicyBackedGameModeRuntime {
  private noContactMs = 0;
  private lastAssistAtMs = 0;
  private readonly contactRadius = 250;
  private readonly assistDelayMs = 60_000;
  private readonly assistCooldownMs = 90_000;

  override onEnter(context: GameModeRuntimeContext): void {
    super.onEnter(context);
    this.resetAssistState();
  }

  onExit(context: GameModeRuntimeContext): void {
    void context;
    this.resetAssistState();
  }

  override onReapply(context: GameModeRuntimeContext): void {
    super.onReapply(context);
    this.resetAssistState();
  }

  update(context: GameModeRuntimeContext, deltaTime: number, gameStarted: boolean): void {
    if (!gameStarted) {
      this.noContactMs = 0;
      return;
    }

    const respawnPolicy = context.definition.policies.respawn;
    if (respawnPolicy.contactAssistStyle !== 'pressure_front') {
      this.noContactMs = 0;
      return;
    }

    const playerController = context.playerController;
    const combatantSystem = context.combatantSystem;
    if (!playerController || !combatantSystem) {
      return;
    }

    const playerPos = playerController.getPosition();
    const contactRadiusSq = this.contactRadius * this.contactRadius;
    const hasNearbyOpfor = combatantSystem.getAllCombatants().some(combatant => {
      if (!isOpfor(combatant.faction) || combatant.state === 'dead' || combatant.health <= 0) {
        return false;
      }

      const dx = combatant.position.x - playerPos.x;
      const dz = combatant.position.z - playerPos.z;
      return (dx * dx + dz * dz) <= contactRadiusSq;
    });

    if (hasNearbyOpfor) {
      this.noContactMs = 0;
      return;
    }

    this.noContactMs += deltaTime * 1000;
    const now = Date.now();
    if (this.noContactMs < this.assistDelayMs) {
      return;
    }
    if (now - this.lastAssistAtMs < this.assistCooldownMs) {
      return;
    }

    const suggested = context.playerRespawnManager?.getPolicyDrivenInsertionSuggestion?.({ minOpfor250: 1 });
    if (!suggested) {
      return;
    }

    context.hudSystem?.showMessage('No nearby contact. Open the map and redeploy to the active front.', 5000);
    Logger.info('GameModeRuntime', 'A Shau contact assist suggested a manual frontline redeploy');
    this.noContactMs = 0;
    this.lastAssistAtMs = now;
  }

  private resetAssistState(): void {
    this.noContactMs = 0;
    this.lastAssistAtMs = 0;
  }
}

export function createGameModeRuntime(definition: GameModeDefinition): GameModeRuntime {
  if (definition.id === GameMode.A_SHAU_VALLEY) {
    return new AShauValleyRuntime(definition);
  }
  return new PolicyBackedGameModeRuntime(definition);
}
