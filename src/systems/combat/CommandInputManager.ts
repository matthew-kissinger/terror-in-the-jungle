import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { InputManager } from '../input/InputManager';
import type { HUDLayout } from '../../ui/layout/HUDLayout';
import { QuickCommandStrip } from '../../ui/hud/QuickCommandStrip';
import { CommandModeOverlay } from '../../ui/hud/CommandModeOverlay';
import type { InputMode } from '../input/InputManager';
import type { SquadCommandState } from './PlayerSquadController';
import { PlayerSquadController } from './PlayerSquadController';
import { SquadCommand } from './types';
import { getQuickCommandOption, requiresCommandTarget } from './SquadCommandPresentation';
import type { ZoneManager } from '../world/ZoneManager';
import type { CombatantSystem } from './CombatantSystem';
import type { GameModeManager } from '../world/GameModeManager';
import type { PlayerController } from '../player/PlayerController';

export class CommandInputManager implements GameSystem {
  private static readonly MAP_UPDATE_INTERVAL = 1 / 20;

  private readonly playerSquadController: PlayerSquadController;
  private readonly quickCommandStrip: QuickCommandStrip;
  private readonly commandModeOverlay: CommandModeOverlay;
  private layout?: HUDLayout;
  private inputManager?: InputManager;
  private zoneManager?: ZoneManager;
  private combatantSystem?: CombatantSystem;
  private gameModeManager?: GameModeManager;
  private playerController?: PlayerController;
  private inputMode: InputMode = 'keyboardMouse';
  private latestSquadState: SquadCommandState = {
    hasSquad: false,
    currentCommand: SquadCommand.NONE,
    isCommandModeOpen: false,
    memberCount: 0,
    commandPosition: undefined
  };
  private overlayVisible = false;
  private pendingPlacementCommand: SquadCommand | null = null;
  private mapUpdateAccumulator = 0;
  private readonly mapDirection = new THREE.Vector3();
  private readonly mapPlayerPosition = new THREE.Vector3();
  private unsubscribeCommandState?: () => void;
  private unsubscribeInputMode?: () => void;

  constructor(playerSquadController: PlayerSquadController) {
    this.playerSquadController = playerSquadController;
    this.quickCommandStrip = new QuickCommandStrip();
    this.commandModeOverlay = new CommandModeOverlay();
    this.quickCommandStrip.setCallbacks({
      onCommandModeRequested: () => this.toggleCommandMode(),
      onQuickCommandSelected: (slot) => this.issueQuickCommand(slot)
    });
    this.commandModeOverlay.setCallbacks({
      onQuickCommandSelected: (slot) => this.handleOverlayCommandSelection(slot),
      onMapPointSelected: (position) => this.applyPlacementCommand(position),
      onCloseRequested: () => this.closeOverlay()
    });

    this.unsubscribeCommandState = this.playerSquadController.onCommandStateChange((state) => {
      this.latestSquadState = state;
      if (!state.hasSquad && this.overlayVisible) {
        this.closeOverlay(false);
      } else {
        this.syncPresentation();
      }
    });
  }

  async init(): Promise<void> {
    this.latestSquadState = this.playerSquadController.getCommandState();
    this.syncPresentation();
  }

  update(deltaTime: number): void {
    if (!this.overlayVisible || !this.playerController) return;

    this.mapUpdateAccumulator += deltaTime;
    if (this.mapUpdateAccumulator < CommandInputManager.MAP_UPDATE_INTERVAL) {
      return;
    }

    this.mapUpdateAccumulator = 0;
    const camera = this.playerController.getCamera();
    const playerPosition = this.playerController.getPosition(this.mapPlayerPosition);
    const direction = camera.getWorldDirection(this.mapDirection);
    const playerRotation = Math.atan2(direction.x, -direction.z);
    const minimapScale = this.gameModeManager?.getCurrentConfig().minimapScale ?? 320;

    this.commandModeOverlay.setMapState({
      playerPosition,
      playerRotation,
      worldSize: minimapScale,
      zoneManager: this.zoneManager,
      combatantSystem: this.combatantSystem,
      playerSquadId: this.playerSquadController.getPlayerSquadId(),
      commandPosition: this.latestSquadState.commandPosition
    });
  }

  dispose(): void {
    this.unsubscribeCommandState?.();
    this.unsubscribeInputMode?.();
    if (this.layout) {
      this.layout.unregister(this.quickCommandStrip);
      this.layout.unregister(this.commandModeOverlay);
    }
    this.commandModeOverlay.dispose();
    this.quickCommandStrip.dispose();
  }

