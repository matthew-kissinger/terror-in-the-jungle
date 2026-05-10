import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { InputManager } from '../input/InputManager';
import type { HUDLayout } from '../../ui/layout/HUDLayout';
import type { AirSupportRadioCooldowns } from '../airsupport/AirSupportRadioCatalog';
import { CommandModeOverlay } from '../../ui/hud/CommandModeOverlay';
import { AirSupportRadioMenu, type AirSupportRadioSelection } from '../../ui/hud/AirSupportRadioMenu';
import type { InputMode } from '../input/InputManager';
import type { SquadCommandState } from './PlayerSquadController';
import { PlayerSquadController } from './PlayerSquadController';
import { SquadCommand } from './types';
import { getQuickCommandOption, requiresCommandTarget } from './SquadCommandPresentation';
import type { IZoneQuery } from '../../types/SystemInterfaces';
import type { CombatantSystem } from './CombatantSystem';
import type { GameModeManager } from '../world/GameModeManager';
import type { PlayerController } from '../player/PlayerController';

export class CommandInputManager implements GameSystem {
  private static readonly MAP_UPDATE_INTERVAL = 1 / 20;

  private readonly playerSquadController: PlayerSquadController;
  private readonly commandModeOverlay: CommandModeOverlay;
  private readonly airSupportRadioMenu: AirSupportRadioMenu;
  private layout?: HUDLayout;
  private inputManager?: InputManager;
  private zoneQuery?: IZoneQuery;
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
  private radioVisible = false;
  private pendingPlacementCommand: SquadCommand | null = null;
  private mapUpdateAccumulator = 0;
  private readonly mapDirection = new THREE.Vector3();
  private readonly mapPlayerPosition = new THREE.Vector3();
  private unsubscribeCommandState?: () => void;
  private unsubscribeInputMode?: () => void;
  private visibilityListeners = new Set<(visible: boolean) => void>();

  constructor(playerSquadController: PlayerSquadController) {
    this.playerSquadController = playerSquadController;
    this.commandModeOverlay = new CommandModeOverlay();
    this.airSupportRadioMenu = new AirSupportRadioMenu();
    this.commandModeOverlay.setCallbacks({
      onQuickCommandSelected: (slot) => this.handleOverlayCommandSelection(slot),
      onMapPointSelected: (position) => this.applyPlacementCommand(position),
      onSquadSelected: (squadId) => this.handleSquadSelection(squadId),
      onCloseRequested: () => this.closeOverlay(),
      onRadioRequested: () => this.openRadioMenu()
    });
    this.airSupportRadioMenu.setCallbacks({
      onCloseRequested: () => this.closeRadioMenu(),
      onAssetSelected: (selection) => this.handleRadioSelection(selection)
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

    if (this.inputMode === 'gamepad') {
      const movement = this.inputManager?.getGamepadManager()?.getMovementVector();
      if (movement && (movement.x !== 0 || movement.z !== 0)) {
        this.commandModeOverlay.nudgeGamepadCursor(movement.x, movement.z, deltaTime);
      }
    }

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
      zoneQuery: this.zoneQuery,
      combatantSystem: this.combatantSystem,
      playerSquadId: this.playerSquadController.getPlayerSquadId(),
      commandPosition: this.latestSquadState.commandPosition
    });
  }

  dispose(): void {
    this.unsubscribeCommandState?.();
    this.unsubscribeInputMode?.();
    if (this.overlayVisible) {
      this.overlayVisible = false;
      this.closeOverlayTouchPassThrough();
      this.commandModeOverlay.setVisible(false);
    }
    if (this.radioVisible) {
      this.radioVisible = false;
      this.closeOverlayTouchPassThrough();
      this.airSupportRadioMenu.setVisible(false);
    }
    this.commandModeOverlay.unmount();
    this.airSupportRadioMenu.unmount();
    this.layout = undefined;
    this.commandModeOverlay.dispose();
    this.airSupportRadioMenu.dispose();
  }

  mountTo(layout: HUDLayout): void {
    if (this.layout === layout) return;

    this.commandModeOverlay.unmount();
    this.airSupportRadioMenu.unmount();
    this.layout = layout;
    this.commandModeOverlay.mount(document.body);
    this.airSupportRadioMenu.mount(document.body);
  }

  bindInputManager(inputManager: InputManager): void {
    this.inputManager = inputManager;
    this.unsubscribeInputMode?.();
    this.unsubscribeInputMode = inputManager.onInputModeChange((mode) => {
      this.inputMode = mode;
      this.commandModeOverlay.setInputMode(mode);
      this.syncPresentation();
    });
  }

