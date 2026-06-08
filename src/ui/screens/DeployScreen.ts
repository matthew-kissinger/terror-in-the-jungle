// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * DeployScreen - Hero map + compact sidebar.
 *
 * Replaces old RespawnUI. Two modes:
 * - 'initial': full sidebar with loadout, sequence, legend
 * - 'respawn': stripped to map + spawn + countdown deploy button
 *
 * Exposes the same API surface that PlayerRespawnManager expects.
 */

import { UIComponent } from '../engine/UIComponent';
import type { DeploySessionModel } from '../../systems/world/runtime/DeployFlowSession';
import type { LoadoutPresentationModel } from '../../systems/player/LoadoutService';
import type { RespawnSpawnPoint } from '../../systems/player/RespawnSpawnPoint';
import {
  AmmoLoad,
  AMMO_LOAD_OPTIONS,
  getAmmoLoadLabel,
  getAmmoLoadShortLabel,
  getEquipmentLabel,
  getEquipmentShortLabel,
  getWeaponLabel,
  getWeaponShortLabel,
  LoadoutEquipment,
  LoadoutWeapon,
  type LoadoutFieldKey,
  type PlayerLoadout,
  type VehicleDeployOption,
} from '../loadout/LoadoutTypes';
import { icon } from '../icons/IconRegistry';
import styles from './DeployScreen.module.css';
import { ArmoryCharacterPreview } from './deploy/ArmoryCharacterPreview';
import {
  createDiv,
  createHeading,
  createMetaRow,
  makeActionButton,
  makeSmallButton,
} from './deploy/DeployDomFactory';
import {
  groupSpawnPoints,
  makeSpawnOptionButton,
  makeVehicleOptionButton,
  type DeploySpawnListContext,
} from './deploy/DeploySpawnList';

interface LoadoutFieldControl {
  value: HTMLDivElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  availability: HTMLDivElement;
  optionButtons: HTMLButtonElement[];
}

type DeployScreenView = 'insertion' | 'armory';
type ArmoryPreviewSlot = 'primary' | 'secondary' | 'equipment' | 'ammo';
type LoadoutSelectionValue = LoadoutWeapon | LoadoutEquipment | AmmoLoad;

interface ArmoryPreviewControl {
  visual: HTMLDivElement;
  icon: HTMLImageElement;
  fallback: HTMLSpanElement;
  value: HTMLDivElement;
  meta: HTMLDivElement;
}

const LOADOUT_FIELD_ORDER: Array<{ key: LoadoutFieldKey; label: string }> = [
  { key: 'primaryWeapon', label: 'Primary' },
  { key: 'secondaryWeapon', label: 'Secondary' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'ammoLoad', label: 'Ammo Load' },
];

export class DeployScreen extends UIComponent {
  private mapPanel?: HTMLDivElement;
  private armoryPreviewPanel?: HTMLDivElement;
  private armoryCharacterPreview?: ArmoryCharacterPreview;
  private insertionSideView?: HTMLDivElement;
  private armorySideView?: HTMLDivElement;
  private insertionViewButton?: HTMLButtonElement;
  private armoryViewButton?: HTMLButtonElement;
  private activeView: DeployScreenView = 'insertion';
  private loadoutEditingEnabled = false;
  private mapContainer?: HTMLDivElement;
  private headerTitle?: HTMLHeadingElement;
  private headerStatus?: HTMLDivElement;
  private headerModeValue?: HTMLDivElement;
  private headerFlowValue?: HTMLDivElement;
  private headerLoadoutValue?: HTMLDivElement;
  private headerAllianceValue?: HTMLDivElement;
  private mapTitle?: HTMLDivElement;
  private selectedPanel?: HTMLDivElement;
  private selectedName?: HTMLDivElement;
  private selectedStatus?: HTMLDivElement;
  private selectedTitle?: HTMLHeadingElement;
  private decisionMetric?: HTMLDivElement;
  private sequenceTitle?: HTMLHeadingElement;
  private sequenceSteps?: HTMLDivElement;
  private spawnOptionsPanel?: HTMLDivElement;
  private spawnOptionsList?: HTMLDivElement;
  private vehicleOptionsPanel?: HTMLDivElement;
  private vehicleOptionsList?: HTMLDivElement;
  private timerDisplay?: HTMLDivElement;
  private respawnButton?: HTMLButtonElement;
  private secondaryActionButton?: HTMLButtonElement;
  private loadoutPanel?: HTMLDivElement;
  private loadoutStatus?: HTMLDivElement;
  private loadoutFactionValue?: HTMLDivElement;
  private loadoutPresetName?: HTMLDivElement;
  private loadoutPresetDescription?: HTMLDivElement;
  private presetPreviousButton?: HTMLButtonElement;
  private presetNextButton?: HTMLButtonElement;
  private presetSaveButton?: HTMLButtonElement;
  private onRespawnClick?: () => void;
  private onCancelClick?: () => void;
  private onSpawnOptionSelected?: (spawnPointId: string, spawnPointName: string) => void;
  private onVehicleDeployOptionSelected?: (vehicleId: string, vehicleName: string) => void;
  private onLoadoutChange?: (field: LoadoutFieldKey, direction: 1 | -1) => void;
  private onLoadoutSelect?: (field: LoadoutFieldKey, value: LoadoutSelectionValue) => void;
  private onPresetCycle?: (direction: 1 | -1) => void;
  private onPresetSave?: () => void;
  private deploySession?: DeploySessionModel;
  private loadoutPresentation?: LoadoutPresentationModel;
  private currentLoadout?: PlayerLoadout;
  private decisionStartedAtMs: number | null = null;
  private decisionElapsedMs: number | null = null;
  private armoryFocusWeapon?: LoadoutWeapon;
  private readonly loadoutControls = new Map<LoadoutFieldKey, LoadoutFieldControl>();
  private readonly armoryPreviewControls = new Map<ArmoryPreviewSlot, ArmoryPreviewControl>();

