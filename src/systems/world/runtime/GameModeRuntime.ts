import {
  GameMode,
  GameModeConfig,
  GameModeDefinition,
  MapIntelPolicyConfig
} from '../../../config/gameModeTypes';
import type { InfluenceMapSystem } from '../../combat/InfluenceMapSystem';
import type { CombatantSystem } from '../../combat/CombatantSystem';
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
}

export class PolicyBackedGameModeRuntime implements GameModeRuntime {
  constructor(public readonly definition: GameModeDefinition) {}

  onEnter(context: GameModeRuntimeContext): void {
    context.services.applyMapIntelPolicy(this.definition.policies.mapIntel);
  }

  onReapply(context: GameModeRuntimeContext): void {
    context.services.applyMapIntelPolicy(this.definition.policies.mapIntel);
  }
}

export function createGameModeRuntime(definition: GameModeDefinition): GameModeRuntime {
  return new PolicyBackedGameModeRuntime(definition);
}