  setZoneQuery(zoneQuery: IZoneQuery): void {
    this.zoneQuery = zoneQuery;
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

  onVisibilityChange(listener: (visible: boolean) => void): () => void {
    this.visibilityListeners.add(listener);
    listener(this.isModalVisible());
    return () => this.visibilityListeners.delete(listener);
  }

  toggleCommandMode(): void {
    if (!this.latestSquadState.hasSquad) return;
    if (this.overlayVisible) {
      this.closeOverlay();
    } else {
      this.openOverlay();
    }
  }

  issueQuickCommand(slot: number): void {
    if (this.overlayVisible) {
      this.handleOverlayCommandSelection(slot);
      return;
    }
    this.playerSquadController.issueQuickCommand(slot);
    if (this.overlayVisible) {
      this.closeOverlay();
    }
  }

  handleCancel(): boolean {
    if (this.radioVisible) {
      this.closeRadioMenu();
      return true;
    }
    if (this.overlayVisible) {
      this.closeOverlay();
      return true;
    }
    return false;
  }

  handlePrimaryConfirm(): boolean {
    if (!this.overlayVisible || this.inputMode !== 'gamepad') {
      return false;
    }
    return this.commandModeOverlay.confirmGamepadAction();
  }

  handleSecondarySelect(): boolean {
    if (!this.overlayVisible || this.inputMode !== 'gamepad') {
      return false;
    }
    return this.commandModeOverlay.selectSquadAtCursor();
  }

  handleGamepadCancel(): boolean {
    if (this.radioVisible) {
      this.closeRadioMenu();
      return true;
    }
    if (!this.overlayVisible || this.inputMode !== 'gamepad') {
      return false;
    }
    this.closeOverlay();
    return true;
  }

  toggleRadioMenu(): void {
    if (this.radioVisible) {
      this.closeRadioMenu();
    } else {
      this.openRadioMenu();
    }
  }

  setRadioCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    this.airSupportRadioMenu.setCooldowns(cooldowns);
  }

  private openOverlay(): void {
    if (this.radioVisible) {
      this.closeRadioMenu(false);
    }
    this.overlayVisible = true;
    this.pendingPlacementCommand = this.getDefaultPlacementCommand();
    this.mapUpdateAccumulator = CommandInputManager.MAP_UPDATE_INTERVAL;
    this.inputManager?.unlockPointer?.();
    this.openOverlayTouchPassThrough();
    this.commandModeOverlay.setVisible(true);
    this.emitVisibility();
    this.syncPresentation();
  }

  private closeOverlay(relockPointer = true): void {
    this.overlayVisible = false;
    this.pendingPlacementCommand = this.getDefaultPlacementCommand();
    this.commandModeOverlay.setVisible(false);
    this.closeOverlayTouchPassThrough();
    if (relockPointer) {
      this.inputManager?.relockPointer?.();
    }
    this.emitVisibility();
    this.syncPresentation();
  }

  private openRadioMenu(): void {
    if (this.overlayVisible) {
      this.closeOverlay(false);
    }
    this.radioVisible = true;
    this.inputManager?.unlockPointer?.();
    this.openOverlayTouchPassThrough();
    this.airSupportRadioMenu.setVisible(true);
    this.airSupportRadioMenu.setState({ statusText: 'Select aircraft and target mark' });
    this.emitVisibility();
  }

  private closeRadioMenu(relockPointer = true): void {
    this.radioVisible = false;
    this.airSupportRadioMenu.setVisible(false);
    this.closeOverlayTouchPassThrough();
    if (relockPointer) {
      this.inputManager?.relockPointer?.();
    }
    this.emitVisibility();
  }

  /** Let squad / tactical map receive touches above body-level touch controls (see TouchControls.beginModalOverlays). */
  private openOverlayTouchPassThrough(): void {
    this.inputManager?.getTouchControls()?.beginModalOverlays();
  }

  private closeOverlayTouchPassThrough(): void {
    this.inputManager?.getTouchControls()?.endModalOverlays();
  }

  private syncPresentation(): void {
    const mergedState = {
      ...this.latestSquadState,
      isCommandModeOpen: this.overlayVisible
    };
    this.commandModeOverlay.setState({
      hasSquad: mergedState.hasSquad,
      currentCommand: mergedState.currentCommand,
      memberCount: mergedState.memberCount,
      commandPosition: mergedState.commandPosition
        ? { x: mergedState.commandPosition.x, z: mergedState.commandPosition.z }
        : null,
      pendingCommand: this.pendingPlacementCommand,
      selectedSquadId: mergedState.selectedSquadId ?? null,
      selectedLeaderId: mergedState.selectedLeaderId ?? null,
      selectedFormation: mergedState.selectedFormation ?? null,
      selectedFaction: mergedState.selectedFaction ?? null
    });
  }

  private emitVisibility(): void {
    for (const listener of this.visibilityListeners) {
      listener(this.isModalVisible());
    }
  }

  private handleOverlayCommandSelection(slot: number): void {
    const option = getQuickCommandOption(slot);
    if (!option) return;

    if (requiresCommandTarget(option.command)) {
      this.pendingPlacementCommand = option.command;
      this.syncPresentation();
      return;
    }

    this.playerSquadController.issueQuickCommand(slot);
    this.closeOverlay();
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

  private handleSquadSelection(squadId: string): void {
    if (this.playerSquadController.selectSquad(squadId)) {
      this.syncPresentation();
      this.mapUpdateAccumulator = CommandInputManager.MAP_UPDATE_INTERVAL;
    }
  }

  private handleRadioSelection(selection: AirSupportRadioSelection): void {
    const marking = selection.targetMarking.replace(/_/g, ' ').toUpperCase();
    this.airSupportRadioMenu.setState({
      selectedAssetId: selection.assetId,
      selectedMarking: selection.targetMarking,
      statusText: `${marking} target mark selected`,
    });
  }

  private getDefaultPlacementCommand(): SquadCommand | null {
    if (requiresCommandTarget(this.latestSquadState.currentCommand)) {
      return this.latestSquadState.currentCommand;
    }
    return null;
  }

  private isModalVisible(): boolean {
    return this.overlayVisible || this.radioVisible;
  }
}
