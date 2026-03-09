import type { DeploySessionModel } from '../world/runtime/DeployFlowSession';
import type { LoadoutPresentationModel } from './LoadoutService';
import {
  getEquipmentLabel,
  getWeaponLabel,
  type LoadoutFieldKey,
  type PlayerLoadout
} from '../../ui/loadout/LoadoutTypes';

interface LoadoutFieldControl {
  value: HTMLDivElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
}

const LOADOUT_FIELD_ORDER: Array<{ key: LoadoutFieldKey; label: string }> = [
  { key: 'primaryWeapon', label: 'Primary Weapon' },
  { key: 'secondaryWeapon', label: 'Secondary Weapon' },
  { key: 'equipment', label: 'Equipment' },
];

export class RespawnUI {
  private respawnUIContainer?: HTMLDivElement;
  private mapContainer?: HTMLDivElement;
  private headerTitle?: HTMLHeadingElement;
  private headerStatus?: HTMLDivElement;
  private mapTitle?: HTMLHeadingElement;
  private selectedTitle?: HTMLHeadingElement;
  private selectedName?: HTMLDivElement;
  private selectedStatus?: HTMLDivElement;
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
    this.injectResponsiveStyles();
    this.createRespawnUI();
  }

  private injectResponsiveStyles(): void {
    const styleId = 'respawn-ui-responsive-styles';
    if (!document.head || document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @media (max-width: 900px) {
        #respawn-ui .content-area {
          flex-direction: column !important;
          padding: 16px !important;
          gap: 16px !important;
        }
        #respawn-ui .info-panel {
          max-width: 100% !important;
        }
      }
      @media (max-width: 768px) {
        #respawn-ui .map-container {
          min-height: 40vh !important;
        }
        #respawn-ui .header {
          padding: 16px !important;
        }
        #respawn-ui .loadout-row {
          grid-template-columns: 1fr !important;
        }
        #respawn-ui .loadout-buttons {
          justify-content: stretch !important;
        }
        #respawn-ui .loadout-buttons button {
          flex: 1 1 auto !important;
        }
      }
      @media (max-width: 480px) {
        #respawn-ui .map-title {
          font-size: 16px !important;
        }
        #respawn-ui .selected-title,
        #respawn-ui .legend-title,
        #respawn-ui .loadout-title {
          font-size: 13px !important;
        }
        #respawn-ui .legend-item span,
        #respawn-ui .loadout-label,
        #respawn-ui .loadout-status {
          font-size: 11px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  private createRespawnUI(): void {
    this.respawnUIContainer = document.createElement('div');
    this.respawnUIContainer.id = 'respawn-ui';
    this.respawnUIContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      display: none;
      z-index: 10000;
      font-family: var(--font-primary, 'Rajdhani', sans-serif);
    `;

    const mainLayout = document.createElement('div');
    mainLayout.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.className = 'header';
    header.style.cssText = `
      background: linear-gradient(180deg, rgba(18, 8, 8, 0.95) 0%, rgba(8, 4, 4, 0.8) 100%);
      border-bottom: 1px solid rgba(201, 86, 74, 0.4);
      padding: 20px;
      text-align: center;
    `;

    this.headerTitle = document.createElement('h1');
    this.headerTitle.id = 'respawn-header-title';
    this.headerTitle.style.cssText = `
      font-family: var(--font-heading, 'Teko', sans-serif);
      color: rgba(201, 86, 74, 0.95);
      font-size: clamp(28px, 7vw, 56px);
      font-weight: 500;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: clamp(2px, 1vw, 8px);
      text-shadow: 0 0 12px rgba(201, 86, 74, 0.3);
    `;
    this.headerTitle.textContent = 'RETURN TO BATTLE';
    header.appendChild(this.headerTitle);

    this.headerStatus = document.createElement('div');
    this.headerStatus.id = 'respawn-header-status';
    this.headerStatus.style.cssText = `
      color: #999;
      font-size: 16px;
      margin-top: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    `;
    this.headerStatus.textContent = 'Choose a controlled position and return to the fight.';
    header.appendChild(this.headerStatus);

    const contentArea = document.createElement('div');
    contentArea.className = 'content-area';
    contentArea.style.cssText = `
      flex: 1;
      display: flex;
      padding: 30px;
      gap: 24px;
      overflow: auto;
      align-items: stretch;
    `;

    const mapPanel = document.createElement('div');
    mapPanel.className = 'map-panel';
    mapPanel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    `;

    this.mapTitle = document.createElement('h2');
    this.mapTitle.className = 'map-title';
    this.mapTitle.style.cssText = `
      color: rgba(92, 184, 92, 0.85);
      font-size: 20px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 2px;
    `;
    this.mapTitle.textContent = 'TACTICAL MAP - SELECT DEPLOYMENT';
    mapPanel.appendChild(this.mapTitle);

    this.mapContainer = document.createElement('div');
    this.mapContainer.id = 'respawn-map';
    this.mapContainer.className = 'map-container';
    this.mapContainer.style.cssText = `
      flex: 1;
      background: rgba(8, 12, 18, 0.9);
      border: 1px solid rgba(92, 184, 92, 0.3);
      border-radius: 4px;
      position: relative;
      min-height: 500px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s ease;
    `;
    mapPanel.appendChild(this.mapContainer);

    const infoPanel = document.createElement('div');
    infoPanel.className = 'info-panel';
    infoPanel.style.cssText = `
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    const selectedInfo = document.createElement('div');
    selectedInfo.style.cssText = `
      background: rgba(8, 18, 12, 0.3);
      border: 1px solid rgba(92, 184, 92, 0.3);
      border-radius: 4px;
      padding: 20px;
    `;

    this.selectedTitle = document.createElement('h3');
    this.selectedTitle.className = 'selected-title';
    this.selectedTitle.style.cssText = `
      color: rgba(92, 184, 92, 0.8);
      font-size: 16px;
      text-transform: uppercase;
      margin: 0 0 15px 0;
      letter-spacing: 1px;
    `;
    this.selectedTitle.textContent = 'SELECTED SPAWN POINT';
    selectedInfo.appendChild(this.selectedTitle);

    this.selectedName = document.createElement('div');
    this.selectedName.id = 'selected-spawn-name';
    this.selectedName.style.cssText = `
      color: white;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
    `;
    this.selectedName.textContent = 'NONE';
    selectedInfo.appendChild(this.selectedName);

    this.selectedStatus = document.createElement('div');
    this.selectedStatus.id = 'selected-spawn-status';
    this.selectedStatus.style.cssText = `
      color: #999;
      font-size: 14px;
    `;
    this.selectedStatus.textContent = 'Select a spawn point on the map';
    selectedInfo.appendChild(this.selectedStatus);

    infoPanel.appendChild(selectedInfo);
    infoPanel.appendChild(this.createSequencePanel());
    infoPanel.appendChild(this.createLoadoutPanel());

    const controlsContainer = document.createElement('div');
    controlsContainer.style.cssText = `
      background: rgba(20, 20, 20, 0.8);
      border: 1px solid #666;
      border-radius: 4px;
      padding: 20px;
      text-align: center;
    `;

    this.timerDisplay = document.createElement('div');
    this.timerDisplay.id = 'respawn-timer';
    this.timerDisplay.style.cssText = `
      color: rgba(212, 163, 68, 0.9);
      font-size: 16px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    controlsContainer.appendChild(this.timerDisplay);

    const buttonStack = document.createElement('div');
    buttonStack.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    this.respawnButton = document.createElement('button');
    this.respawnButton.id = 'respawn-button';
    this.respawnButton.type = 'button';
    this.respawnButton.style.cssText = `
      background: rgba(92, 184, 92, 0.2);
      border: 1px solid rgba(92, 184, 92, 0.5);
      color: rgba(92, 184, 92, 0.95);
      font-size: 18px;
      font-weight: bold;
      padding: 15px 40px;
      border-radius: 4px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 2px;
      transition: all 0.2s;
      width: 100%;
      min-height: 44px;
      box-shadow: 0 2px 8px rgba(92, 184, 92, 0.15);
      touch-action: manipulation;
    `;
    this.respawnButton.textContent = 'DEPLOY';
    this.respawnButton.disabled = true;
    buttonStack.appendChild(this.respawnButton);

    this.secondaryActionButton = document.createElement('button');
    this.secondaryActionButton.id = 'respawn-secondary-button';
    this.secondaryActionButton.type = 'button';
    this.secondaryActionButton.style.cssText = `
      display: none;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(180, 180, 180, 0.25);
      color: rgba(220, 220, 220, 0.92);
      font-size: 13px;
      font-weight: 700;
      padding: 12px 18px;
      border-radius: 4px;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 1.4px;
      transition: all 0.2s;
      width: 100%;
      min-height: 42px;
      touch-action: manipulation;
    `;
    this.secondaryActionButton.addEventListener('pointerdown', () => {
      if (!this.secondaryActionButton?.disabled) {
        this.onCancelClick?.();
      }
    });
    buttonStack.appendChild(this.secondaryActionButton);
    controlsContainer.appendChild(buttonStack);

    this.respawnButton.onmouseover = () => {
      const button = this.respawnButton;
      if (button && !button.disabled) {
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = '0 4px 12px rgba(92, 184, 92, 0.25)';
      }
    };
    this.respawnButton.onmouseout = () => {
      if (!this.respawnButton) return;
      this.respawnButton.style.transform = 'scale(1)';
      this.respawnButton.style.boxShadow = '0 2px 8px rgba(92, 184, 92, 0.15)';
    };
    this.respawnButton.ontouchstart = () => {
      const button = this.respawnButton;
      if (button && !button.disabled) {
        button.style.transform = 'scale(0.95)';
      }
    };
    this.respawnButton.ontouchend = () => {
      if (this.respawnButton) {
        this.respawnButton.style.transform = 'scale(1)';
      }
    };

    this.respawnButton.addEventListener('pointerdown', () => {
      if (!this.respawnButton?.disabled && this.onRespawnClick) {
        this.onRespawnClick();
      }
    });

    infoPanel.appendChild(controlsContainer);

    const legend = document.createElement('div');
    legend.style.cssText = `
      background: rgba(0, 0, 0, 0.8);
      border: 1px solid #444;
      border-radius: 4px;
      padding: 15px;
    `;

    const legendTitle = document.createElement('h4');
    legendTitle.className = 'legend-title';
    legendTitle.style.cssText = `
      color: #888;
      font-size: 14px;
      text-transform: uppercase;
      margin: 0 0 10px 0;
      letter-spacing: 1px;
    `;
    legendTitle.textContent = 'MAP LEGEND';
    legend.appendChild(legendTitle);

    const legendItems = [
      { color: 'rgba(91, 140, 201, 0.9)', label: 'HQ / Main Base' },
      { color: 'rgba(92, 184, 92, 0.85)', label: 'Controlled Zone' },
      { color: 'rgba(212, 163, 68, 0.85)', label: 'Contested Zone' },
      { color: 'rgba(201, 86, 74, 0.85)', label: 'Enemy Zone' }
    ];

    legendItems.forEach(item => {
      const legendItem = document.createElement('div');
      legendItem.className = 'legend-item';
      legendItem.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 5px;
      `;

      const colorBox = document.createElement('div');
      colorBox.style.cssText = `
        width: 24px;
        height: 24px;
        min-width: 24px;
        background: ${item.color};
        border: 1px solid rgba(255,255,255,0.3);
      `;

      const label = document.createElement('span');
      label.style.cssText = `
        color: #999;
        font-size: 12px;
      `;
      label.textContent = item.label;

      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legend.appendChild(legendItem);
    });

    infoPanel.appendChild(legend);

    contentArea.appendChild(mapPanel);
    contentArea.appendChild(infoPanel);

    mainLayout.appendChild(header);
    mainLayout.appendChild(contentArea);

    this.respawnUIContainer.appendChild(mainLayout);
    document.body.appendChild(this.respawnUIContainer);
  }

  private createLoadoutPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'respawn-loadout-panel';
    panel.style.cssText = `
      background: rgba(16, 16, 16, 0.86);
      border: 1px solid rgba(120, 120, 120, 0.45);
      border-radius: 4px;
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;
    this.loadoutPanel = panel;

    const title = document.createElement('h3');
    title.className = 'loadout-title';
    title.style.cssText = `
      color: rgba(214, 214, 214, 0.9);
      font-size: 16px;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 1px;
    `;
    title.textContent = 'LOADOUT';
    panel.appendChild(title);

    this.loadoutStatus = document.createElement('div');
    this.loadoutStatus.id = 'respawn-loadout-status';
    this.loadoutStatus.className = 'loadout-status';
    this.loadoutStatus.style.cssText = `
      color: #8d8d8d;
      font-size: 12px;
      line-height: 1.4;
      letter-spacing: 0.3px;
    `;
    this.loadoutStatus.textContent = 'Two weapon slots and one equipment slot. Adjust before deploying.';
    panel.appendChild(this.loadoutStatus);
    panel.appendChild(this.createLoadoutPresetPanel());

    for (const field of LOADOUT_FIELD_ORDER) {
      panel.appendChild(this.createLoadoutFieldRow(field.key, field.label));
    }

    return panel;
  }

  private createSequencePanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'respawn-sequence-panel';
    panel.style.cssText = `
      background: rgba(10, 10, 10, 0.76);
      border: 1px solid rgba(110, 110, 110, 0.3);
      border-radius: 4px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;

    this.sequenceTitle = document.createElement('h3');
    this.sequenceTitle.id = 'respawn-sequence-title';
    this.sequenceTitle.style.cssText = `
      color: rgba(214, 214, 214, 0.88);
      font-size: 14px;
      text-transform: uppercase;
      margin: 0;
      letter-spacing: 1px;
    `;
    this.sequenceTitle.textContent = 'Deployment Checklist';
    panel.appendChild(this.sequenceTitle);

    this.sequenceSteps = document.createElement('div');
    this.sequenceSteps.id = 'respawn-sequence-steps';
    this.sequenceSteps.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    panel.appendChild(this.sequenceSteps);

    this.renderSequenceSteps([]);
    return panel;
  }

  private createLoadoutPresetPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.id = 'respawn-loadout-preset-panel';
    panel.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 12px;
    `;

    const metaRow = document.createElement('div');
    metaRow.style.cssText = `
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
    `;

    const presetInfo = document.createElement('div');
    presetInfo.style.cssText = `
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    this.loadoutPresetName = document.createElement('div');
    this.loadoutPresetName.id = 'respawn-loadout-preset-name';
    this.loadoutPresetName.style.cssText = `
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    this.loadoutPresetName.textContent = 'Rifleman';
    presetInfo.appendChild(this.loadoutPresetName);

    this.loadoutPresetDescription = document.createElement('div');
    this.loadoutPresetDescription.id = 'respawn-loadout-preset-description';
    this.loadoutPresetDescription.style.cssText = `
      color: rgba(180, 180, 180, 0.85);
      font-size: 12px;
      line-height: 1.45;
    `;
    this.loadoutPresetDescription.textContent = 'Balanced deploy preset.';
    presetInfo.appendChild(this.loadoutPresetDescription);

    metaRow.appendChild(presetInfo);

    this.loadoutFactionValue = document.createElement('div');
    this.loadoutFactionValue.id = 'respawn-loadout-faction';
    this.loadoutFactionValue.style.cssText = `
      align-self: start;
      background: rgba(92, 184, 92, 0.15);
      border: 1px solid rgba(92, 184, 92, 0.3);
      border-radius: 999px;
      color: rgba(92, 184, 92, 0.92);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 6px 10px;
      text-transform: uppercase;
      white-space: nowrap;
    `;
    this.loadoutFactionValue.textContent = 'US';
    metaRow.appendChild(this.loadoutFactionValue);

    panel.appendChild(metaRow);

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = `
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    `;

    this.presetPreviousButton = this.createPresetButton('respawn-loadout-preset-prev', 'Prev Preset', () => {
      this.onPresetCycle?.(-1);
    });
    buttonRow.appendChild(this.presetPreviousButton);

    this.presetNextButton = this.createPresetButton('respawn-loadout-preset-next', 'Next Preset', () => {
      this.onPresetCycle?.(1);
    });
    buttonRow.appendChild(this.presetNextButton);

    this.presetSaveButton = this.createPresetButton('respawn-loadout-preset-save', 'Save Preset', () => {
      this.onPresetSave?.();
    });
    buttonRow.appendChild(this.presetSaveButton);

    panel.appendChild(buttonRow);

    return panel;
  }

  private createLoadoutFieldRow(field: LoadoutFieldKey, label: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'loadout-row';
    row.style.cssText = `
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 10px;
    `;

    const valueBlock = document.createElement('div');
    valueBlock.style.cssText = `
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;

    const labelElement = document.createElement('div');
    labelElement.className = 'loadout-label';
    labelElement.style.cssText = `
      color: rgba(180, 180, 180, 0.85);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    labelElement.textContent = label;
    valueBlock.appendChild(labelElement);

    const valueElement = document.createElement('div');
    valueElement.id = `loadout-${field}-value`;
    valueElement.style.cssText = `
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: 0.4px;
      min-height: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;
    valueElement.textContent = '--';
    valueBlock.appendChild(valueElement);

    row.appendChild(valueBlock);

    const buttons = document.createElement('div');
    buttons.className = 'loadout-buttons';
    buttons.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    `;

    const previousButton = this.createLoadoutButton(field, -1);
    const nextButton = this.createLoadoutButton(field, 1);
    previousButton.textContent = 'PREV';
    nextButton.textContent = 'NEXT';

    buttons.appendChild(previousButton);
    buttons.appendChild(nextButton);
    row.appendChild(buttons);

    this.loadoutControls.set(field, {
      value: valueElement,
      previousButton,
      nextButton
    });

    return row;
  }

  private createLoadoutButton(field: LoadoutFieldKey, direction: 1 | -1): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = `
      min-width: 58px;
      border-radius: 4px;
      border: 1px solid rgba(140, 140, 140, 0.35);
      background: rgba(46, 46, 46, 0.9);
      color: rgba(220, 220, 220, 0.95);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 9px 12px;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    `;

    button.addEventListener('pointerdown', () => {
      if (!button.disabled) {
        this.onLoadoutChange?.(field, direction);
      }
    });

    return button;
  }

  private createPresetButton(
    id: string,
    label: string,
    onPress: () => void
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = label;
    button.style.cssText = `
      min-height: 38px;
      border-radius: 4px;
      border: 1px solid rgba(140, 140, 140, 0.35);
      background: rgba(46, 46, 46, 0.9);
      color: rgba(220, 220, 220, 0.95);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1px;
      padding: 9px 12px;
      cursor: pointer;
      text-transform: uppercase;
      transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
      flex: 1 1 110px;
    `;

    button.addEventListener('pointerdown', () => {
      if (!button.disabled) {
        onPress();
      }
    });

    return button;
  }

  getContainer(): HTMLDivElement | undefined {
    return this.respawnUIContainer;
  }

  getMapContainer(): HTMLElement | null {
    return this.mapContainer ?? null;
  }

  configureSession(session: DeploySessionModel): void {
    this.deploySession = session;
    if (this.headerTitle) this.headerTitle.textContent = session.headline;
    if (this.headerStatus) this.headerStatus.textContent = session.subheadline;
    if (this.mapTitle) this.mapTitle.textContent = session.mapTitle;
    if (this.sequenceTitle) this.sequenceTitle.textContent = session.sequenceTitle;
    this.renderSequenceSteps(session.sequenceSteps);
    if (this.selectedTitle) this.selectedTitle.textContent = session.selectedSpawnTitle;
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

    for (const control of this.loadoutControls.values()) {
      this.applyLoadoutButtonState(control.previousButton, enabled);
      this.applyLoadoutButtonState(control.nextButton, enabled);
    }

    this.refreshLoadoutPresentationState(enabled);
  }

  updateLoadout(loadout: PlayerLoadout): void {
    this.updateLoadoutFieldValue('primaryWeapon', getWeaponLabel(loadout.primaryWeapon));
    this.updateLoadoutFieldValue('secondaryWeapon', getWeaponLabel(loadout.secondaryWeapon));
    this.updateLoadoutFieldValue('equipment', getEquipmentLabel(loadout.equipment));
  }

  updateLoadoutPresentation(model: LoadoutPresentationModel): void {
    this.loadoutPresentation = model;
    if (this.loadoutFactionValue) {
      this.loadoutFactionValue.textContent = model.factionLabel;
    }
    if (this.loadoutPresetName) {
      this.loadoutPresetName.textContent = `${model.presetName} (${model.presetIndex + 1}/${model.presetCount})`;
    }
    if (this.loadoutPresetDescription) {
      this.loadoutPresetDescription.textContent = model.presetDescription;
    }

    const editingEnabled = this.deploySession?.allowLoadoutEditing === true;
    this.refreshLoadoutPresentationState(editingEnabled);
  }

  show(): void {
    if (this.respawnUIContainer) {
      this.respawnUIContainer.style.display = 'flex';
    }
  }

  hide(): void {
    if (this.respawnUIContainer) {
      this.respawnUIContainer.style.display = 'none';
    }
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
      if (respawnTimer > 0 || !hasSelectedSpawn) {
        this.respawnButton.disabled = true;
        this.respawnButton.style.opacity = '0.5';
        this.respawnButton.style.cursor = 'not-allowed';
      } else {
        this.respawnButton.disabled = false;
        this.respawnButton.style.opacity = '1';
        this.respawnButton.style.cursor = 'pointer';
      }
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

  dispose(): void {
    if (this.respawnUIContainer?.parentElement) {
      this.respawnUIContainer.parentElement.removeChild(this.respawnUIContainer);
    }
  }

  private updateLoadoutFieldValue(field: LoadoutFieldKey, value: string): void {
    const control = this.loadoutControls.get(field);
    if (control) {
      control.value.textContent = value;
    }
  }

  private renderSequenceSteps(steps: string[]): void {
    if (!this.sequenceSteps) {
      return;
    }

    while (this.sequenceSteps.children.length > 0) {
      this.sequenceSteps.removeChild(this.sequenceSteps.children[0]);
    }

    steps.forEach((step, index) => {
      const row = document.createElement('div');
      row.id = `respawn-sequence-step-${index}`;
      row.style.cssText = `
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      `;

      const indexBadge = document.createElement('div');
      indexBadge.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 999px;
        border: 1px solid rgba(92, 184, 92, 0.35);
        color: rgba(92, 184, 92, 0.95);
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      indexBadge.textContent = String(index + 1);
      row.appendChild(indexBadge);

      const body = document.createElement('div');
      body.style.cssText = `
        color: rgba(196, 196, 196, 0.84);
        font-size: 12px;
        line-height: 1.45;
      `;
      body.textContent = step;
      row.appendChild(body);

      this.sequenceSteps?.appendChild(row);
    });
  }

  private applyLoadoutButtonState(button: HTMLButtonElement, enabled: boolean): void {
    button.disabled = !enabled;
    button.style.opacity = enabled ? '1' : '0.45';
    button.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  private refreshLoadoutPresentationState(editingEnabled: boolean): void {
    const presetDirty = this.loadoutPresentation?.presetDirty === true;
    const presetCount = this.loadoutPresentation?.presetCount ?? 0;

    if (this.loadoutStatus) {
      this.loadoutStatus.textContent = editingEnabled
        ? this.loadoutPresentation
          ? `${this.loadoutPresentation.factionLabel} preset ${this.loadoutPresentation.presetIndex + 1}/${this.loadoutPresentation.presetCount}. Adjust two weapons and one equipment slot before deploying.`
          : 'Two weapon slots and one equipment slot. Adjust before deploying.'
        : 'Mission loadout locked for this deployment.';
    }

    if (this.presetPreviousButton) {
      this.applyLoadoutButtonState(this.presetPreviousButton, editingEnabled && presetCount > 1);
    }
    if (this.presetNextButton) {
      this.applyLoadoutButtonState(this.presetNextButton, editingEnabled && presetCount > 1);
    }
    if (this.presetSaveButton) {
      this.presetSaveButton.textContent = presetDirty ? 'Save Preset' : 'Preset Saved';
      this.applyLoadoutButtonState(this.presetSaveButton, editingEnabled && presetDirty);
    }
  }
}
