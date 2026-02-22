/**
 * StatsPanel - Personal K/D/KD stats + kill streak notifications.
 *
 * Two layouts: vertical (desktop) and horizontal (mobile), switched via CSS.
 * Kill streak overlay is a separate fixed-position element for center-screen display.
 *
 * Note: Kill streak audio stings are disabled (TODO in original code).
 *
 * Replaces: PersonalStatsPanel (old class with injected global styles)
 */

import { UIComponent } from '../engine/UIComponent';
import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';
import styles from './StatsPanel.module.css';

/** Kill streak milestones and their display text + color */
const STREAKS: Record<number, { message: string; color: string }> = {
  3:  { message: 'KILLING SPREE', color: 'var(--accent)' },
  5:  { message: 'RAMPAGE',       color: 'var(--danger)' },
  7:  { message: 'DOMINATING',    color: 'var(--danger)' },
  10: { message: 'UNSTOPPABLE',   color: 'var(--critical)' },
  15: { message: 'GODLIKE',       color: 'var(--text-primary)' },
};

export class StatsPanel extends UIComponent {
  // --- Reactive state ---
  private kills = this.signal(0);
  private deaths = this.signal(0);
  private kdRatio = this.computed(() => {
    const k = this.kills.value;
    const d = this.deaths.value;
    return d > 0 ? (k / d).toFixed(2) : k.toFixed(2);
  });

  // Kill streak tracking
  private currentStreak = 0;
  private lastKillTime = 0;
  private readonly STREAK_TIMEOUT = 10_000; // 10s
  private streakTimerId: ReturnType<typeof setTimeout> | null = null;
  private streakFadeTimerId: ReturnType<typeof setTimeout> | null = null;

  // Streak overlay element (fixed-position, mounted separately)
  private streakOverlay: HTMLDivElement | null = null;

  constructor(private statsTracker: PlayerStatsTracker) {
    super();
  }

  protected build(): void {
    this.root.className = styles.container;

    // Desktop layout
    this.root.innerHTML = `
      <div class="${styles.desktop}">
        <div class="${styles.header}">Stats</div>
        <div class="${styles.statRow}">
          <span class="${styles.statLabel}">K</span>
          <span data-ref="dk" class="${styles.statValueKills}">0</span>
        </div>
        <div class="${styles.statRow}">
          <span class="${styles.statLabel}">D</span>
          <span data-ref="dd" class="${styles.statValueDeaths}">0</span>
        </div>
        <div class="${styles.statRow}">
          <span class="${styles.statLabel}">K/D</span>
          <span data-ref="dkd" class="${styles.statValueKD}">0.00</span>
        </div>
      </div>
      <div class="${styles.mobile}">
        <span class="${styles.statValueKills}">K:<span data-ref="mk">0</span></span>
        <span class="${styles.statValueDeaths}">D:<span data-ref="md">0</span></span>
        <span class="${styles.statValueKD}">KD:<span data-ref="mkd">0.00</span></span>
      </div>
    `;

    // Create streak overlay (will be mounted separately to center slot)
    this.streakOverlay = document.createElement('div');
    this.streakOverlay.className = styles.streakOverlay;
  }

  protected onMount(): void {
    // Mount streak overlay to parent (same slot)
    if (this.streakOverlay && this.root.parentElement) {
      this.root.parentElement.appendChild(this.streakOverlay);
    }

    // Effect: update kills display (desktop + mobile)
    this.effect(() => {
      const k = this.kills.value.toString();
      this.text('[data-ref="dk"]', k);
      this.text('[data-ref="mk"]', k);
    });

    // Effect: update deaths display
    this.effect(() => {
      const d = this.deaths.value.toString();
      this.text('[data-ref="dd"]', d);
      this.text('[data-ref="md"]', d);
    });

    // Effect: update KD ratio display
    this.effect(() => {
      const kd = this.kdRatio.value;
      this.text('[data-ref="dkd"]', kd);
      this.text('[data-ref="mkd"]', kd);
    });
  }

  protected onUnmount(): void {
    // Remove streak overlay from DOM
    if (this.streakOverlay?.parentNode) {
      this.streakOverlay.parentNode.removeChild(this.streakOverlay);
    }
  }

  // --- Public API ---

  /** Sync stats from tracker (called each frame) */
  update(): void {
    const stats = this.statsTracker.getStats();
    this.kills.value = stats.kills;
    this.deaths.value = stats.deaths;

    // Check streak timeout
    if (this.currentStreak > 0 && Date.now() - this.lastKillTime > this.STREAK_TIMEOUT) {
      this.currentStreak = 0;
    }
  }

  onKill(): void {
    const now = Date.now();
    if (now - this.lastKillTime < this.STREAK_TIMEOUT) {
      this.currentStreak++;
    } else {
      this.currentStreak = 1;
    }
    this.lastKillTime = now;
    this.checkStreakMilestone();
  }

  onDeath(): void {
    this.currentStreak = 0;
  }

  // --- Kill streak ---

  private checkStreakMilestone(): void {
    const milestone = STREAKS[this.currentStreak];
    if (!milestone) return;
    this.showStreak(milestone.message, milestone.color);
  }

  private showStreak(message: string, color: string): void {
    if (!this.streakOverlay) return;

    // Clear any pending timers
    if (this.streakTimerId !== null) clearTimeout(this.streakTimerId);
    if (this.streakFadeTimerId !== null) clearTimeout(this.streakFadeTimerId);

    this.streakOverlay.textContent = message;
    this.streakOverlay.style.color = color;
    this.streakOverlay.style.borderColor = color;
    this.streakOverlay.className = `${styles.streakOverlay} ${styles.streakVisible}`;

    // Fade out after 3s
    this.streakTimerId = setTimeout(() => {
      if (!this.streakOverlay) return;
      this.streakOverlay.className = `${styles.streakOverlay} ${styles.streakVisible} ${styles.streakFading}`;
      this.streakFadeTimerId = setTimeout(() => {
        if (!this.streakOverlay) return;
        this.streakOverlay.className = styles.streakOverlay;
      }, 300);
    }, 3000);
  }

  override dispose(): void {
    if (this.streakTimerId !== null) clearTimeout(this.streakTimerId);
    if (this.streakFadeTimerId !== null) clearTimeout(this.streakFadeTimerId);
    if (this.streakOverlay?.parentNode) {
      this.streakOverlay.parentNode.removeChild(this.streakOverlay);
    }
    super.dispose();
  }
}
