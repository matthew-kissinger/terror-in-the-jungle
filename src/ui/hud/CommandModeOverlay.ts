import type { LayoutComponent } from '../layout/types';
import type { InputMode } from '../../systems/input/InputManager';
import { SquadCommand } from '../../systems/combat/types';
import {
  getSquadCommandLabel,
  SQUAD_QUICK_COMMAND_OPTIONS
} from '../../systems/combat/SquadCommandPresentation';
import { CommandTacticalMap, type CommandTacticalMapRenderState } from './CommandTacticalMap';
import * as THREE from 'three';

interface CommandModeOverlayState {
  hasSquad: boolean;
  currentCommand: SquadCommand;
  memberCount: number;
  commandPosition?: { x: number; z: number } | null;
  pendingCommand: SquadCommand | null;
  selectedSquadId?: string | null;
  selectedLeaderId?: string | null;
  selectedFormation?: string | null;
  selectedFaction?: string | null;
}

interface OverlayButtonRefs {
  button: HTMLButtonElement;
  hint: HTMLSpanElement;
  label: HTMLSpanElement;
}

export class CommandModeOverlay implements LayoutComponent {
  private static readonly STYLE_ID = 'command-mode-overlay-styles';

  private readonly container: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly statusValue: HTMLSpanElement;
  private readonly squadValue: HTMLSpanElement;
  private readonly waypointValue: HTMLSpanElement;
  private readonly selectedSquadValue: HTMLSpanElement;
  private readonly selectedLeaderValue: HTMLSpanElement;
  private readonly selectedFormationValue: HTMLSpanElement;
  private readonly selectedFactionValue: HTMLSpanElement;
  private readonly hintValue: HTMLSpanElement;
  private readonly tacticalMap: CommandTacticalMap;
  private readonly commandButtons = new Map<number, OverlayButtonRefs>();
  private inputMode: InputMode = 'keyboardMouse';
  private visible = false;
  private state: CommandModeOverlayState = {
    hasSquad: false,
    currentCommand: SquadCommand.NONE,
    memberCount: 0,
    commandPosition: null,
    pendingCommand: null,
    selectedSquadId: null,
    selectedLeaderId: null,
    selectedFormation: null,
    selectedFaction: null
  };
  private onQuickCommandSelected?: (slot: number) => void;
  private onCloseRequested?: () => void;
  private onMapPointSelected?: (position: THREE.Vector3) => void;
  private onSquadSelected?: (squadId: string) => void;
  private backdropPointerId: number | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'command-mode-overlay';
    this.container.addEventListener('click', (event) => {
      if (event.target === this.container) {
        this.onCloseRequested?.();
      }
    });
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

    this.panel = document.createElement('div');
    this.panel.className = 'command-mode-overlay__panel';
    this.container.appendChild(this.panel);

    const header = document.createElement('div');
    header.className = 'command-mode-overlay__header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'command-mode-overlay__title-wrap';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'command-mode-overlay__eyebrow';
    eyebrow.textContent = 'LIVE COMMAND';

    const title = document.createElement('h3');
    title.className = 'command-mode-overlay__title';
    title.textContent = 'Squad Control';

    titleWrap.appendChild(eyebrow);
    titleWrap.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'command-mode-overlay__close';
    closeButton.textContent = 'CLOSE';
    closeButton.addEventListener('click', () => this.onCloseRequested?.());

    header.appendChild(titleWrap);
    header.appendChild(closeButton);
    this.panel.appendChild(header);

    const summary = document.createElement('div');
    summary.className = 'command-mode-overlay__summary';
    this.panel.appendChild(summary);

    this.statusValue = this.appendSummaryValue(summary, 'Order');
    this.squadValue = this.appendSummaryValue(summary, 'Squad');
    this.waypointValue = this.appendSummaryValue(summary, 'Command Point');

    const body = document.createElement('div');
    body.className = 'command-mode-overlay__body';
    this.panel.appendChild(body);

