// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { GameSystem } from '../../types';
import type { InputManager } from '../input/InputManager';
import type { HUDLayout } from '../../ui/layout/HUDLayout';
import type {
  AirSupportRadioAssetId,
  AirSupportRadioCooldowns,
  AirSupportTargetMarking,
} from '../airsupport/AirSupportRadioCatalog';
import {
  AIR_SUPPORT_RADIO_ASSETS,
  getAirSupportRadioAsset,
  radioAssetToSupportType,
} from '../airsupport/AirSupportRadioCatalog';
import type { AirSupportManager } from '../airsupport/AirSupportManager';
import { StrikeDesignationController } from '../airsupport/StrikeDesignationController';
import { CommandModeOverlay } from '../../ui/hud/CommandModeOverlay';
import { AirSupportRadioMenu } from '../../ui/hud/AirSupportRadioMenu';
import { RadioDialPresenter } from '../../ui/hud/radio/RadioDialPresenter';
import { RADIO_SLOT_OPEN_EVENT } from '../../ui/hud/radio/RadioHotbarSlot';
import type { RadioIntent } from '../../ui/hud/radio/RadioDialModel';
import type { InputMode } from '../input/InputManager';
import type { SquadCommandState } from './PlayerSquadController';
import { PlayerSquadController } from './PlayerSquadController';
import { SquadCommand, Faction } from './types';
import { getQuickCommandOption, requiresCommandTarget } from './SquadCommandPresentation';
import type { IZoneQuery, ITerrainRuntime } from '../../types/SystemInterfaces';
import type { CombatantSystem } from './CombatantSystem';
import type { GameModeManager } from '../world/GameModeManager';
import type { PlayerController } from '../player/PlayerController';
import { CommandHeldEquipmentBridge, type CommandHeldEquipmentConfig } from './CommandHeldEquipmentBridge';

export class CommandInputManager implements GameSystem {
  private static readonly MAP_UPDATE_INTERVAL = 1 / 20;