  mountTo(layout: HUDLayout): void {
    if (this.layout === layout) return;

    if (this.layout) {
      this.layout.unregister(this.quickCommandStrip);
      this.layout.unregister(this.commandModeOverlay);
    }

    this.layout = layout;
    this.layout.register({
      region: 'command-bar',
      component: this.quickCommandStrip,
      showContext: 'infantry'
    });
    this.layout.register({
      region: 'center',
      component: this.commandModeOverlay,
      showContext: 'infantry'
    });
  }

  bindInputManager(inputManager: InputManager): void {
    this.inputManager = inputManager;
    this.unsubscribeInputMode?.();
    this.unsubscribeInputMode = inputManager.onInputModeChange((mode) => {
      this.inputMode = mode;
      if (mode === 'gamepad' && this.overlayVisible) {
        this.closeOverlay(false);
      }
      this.quickCommandStrip.setInputMode(mode);
      this.commandModeOverlay.setInputMode(mode);
      this.syncPresentation();
    });
  }

  setZoneManager(zoneManager: ZoneManager): void {
    this.zoneManager = zoneManager;
  }

  setCombatantSystem(combatantSystem: CombatantSystem): void {
    this.combatantSystem = combatantSystem;
  }

  setGameModeManager(gameModeManager: GameModeManager): void {
    this.gameModeManager = gameModeManager;
  }

  setPlayerController(playerController: PlayerController): void {
    this.playerController = playerController;
  }

  toggleCommandMode(): void {
    if (!this.latestSquadState.hasSquad) return;
    if (this.inputMode === 'gamepad') {
      this.playerSquadController.toggleCommandModeSurface();
      return;
    }
    if (this.overlayVisible) {
      this.closeOverlay();
    } else {
      this.openOverlay();
    }
  }

  issueQuickCommand(slot: number): void {
    this.playerSquadController.issueQuickCommand(slot);
    if (this.overlayVisible) {
      this.closeOverlay();
    }
  }

  handleCancel(): boolean {
    if (this.overlayVisible) {
      this.closeOverlay();
      return true;
    }
    if (this.latestSquadState.isCommandModeOpen) {
      this.playerSquadController.closeCommandModeSurface();
      return true;
    }
    return false;
  }

  private openOverlay(): void {
    this.overlayVisible = true;
    this.pendingPlacementCommand = this.getDefaultPlacementCommand();
    this.mapUpdateAccumulator = CommandInputManager.MAP_UPDATE_INTERVAL;
    this.inputManager?.unlockPointer();
    this.commandModeOverlay.setVisible(true);
    this.syncPresentation();
  }

  private closeOverlay(relockPointer = true): void {
    this.overlayVisible = false;
    this.pendingPlacementCommand = this.getDefaultPlacementCommand();
    this.commandModeOverlay.setVisible(false);
    if (relockPointer) {
      this.inputManager?.relockPointer();
    }
    this.syncPresentation();
  }

  private syncPresentation(): void {
    const mergedState = {
      ...this.latestSquadState,
      isCommandModeOpen: this.overlayVisible || this.latestSquadState.isCommandModeOpen
    };
    this.quickCommandStrip.setState(mergedState);
    this.commandModeOverlay.setState({
      hasSquad: mergedState.hasSquad,
      currentCommand: mergedState.currentCommand,
      memberCount: mergedState.memberCount,
      commandPosition: mergedState.commandPosition
        ? { x: mergedState.commandPosition.x, z: mergedState.commandPosition.z }
        : null,
      pendingCommand: this.pendingPlacementCommand
    });
  }

  private handleOverlayCommandSelection(slot: number): void {
    const option = getQuickCommandOption(slot);
    if (!option) return;

    if (requiresCommandTarget(option.command)) {
      this.pendingPlacementCommand = option.command;
      this.syncPresentation();
      return;
    }

    this.issueQuickCommand(slot);
  }

  private applyPlacementCommand(position: THREE.Vector3): void {
    if (!this.pendingPlacementCommand || !requiresCommandTarget(this.pendingPlacementCommand)) {
      return;
    }

    this.playerSquadController.issueCommandAtPosition(
      this.pendingPlacementCommand,
      position
    );
    this.closeOverlay();
  }

  private getDefaultPlacementCommand(): SquadCommand | null {
    if (requiresCommandTarget(this.latestSquadState.currentCommand)) {
      return this.latestSquadState.currentCommand;
    }
    return null;
  }
}
