/**
 * ModeSelectScreen - 4 mode cards in a responsive grid.
 *
 * Each card: icon + name + one stat line.
 * Tap card -> emits mode selection. No descriptions, no feature badges.
 */

import { UIComponent } from '../engine/UIComponent';
import { GameMode } from '../../config/gameModeTypes';
import { iconHtml } from '../icons/IconRegistry';
import styles from './ModeSelectScreen.module.css';

interface ModeEntry {
  key: string;
  mode: GameMode;
  name: string;
  stat: string;
  icon: string;
  isTdm: boolean;
}

const MODE_ENTRIES: ModeEntry[] = [
  { key: 'zone_control', mode: GameMode.ZONE_CONTROL, name: 'ZONE CONTROL', stat: '60 AI, 3 min', icon: 'mode-conquest', isTdm: false },
  { key: 'open_frontier', mode: GameMode.OPEN_FRONTIER, name: 'OPEN FRONTIER', stat: '120 AI, 15 min', icon: 'mode-frontier', isTdm: false },
  { key: 'tdm', mode: GameMode.TEAM_DEATHMATCH, name: 'TDM', stat: '30 AI, 5 min', icon: 'mode-tdm', isTdm: true },
  { key: 'a_shau_valley', mode: GameMode.A_SHAU_VALLEY, name: 'A SHAU VALLEY', stat: '3000 AI, 60 min', icon: 'mode-ashau', isTdm: false },
];

export class ModeSelectScreen extends UIComponent {
  private onModeSelect?: (mode: GameMode) => void;
  private onBack?: () => void;

  protected build(): void {
    this.root.className = styles.screen;

    const cardsHtml = MODE_ENTRIES.map(entry => {
      const tdmClass = entry.isTdm ? ` ${styles.cardTdm}` : '';
      return `
        <div class="${styles.card}${tdmClass}" data-mode="${entry.mode}">
          ${iconHtml(entry.icon, { width: 36, css: 'flex-shrink:0;opacity:0.85;image-rendering:pixelated;' })}
          <div class="${styles.cardInfo}">
            <span class="${styles.cardName}">${entry.name}</span>
            <span class="${styles.cardStat}">${entry.stat}</span>
          </div>
        </div>
      `;
    }).join('');

    this.root.innerHTML = `
      <div class="${styles.content}">
        <h2 class="${styles.heading}">SELECT MODE</h2>
        <div class="${styles.cards}">${cardsHtml}</div>
        <button class="${styles.backButton}" data-ref="back" type="button">BACK</button>
      </div>
    `;
  }

  protected onMount(): void {
    const cards = this.$all('[data-mode]');
    for (const card of cards) {
      this.listen(card, 'pointerdown', () => {
        const mode = card.dataset.mode as GameMode;
        this.onModeSelect?.(mode);
      });
      this.listen(card, 'click', (e) => e.preventDefault());
    }

    const backBtn = this.$('[data-ref="back"]');
    if (backBtn) {
      this.listen(backBtn, 'pointerdown', () => this.onBack?.());
      this.listen(backBtn, 'click', (e) => e.preventDefault());
    }

    this.listen(window, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.onBack?.();
      }
    });
  }

  // --- Public API ---

  show(): void {
    this.root.classList.add(styles.visible);
  }

  hide(): void {
    this.root.classList.remove(styles.visible);
  }

  isVisible(): boolean {
    return this.root.classList.contains(styles.visible);
  }

  setOnModeSelect(callback: (mode: GameMode) => void): void {
    this.onModeSelect = callback;
  }

  setOnBack(callback: () => void): void {
    this.onBack = callback;
  }
}