  constructor() {
    super();
    if (document.body) {
      this.mount(document.body);
    }
  }

  protected build(): void {
    this.root.id = 'respawn-ui';
    this.root.className = styles.root;
    this.root.style.display = 'none';
    (this.root.style as CSSStyleDeclaration & { cssText?: string }).cssText = 'display: none;';

    const stage = this.createDiv(styles.stage, 'respawn-stage');
    const layout = this.createDiv(styles.layout);

    // Header
    const header = this.createDiv(styles.header);
    const headerCopy = this.createDiv(styles.headerCopy);
    this.headerTitle = this.createHeading('h1', 'respawn-header-title', styles.headerTitle, 'RETURN TO BATTLE');
    this.headerStatus = this.createDiv(styles.headerStatus, 'respawn-header-status');
    this.headerStatus.textContent = 'Choose a controlled position and return to the fight.';
    headerCopy.appendChild(this.headerTitle);
    headerCopy.appendChild(this.headerStatus);

    const headerMeta = this.createDiv(styles.headerMeta, 'respawn-header-meta');
    const modeRow = this.createMetaRow('Mode', 'Zone Control');
    this.headerModeValue = modeRow.value;
    const flowRow = this.createMetaRow('Flow', 'Frontline deployment');
    this.headerFlowValue = flowRow.value;
    const loadoutRow = this.createMetaRow('Loadout', 'Editable');
    this.headerLoadoutValue = loadoutRow.value;
    const allianceRow = this.createMetaRow('Alliance', 'BLUFOR / US');
    this.headerAllianceValue = allianceRow.value;
    headerMeta.appendChild(modeRow.row);
    headerMeta.appendChild(flowRow.row);
    headerMeta.appendChild(loadoutRow.row);
    headerMeta.appendChild(allianceRow.row);

    header.appendChild(headerCopy);
    header.appendChild(headerMeta);

    const viewTabs = this.createDiv(styles.viewTabs, 'respawn-view-tabs');
    this.insertionViewButton = this.makeButton('respawn-view-insertion', 'Insertion', () => this.setActiveView('insertion'));
    this.armoryViewButton = this.makeButton('respawn-view-armory', 'Armory', () => this.setActiveView('armory'));
    this.insertionViewButton.classList.add(styles.viewTab);
    this.armoryViewButton.classList.add(styles.viewTab);
    viewTabs.appendChild(this.insertionViewButton);
    viewTabs.appendChild(this.armoryViewButton);

    // Map panel (hero)
    const mapPanel = this.createDiv(styles.mapPanel);
    this.mapPanel = mapPanel;
    const mapHeader = this.createDiv(styles.mapHeader);
    this.mapTitle = this.createDiv(styles.mapTitle, 'respawn-map-title');
    this.mapTitle.textContent = 'SELECT SPAWN POINT';
    const mapHelper = this.createDiv(styles.mapHelper);
    mapHelper.textContent = 'Tap or click a sector to select your insertion point — or pick from the spawn list below.';
    this.mapContainer = this.createDiv(styles.map, 'respawn-map');
    mapHeader.appendChild(this.mapTitle);
    mapHeader.appendChild(mapHelper);
    mapPanel.appendChild(mapHeader);
    mapPanel.appendChild(this.mapContainer);

    const primaryColumn = this.createDiv(styles.primaryColumn);
    primaryColumn.appendChild(mapPanel);
    primaryColumn.appendChild(this.createArmoryPreviewPanel());

    // Side panel
    const sidePanel = this.createDiv(styles.sidePanel);
    sidePanel.appendChild(this.createSelectedPanel());
    const sideScroll = this.createDiv(styles.sideScroll, 'respawn-side-scroll');
    this.insertionSideView = this.createDiv(styles.sideView, 'respawn-insertion-view');
    this.insertionSideView.appendChild(this.createVehicleOptionsPanel());
    this.insertionSideView.appendChild(this.createSpawnOptionsPanel());
    this.insertionSideView.appendChild(this.createSequencePanel());
    this.insertionSideView.appendChild(this.createLegendPanel());
    this.armorySideView = this.createDiv(styles.sideView, 'respawn-armory-view');
    this.armorySideView.appendChild(this.createLoadoutPanel());
    sideScroll.appendChild(this.insertionSideView);
    sideScroll.appendChild(this.armorySideView);
    sidePanel.appendChild(sideScroll);
    sidePanel.appendChild(this.createControlsPanel());

    layout.appendChild(primaryColumn);
    layout.appendChild(sidePanel);

    stage.appendChild(header);
    stage.appendChild(viewTabs);
    stage.appendChild(layout);

    this.root.appendChild(stage);
    this.setActiveView('insertion');
  }

  // --- Public API (same as old RespawnUI) ---

  getContainer(): HTMLDivElement {
    return this.root;
  }

  getMapContainer(): HTMLElement | null {
    return this.mapContainer ?? null;
  }

