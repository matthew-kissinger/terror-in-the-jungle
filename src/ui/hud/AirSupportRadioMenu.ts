import type {
  AirSupportRadioAsset,
  AirSupportRadioAssetId,
  AirSupportRadioCooldowns,
  AirSupportTargetMarking,
} from '../../systems/airsupport/AirSupportRadioCatalog';
import {
  AIR_SUPPORT_RADIO_ASSETS,
  AIR_SUPPORT_TARGET_MARKINGS,
  countReadyAssets,
  getCooldownRemaining,
} from '../../systems/airsupport/AirSupportRadioCatalog';
import type { LayoutComponent } from '../layout/types';
import styles from './AirSupportRadioMenu.module.css';

export interface AirSupportRadioSelection {
  assetId: AirSupportRadioAssetId;
  targetMarking: AirSupportTargetMarking;
}

interface AirSupportRadioMenuState {
  selectedAssetId: AirSupportRadioAssetId | null;
  selectedMarking: AirSupportTargetMarking;
  cooldowns: AirSupportRadioCooldowns;
  statusText: string;
}

interface AssetRefs {
  button: HTMLButtonElement;
  status: HTMLSpanElement;
  fill: HTMLDivElement;
}

export class AirSupportRadioMenu implements LayoutComponent {
  private readonly container: HTMLDivElement;
  private readonly targetValue: HTMLSpanElement;
  private readonly readyValue: HTMLSpanElement;
  private readonly selectedValue: HTMLSpanElement;
  private readonly statusValue: HTMLDivElement;
  private readonly markingButtons = new Map<AirSupportTargetMarking, HTMLButtonElement>();
  private readonly assetRefs = new Map<AirSupportRadioAssetId, AssetRefs>();
  private state: AirSupportRadioMenuState = {
    selectedAssetId: null,
    selectedMarking: 'smoke',
    cooldowns: {},
    statusText: 'Select aircraft and target mark',
  };
  private visible = false;
  private onCloseRequested?: () => void;
  private onAssetSelected?: (selection: AirSupportRadioSelection) => void;
  private backdropPointerId: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = styles.overlay;
    this.container.setAttribute('role', 'dialog');
    this.container.setAttribute('aria-modal', 'true');
    this.container.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.target === this.container) {
        this.backdropPointerId = event.pointerId;
      }
    });
    this.container.addEventListener('pointerup', (event: PointerEvent) => {
      if (event.pointerId === this.backdropPointerId && event.target === this.container) {
        this.onCloseRequested?.();
      }
      this.backdropPointerId = null;
    });
    this.container.addEventListener('pointercancel', () => {
      this.backdropPointerId = null;
    });

    const panel = document.createElement('div');
    panel.className = styles.panel;
    this.container.appendChild(panel);

    const header = document.createElement('div');
    header.className = styles.header;
    panel.appendChild(header);

    const titleWrap = document.createElement('div');
    titleWrap.className = styles.titleWrap;
    header.appendChild(titleWrap);

    const eyebrow = document.createElement('span');
    eyebrow.className = styles.eyebrow;
    eyebrow.textContent = 'RADIO NET';
    titleWrap.appendChild(eyebrow);

    const title = document.createElement('h3');
    title.className = styles.title;
    title.textContent = 'Air Support';
    titleWrap.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = styles.close;
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => this.onCloseRequested?.());
    header.appendChild(closeButton);

    const summary = document.createElement('div');
    summary.className = styles.summary;
    panel.appendChild(summary);

    this.targetValue = this.appendSummaryValue(summary, 'Mark');
    this.readyValue = this.appendSummaryValue(summary, 'Cooldowns');
    this.selectedValue = this.appendSummaryValue(summary, 'Selected');

    const markingGroup = document.createElement('div');
    markingGroup.className = styles.markingGroup;
    panel.appendChild(markingGroup);
    for (const marking of AIR_SUPPORT_TARGET_MARKINGS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = styles.markingButton;
      button.dataset.radioMarking = marking.id;
      button.textContent = marking.shortLabel;
      button.title = marking.label;
      button.addEventListener('click', () => {
        this.state = {
          ...this.state,
          selectedMarking: marking.id,
          statusText: `${marking.label} target mark selected`,
        };
        this.render();
      });
      this.markingButtons.set(marking.id, button);
      markingGroup.appendChild(button);
    }

    const assetList = document.createElement('div');
    assetList.className = styles.assetList;
    panel.appendChild(assetList);
    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const refs = this.createAssetButton(asset);
      this.assetRefs.set(asset.id, refs);
      assetList.appendChild(refs.button);
    }

    const footer = document.createElement('div');
    footer.className = styles.footer;
    panel.appendChild(footer);

    this.statusValue = document.createElement('div');
    this.statusValue.className = styles.statusText;
    footer.appendChild(this.statusValue);

    this.render();
  }

  setCallbacks(callbacks: {
    onCloseRequested?: () => void;
    onAssetSelected?: (selection: AirSupportRadioSelection) => void;
  }): void {
    this.onCloseRequested = callbacks.onCloseRequested;
    this.onAssetSelected = callbacks.onAssetSelected;
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.render();
  }

  setCooldowns(cooldowns: AirSupportRadioCooldowns): void {
    this.state = {
      ...this.state,
      cooldowns,
    };
    this.render();
  }

  setState(state: Partial<AirSupportRadioMenuState>): void {
    this.state = {
      ...this.state,
      ...state,
    };
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  unmount(): void {
    this.container.remove();
  }

  dispose(): void {
    this.unmount();
  }

  private appendSummaryValue(parent: HTMLElement, label: string): HTMLSpanElement {
    const item = document.createElement('div');
    item.className = styles.summaryItem;

    const key = document.createElement('span');
    key.className = styles.summaryKey;
    key.textContent = label;
    item.appendChild(key);

    const value = document.createElement('span');
    value.className = styles.summaryValue;
    item.appendChild(value);

    parent.appendChild(item);
    return value;
  }

  private createAssetButton(asset: AirSupportRadioAsset): AssetRefs {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = styles.assetButton;
    button.dataset.radioAsset = asset.id;
    button.addEventListener('click', () => this.selectAsset(asset));

    const textWrap = document.createElement('div');

    const label = document.createElement('div');
    label.className = styles.assetLabel;
    label.textContent = asset.label;
    textWrap.appendChild(label);

    const aircraft = document.createElement('div');
    aircraft.className = styles.assetMeta;
    aircraft.textContent = `${asset.aircraft} / ${asset.payload}`;
    textWrap.appendChild(aircraft);

    const mission = document.createElement('div');
    mission.className = styles.assetMeta;
    mission.textContent = asset.mission;
    textWrap.appendChild(mission);

    const status = document.createElement('span');
    status.className = styles.assetStatus;

    const track = document.createElement('div');
    track.className = styles.cooldownTrack;

    const fill = document.createElement('div');
    fill.className = styles.cooldownFill;
    track.appendChild(fill);

    button.appendChild(textWrap);
    button.appendChild(status);
    button.appendChild(track);

    return { button, status, fill };
  }

  private selectAsset(asset: AirSupportRadioAsset): void {
    const cooldown = getCooldownRemaining(this.state.cooldowns, asset.id);
    if (cooldown > 0) {
      this.state = {
        ...this.state,
        statusText: `${asset.label} cooling down (${formatCooldown(cooldown)})`,
      };
      this.render();
      return;
    }

    this.state = {
      ...this.state,
      selectedAssetId: asset.id,
      statusText: `${asset.label} selected`,
    };
    this.onAssetSelected?.({
      assetId: asset.id,
      targetMarking: this.state.selectedMarking,
    });
    this.render();
  }

  private render(): void {
    this.container.dataset.visible = this.visible ? 'true' : 'false';
    this.container.setAttribute('aria-hidden', this.visible ? 'false' : 'true');

    const selectedMarking = AIR_SUPPORT_TARGET_MARKINGS.find((marking) => marking.id === this.state.selectedMarking);
    this.targetValue.textContent = selectedMarking?.label ?? 'Unmarked';
    this.readyValue.textContent = `${countReadyAssets(this.state.cooldowns)}/${AIR_SUPPORT_RADIO_ASSETS.length} ready`;
    const selectedAsset = AIR_SUPPORT_RADIO_ASSETS.find((asset) => asset.id === this.state.selectedAssetId);
    this.selectedValue.textContent = selectedAsset?.label ?? 'None';
    this.statusValue.textContent = this.state.statusText;

    for (const marking of AIR_SUPPORT_TARGET_MARKINGS) {
      const button = this.markingButtons.get(marking.id);
      button?.setAttribute('aria-pressed', marking.id === this.state.selectedMarking ? 'true' : 'false');
    }

    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const refs = this.assetRefs.get(asset.id);
      if (!refs) continue;
      const cooldown = getCooldownRemaining(this.state.cooldowns, asset.id);
      const coolingDown = cooldown > 0;
      refs.button.disabled = coolingDown;
      refs.button.setAttribute('aria-pressed', asset.id === this.state.selectedAssetId ? 'true' : 'false');
      refs.status.textContent = coolingDown ? formatCooldown(cooldown) : 'Ready';
      refs.fill.style.width = coolingDown
        ? `${Math.round(Math.min(1, cooldown / asset.cooldownSeconds) * 100)}%`
        : '0%';
    }
  }
}

function formatCooldown(seconds: number): string {
  const safeSeconds = Math.ceil(Math.max(0, seconds));
  if (safeSeconds >= 60) {
    return `${Math.ceil(safeSeconds / 60)}m`;
  }
  return `${safeSeconds}s`;
}
