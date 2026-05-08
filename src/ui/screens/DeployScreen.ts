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
  getEquipmentLabel,
  getWeaponLabel,
  type LoadoutFieldKey,
  type PlayerLoadout,
} from '../loadout/LoadoutTypes';
import styles from './DeployScreen.module.css';

interface LoadoutFieldControl {
  value: HTMLDivElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
}

const LOADOUT_FIELD_ORDER: Array<{ key: LoadoutFieldKey; label: string }> = [
  { key: 'primaryWeapon', label: 'Primary' },
  { key: 'secondaryWeapon', label: 'Secondary' },
  { key: 'equipment', label: 'Equipment' },
];

export class DeployScreen extends UIComponent {
  private mapContainer?: HTMLDivElement;
  private headerTitle?: HTMLHeadingElement;
  private headerStatus?: HTMLDivElement;
  private headerModeValue?: HTMLDivElement;
  private headerFlowValue?: HTMLDivElement;
  private headerLoadoutValue?: HTMLDivElement;
  private headerAllianceValue?: HTMLDivElement;
  private mapTitle?: HTMLDivElement;
  private selectedName?: HTMLDivElement;
  private selectedStatus?: HTMLDivElement;
  private selectedTitle?: HTMLHeadingElement;
  private decisionMetric?: HTMLDivElement;
  private sequenceTitle?: HTMLHeadingElement;
  private sequenceSteps?: HTMLDivElement;
  private spawnOptionsPanel?: HTMLDivElement;
  private spawnOptionsList?: HTMLDivElement;
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
  private onLoadoutChange?: (field: LoadoutFieldKey, direction: 1 | -1) => void;
  private onPresetCycle?: (direction: 1 | -1) => void;
  private onPresetSave?: () => void;
  private deploySession?: DeploySessionModel;
  private loadoutPresentation?: LoadoutPresentationModel;
  private decisionStartedAtMs: number | null = null;
  private decisionElapsedMs: number | null = null;
  private readonly loadoutControls = new Map<LoadoutFieldKey, LoadoutFieldControl>();

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

    // Map panel (hero)
    const mapPanel = this.createDiv(styles.mapPanel);
    const mapHeader = this.createDiv(styles.mapHeader);
    this.mapTitle = this.createDiv(styles.mapTitle, 'respawn-map-title');
    this.mapTitle.textContent = 'SELECT SPAWN POINT';
    const mapHelper = this.createDiv(styles.mapHelper);
    mapHelper.textContent = 'Click a zone on the map to select your deployment point.';
    this.mapContainer = this.createDiv(styles.map, 'respawn-map');
    mapHeader.appendChild(this.mapTitle);
    mapHeader.appendChild(mapHelper);
    mapPanel.appendChild(mapHeader);
    mapPanel.appendChild(this.mapContainer);

    // Side panel
    const sidePanel = this.createDiv(styles.sidePanel);
    sidePanel.appendChild(this.createSelectedPanel());
    const sideScroll = this.createDiv(styles.sideScroll, 'respawn-side-scroll');
    sideScroll.appendChild(this.createSpawnOptionsPanel());
    sideScroll.appendChild(this.createSequencePanel());
    sideScroll.appendChild(this.createLoadoutPanel());
    sideScroll.appendChild(this.createLegendPanel());
    sidePanel.appendChild(sideScroll);
    sidePanel.appendChild(this.createControlsPanel());

    layout.appendChild(mapPanel);
    layout.appendChild(sidePanel);

    stage.appendChild(header);
    stage.appendChild(layout);

    this.root.appendChild(stage);
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

  setPresetCycleCallback(callback: (direction: 1 | -1) => void): void {
    this.onPresetCycle = callback;
  }

  setPresetSaveCallback(callback: () => void): void {
    this.onPresetSave = callback;
  }

