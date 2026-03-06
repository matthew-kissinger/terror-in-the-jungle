import type { LayoutComponent } from '../layout/types';
import type { InputMode } from '../../systems/input/InputManager';
import { SquadCommand } from '../../systems/combat/types';
import {
  getSquadCommandLabel,
  SQUAD_QUICK_COMMAND_OPTIONS
} from '../../systems/combat/SquadCommandPresentation';

interface QuickCommandButtonRefs {
  button: HTMLButtonElement;
  hint: HTMLSpanElement;
  label: HTMLSpanElement;
}

export interface QuickCommandStripState {
  hasSquad: boolean;
  currentCommand: SquadCommand;
  isCommandModeOpen: boolean;
}

export class QuickCommandStrip implements LayoutComponent {
  private static readonly STYLE_ID = 'quick-command-strip-styles';

  private readonly container: HTMLDivElement;
  private readonly modeButton: HTMLButtonElement;
  private readonly modeHint: HTMLSpanElement;
  private readonly modeLabel: HTMLSpanElement;
  private readonly statusLabel: HTMLSpanElement;
  private readonly commandButtons = new Map<number, QuickCommandButtonRefs>();
  private state: QuickCommandStripState = {
    hasSquad: false,
    currentCommand: SquadCommand.NONE,
    isCommandModeOpen: false
  };
  private inputMode: InputMode = 'keyboardMouse';
  private onCommandModeRequested?: () => void;
  private onQuickCommandSelected?: (slot: number) => void;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'quick-command-strip';

    const header = document.createElement('div');
    header.className = 'quick-command-strip__header';

    const title = document.createElement('span');
    title.className = 'quick-command-strip__title';
    title.textContent = 'SQUAD';

    this.statusLabel = document.createElement('span');
    this.statusLabel.className = 'quick-command-strip__status';
    this.statusLabel.textContent = getSquadCommandLabel(SquadCommand.NONE, 'short');

    header.appendChild(title);
    header.appendChild(this.statusLabel);
    this.container.appendChild(header);

    const actions = document.createElement('div');
    actions.className = 'quick-command-strip__actions';

