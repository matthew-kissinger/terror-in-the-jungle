// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * ModeSelectScreen - 4 mode cards in a responsive grid.
 *
 * Each card: icon + name + one stat line.
 * Tap card -> emits mode selection. No descriptions, no feature badges.
 *
 * Premiere modes (A Shau, future faction-selectable modes) additionally show a
 * side/faction picker (BLUFOR vs OPFOR) before launch; standard modes launch
 * straight from the card with no picker. See `isFactionSelectable`.
 */

import { UIComponent } from '../engine/UIComponent';
import { GameMode } from '../../config/gameModeTypes';
import { Alliance, Faction } from '../../systems/combat/types';
import {
  getFactionOptionsForAlliance,
  getGameModeDefinition,
  getPlayableAlliances,
  isFactionSelectable,
} from '../../config/gameModeDefinitions';
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

const ALLIANCE_DISPLAY_NAMES: Record<Alliance, string> = {
  [Alliance.BLUFOR]: 'BLUFOR',
  [Alliance.OPFOR]: 'OPFOR',
};

const FACTION_DISPLAY_NAMES: Record<Faction, string> = {
  [Faction.US]: 'US',
  [Faction.ARVN]: 'ARVN',
  [Faction.NVA]: 'NVA',
  [Faction.VC]: 'Viet Cong',
};

/** Selection callback payload. `alliance` is set only for premiere modes. */
export interface ModeSelection {
  mode: GameMode;
  alliance?: Alliance;
}

export class ModeSelectScreen extends UIComponent {
  private onModeSelect?: (selection: ModeSelection) => void;
  private onBack?: () => void;
  private pendingMode: GameMode | null = null;

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

        <div class="${styles.cards}" data-ref="cards">${cardsHtml}</div>

        <section class="${styles.sidePicker}" data-ref="side-picker">
          <span class="${styles.sidePickerLabel}">Premiere deployment</span>
          <h3 class="${styles.sidePickerTitle}">CHOOSE YOUR SIDE</h3>
          <p class="${styles.sidePickerBody}">Fight as the allied coalition or the people's army.</p>
          <div class="${styles.sideOptions}" data-ref="side-options"></div>
        </section>
      </div>
    `;
  }

  protected onMount(): void {
    const cards = this.$all('[data-mode]');
    for (const card of cards) {
      this.listen(card, 'click', () => {
        const mode = card.dataset.mode as GameMode;
        this.handleModeCardClick(mode);
      });
    }

    const backBtn = this.$('[data-ref="back"]');
    if (backBtn) {
      this.listen(backBtn, 'click', () => this.handleBack());
    }

    this.listen(window, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.handleBack();
      }
    });
  }

  // --- Public API ---

  show(): void {
    this.showCards();
    this.root.classList.add(styles.visible);
  }

  hide(): void {
    this.root.classList.remove(styles.visible);
    this.showCards();
  }

  isVisible(): boolean {
    return this.root.classList.contains(styles.visible);
  }

  setOnModeSelect(callback: (selection: ModeSelection) => void): void {
    this.onModeSelect = callback;
  }

  setOnBack(callback: () => void): void {
    this.onBack = callback;
  }

  // --- Private ---

  private handleModeCardClick(mode: GameMode): void {
    const definition = getGameModeDefinition(mode);
    if (isFactionSelectable(definition)) {
      this.openSidePicker(mode);
      return;
    }
    this.onModeSelect?.({ mode });
  }

  /** BACK steps out of the side picker first, then leaves the screen. */
  private handleBack(): void {
    if (this.isSidePickerOpen()) {
      this.showCards();
      return;
    }
    this.onBack?.();
  }

  private openSidePicker(mode: GameMode): void {
    this.pendingMode = mode;
    const definition = getGameModeDefinition(mode);
    const optionsHost = this.$('[data-ref="side-options"]');
    if (!optionsHost) return;

    const alliances = getPlayableAlliances(definition);
    optionsHost.innerHTML = alliances
      .map((alliance) => {
        const factions = getFactionOptionsForAlliance(definition, alliance)
          .map((f) => FACTION_DISPLAY_NAMES[f])
          .join(' + ');
        return `
          <button class="${styles.sideOption}" data-alliance="${alliance}" type="button">
            <span class="${styles.sideOptionName}">${ALLIANCE_DISPLAY_NAMES[alliance]}</span>
            <span class="${styles.sideOptionFactions}">${factions}</span>
          </button>
        `;
      })
      .join('');

    for (const option of this.$all('[data-alliance]')) {
      this.listen(option, 'click', () => {
        const alliance = option.dataset.alliance as Alliance;
        this.handleSideSelected(alliance);
      });
    }

    this.showSidePicker();
  }

  private handleSideSelected(alliance: Alliance): void {
    if (this.pendingMode === null) return;
    const mode = this.pendingMode;
    this.pendingMode = null;
    this.onModeSelect?.({ mode, alliance });
  }

  private showCards(): void {
    this.pendingMode = null;
    const sidePicker = this.$('[data-ref="side-picker"]');
    const cards = this.$('[data-ref="cards"]');
    sidePicker?.classList.remove(styles.sidePickerVisible);
    if (cards) cards.style.display = '';
  }

  private showSidePicker(): void {
    const sidePicker = this.$('[data-ref="side-picker"]');
    const cards = this.$('[data-ref="cards"]');
    if (cards) cards.style.display = 'none';
    sidePicker?.classList.add(styles.sidePickerVisible);
  }

  private isSidePickerOpen(): boolean {
    const sidePicker = this.$('[data-ref="side-picker"]');
    return Boolean(sidePicker?.classList.contains(styles.sidePickerVisible));
  }
}