  configureSession(session: DeploySessionModel): void {
    this.deploySession = session;
    if (this.root.dataset) {
      this.root.dataset.deployKind = session.kind;
    }
    if (this.headerTitle) this.headerTitle.textContent = session.headline;
    if (this.headerStatus) this.headerStatus.textContent = session.subheadline;
    if (this.headerModeValue) this.headerModeValue.textContent = session.modeName;
    if (this.headerFlowValue) this.headerFlowValue.textContent = session.flowLabel;
    if (this.headerLoadoutValue) {
      this.headerLoadoutValue.textContent = session.allowLoadoutEditing ? 'Editable' : 'Locked';
    }
    if (this.mapTitle) this.mapTitle.textContent = session.mapTitle;
    if (this.selectedTitle) this.selectedTitle.textContent = session.selectedSpawnTitle;
    if (this.sequenceTitle) this.sequenceTitle.textContent = session.sequenceTitle;
    this.renderSequenceSteps(session.sequenceSteps);
    if (this.respawnButton) this.respawnButton.textContent = session.actionLabel;
    if (this.secondaryActionButton) {
      this.secondaryActionButton.textContent = session.secondaryActionLabel ?? '';
      this.secondaryActionButton.style.display = session.secondaryActionLabel ? 'block' : 'none';
    }
    this.setLoadoutEditingEnabled(session.allowLoadoutEditing);
    this.setActiveView('insertion');
    if (!this.selectedName || this.selectedName.textContent === 'NONE') {
      this.resetSelectedSpawn();
    }
  }

  setMapInteractionEnabled(enabled: boolean): void {
    if (!this.mapContainer) return;
    this.mapContainer.style.pointerEvents = enabled ? 'auto' : 'none';
    this.mapContainer.style.opacity = enabled ? '1' : '0.8';
  }

  setLoadoutChangeCallback(callback: (field: LoadoutFieldKey, direction: 1 | -1) => void): void {
    this.onLoadoutChange = callback;
  }

  setLoadoutSelectCallback(callback: (field: LoadoutFieldKey, value: LoadoutSelectionValue) => void): void {
    this.onLoadoutSelect = callback;
  }

  setPresetCycleCallback(callback: (direction: 1 | -1) => void): void {
    this.onPresetCycle = callback;
  }

  setPresetSaveCallback(callback: () => void): void {
    this.onPresetSave = callback;
  }

  setLoadoutEditingEnabled(enabled: boolean): void {
    this.loadoutEditingEnabled = enabled;
    if (this.loadoutPanel) {
      this.loadoutPanel.style.opacity = enabled ? '1' : '0.55';
    }
    if (this.headerLoadoutValue) {
      this.headerLoadoutValue.textContent = enabled ? 'Editable' : 'Locked';
    }
    for (const control of this.loadoutControls.values()) {
      this.applyButtonState(control.previousButton, enabled);
      this.applyButtonState(control.nextButton, enabled);
    }
    this.setLoadoutOptionButtonsEnabled(enabled);
    if (this.presetPreviousButton) this.applyButtonState(this.presetPreviousButton, enabled);
    if (this.presetNextButton) this.applyButtonState(this.presetNextButton, enabled);
    if (this.presetSaveButton) {
      const saveEnabled = enabled && (this.loadoutPresentation?.presetDirty ?? true);
      this.applyButtonState(this.presetSaveButton, saveEnabled);
    }
    if (this.armoryViewButton) this.applyButtonState(this.armoryViewButton, enabled);
    if (!enabled && this.activeView === 'armory') {
      this.setActiveView('insertion');
    }
    this.refreshLoadoutState(enabled);
  }

  updateLoadout(loadout: PlayerLoadout): void {
    this.currentLoadout = loadout;
    this.updateFieldValue('primaryWeapon', getWeaponLabel(loadout.primaryWeapon));
    this.updateFieldValue('secondaryWeapon', getWeaponLabel(loadout.secondaryWeapon));
    this.updateFieldValue('equipment', getEquipmentLabel(loadout.equipment));
    this.updateFieldValue('ammoLoad', getAmmoLoadLabel(loadout.ammoLoad ?? AmmoLoad.STANDARD));
    this.updateArmoryPreview(loadout);
    this.refreshAvailabilityChips();
  }

  updateLoadoutPresentation(model: LoadoutPresentationModel): void {
    this.loadoutPresentation = model;
    this.updateAlliance(model.context.alliance, model.factionLabel);
    if (this.loadoutFactionValue) this.loadoutFactionValue.textContent = model.factionLabel;
    if (this.loadoutPresetName) {
      this.loadoutPresetName.textContent = `${model.presetName} (${model.presetIndex + 1}/${model.presetCount})`;
    }
    if (this.loadoutPresetDescription) {
      this.loadoutPresetDescription.textContent = model.presetDescription;
    }
    this.refreshAvailabilityChips();
    this.refreshLoadoutState(this.deploySession?.allowLoadoutEditing === true);
    this.updateArmoryCharacterPreview();
  }

  show(): void {
    this.root.style.display = 'flex';
    this.armoryCharacterPreview?.setVisible(this.activeView === 'armory');
    this.setDecisionTimerStarted();
  }

  hide(): void {
    this.armoryCharacterPreview?.setVisible(false);
    this.root.style.display = 'none';
    this.decisionStartedAtMs = null;
    this.decisionElapsedMs = null;
  }

  updateTimerDisplay(respawnTimer: number, hasSelectedSpawn: boolean): void {
    if (this.timerDisplay) {
      if (respawnTimer > 0) {
        const label = this.deploySession?.countdownLabel ?? 'Deployment available in';
        this.timerDisplay.textContent = `${label} ${Math.ceil(respawnTimer)}s`;
        this.timerDisplay.style.color = 'rgba(168, 116, 42, 0.95)';
      } else {
        this.timerDisplay.textContent = this.deploySession?.readyLabel ?? 'Ready for deployment';
        this.timerDisplay.style.color = 'rgba(58, 79, 42, 0.95)';
      }
    }

    if (this.respawnButton) {
      const enabled = respawnTimer <= 0 && hasSelectedSpawn;
      this.respawnButton.disabled = !enabled;
      this.respawnButton.style.opacity = enabled ? '1' : '0.45';
      this.respawnButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }
  }