    const modeButtonRefs = this.createActionButton({
      action: 'mode',
      label: 'COMMAND',
      hint: this.getModeHintText()
    });
    this.modeButton = modeButtonRefs.button;
    this.modeHint = modeButtonRefs.hint;
    this.modeLabel = modeButtonRefs.label;
    this.modeButton.classList.add('quick-command-strip__button--mode');
    this.modeButton.addEventListener('click', () => this.onCommandModeRequested?.());
    actions.appendChild(this.modeButton);

    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      const refs = this.createActionButton({
        action: `slot-${option.slot}`,
        label: option.shortLabel,
        hint: this.getQuickHintText(option.slot)
      });
      refs.button.title = option.fullLabel;
      refs.button.addEventListener('click', () => this.onQuickCommandSelected?.(option.slot));
      this.commandButtons.set(option.slot, refs);
      actions.appendChild(refs.button);
    }

    this.container.appendChild(actions);
    this.injectStyles();
    this.render();
  }

  setCallbacks(callbacks: {
    onCommandModeRequested?: () => void;
    onQuickCommandSelected?: (slot: number) => void;
  }): void {
    this.onCommandModeRequested = callbacks.onCommandModeRequested;
    this.onQuickCommandSelected = callbacks.onQuickCommandSelected;
  }

  setInputMode(inputMode: InputMode): void {
    if (this.inputMode === inputMode) return;
    this.inputMode = inputMode;
    this.render();
  }

  setState(state: QuickCommandStripState): void {
    this.state = state;
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
    document.getElementById(QuickCommandStrip.STYLE_ID)?.remove();
  }

  private createActionButton(config: {
    action: string;
    label: string;
    hint: string;
  }): QuickCommandButtonRefs {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quick-command-strip__button';
    button.dataset.action = config.action;

    const hint = document.createElement('span');
    hint.className = 'quick-command-strip__hint';
    hint.textContent = config.hint;

    const label = document.createElement('span');
    label.className = 'quick-command-strip__label';
    label.textContent = config.label;

    button.appendChild(hint);
    button.appendChild(label);

    return { button, hint, label };
  }

  private render(): void {
    this.container.dataset.inputMode = this.inputMode;
    this.container.dataset.ready = this.state.hasSquad ? 'true' : 'false';

    this.modeHint.textContent = this.getModeHintText();
    this.modeLabel.textContent = this.state.isCommandModeOpen ? 'RADIAL OPEN' : 'COMMAND';
    this.modeButton.classList.toggle('quick-command-strip__button--active', this.state.isCommandModeOpen);
    this.modeButton.disabled = !this.state.hasSquad;

    const statusText = this.state.hasSquad
      ? getSquadCommandLabel(this.state.currentCommand, 'short')
      : 'NO SQUAD';
    this.statusLabel.textContent = statusText;

    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      const refs = this.commandButtons.get(option.slot);
      if (!refs) continue;

      refs.hint.textContent = this.getQuickHintText(option.slot);
      refs.label.textContent = option.shortLabel;
      refs.button.disabled = !this.state.hasSquad;
      refs.button.classList.toggle(
        'quick-command-strip__button--active',
        this.state.currentCommand === option.command
      );
    }
  }

  private getModeHintText(): string {
    switch (this.inputMode) {
      case 'gamepad':
        return 'R3';
      case 'touch':
        return 'TAP';
      default:
        return 'Z';
    }
  }

  private getQuickHintText(slot: number): string {
    switch (this.inputMode) {
      case 'gamepad': {
        const dpadHints: Record<number, string> = {
          1: 'D-UP',
          2: 'D-R',
          3: 'D-DN',
          4: 'D-L',
          5: 'RADIAL'
        };
        return dpadHints[slot] ?? 'D-PAD';
      }
      case 'touch':
        return 'TAP';
      default:
        return `S+${slot}`;
    }
  }

  private injectStyles(): void {
    if (document.getElementById(QuickCommandStrip.STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = QuickCommandStrip.STYLE_ID;
    style.textContent = `
      .quick-command-strip {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: min(100%, 520px);
        padding: 8px 10px 10px;
        border: 1px solid rgba(199, 157, 74, 0.28);
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(18, 20, 16, 0.88), rgba(9, 11, 12, 0.74)),
          radial-gradient(circle at top, rgba(113, 148, 84, 0.12), transparent 58%);
        box-shadow: 0 14px 24px rgba(0, 0, 0, 0.26);
        backdrop-filter: blur(10px);
        pointer-events: auto;
        box-sizing: border-box;
      }

      .quick-command-strip__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .quick-command-strip__title,
      .quick-command-strip__status {
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        letter-spacing: 0.16em;
        text-transform: uppercase;
        line-height: 1;
      }

      .quick-command-strip__title {
        font-size: 11px;
        color: rgba(214, 197, 153, 0.72);
      }

      .quick-command-strip__status {
        font-size: 13px;
        font-weight: 700;
        color: rgba(239, 239, 228, 0.94);
      }

      .quick-command-strip__actions {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 6px;
      }

      .quick-command-strip__button {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-height: 54px;
        padding: 8px 9px 9px;
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 10px;
        background: rgba(31, 36, 32, 0.72);
        color: rgba(241, 238, 229, 0.92);
        font-family: var(--font-primary, 'Rajdhani', sans-serif);
        text-align: left;
        cursor: pointer;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background 120ms ease,
          box-shadow 120ms ease;
      }

      .quick-command-strip__button:hover:not(:disabled) {
        border-color: rgba(214, 165, 89, 0.32);
        background: rgba(52, 60, 50, 0.88);
        transform: translateY(-1px);
      }

      .quick-command-strip__button:disabled {
        cursor: default;
        opacity: 0.48;
      }

      .quick-command-strip__button--active {
        border-color: rgba(92, 184, 92, 0.48);
        background:
          linear-gradient(180deg, rgba(34, 62, 42, 0.96), rgba(22, 39, 28, 0.88));
        box-shadow: inset 0 0 0 1px rgba(92, 184, 92, 0.2);
      }

      .quick-command-strip__button--mode.quick-command-strip__button--active {
        border-color: rgba(214, 165, 89, 0.5);
        background:
          linear-gradient(180deg, rgba(70, 56, 28, 0.94), rgba(42, 34, 16, 0.88));
        box-shadow: inset 0 0 0 1px rgba(214, 165, 89, 0.2);
      }

      .quick-command-strip__hint,
      .quick-command-strip__label {
        line-height: 1;
        text-transform: uppercase;
      }

      .quick-command-strip__hint {
        font-size: 10px;
        letter-spacing: 0.12em;
        color: rgba(193, 182, 158, 0.52);
      }

      .quick-command-strip__label {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
      }

      .quick-command-strip[data-input-mode="touch"] .quick-command-strip__actions {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }

      .quick-command-strip[data-input-mode="touch"] .quick-command-strip__button {
        min-height: 48px;
      }

      .quick-command-strip[data-input-mode="touch"] .quick-command-strip__hint {
        display: none;
      }

      @media (max-width: 920px) {
        .quick-command-strip {
          width: min(100%, 420px);
        }

        .quick-command-strip__actions {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 620px) {
        .quick-command-strip {
          width: min(100%, 360px);
          padding: 8px;
        }

        .quick-command-strip__button {
          min-height: 46px;
          padding: 7px 8px;
        }

        .quick-command-strip__hint {
          font-size: 9px;
        }
      }
    `;
    document.head.appendChild(style);
  }
}
