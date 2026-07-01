// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import type { GameModeManager } from '../world/GameModeManager';
import type { HelicopterModel } from '../helicopter/HelicopterModel';
import type { FixedWingModel } from '../vehicle/FixedWingModel';
import type { FirstPersonWeapon } from './FirstPersonWeapon';
import type { HUDSystem } from '../../ui/hud/HUDSystem';
import type { IGameRenderer, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { InventoryManager } from './InventoryManager';
import type { GrenadeSystem } from '../weapons/GrenadeSystem';
import type { SmokeMarkerSystem } from '../weapons/SmokeMarkerSystem';
import type { MortarSystem } from '../weapons/MortarSystem';
import type { SandbagSystem } from '../weapons/SandbagSystem';
import type { CameraShakeSystem } from '../effects/CameraShakeSystem';
import type { RallyPointSystem } from '../combat/RallyPointSystem';
import type { FootstepAudioSystem } from '../audio/FootstepAudioSystem';
import type { PlayerSquadController } from '../combat/PlayerSquadController';
import type { CommandInputManager } from '../combat/CommandInputManager';
import type { AirSupportManager } from '../airsupport/AirSupportManager';
import type { TicketSystem } from '../world/TicketSystem';
import type { FullMapSystem } from '../../ui/map/FullMapSystem';

export interface PlayerCombatControllerDependencies {
  helicopterModel?: HelicopterModel;
  fixedWingModel?: FixedWingModel;
  firstPersonWeapon?: FirstPersonWeapon;
  hudSystem?: HUDSystem;
  inventoryManager?: InventoryManager;
  grenadeSystem?: GrenadeSystem;
  smokeMarkerSystem?: SmokeMarkerSystem;
  mortarSystem?: MortarSystem;
  sandbagSystem?: SandbagSystem;
  ticketSystem?: TicketSystem;
}

export interface PlayerVehicleControllerDependencies {
  helicopterModel?: HelicopterModel;
  fixedWingModel?: FixedWingModel;
  hudSystem?: HUDSystem;
  airSupportManager?: AirSupportManager;
  requestVehicleExit?: () => boolean;
}

export interface PlayerControllerDependencies {
  terrainSystem: ITerrainRuntime;
  gameModeManager: GameModeManager;
  helicopterModel: HelicopterModel;
  fixedWingModel?: FixedWingModel;
  firstPersonWeapon: FirstPersonWeapon;
  hudSystem: HUDSystem;
  ticketSystem: TicketSystem;
  renderer?: IGameRenderer;
  inventoryManager: InventoryManager;
  grenadeSystem: GrenadeSystem;
  smokeMarkerSystem?: SmokeMarkerSystem;
  mortarSystem: MortarSystem;
  sandbagSystem: SandbagSystem;
  cameraShakeSystem: CameraShakeSystem;
  rallyPointSystem?: RallyPointSystem;
  footstepAudioSystem: FootstepAudioSystem;
  playerSquadController: PlayerSquadController;
  commandInputManager: CommandInputManager;
  fullMapSystem: FullMapSystem;
  airSupportManager?: AirSupportManager;
}