  updateSelectedSpawn(zoneName: string): void {
    if (this.selectedName) this.selectedName.textContent = zoneName;
    if (this.selectedStatus) {
      this.selectedStatus.textContent = this.deploySession?.readySelectionText ?? 'Ready to deploy';
    }
    this.recordDecisionTime();
  }

  resetSelectedSpawn(): void {
    if (this.selectedName) this.selectedName.textContent = 'NONE';
    if (this.selectedStatus) {
      this.selectedStatus.textContent = this.deploySession?.emptySelectionText ?? 'Select a spawn point on the map';
    }
  }

  setRespawnClickCallback(callback: () => void): void {
    this.onRespawnClick = callback;
  }

  setCancelClickCallback(callback: () => void): void {
    this.onCancelClick = callback;
  }

  setSpawnOptionClickCallback(callback: (spawnPointId: string, spawnPointName: string) => void): void {
    this.onSpawnOptionSelected = callback;
  }

  setVehicleDeployOptionCallback(callback: (vehicleId: string, vehicleName: string) => void): void {
    this.onVehicleDeployOptionSelected = callback;
  }

  updateVehicleDeployOptions(options: VehicleDeployOption[], selectedVehicleId?: string): void {
    if (!this.vehicleOptionsList || !this.vehicleOptionsPanel) return;
    this.vehicleOptionsList.innerHTML = '';

    // Hide the whole section when no crewable vehicles exist for the mode.
    this.vehicleOptionsPanel.style.display = options.length === 0 ? 'none' : '';
    if (options.length === 0) return;

    const ctx = this.spawnListContext();
    for (const option of options) {
      this.vehicleOptionsList.appendChild(
        makeVehicleOptionButton(ctx, option, option.id === selectedVehicleId)
      );
    }
  }

  updateAlliance(alliance: string, faction?: string): void {
    const allianceLabel = String(alliance).split('_').join(' ').toUpperCase();
    const factionLabel = faction ? String(faction).split('_').join(' ').toUpperCase() : '';
    const label = factionLabel ? `${allianceLabel} / ${factionLabel}` : allianceLabel;
    if (this.headerAllianceValue) {
      this.headerAllianceValue.textContent = label;
    }
    if (this.root.dataset) {
      this.root.dataset.alliance = allianceLabel;
      this.root.dataset.faction = factionLabel;
    }
  }

  updateSpawnOptions(spawnPoints: RespawnSpawnPoint[], selectedSpawnPointId?: string): void {
    if (!this.spawnOptionsList) return;
    this.spawnOptionsList.innerHTML = '';

    if (spawnPoints.length === 0) {
      const empty = this.createDiv(styles.spawnOptionEmpty);
      empty.textContent = 'No deployment points available.';
      this.spawnOptionsList.appendChild(empty);
      return;
    }

    const ctx = this.spawnListContext();
    for (const group of groupSpawnPoints(spawnPoints)) {
      const groupEl = this.createDiv(styles.spawnOptionGroup);
      const heading = this.createDiv(styles.spawnOptionGroupTitle);
      heading.textContent = group.label;
      groupEl.appendChild(heading);

      for (const spawnPoint of group.points) {
        const option = makeSpawnOptionButton(ctx, spawnPoint, spawnPoint.id === selectedSpawnPointId);
        groupEl.appendChild(option);
      }

      this.spawnOptionsList.appendChild(groupEl);
    }
  }

  setDecisionTimerStarted(startedAtMs = DeployScreen.nowMs()): void {
    this.decisionStartedAtMs = startedAtMs;
    this.decisionElapsedMs = null;
    if (this.root.dataset) {
      this.root.dataset.decisionStartedAtMs = String(Math.round(startedAtMs));
      delete this.root.dataset.decisionElapsedMs;
    }
    this.updateDecisionMetric(0);
  }

  recordDecisionTime(nowMs = DeployScreen.nowMs()): number | null {
    if (this.decisionStartedAtMs === null) return null;
    if (this.decisionElapsedMs !== null) return this.decisionElapsedMs;
    this.decisionElapsedMs = Math.max(0, nowMs - this.decisionStartedAtMs);
    if (this.root.dataset) {
      this.root.dataset.decisionElapsedMs = String(Math.round(this.decisionElapsedMs));
    }
    this.updateDecisionMetric(this.decisionElapsedMs);
    return this.decisionElapsedMs;
  }

  override dispose(): void {
    this.armoryCharacterPreview?.dispose();
    this.armoryCharacterPreview = undefined;
    super.dispose();
  }

  // --- Private: Panel builders ---

