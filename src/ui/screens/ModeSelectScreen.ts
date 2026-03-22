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
  icon: string;
  tagline: string;
  tempo: string;
  scale: string;
  duration: string;
  theater: string;
  isTdm: boolean;
}

const MODE_ENTRIES: ModeEntry[] = [
  {
    key: 'zone_control',
    mode: GameMode.ZONE_CONTROL,
    name: 'ZONE CONTROL',
    icon: 'mode-conquest',
    tagline: 'Frontline capture with short, readable engagements and rapid redeploy cadence.',
    tempo: 'Fast',
    scale: 'Platoon / 60 AI',
    duration: '3 min',
    theater: 'Multi-zone frontline',
    isTdm: false,
  },
  {
    key: 'open_frontier',
    mode: GameMode.OPEN_FRONTIER,
    name: 'OPEN FRONTIER',
    icon: 'mode-frontier',
    tagline: 'Open map pressure with deeper routes, broad maneuvering, and live strategic spacing.',
    tempo: 'Medium',
    scale: 'Company / 120 AI',
    duration: '15 min',
    theater: 'Wide frontier theater',
    isTdm: false,
  },
  {
    key: 'tdm',
    mode: GameMode.TEAM_DEATHMATCH,
    name: 'TEAM DEATHMATCH',
    icon: 'mode-tdm',
    tagline: 'Tighter combat loop with immediate contact, short downtime, and kill-driven scoring.',
    tempo: 'Very fast',
    scale: 'Squad / 30 AI',
    duration: '5 min',
    theater: 'Close combat arena',
    isTdm: true,
  },
  {
    key: 'a_shau_valley',
    mode: GameMode.A_SHAU_VALLEY,
    name: 'A SHAU VALLEY',
    icon: 'mode-ashau',
    tagline: 'Warfront-scale campaign across a historic valley with strategic pressure and deep insertion.',
    tempo: 'Escalating',
    scale: 'Battalion / 3000 AI',
    duration: '60 min',
    theater: 'Historic campaign valley',
    isTdm: false,
  },
];

export class ModeSelectScreen extends UIComponent {
  private onModeSelect?: (mode: GameMode) => void;
  private onBack?: () => void;

  protected build(): void {
    this.root.className = styles.screen;

    const cardsHtml = MODE_ENTRIES.map((entry, index) => {
      const tdmClass = entry.isTdm ? ` ${styles.cardTdm}` : '';
      return `
        <div class="${styles.card}${tdmClass}" data-mode="${entry.mode}">
          <div class="${styles.cardHeader}">
            <div class="${styles.cardIconWrap}">
              ${iconHtml(entry.icon, { width: 30, css: 'opacity:0.9;image-rendering:pixelated;' })}
            </div>
            <div class="${styles.cardInfo}">
              <span class="${styles.cardName}">${entry.name}</span>
              <p class="${styles.cardTagline}">${entry.tagline}</p>
            </div>
            <span class="${styles.cardIndex}">0${index + 1}</span>
          </div>

          <div class="${styles.cardMetrics}">
            <div class="${styles.metricCell}">
              <span class="${styles.metricLabel}">Tempo</span>
              <span class="${styles.metricValue}">${entry.tempo}</span>
            </div>
            <div class="${styles.metricCell}">
              <span class="${styles.metricLabel}">Command</span>
              <span class="${styles.metricValue}">${entry.scale}</span>
            </div>
            <div class="${styles.metricCell}">
              <span class="${styles.metricLabel}">Duration</span>
              <span class="${styles.metricValue}">${entry.duration}</span>
            </div>
            <div class="${styles.metricCell}">
              <span class="${styles.metricLabel}">Theater</span>
              <span class="${styles.metricValue}">${entry.theater}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.root.innerHTML = `
      <div class="${styles.content}" data-ref="mode-select-content">
        <section class="${styles.headerPanel}" data-ref="mode-select-header">
          <div class="${styles.headerBar}">
            <button class="${styles.backButton}" data-ref="back" type="button">BACK</button>
            <h2 class="${styles.heading}">SELECT MODE</h2>
          </div>
        </section>

        <div class="${styles.cards}">${cardsHtml}</div>
      </div>
    `;
  }

  protected onMount(): void {
    const cards = this.$all('[data-mode]');
    for (const card of cards) {
      this.listen(card, 'click', () => {
        const mode = card.dataset.mode as GameMode;
        this.onModeSelect?.(mode);
      });
    }

    const backBtn = this.$('[data-ref="back"]');
    if (backBtn) {
      this.listen(backBtn, 'click', () => this.onBack?.());
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
