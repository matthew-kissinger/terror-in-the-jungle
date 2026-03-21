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
  private mapTitle?: HTMLDivElement;
  private selectedName?: HTMLDivElement;
  private selectedStatus?: HTMLDivElement;
  private selectedTitle?: HTMLHeadingElement;
  private sequenceTitle?: HTMLHeadingElement;
  private sequenceSteps?: HTMLDivElement;
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
  private onLoadoutChange?: (field: LoadoutFieldKey, direction: 1 | -1) => void;
  private onPresetCycle?: (direction: 1 | -1) => void;
  private onPresetSave?: () => void;
  private deploySession?: DeploySessionModel;
  private loadoutPresentation?: LoadoutPresentationModel;
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

    const stage = this.createDiv(styles.stage);
    const layout = this.createDiv(styles.layout);

    // Header
    const header = this.createDiv(styles.header);
    const headerCopy = this.createDiv(styles.headerCopy);
    this.headerTitle = this.createHeading('h1', 'respawn-header-title', styles.headerTitle, 'RETURN TO BATTLE');
    this.headerStatus = this.createDiv(styles.headerStatus, 'respawn-header-status');
    this.headerStatus.textContent = 'Choose a controlled position and return to the fight.';
    headerCopy.appendChild(this.headerTitle);
    headerCopy.appendChild(this.headerStatus);

    const headerMeta = this.createDiv(styles.headerMeta);
    const modeRow = this.createMetaRow('Mode', 'Zone Control');
    this.headerModeValue = modeRow.value;
    const flowRow = this.createMetaRow('Flow', 'Frontline deployment');
    this.headerFlowValue = flowRow.value;
    const loadoutRow = this.createMetaRow('Loadout', 'Editable');
    this.headerLoadoutValue = loadoutRow.value;
    headerMeta.appendChild(modeRow.row);
    headerMeta.appendChild(flowRow.row);
    headerMeta.appendChild(loadoutRow.row);

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
    sidePanel.appendChild(this.createSequencePanel());
    sidePanel.appendChild(this.createLoadoutPanel());
    sidePanel.appendChild(this.createControlsPanel());
    sidePanel.appendChild(this.createLegendPanel());

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
  }

  hide(): void {
    this.root.style.display = 'none';
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

  override dispose(): void {
    super.dispose();
  }

  // --- Private: Panel builders ---

  private createSelectedPanel(): HTMLDivElement {
    const panel = this.createDiv(styles.panel);
    this.selectedTitle = this.createHeading('h3', undefined, styles.panelTitle, 'SPAWN POINT');
    this.selectedName = this.createDiv(styles.selectedName, 'selected-spawn-name');
    this.selectedName.textContent = 'NONE';
    this.selectedStatus = this.createDiv(styles.statusText, 'selected-spawn-status');
    this.selectedStatus.textContent = 'Select a spawn point on the map';
    panel.appendChild(this.selectedTitle);
    panel.appendChild(this.selectedName);
    panel.appendChild(this.selectedStatus);
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
    const panel = this.createDiv(styles.controlPanel);
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
}
