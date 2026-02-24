/**
 * KillCounter - Displays compact player kills/deaths.
 *
 * Signal-driven: addKill()/addDeath() increment counters.
 *
 * Replaces: CombatStatsDisplay.killCounter + HUDUpdater.initializeKillCounter() + updateKillCounter()
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './KillCounter.module.css';

export class KillCounter extends UIComponent {
  // --- Reactive state ---
  private kills = this.signal(0);
  private deaths = this.signal(0);

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div class="${styles.stat} ${styles.kills}">
        <span class="${styles.value}" data-ref="kills">0</span>
        <span class="${styles.label}">Kills</span>
      </div>
      <div class="${styles.stat} ${styles.deaths}">
        <span class="${styles.value}" data-ref="deaths">0</span>
        <span class="${styles.label}">Deaths</span>
      </div>
    `;
  }

  protected onMount(): void {
    this.effect(() => {
      this.text('[data-ref="kills"]', String(this.kills.value));
    });

    this.effect(() => {
      this.text('[data-ref="deaths"]', String(this.deaths.value));
    });

  }

  // --- Public API ---

  addKill(): void {
    this.kills.value++;
  }

  addDeath(): void {
    this.deaths.value++;
  }

  getKills(): number {
    return this.kills.value;
  }

  getDeaths(): number {
    return this.deaths.value;
  }
}