    this.tacticalMap = new CommandTacticalMap();
    this.tacticalMap.setCallbacks({
      onPointSelected: (position) => this.onMapPointSelected?.(position),
      onSquadSelected: (squadId) => this.onSquadSelected?.(squadId)
    });
    body.appendChild(this.tacticalMap.getElement());

    const sidebar = document.createElement('div');
    sidebar.className = 'command-mode-overlay__sidebar';
    body.appendChild(sidebar);

    const detailPanel = document.createElement('div');
    detailPanel.className = 'command-mode-overlay__detail-panel';
    sidebar.appendChild(detailPanel);

    this.selectedSquadValue = this.appendDetailValue(detailPanel, 'Selected Squad');
    this.selectedLeaderValue = this.appendDetailValue(detailPanel, 'Leader');
    this.selectedFormationValue = this.appendDetailValue(detailPanel, 'Formation');
    this.selectedFactionValue = this.appendDetailValue(detailPanel, 'Faction');

    const grid = document.createElement('div');
    grid.className = 'command-mode-overlay__grid';
    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      const refs = this.createCommandButton(option.slot, option.shortLabel, option.fullLabel);
      this.commandButtons.set(option.slot, refs);
      grid.appendChild(refs.button);
    }
    sidebar.appendChild(grid);

    const footer = document.createElement('div');
    footer.className = 'command-mode-overlay__footer';

    this.hintValue = document.createElement('span');
    this.hintValue.className = 'command-mode-overlay__hint';

    const note = document.createElement('span');
    note.className = 'command-mode-overlay__note';
    note.textContent = 'Follow and Auto execute immediately. Hold, Patrol, and Retreat place a ground point.';

    footer.appendChild(this.hintValue);
    footer.appendChild(note);
    this.panel.appendChild(footer);

    this.injectStyles();
    this.render();
  }

  setCallbacks(callbacks: {
    onQuickCommandSelected?: (slot: number) => void;
    onCloseRequested?: () => void;
    onMapPointSelected?: (position: THREE.Vector3) => void;
    onSquadSelected?: (squadId: string) => void;
  }): void {
    this.onQuickCommandSelected = callbacks.onQuickCommandSelected;
    this.onCloseRequested = callbacks.onCloseRequested;
    this.onMapPointSelected = callbacks.onMapPointSelected;
    this.onSquadSelected = callbacks.onSquadSelected;
  }

  setInputMode(inputMode: InputMode): void {
    if (this.inputMode === inputMode) return;
    this.inputMode = inputMode;
    this.tacticalMap.setInputMode(inputMode);
    this.render();
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.render();
  }

  setState(state: CommandModeOverlayState): void {
    this.state = state;
    this.render();
  }

  setMapState(state: CommandTacticalMapRenderState): void {
    this.tacticalMap.setRenderState(state);
  }

  nudgeGamepadCursor(x: number, z: number, deltaTime: number): void {
    this.tacticalMap.nudgeGamepadCursor(x, z, deltaTime);
  }

  confirmGamepadAction(): boolean {
    return this.tacticalMap.confirmGamepadAction();
  }

  selectSquadAtCursor(): boolean {
    return this.tacticalMap.selectSquadAtCursor();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.container);
  }

  unmount(): void {
    this.container.remove();
  }

  dispose(): void {
    this.tacticalMap.dispose();
    this.unmount();
    document.getElementById(CommandModeOverlay.STYLE_ID)?.remove();
  }

  private appendSummaryValue(parent: HTMLElement, label: string): HTMLSpanElement {
    const item = document.createElement('div');
    item.className = 'command-mode-overlay__summary-item';

    const key = document.createElement('span');
    key.className = 'command-mode-overlay__summary-key';
    key.textContent = label;

    const value = document.createElement('span');
    value.className = 'command-mode-overlay__summary-value';

    item.appendChild(key);
    item.appendChild(value);
    parent.appendChild(item);
    return value;
  }

  private appendDetailValue(parent: HTMLElement, label: string): HTMLSpanElement {
    const item = document.createElement('div');
    item.className = 'command-mode-overlay__detail-item';

    const key = document.createElement('span');
    key.className = 'command-mode-overlay__summary-key';
    key.textContent = label;

    const value = document.createElement('span');
    value.className = 'command-mode-overlay__summary-value';

    item.appendChild(key);
    item.appendChild(value);
    parent.appendChild(item);
    return value;
  }

  private createCommandButton(slot: number, shortLabel: string, fullLabel: string): OverlayButtonRefs {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-mode-overlay__button';
    button.dataset.action = `slot-${slot}`;
    button.title = fullLabel;

    let downAt = 0;
    /** Browser timer id (`window.setTimeout` is a number; Node typings use Timeout). */
    let longHold: number | null = null;
    let holdIssued = false;

    button.addEventListener('click', (e) => {
      if (this.inputMode === 'touch') {
        e.preventDefault();
        return;
      }
      this.onQuickCommandSelected?.(slot);
    });

    button.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.inputMode !== 'touch') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      downAt = performance.now();
      holdIssued = false;
      longHold = window.setTimeout(() => {
        longHold = null;
        holdIssued = true;
        this.onQuickCommandSelected?.(slot);
      }, 420);
    });

    button.addEventListener('pointerup', () => {
      if (this.inputMode !== 'touch') return;
      if (longHold !== null) {
        clearTimeout(longHold);
        longHold = null;
      }
      if (!holdIssued && performance.now() - downAt < 650) {
        this.onQuickCommandSelected?.(slot);
      }
    });

    button.addEventListener('pointercancel', () => {
      if (longHold !== null) {
        clearTimeout(longHold);
        longHold = null;
      }
    });

    const hint = document.createElement('span');
    hint.className = 'command-mode-overlay__button-hint';

    const label = document.createElement('span');
    label.className = 'command-mode-overlay__button-label';
    label.textContent = shortLabel;

    button.appendChild(hint);
    button.appendChild(label);
    return { button, hint, label };
  }

  private render(): void {
    this.container.dataset.visible = this.visible ? 'true' : 'false';
    this.container.dataset.inputMode = this.inputMode;
    this.container.dataset.touchRadial = this.inputMode === 'touch' ? 'true' : 'false';
    this.panel.setAttribute('aria-hidden', this.visible ? 'false' : 'true');

    this.statusValue.textContent = this.state.hasSquad
      ? getSquadCommandLabel(this.state.currentCommand, 'full')
      : 'NO SQUAD';
    this.squadValue.textContent = this.state.hasSquad
      ? `${this.state.memberCount} TROOPS`
      : 'UNASSIGNED';
    this.waypointValue.textContent = this.state.commandPosition
      ? `${Math.round(this.state.commandPosition.x)} / ${Math.round(this.state.commandPosition.z)}`
      : 'FOLLOW PLAYER';
    this.selectedSquadValue.textContent = this.state.selectedSquadId
      ? this.state.selectedSquadId.replace(/[_-]/g, ' ').toUpperCase()
      : 'NO ACTIVE SQUAD';
    this.selectedLeaderValue.textContent = this.state.selectedLeaderId
      ? this.state.selectedLeaderId.replace(/[_-]/g, ' ').toUpperCase()
      : 'UNKNOWN';
    this.selectedFormationValue.textContent = this.state.selectedFormation
      ? this.state.selectedFormation.toUpperCase()
      : 'UNSET';
    this.selectedFactionValue.textContent = this.state.selectedFaction ?? 'UNASSIGNED';
    this.hintValue.textContent = this.getFooterHint();
    this.tacticalMap.setPlacementCommandLabel(
      this.state.pendingCommand
        ? getSquadCommandLabel(this.state.pendingCommand, 'full')
        : 'COMMAND POINT',
      this.state.pendingCommand !== null
    );

    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      const refs = this.commandButtons.get(option.slot);
      if (!refs) continue;
      refs.hint.textContent = this.getButtonHint(option.slot);
      refs.button.disabled = !this.state.hasSquad;
      const activeCommand = this.state.pendingCommand ?? this.state.currentCommand;
      refs.button.classList.toggle(
        'command-mode-overlay__button--active',
        option.command === activeCommand
      );
    }
  }

  private getButtonHint(slot: number): string {
    switch (this.inputMode) {
      case 'touch':
        return 'TAP / HOLD';
      case 'gamepad':
        return slot <= 4 ? `D-${['UP', 'R', 'DN', 'L'][slot - 1]}` : 'AUTO';
      default:
        return `SHIFT+${slot}`;
    }
  }

  private getFooterHint(): string {
    switch (this.inputMode) {
      case 'touch':
        return 'Quick tap or hold a command. For Hold/Patrol/Retreat, then tap the map. Follow / Auto fire immediately.';
      case 'gamepad':
        return 'Use D-pad to arm orders, move the cursor with the left stick, A to confirm, and X to select a squad.';
      default:
        return 'Choose Hold, Patrol, or Retreat, then click the map. Follow and Auto fire immediately.';
    }
  }

  private injectStyles(): void {
    if (document.getElementById(CommandModeOverlay.STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = CommandModeOverlay.STYLE_ID;
    style.textContent = `
      .command-mode-overlay {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding:
          max(12px, env(safe-area-inset-top, 0px))
          max(12px, env(safe-area-inset-right, 0px))
          max(12px, env(safe-area-inset-bottom, 0px))
          max(12px, env(safe-area-inset-left, 0px));
        pointer-events: none;
        opacity: 0;
        transition: opacity 140ms ease;
        z-index: 12;
      }

      .command-mode-overlay[data-visible="true"] {
        pointer-events: auto;
        opacity: 1;
      }

      .command-mode-overlay::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(circle at center, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.52));
        border-radius: 18px;
      }

      .command-mode-overlay__panel {
        position: relative;
        width: min(100%, 640px);
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 20px;
        border: 1px solid rgba(214, 165, 89, 0.25);
        border-radius: 18px;
        background:
          linear-gradient(180deg, rgba(15, 18, 14, 0.95), rgba(8, 10, 11, 0.92)),
          radial-gradient(circle at top, rgba(92, 184, 92, 0.1), transparent 60%);
        box-shadow: 0 24px 40px rgba(0, 0, 0, 0.34);
        pointer-events: auto;
      }

      .command-mode-overlay__header,
      .command-mode-overlay__footer {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }

      .command-mode-overlay__title-wrap {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .command-mode-overlay__eyebrow,
      .command-mode-overlay__summary-key,
      .command-mode-overlay__button-hint,
      .command-mode-overlay__hint {
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: rgba(205, 196, 171, 0.62);
      }

      .command-mode-overlay__eyebrow,
      .command-mode-overlay__summary-key,
      .command-mode-overlay__button-hint {
        font-size: 11px;
      }

      .command-mode-overlay__title {
        margin: 0;
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        font-size: 28px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: rgba(244, 242, 236, 0.96);
      }

      .command-mode-overlay__close {
        padding: 8px 10px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        background: rgba(29, 32, 34, 0.86);
        color: rgba(240, 239, 235, 0.9);
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .command-mode-overlay__body {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(220px, 0.9fr);
        gap: 14px;
        align-items: start;
      }

      .command-mode-overlay__sidebar {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .command-mode-overlay__summary {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .command-mode-overlay__summary-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        background: rgba(26, 30, 28, 0.66);
      }

      .command-mode-overlay__detail-panel {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .command-mode-overlay__detail-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        background: rgba(26, 30, 28, 0.66);
      }

      .command-mode-overlay__summary-value,
      .command-mode-overlay__button-label,
      .command-mode-overlay__note {
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        color: rgba(243, 241, 233, 0.95);
      }

      .command-mode-overlay__summary-value {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .command-mode-overlay__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
        align-content: start;
      }

      .command-mode-overlay__button {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 88px;
        padding: 12px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        background: rgba(33, 38, 35, 0.76);
        text-align: left;
        cursor: pointer;
        transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
      }

      .command-mode-overlay__button:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: rgba(214, 165, 89, 0.35);
        background: rgba(48, 56, 50, 0.9);
      }

      .command-mode-overlay__button:disabled {
        opacity: 0.45;
        cursor: default;
      }

      .command-mode-overlay__button--active {
        border-color: rgba(92, 184, 92, 0.46);
        background:
          linear-gradient(180deg, rgba(32, 58, 39, 0.95), rgba(20, 37, 24, 0.88));
      }

      .command-mode-overlay__button-label {
        font-size: 16px;
        font-weight: 700;
        line-height: 1.1;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .command-mode-overlay__footer {
        align-items: flex-end;
      }

      .command-mode-overlay__hint {
        max-width: 280px;
        line-height: 1.35;
      }

      .command-mode-overlay__note {
        max-width: 260px;
        font-size: 13px;
        line-height: 1.35;
        color: rgba(217, 214, 205, 0.74);
        text-align: right;
      }

      @media (max-width: 920px) {
        .command-mode-overlay__panel {
          width: min(100%, 520px);
          padding: 16px;
        }

        .command-mode-overlay__body {
          grid-template-columns: 1fr;
        }

        .command-mode-overlay__summary,
        .command-mode-overlay__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      .command-mode-overlay[data-touch-radial="true"] .command-mode-overlay__grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(120px, 1fr));
        gap: 14px;
        justify-content: center;
      }

      .command-mode-overlay[data-touch-radial="true"] .command-mode-overlay__button {
        min-height: 76px;
        border-radius: 50%;
        align-items: center;
        justify-content: center;
        text-align: center;
        max-width: 132px;
        width: 100%;
        justify-self: center;
      }

      .command-mode-overlay[data-touch-radial="true"] .command-mode-overlay__button:nth-child(5) {
        grid-column: 1 / -1;
      }

      @media (max-width: 620px) {
        .command-mode-overlay {
          padding: 8px;
          align-items: flex-end;
        }

        .command-mode-overlay__panel {
          width: 100%;
          max-height: 85vh;
          gap: 10px;
          padding: 12px;
          border-radius: 14px 14px 0 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .command-mode-overlay__header {
          flex-direction: row;
          align-items: center;
        }

        .command-mode-overlay__title {
          font-size: 20px;
        }

        .command-mode-overlay__close {
          min-width: 56px;
          min-height: 40px;
          font-size: 13px;
        }

        .command-mode-overlay__body {
          grid-template-columns: 1fr;
        }

        .command-mode-overlay__summary {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .command-mode-overlay__summary-item {
          padding: 6px 8px;
        }

        .command-mode-overlay__detail-panel {
          display: none;
        }

        .command-mode-overlay__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .command-mode-overlay__button {
          min-height: 56px;
          padding: 10px;
          border-radius: 10px;
        }

        .command-mode-overlay__button-label {
          font-size: 14px;
        }

        .command-mode-overlay__footer {
          flex-direction: column;
          gap: 4px;
        }

        .command-mode-overlay__note {
          text-align: left;
          font-size: 11px;
        }

        .command-mode-overlay__hint {
          font-size: 11px;
        }
      }

      @media (pointer: coarse) and (max-height: 520px) {
        .command-mode-overlay {
          padding: 8px;
          align-items: flex-end;
        }

        .command-mode-overlay__panel {
          width: min(100%, 560px);
          max-height: calc(100dvh - 16px);
          gap: 10px;
          padding: 12px;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .command-mode-overlay__header {
          align-items: center;
        }

        .command-mode-overlay__title {
          font-size: 20px;
        }

        .command-mode-overlay__close {
          min-width: 56px;
          min-height: 40px;
          font-size: 13px;
        }

        .command-mode-overlay__body {
          grid-template-columns: 1fr;
        }

        .command-mode-overlay__summary {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .command-mode-overlay__summary-item {
          padding: 6px 8px;
        }

        .command-mode-overlay__detail-panel {
          display: none;
        }

        .command-mode-overlay__grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .command-mode-overlay__button {
          min-height: 56px;
          padding: 10px;
          border-radius: 10px;
        }

        .command-mode-overlay__button-label {
          font-size: 14px;
        }

        .command-mode-overlay__footer {
          flex-direction: column;
          gap: 4px;
        }

        .command-mode-overlay__note {
          text-align: left;
          font-size: 11px;
        }

        .command-mode-overlay__hint {
          font-size: 11px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