  private createSelectedPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.panel, 'respawn-selected-panel');
    this.selectedPanel = panel;
    this.selectedTitle = this.createHeading('h3', undefined, styles.panelTitle, 'SPAWN POINT');
    this.selectedName = this.createDiv(styles.selectedName, 'selected-spawn-name');
    this.selectedName.textContent = 'NONE';
    this.selectedStatus = this.createDiv(styles.statusText, 'selected-spawn-status');
    this.selectedStatus.textContent = 'Select a spawn point on the map';
    this.decisionMetric = this.createDiv(styles.decisionMetric, 'respawn-decision-time');
    this.decisionMetric.textContent = 'Decision time 0.0s';
    panel.appendChild(this.selectedTitle);
    panel.appendChild(this.selectedName);
    panel.appendChild(this.selectedStatus);
    panel.appendChild(this.decisionMetric);
    return panel;
  }

  private createSpawnOptionsPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.spawnOptionsPanel, 'respawn-spawn-options-panel');
    this.spawnOptionsPanel = panel;
    panel.appendChild(this.createHeading('h3', undefined, styles.panelTitle, 'AVAILABLE SPAWNS'));
    this.spawnOptionsList = this.createDiv(styles.spawnOptionsList, 'respawn-spawn-options');
    panel.appendChild(this.spawnOptionsList);
    return panel;
  }

  private createVehicleOptionsPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.spawnOptionsPanel, 'respawn-vehicle-options-panel');
    this.vehicleOptionsPanel = panel;
    panel.style.display = 'none';
    panel.appendChild(this.createHeading('h3', undefined, styles.panelTitle, 'CREW A VEHICLE'));
    this.vehicleOptionsList = this.createDiv(styles.spawnOptionsList, 'respawn-vehicle-options');
    panel.appendChild(this.vehicleOptionsList);
    return panel;
  }

  private createSequencePanel(): HTMLDivElement {
    const panel = this.createDiv(`${styles.panel} ${styles.sequencePanel}`, 'respawn-sequence-panel');
    this.sequenceTitle = this.createHeading('h3', 'respawn-sequence-title', styles.panelTitle, 'Deployment Checklist');
    this.sequenceSteps = this.createDiv(styles.sequenceSteps, 'respawn-sequence-steps');
    panel.appendChild(this.sequenceTitle);
    panel.appendChild(this.sequenceSteps);
    return panel;
  }

  private createLoadoutPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.loadoutPanel, 'respawn-loadout-panel');
    this.loadoutPanel = panel;
    panel.appendChild(this.createHeading('h3', undefined, styles.panelTitle, 'ARMORY OPTIONS'));
    this.loadoutStatus = this.createDiv(styles.loadoutStatus, 'respawn-loadout-status');
    this.loadoutStatus.textContent = 'Preset kit and ammo load.';
    panel.appendChild(this.loadoutStatus);
    panel.appendChild(this.createPresetPanel());

    const grid = this.createDiv(styles.loadoutGrid, 'respawn-loadout-grid');
    for (const field of LOADOUT_FIELD_ORDER) {
      grid.appendChild(this.createLoadoutRow(field.key, field.label));
    }
    panel.appendChild(grid);
    return panel;
  }

  private createArmoryPreviewPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.armoryPreviewPanel, 'respawn-armory-preview-panel');
    this.armoryPreviewPanel = panel;

    const header = this.createDiv(styles.armoryPreviewHeader);
    header.appendChild(this.createHeading('h2', undefined, styles.mapTitle, 'ARMORY'));
    const meta = this.createDiv(styles.armoryPreviewMeta);
    meta.textContent = 'DEPLOYMENT KIT';
    header.appendChild(meta);

    const board = this.createDiv(styles.armoryBoard);
    const figure = this.createDiv(styles.armoryModelStage, 'respawn-armory-model-stage');
    const canvas = document.createElement('canvas');
    canvas.id = 'respawn-armory-character-canvas';
    canvas.className = styles.armoryModelCanvas;
    canvas.setAttribute('aria-label', 'Equipped soldier preview');
    const status = this.createDiv(styles.armoryModelStatus, 'respawn-armory-model-status');
    const animationControls = this.createDiv(styles.armoryAnimationControls, 'respawn-armory-animation-controls');
    figure.appendChild(canvas);
    figure.appendChild(animationControls);
    figure.appendChild(status);
    this.armoryCharacterPreview = new ArmoryCharacterPreview(figure, canvas, status, animationControls);

    const kit = this.createDiv(styles.armoryKit);
    kit.appendChild(this.createArmoryPreviewItem('primary', 'Primary'));
    kit.appendChild(this.createArmoryPreviewItem('secondary', 'Secondary'));
    kit.appendChild(this.createArmoryPreviewItem('equipment', 'Equipment'));
    kit.appendChild(this.createArmoryPreviewItem('ammo', 'Ammo Load'));

    board.appendChild(figure);
    board.appendChild(kit);
    panel.appendChild(header);
    panel.appendChild(board);
    return panel;
  }

  private createArmoryPreviewItem(slot: ArmoryPreviewSlot, label: string): HTMLDivElement {
    const item = this.createDiv(styles.armoryPreviewItem, `respawn-armory-${slot}`);
    const visual = this.createDiv(styles.armoryPreviewIcon);
    const iconEl = document.createElement('img');
    iconEl.alt = '';
    iconEl.draggable = false;
    const fallback = document.createElement('span');
    visual.appendChild(iconEl);
    visual.appendChild(fallback);

    const copy = this.createDiv(styles.armoryPreviewCopy);
    const meta = this.createDiv(styles.armoryPreviewSlot);
    meta.textContent = label;
    const value = this.createDiv(styles.armoryPreviewValue);
    value.textContent = '--';
    copy.appendChild(meta);
    copy.appendChild(value);

    item.appendChild(visual);
    item.appendChild(copy);
    this.armoryPreviewControls.set(slot, { visual, icon: iconEl, fallback, value, meta });
    return item;
  }

  private createPresetPanel(): HTMLDivElement {
    const panel = this.createDiv(undefined, 'respawn-loadout-preset-panel');
    const meta = this.createDiv(styles.presetMeta);
    const info = this.createDiv(styles.presetInfo);
    this.loadoutPresetName = this.createDiv(styles.presetName, 'respawn-loadout-preset-name');
    this.loadoutPresetName.textContent = 'Rifleman';
    this.loadoutPresetDescription = this.createDiv(styles.presetDescription, 'respawn-loadout-preset-description');
    this.loadoutPresetDescription.textContent = 'Balanced deploy preset.';
    info.appendChild(this.loadoutPresetName);
    info.appendChild(this.loadoutPresetDescription);
    this.loadoutFactionValue = this.createDiv(styles.factionPill, 'respawn-loadout-faction');
    this.loadoutFactionValue.textContent = 'US';
    meta.appendChild(info);
    meta.appendChild(this.loadoutFactionValue);

    const buttons = this.createDiv(styles.presetButtons);
    this.presetPreviousButton = this.makeButton('respawn-loadout-preset-prev', 'Prev Preset', () => this.onPresetCycle?.(-1));
    this.presetNextButton = this.makeButton('respawn-loadout-preset-next', 'Next Preset', () => this.onPresetCycle?.(1));
    this.presetSaveButton = this.makeButton('respawn-loadout-preset-save', 'Save Preset', () => this.onPresetSave?.());
    buttons.appendChild(this.presetPreviousButton);
    buttons.appendChild(this.presetNextButton);
    buttons.appendChild(this.presetSaveButton);

    panel.appendChild(meta);
    panel.appendChild(buttons);
    return panel;
  }

  private createLoadoutRow(field: LoadoutFieldKey, label: string): HTMLDivElement {
    const row = this.createDiv(styles.loadoutSection, `respawn-loadout-${field}-section`);
    const header = this.createDiv(styles.loadoutSectionHeader);
    const valueBlock = this.createDiv(styles.loadoutCurrent);
    const labelEl = this.createDiv(styles.loadoutLabel);
    labelEl.textContent = label;
    const valueEl = this.createDiv(styles.loadoutValue, `loadout-${field}-value`);
    valueEl.textContent = '--';
    valueBlock.appendChild(labelEl);
    valueBlock.appendChild(valueEl);

    const buttons = this.createDiv(styles.loadoutButtons);
    const prev = this.makeButton(undefined, 'PREV', () => this.onLoadoutChange?.(field, -1));
    const next = this.makeButton(undefined, 'NEXT', () => this.onLoadoutChange?.(field, 1));
    buttons.appendChild(prev);
    buttons.appendChild(next);

    header.appendChild(valueBlock);
    header.appendChild(buttons);
    const availability = this.createDiv(styles.loadoutOptionGrid, `respawn-loadout-${field}-options`);
    row.appendChild(header);
    row.appendChild(availability);
    this.loadoutControls.set(field, { value: valueEl, previousButton: prev, nextButton: next, availability, optionButtons: [] });
    return row;
  }

  private createControlsPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.controlPanel, 'respawn-controls-panel');
    this.timerDisplay = this.createDiv(styles.timer, 'respawn-timer');
    this.respawnButton = this.makeActionButton('respawn-button', styles.actionButton, () => this.onRespawnClick?.());
    this.respawnButton.textContent = 'DEPLOY';
    this.respawnButton.disabled = true;
    this.respawnButton.style.opacity = '0.5';
    this.respawnButton.style.cursor = 'not-allowed';
    this.respawnButton.onmouseover = () => {
      if (!this.respawnButton || this.respawnButton.disabled) return;
      this.respawnButton.style.transform = 'scale(1.05)';
    };
    this.respawnButton.onmouseout = () => {
      if (!this.respawnButton) return;
      this.respawnButton.style.transform = 'scale(1)';
    };
    this.secondaryActionButton = this.makeActionButton('respawn-secondary-button', styles.secondaryButton, () => this.onCancelClick?.());
    this.secondaryActionButton.style.display = 'none';

    const stack = this.createDiv(styles.buttonStack);
    stack.appendChild(this.respawnButton);
    stack.appendChild(this.secondaryActionButton);
    panel.appendChild(this.timerDisplay);
    panel.appendChild(stack);
    return panel;
  }

  private createLegendPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.legend);
    panel.appendChild(this.createHeading('h4', undefined, styles.panelTitle, 'MAP LEGEND'));
    const items = [
      { color: 'var(--green-dk)', label: 'HQ / Main Base' },
      { color: 'var(--green)', label: 'Controlled Zone' },
      { color: 'var(--warn)', label: 'Contested Zone' },
      { color: 'var(--red)', label: 'Enemy Zone' },
    ];

    for (const item of items) {
      const row = this.createDiv(styles.legendItem);
      const swatch = this.createDiv(styles.legendSwatch);
      swatch.style.background = item.color;
      const label = this.createDiv(styles.legendLabel);
      label.textContent = item.label;
      row.appendChild(swatch);
      row.appendChild(label);
      panel.appendChild(row);
    }
    return panel;
  }

  // --- Private helpers ---

  // DOM-factory wrappers preserve the original call sites while the actual
  // element construction lives in deploy/DeployDomFactory.ts.
  private makeButton(id: string | undefined, label: string, onPress: () => void): HTMLButtonElement {
    return makeSmallButton(id, styles.smallButton, label, onPress);
  }

  private makeActionButton(id: string, className: string, onPress: () => void): HTMLButtonElement {
    return makeActionButton(id, className, onPress);
  }

  private createDiv(className?: string, id?: string): HTMLDivElement {
    return createDiv(className, id);
  }

  private createMetaRow(label: string, value: string): { row: HTMLDivElement; value: HTMLDivElement } {
    return createMetaRow(styles.metaRow, styles.metaLabel, styles.metaValue, label, value);
  }

  private createHeading<K extends 'h1' | 'h2' | 'h3' | 'h4'>(
    tag: K, id: string | undefined, className: string | undefined, text: string,
  ): HTMLHeadingElement {
    return createHeading(tag, id, className, text);
  }

  private updateFieldValue(field: LoadoutFieldKey, value: string): void {
    const control = this.loadoutControls.get(field);
    if (control) control.value.textContent = value;
  }

  private setActiveView(view: DeployScreenView): void {
    if (view === 'armory' && this.armoryViewButton?.disabled) {
      view = 'insertion';
    }
    this.activeView = view;
    const insertionActive = view === 'insertion';
    if (this.mapPanel) this.mapPanel.style.display = insertionActive ? '' : 'none';
    if (this.armoryPreviewPanel) this.armoryPreviewPanel.style.display = insertionActive ? 'none' : '';
    if (this.selectedPanel) this.selectedPanel.style.display = insertionActive ? '' : 'none';
    if (this.insertionSideView) this.insertionSideView.style.display = insertionActive ? 'flex' : 'none';
    if (this.armorySideView) this.armorySideView.style.display = insertionActive ? 'none' : 'flex';
    this.setViewButtonActive(this.insertionViewButton, insertionActive);
    this.setViewButtonActive(this.armoryViewButton, !insertionActive);
    this.insertionViewButton?.setAttribute('aria-pressed', String(insertionActive));
    this.armoryViewButton?.setAttribute('aria-pressed', String(!insertionActive));
    if (this.root.dataset) this.root.dataset.deployView = view;
    const rootVisible = this.root.style.display !== 'none';
    this.armoryCharacterPreview?.setVisible(!insertionActive && rootVisible);
  }

  private setViewButtonActive(button: HTMLButtonElement | undefined, active: boolean): void {
    if (!button) return;
    if (active) {
      button.classList.add(styles.viewTabActive);
    } else {
      button.classList.remove(styles.viewTabActive);
    }
  }

  private updateArmoryPreview(loadout: PlayerLoadout): void {
    this.updateArmoryPreviewItem(
      'primary',
      getWeaponLabel(loadout.primaryWeapon),
      getWeaponShortLabel(loadout.primaryWeapon),
      this.getWeaponIcon(loadout.primaryWeapon)
    );
    this.updateArmoryPreviewItem(
      'secondary',
      getWeaponLabel(loadout.secondaryWeapon),
      getWeaponShortLabel(loadout.secondaryWeapon),
      this.getWeaponIcon(loadout.secondaryWeapon)
    );
    this.updateArmoryPreviewItem(
      'equipment',
      getEquipmentLabel(loadout.equipment),
      getEquipmentShortLabel(loadout.equipment),
      this.getEquipmentIcon(loadout.equipment)
    );
    const ammoLoad = loadout.ammoLoad ?? AmmoLoad.STANDARD;
    this.updateArmoryPreviewItem('ammo', getAmmoLoadLabel(ammoLoad), getAmmoLoadShortLabel(ammoLoad));
    this.updateArmoryCharacterPreview();
  }

  private updateArmoryPreviewItem(
    slot: ArmoryPreviewSlot,
    value: string,
    shortLabel: string,
    iconName?: string,
  ): void {
    const control = this.armoryPreviewControls.get(slot);
    if (!control) return;
    control.value.textContent = value;
    if (iconName) {
      control.icon.src = icon(iconName);
      control.icon.style.display = 'block';
      control.fallback.textContent = '';
      control.visual.dataset.fallback = 'false';
    } else {
      control.icon.style.display = 'none';
      control.fallback.textContent = shortLabel;
      control.visual.dataset.fallback = 'true';
    }
  }

  private getWeaponIcon(weapon: LoadoutWeapon): string {
    switch (weapon) {
      case LoadoutWeapon.SHOTGUN:
        return 'icon-shotgun';
      case LoadoutWeapon.SMG:
        return 'icon-smg';
      case LoadoutWeapon.PISTOL:
        return 'icon-pistol';
      case LoadoutWeapon.LMG:
        return 'icon-lmg';
      case LoadoutWeapon.LAUNCHER:
        return 'icon-launcher';
      case LoadoutWeapon.RIFLE:
      default:
        return 'icon-rifle';
    }
  }

  private getEquipmentIcon(equipment: LoadoutEquipment): string {
    switch (equipment) {
      case LoadoutEquipment.SANDBAG_KIT:
        return 'icon-sandbag';
      case LoadoutEquipment.MORTAR_KIT:
        return 'icon-mortar';
      case LoadoutEquipment.FRAG_GRENADE:
      case LoadoutEquipment.SMOKE_GRENADE:
      case LoadoutEquipment.FLASHBANG:
      default:
        return 'icon-grenade';
    }
  }

  /**
   * Surface the faction's available pool per loadout slot (UX-3): render each
   * option as a short-label chip with the active selection highlighted, so the
   * player can see what their faction can field (and why reduced factions have
   * fewer options). Read-only from the presentation model — no service change.
   */
  private refreshAvailabilityChips(): void {
    const current = this.currentLoadout;
    // Ammo loads are universal (NOT faction-filtered), so their chip strip is
    // driven by the global AMMO_LOAD_OPTIONS pool and rendered regardless of
    // whether a faction presentation model is present yet.
    this.renderAvailabilityStrip(
      'ammoLoad',
      AMMO_LOAD_OPTIONS.map(option => option.value),
      current?.ammoLoad ?? AmmoLoad.STANDARD,
      getAmmoLoadShortLabel,
      getAmmoLoadLabel,
    );

    const model = this.loadoutPresentation;
    if (!model) return;
    this.renderAvailabilityStrip(
      'primaryWeapon',
      model.availableWeapons,
      current?.primaryWeapon,
      getWeaponShortLabel,
      getWeaponLabel,
      value => this.getWeaponIcon(value as LoadoutWeapon),
    );
    this.renderAvailabilityStrip(
      'secondaryWeapon',
      model.availableWeapons,
      current?.secondaryWeapon,
      getWeaponShortLabel,
      getWeaponLabel,
      value => this.getWeaponIcon(value as LoadoutWeapon),
    );
    this.renderAvailabilityStrip(
      'equipment',
      model.availableEquipment,
      current?.equipment,
      getEquipmentShortLabel,
      getEquipmentLabel,
      value => this.getEquipmentIcon(value as LoadoutEquipment),
    );
  }

  private renderAvailabilityStrip<T extends string>(
    field: LoadoutFieldKey,
    pool: readonly T[],
    active: T | undefined,
    shortLabel: (value: T) => string,
    fullLabel: (value: T) => string,
    iconName?: (value: T) => string | undefined,
  ): void {
    const control = this.loadoutControls.get(field);
    if (!control) return;
    const strip = control.availability;
    strip.innerHTML = '';
    control.optionButtons = [];
    for (const value of pool) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = styles.loadoutOptionCard;
      button.dataset.loadoutField = field;
      button.dataset.loadoutOption = String(value);
      button.setAttribute('aria-pressed', String(value === active));
      button.disabled = !this.loadoutEditingEnabled;
      if (value === active) button.classList.add(styles.loadoutOptionCardActive);
      const visual = this.createDiv(styles.loadoutOptionVisual);
      const iconNameForValue = iconName?.(value);
      if (iconNameForValue) {
        const iconEl = document.createElement('img');
        iconEl.alt = '';
        iconEl.draggable = false;
        iconEl.src = icon(iconNameForValue);
        visual.appendChild(iconEl);
      } else {
        visual.textContent = shortLabel(value);
      }
      const copy = this.createDiv(styles.loadoutOptionCopy);
      const name = this.createDiv(styles.loadoutOptionName);
      name.textContent = fullLabel(value);
      const meta = this.createDiv(styles.loadoutOptionMeta);
      meta.textContent = shortLabel(value);
      copy.appendChild(name);
      copy.appendChild(meta);
      button.appendChild(visual);
      button.appendChild(copy);
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.selectLoadoutOption(field, value as LoadoutSelectionValue);
      });
      control.optionButtons.push(button);
      strip.appendChild(button);
    }
  }

  private selectLoadoutOption(field: LoadoutFieldKey, value: LoadoutSelectionValue): void {
    if (!this.loadoutEditingEnabled) return;
    if (field === 'primaryWeapon' || field === 'secondaryWeapon') {
      this.armoryFocusWeapon = value as LoadoutWeapon;
      if (this.currentLoadout) {
        this.armoryCharacterPreview?.setLoadout(
          this.currentLoadout,
          this.loadoutPresentation?.context.faction,
          this.armoryFocusWeapon,
        );
      }
    }
    this.onLoadoutSelect?.(field, value);
  }

  private setLoadoutOptionButtonsEnabled(enabled: boolean): void {
    for (const control of this.loadoutControls.values()) {
      control.optionButtons.forEach((button) => {
        button.disabled = !enabled;
      });
    }
  }

  private updateArmoryCharacterPreview(): void {
    if (!this.currentLoadout) return;
    const focusWeapon = this.armoryFocusWeapon ?? this.currentLoadout.primaryWeapon;
    this.armoryCharacterPreview?.setLoadout(
      this.currentLoadout,
      this.loadoutPresentation?.context.faction,
      focusWeapon,
    );
  }

  private renderSequenceSteps(steps: string[]): void {
    if (!this.sequenceSteps) return;
    this.sequenceSteps.innerHTML = '';
    steps.forEach((step, i) => {
      const row = this.createDiv(styles.sequenceStep, `respawn-sequence-step-${i}`);
      const badge = this.createDiv(styles.sequenceBadge);
      badge.textContent = String(i + 1);
      const body = this.createDiv(styles.sequenceBody);
      body.textContent = step;
      row.appendChild(badge);
      row.appendChild(body);
      this.sequenceSteps?.appendChild(row);
    });
  }

  private applyButtonState(button: HTMLButtonElement, enabled: boolean): void {
    button.disabled = !enabled;
    button.style.opacity = enabled ? '1' : '0.4';
    button.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  private refreshLoadoutState(editingEnabled: boolean): void {
    if (!this.loadoutStatus) return;
    if (!editingEnabled) {
      this.loadoutStatus.textContent = 'Mission loadout locked for this deployment.';
      return;
    }
    if (this.loadoutPresentation) {
      this.loadoutStatus.textContent = `${this.loadoutPresentation.factionLabel} preset ${this.loadoutPresentation.presetIndex + 1}/${this.loadoutPresentation.presetCount}. Adjust two weapons and one equipment slot before deploying.`;
      if (this.presetSaveButton) {
        this.presetSaveButton.disabled = !this.loadoutPresentation.presetDirty;
        this.applyButtonState(this.presetSaveButton, this.loadoutPresentation.presetDirty);
      }
      return;
    }
    this.loadoutStatus.textContent = 'Two weapon slots and one equipment slot. Adjust before deploying.';
  }

  // Snapshot of the dependencies the spawn/vehicle option builders need. The
  // builder bodies live in deploy/DeploySpawnList.ts; callbacks are read live
  // so late `set*Callback` calls still take effect.
  private spawnListContext(): DeploySpawnListContext {
    return {
      styles,
      onSpawnOptionSelected: this.onSpawnOptionSelected,
      onVehicleDeployOptionSelected: this.onVehicleDeployOptionSelected,
    };
  }

  private updateDecisionMetric(elapsedMs: number): void {
    if (!this.decisionMetric) return;
    const seconds = Math.max(0, elapsedMs / 1000);
    this.decisionMetric.textContent = `Decision time ${seconds.toFixed(1)}s`;
  }

  private static nowMs(): number {
    return globalThis.performance?.now?.() ?? Date.now();
  }
}