  private readonly playerSquadController: PlayerSquadController;
  private readonly commandModeOverlay: CommandModeOverlay;
  private readonly airSupportRadioMenu: AirSupportRadioMenu;
  private readonly radioDial: RadioDialPresenter;
  private readonly radioSlotOpenHandler: () => void;
  private dialVisible = false;
  private onStationTune?: (stationId: string) => void;
  private layout?: HUDLayout;
  private inputManager?: InputManager;
  private zoneQuery?: IZoneQuery;
  private combatantSystem?: CombatantSystem;
  private gameModeManager?: GameModeManager;
  private playerController?: PlayerController;
  private readonly heldEquipmentBridge = new CommandHeldEquipmentBridge();
  private airSupportManager?: AirSupportManager;
  private terrainSystem?: ITerrainRuntime;
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
  private selectedMarking: AirSupportTargetMarking = 'smoke';
  private pendingPlacementCommand: SquadCommand | null = null;
  private mapUpdateAccumulator = 0;
  private readonly mapDirection = new THREE.Vector3();
  private readonly mapPlayerPosition = new THREE.Vector3();
  private readonly radioOrigin = new THREE.Vector3();
  private readonly radioDir = new THREE.Vector3();
  private readonly radioTarget = new THREE.Vector3();
  private radioTargetValid = false;
  private radioTargetHasGround = false;
  // DESIGNATE -> CONFIRM call-in step (extracted; this manager only forwards).
  private readonly strikeDesignation = new StrikeDesignationController();
  private scene?: THREE.Scene;
  private radioCooldownAccumulator = 0;
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
      onRadioRequested: () => this.openRadioMenu(),
      onFireSupportSelected: (assetId) => this.beginStrikeDesignation(assetId, this.selectedMarking),
      onMarkingSelected: (marking) => this.setSelectedMarking(marking)
    });
    this.airSupportRadioMenu.setCallbacks({
      onCloseRequested: () => this.closeRadioMenu(),
      onAssetSelected: (selection) => {
        this.selectedMarking = selection.targetMarking;
        this.beginStrikeDesignation(selection.assetId, selection.targetMarking);
      }
    });

    this.radioDial = new RadioDialPresenter();
    this.radioDial.setCallbacks({
      onIntent: (intent, closesDial) => this.handleDialIntent(intent, closesDial),
      onCloseRequested: () => this.closeRadioDial(),
    });
    this.radioSlotOpenHandler = () => this.toggleRadioDial();
    document.addEventListener(RADIO_SLOT_OPEN_EVENT, this.radioSlotOpenHandler);

    this.strikeDesignation.setPickProvider(
      (out) => ({ ok: this.resolveCameraGroundPick(out), hasGround: this.radioTargetHasGround }),
      () => this.radioOrigin,
    );
    this.strikeDesignation.setFriendlyCountProvider((center, radius) => {
      const cs = this.combatantSystem;
      if (!cs) return 0;
      let count = 0;
      for (const id of cs.querySpatialRadius(center, radius)) {
        if (cs.getCombatantById(id)?.faction === Faction.US) count++;
      }
      return count;
    });

    this.unsubscribeCommandState = this.playerSquadController.onCommandStateChange((state) => {
      this.latestSquadState = state;
      this.radioDial.setSquadAvailable(state.hasSquad);
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
    if (this.radioVisible || this.overlayVisible || this.dialVisible) {
      this.radioCooldownAccumulator += deltaTime;
      if (this.radioCooldownAccumulator >= 0.1) {
        this.radioCooldownAccumulator = 0;
        this.feedRadioCooldowns();
      }
    }

    if (this.strikeDesignation.isActive()) {
      this.strikeDesignation.update(deltaTime);
      return;
    }

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
    document.removeEventListener(RADIO_SLOT_OPEN_EVENT, this.radioSlotOpenHandler);
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
    if (this.dialVisible) {
      this.dialVisible = false;
      this.closeOverlayTouchPassThrough();
    }
    this.heldEquipmentBridge.restore();
    this.commandModeOverlay.unmount();
    this.airSupportRadioMenu.unmount();
    this.radioDial.unmount();
    this.strikeDesignation.unmount();
    this.layout = undefined;
    this.commandModeOverlay.dispose();
    this.airSupportRadioMenu.dispose();
    this.radioDial.dispose();
    this.strikeDesignation.dispose();
  }

  mountTo(layout: HUDLayout): void {
    if (this.layout === layout) return;

    this.commandModeOverlay.unmount();
    this.airSupportRadioMenu.unmount();
    this.radioDial.unmount();
    this.layout = layout;
    this.commandModeOverlay.mount(document.body);
    this.airSupportRadioMenu.mount(document.body);
    this.radioDial.mount(document.body);
    this.strikeDesignation.mount(document.body);
  }

  setStationTuner(onTune: (stationId: string) => void): void {
    this.onStationTune = onTune;
  }

  setSelectedStation(stationId: string | null): void {
    this.radioDial.setSelectedStationId(stationId);
  }

  bindInputManager(inputManager: InputManager): void {
    this.inputManager = inputManager;
    this.unsubscribeInputMode?.();
    this.unsubscribeInputMode = inputManager.onInputModeChange((mode) => {
      this.inputMode = mode;
      this.commandModeOverlay.setInputMode(mode);
      // If the dial is open when the device flips, swap to the matching view.
      this.radioDial.setTouchMode(mode === 'touch');
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

  configureHeldEquipment(config: CommandHeldEquipmentConfig): void {
    this.heldEquipmentBridge.configure(config);
  }

  setAirSupportManager(airSupportManager: AirSupportManager): void {
    this.airSupportManager = airSupportManager;
    this.strikeDesignation.setAirSupportManager(airSupportManager);
  }

  setTerrainSystem(terrainSystem: ITerrainRuntime): void {
    this.terrainSystem = terrainSystem;
    this.strikeDesignation.setTerrainHeightProvider((x, z) => terrainSystem.getHeightAt(x, z) ?? 0);
  }

  /** Scene handle so the designate step can build its world target marker. */
  setScene(scene: THREE.Scene): void {
    this.scene = scene;
    this.strikeDesignation.setScene(scene);
  }

  handleStrikeConfirm(): boolean {
    return this.strikeDesignation.confirm();
  }

  onVisibilityChange(listener: (visible: boolean) => void): () => void {
    this.visibilityListeners.add(listener);
    listener(this.isModalVisible());
    return () => this.visibilityListeners.delete(listener);
  }

  toggleCommandMode(): void {
    // The unified radio is one surface for fire support AND squad orders, so it
    // opens even without a squad — the squad rows simply read NO SQUAD and stay
    // disabled while the fire-support section remains fully usable.
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
    const option = getQuickCommandOption(slot);
    if (option && requiresCommandTarget(option.command)) {
      // Look-to-mark: a target-requiring command fired from the hotkey (no map
      // open) pings where the player is looking — never the player's own feet.
      // Reuses the air-support camera->ground pick; no camera => silently ignored.
      if (this.resolveCameraGroundPick(this.radioTarget)) {
        this.playerSquadController.issueCommandAtPosition(option.command, this.radioTarget);
      }
      return;
    }
    this.playerSquadController.issueQuickCommand(slot);
  }

  handleCancel(): boolean {
    if (this.heldEquipmentBridge.cancelSmokeMarkerThrow()) {
      return true;
    }
    if (this.strikeDesignation.cancel()) {
      return true;
    }
    if (this.dialVisible) {
      this.closeRadioDial();
      return true;
    }
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
    if (this.heldEquipmentBridge.cancelSmokeMarkerThrow()) {
      return true;
    }
    if (this.strikeDesignation.cancel()) {
      return true;
    }
    if (this.dialVisible) {
      this.closeRadioDial();
      return true;
    }
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
    this.toggleRadioDial();
  }

  toggleRadioDial(): void {
    if (this.dialVisible) {
      this.closeRadioDial();
    } else {
      this.openRadioDial();
    }
  }

  setRadioCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    this.airSupportRadioMenu.setCooldowns(cooldowns);
    this.commandModeOverlay.setFireSupportCooldowns(cooldowns);
    this.radioDial.setCooldowns(cooldowns);
  }

  private setSelectedMarking(marking: AirSupportTargetMarking): void {
    this.selectedMarking = marking;
    this.commandModeOverlay.setSelectedMarking(marking);
    this.radioDial.setSelectedMarking(marking);
  }

  private openRadioDial(): void {
    if (this.overlayVisible) this.closeOverlay(false);
    if (this.radioVisible) this.closeRadioMenu(false);
    this.heldEquipmentBridge.show('radio');
    this.dialVisible = true;
    this.radioCooldownAccumulator = 0;
    this.resolveRadioTarget();
    this.feedRadioCooldowns();
    this.radioDial.setHasSmokeMark(this.heldEquipmentBridge.hasActiveSmokeMark());
    this.radioDial.setTouchMode(this.inputMode === 'touch');
    this.radioDial.open({
      marking: this.selectedMarking,
      squadAvailable: this.latestSquadState.hasSquad,
    });
    this.inputManager?.unlockPointer?.();
    this.openOverlayTouchPassThrough();
    this.emitVisibility();
  }

  private closeRadioDial(relockPointer = true): void {
    this.dialVisible = false;
    this.radioDial.close();
    this.closeOverlayTouchPassThrough();
    if (!this.heldEquipmentBridge.isSmokeMarkerHandlingInput()) {
      this.heldEquipmentBridge.restore();
    }
    if (relockPointer) this.inputManager?.relockPointer?.();
    this.emitVisibility();
  }

  private handleDialIntent(intent: RadioIntent, closesDial: boolean): void {
    if (intent.kind === 'squad') {
      if (requiresCommandTarget(intent.command)) {
        if (this.resolveCameraGroundPick(this.radioTarget)) {
          this.playerSquadController.issueCommandAtPosition(intent.command, this.radioTarget);
        }
      } else {
        this.playerSquadController.issueQuickCommand(intent.slot);
      }
    } else if (intent.kind === 'fire-support') {
      this.selectedMarking = intent.marking;
      if (intent.targetMode === 'current-smoke') {
        const mark = this.heldEquipmentBridge.getActiveSmokeMark();
        if (mark) this.beginStrikeDesignation(intent.assetId, intent.marking, mark.position);
        else {
          const asset = getAirSupportRadioAsset(intent.assetId);
          this.airSupportRadioMenu.setState({ selectedAssetId: intent.assetId, statusText: `${asset.label} needs a smoke marker` });
        }
      } else {
        this.beginStrikeDesignation(intent.assetId, intent.marking);
      }
    } else if (intent.kind === 'throw-smoke-marker') {
      if (this.heldEquipmentBridge.beginSmokeMarkerThrow()) {
        if (this.dialVisible) {
          this.dialVisible = false;
          this.radioDial.close();
          this.closeOverlayTouchPassThrough();
        }
        this.inputManager?.relockPointer?.();
        this.emitVisibility();
      }
    } else if (intent.kind === 'station') {
      this.onStationTune?.(intent.stationId);
    }
    if (closesDial && this.dialVisible) this.closeRadioDial();
  }

  private openOverlay(): void {
    if (this.radioVisible) {
      this.closeRadioMenu(false);
    }
    this.overlayVisible = true;
    this.pendingPlacementCommand = this.getDefaultPlacementCommand();
    this.mapUpdateAccumulator = CommandInputManager.MAP_UPDATE_INTERVAL;
    this.radioCooldownAccumulator = 0;
    this.resolveRadioTarget();
    this.feedRadioCooldowns();
    this.commandModeOverlay.setSelectedMarking(this.selectedMarking);
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
    this.radioCooldownAccumulator = 0;
    this.resolveRadioTarget();
    this.feedRadioCooldowns();
    this.inputManager?.unlockPointer?.();
    this.openOverlayTouchPassThrough();
    this.airSupportRadioMenu.setVisible(true);
    this.airSupportRadioMenu.setState({ statusText: this.describeRadioTarget() });
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

  private beginStrikeDesignation(
    assetId: AirSupportRadioAssetId,
    marking: AirSupportTargetMarking,
    fixedTarget?: THREE.Vector3
  ): void {
    if (this.dialVisible) this.closeRadioDial();
    else if (this.radioVisible) this.closeRadioMenu();
    else if (this.overlayVisible) this.closeOverlay();

    const outcome = fixedTarget
      ? this.strikeDesignation.beginAtTarget(assetId, marking, fixedTarget)
      : this.strikeDesignation.begin(assetId, marking);
    if (outcome !== 'designating') {
      const asset = getAirSupportRadioAsset(assetId);
      const supportType = radioAssetToSupportType[assetId];
      const remaining = supportType
        ? Math.ceil(this.airSupportManager?.getCooldownRemaining(supportType) ?? 0)
        : 0;
      const status = outcome === 'rejected'
        ? `${asset.label} unavailable (${remaining}s)`
        : `${asset.label} selected`;
      this.airSupportRadioMenu.setState({ selectedAssetId: assetId, statusText: status });
    }
  }

  private resolveRadioTarget(): void {
    this.radioTargetValid = this.resolveCameraGroundPick(this.radioTarget);
  }

  private resolveCameraGroundPick(out: THREE.Vector3): boolean {
    if (!this.playerController) return false;

    const camera = this.playerController.getCamera();
    if (typeof camera?.getWorldPosition !== 'function') return false;
    camera.getWorldPosition(this.radioOrigin);
    camera.getWorldDirection(this.radioDir);

    const sampleHeight = (x: number, z: number): number =>
      this.terrainSystem?.getHeightAt(x, z) ?? 0;

    const STEP = 8;
    const MAX_RANGE = 2000;
    for (let d = STEP; d <= MAX_RANGE; d += STEP) {
      const x = this.radioOrigin.x + this.radioDir.x * d;
      const y = this.radioOrigin.y + this.radioDir.y * d;
      const z = this.radioOrigin.z + this.radioDir.z * d;
      const groundY = sampleHeight(x, z);
      if (y <= groundY) {
        out.set(x, groundY, z);
        this.radioTargetHasGround = true;
        return true;
      }
    }

    const horiz = Math.hypot(this.radioDir.x, this.radioDir.z) || 1;
    const fx = this.radioOrigin.x + (this.radioDir.x / horiz) * 200;
    const fz = this.radioOrigin.z + (this.radioDir.z / horiz) * 200;
    out.set(fx, sampleHeight(fx, fz), fz);
    this.radioTargetHasGround = false;
    return true;
  }

  private describeRadioTarget(): string {
    if (!this.radioTargetValid) return 'Select aircraft and target mark';
    return `Target ${Math.round(this.radioTarget.x)}, ${Math.round(this.radioTarget.z)} - select aircraft`;
  }

  private feedRadioCooldowns(): void {
    if (!this.airSupportManager) return;
    const cooldowns: AirSupportRadioCooldowns = {};
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const type = radioAssetToSupportType[asset.id];
      cooldowns[asset.id] = type ? this.airSupportManager.getCooldownRemaining(type) : 0;
    }
    this.setRadioCooldowns(cooldowns);
  }

  private getDefaultPlacementCommand(): SquadCommand | null {
    if (requiresCommandTarget(this.latestSquadState.currentCommand)) {
      return this.latestSquadState.currentCommand;
    }
    return null;
  }

  private isModalVisible(): boolean {
    return this.overlayVisible || this.radioVisible || this.dialVisible;
  }
}