  setLoadoutEditingEnabled(enabled: boolean): void {
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
    if (this.presetPreviousButton) this.applyButtonState(this.presetPreviousButton, enabled);
    if (this.presetNextButton) this.applyButtonState(this.presetNextButton, enabled);
    if (this.presetSaveButton) {
      const saveEnabled = enabled && (this.loadoutPresentation?.presetDirty ?? true);
      this.applyButtonState(this.presetSaveButton, saveEnabled);
    }
    this.refreshLoadoutState(enabled);
  }

  updateLoadout(loadout: PlayerLoadout): void {
    this.updateFieldValue('primaryWeapon', getWeaponLabel(loadout.primaryWeapon));
    this.updateFieldValue('secondaryWeapon', getWeaponLabel(loadout.secondaryWeapon));
    this.updateFieldValue('equipment', getEquipmentLabel(loadout.equipment));
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
    this.refreshLoadoutState(this.deploySession?.allowLoadoutEditing === true);
  }

  show(): void {
    this.root.style.display = 'flex';
    this.setDecisionTimerStarted();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.decisionStartedAtMs = null;
    this.decisionElapsedMs = null;
  }

  updateTimerDisplay(respawnTimer: number, hasSelectedSpawn: boolean): void {
    if (this.timerDisplay) {
      if (respawnTimer > 0) {
        const label = this.deploySession?.countdownLabel ?? 'Deployment available in';
        this.timerDisplay.textContent = `${label} ${Math.ceil(respawnTimer)}s`;
        this.timerDisplay.style.color = 'rgba(212, 163, 68, 0.9)';
      } else {
        this.timerDisplay.textContent = this.deploySession?.readyLabel ?? 'Ready for deployment';
        this.timerDisplay.style.color = 'rgba(92, 184, 92, 0.9)';
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

    for (const group of this.groupSpawnPoints(spawnPoints)) {
      const groupEl = this.createDiv(styles.spawnOptionGroup);
      const heading = this.createDiv(styles.spawnOptionGroupTitle);
      heading.textContent = group.label;
      groupEl.appendChild(heading);

      for (const spawnPoint of group.points) {
        const option = this.makeSpawnOptionButton(spawnPoint, spawnPoint.id === selectedSpawnPointId);
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
    super.dispose();
  }

  // --- Private: Panel builders ---

  private createSelectedPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.panel, 'respawn-selected-panel');
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
    panel.appendChild(this.createHeading('h3', undefined, styles.panelTitle, 'LOADOUT'));
    this.loadoutStatus = this.createDiv(styles.loadoutStatus, 'respawn-loadout-status');
    this.loadoutStatus.textContent = 'Two weapon slots and one equipment slot. Adjust before deploying.';
    panel.appendChild(this.loadoutStatus);
    panel.appendChild(this.createPresetPanel());

    for (const field of LOADOUT_FIELD_ORDER) {
      panel.appendChild(this.createLoadoutRow(field.key, field.label));
    }
    return panel;
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
    const row = this.createDiv(styles.loadoutRow);
    const valueBlock = this.createDiv();
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

    row.appendChild(valueBlock);
    row.appendChild(buttons);
    this.loadoutControls.set(field, { value: valueEl, previousButton: prev, nextButton: next });
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
      { color: 'rgba(91, 140, 201, 0.9)', label: 'HQ / Main Base' },
      { color: 'rgba(92, 184, 92, 0.85)', label: 'Controlled Zone' },
      { color: 'rgba(212, 163, 68, 0.85)', label: 'Contested Zone' },
      { color: 'rgba(201, 86, 74, 0.85)', label: 'Enemy Zone' },
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

  private makeButton(id: string | undefined, label: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    if (id) button.id = id;
    button.type = 'button';
    button.className = styles.smallButton;
    button.textContent = label;
    button.addEventListener('pointerdown', () => {
      if (!button.disabled) onPress();
    });
    return button;
  }

  private makeActionButton(id: string, className: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = className;
    button.addEventListener('pointerdown', () => {
      if (!button.disabled) onPress();
    });
    return button;
  }

  private createDiv(className?: string, id?: string): HTMLDivElement {
    const el = document.createElement('div');
    if (id) el.id = id;
    if (className) el.className = className;
    return el;
  }

  private createMetaRow(label: string, value: string): { row: HTMLDivElement; value: HTMLDivElement } {
    const row = this.createDiv(styles.metaRow);
    const term = this.createDiv(styles.metaLabel);
    term.textContent = label;
    const valueEl = this.createDiv(styles.metaValue);
    valueEl.textContent = value;
    row.appendChild(term);
    row.appendChild(valueEl);
    return { row, value: valueEl };
  }

  private createHeading<K extends 'h1' | 'h2' | 'h3' | 'h4'>(
    tag: K, id: string | undefined, className: string | undefined, text: string,
  ): HTMLHeadingElement {
    const el = document.createElement(tag) as HTMLHeadingElement;
    if (id) el.id = id;
    if (className) el.className = className;
    el.textContent = text;
    return el;
  }

  private updateFieldValue(field: LoadoutFieldKey, value: string): void {
    const control = this.loadoutControls.get(field);
    if (control) control.value.textContent = value;
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

  private makeSpawnOptionButton(spawnPoint: RespawnSpawnPoint, selected: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = selected
      ? `${styles.spawnOption} ${styles.spawnOptionSelected}`
      : styles.spawnOption;
    button.textContent = '';
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    button.setAttribute('aria-label', `${this.getSpawnKindLabel(spawnPoint)} ${spawnPoint.name}`);
    if (button.dataset) {
      button.dataset.spawnId = spawnPoint.id;
      button.dataset.spawnKind = spawnPoint.kind;
      button.dataset.selectionClass = spawnPoint.selectionClass;
    }
    button.addEventListener('pointerdown', () => {
      this.onSpawnOptionSelected?.(spawnPoint.id, spawnPoint.name);
    });

    const label = this.createDiv(styles.spawnOptionLabel);
    label.textContent = spawnPoint.name;
    const meta = this.createDiv(styles.spawnOptionMeta);
    const safety = spawnPoint.safe ? 'CLEAR' : 'HOT';
    meta.textContent = `${this.getSpawnKindLabel(spawnPoint)} / ${safety} / ${Math.round(spawnPoint.position.x)}, ${Math.round(spawnPoint.position.z)}`;
    button.appendChild(label);
    button.appendChild(meta);
    return button;
  }

  private groupSpawnPoints(spawnPoints: RespawnSpawnPoint[]): Array<{ label: string; points: RespawnSpawnPoint[] }> {
    const groups: Array<{ kind: RespawnSpawnPoint['kind']; label: string; points: RespawnSpawnPoint[] }> = [
      { kind: 'home_base', label: 'ALLIANCE BASES', points: [] },
      { kind: 'zone', label: 'CONTROLLED ZONES', points: [] },
      { kind: 'helipad', label: 'HELIPADS', points: [] },
      { kind: 'insertion', label: 'INSERTION POINTS', points: [] },
      { kind: 'default', label: 'DEFAULT', points: [] },
    ];

    for (const spawnPoint of spawnPoints) {
      const group = groups.find((entry) => entry.kind === spawnPoint.kind) ?? groups[groups.length - 1];
      group.points.push(spawnPoint);
    }

    return groups.filter((group) => group.points.length > 0);
  }

  private getSpawnKindLabel(spawnPoint: RespawnSpawnPoint): string {
    switch (spawnPoint.kind) {
      case 'home_base':
        return 'BASE';
      case 'zone':
        return 'ZONE';
      case 'helipad':
        return 'HELIPAD';
      case 'insertion':
        return 'INSERTION';
      case 'default':
      default:
        return 'DEFAULT';
    }
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
