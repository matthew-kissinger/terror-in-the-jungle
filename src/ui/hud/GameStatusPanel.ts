/**
 * GameStatusPanel - Shows current match phase and ticket bleed rate.
 *
 * Phases: SETUP -> COMBAT -> OVERTIME -> ENDED
 * Bleed indicator shows which faction is losing tickets from zone control.
 *
 * Signal-driven: caller sets state via setGameState(), DOM updates automatically.
 * Replaces: HUDUpdater.updateGameStatus() + initializeGameStatus()
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './GameStatusPanel.module.css';

export type GamePhase = 'SETUP' | 'COMBAT' | 'OVERTIME' | 'ENDED';

/** Phase class name mapping */
const PHASE_CLASSES: Record<GamePhase, string> = {
  SETUP: styles.phaseSetup,
  COMBAT: styles.phaseCombat,
  OVERTIME: styles.phaseOvertime,
  ENDED: styles.phaseEnded,
};

/** Human-readable phase labels — COMBAT is intentionally blank (players know they're in combat) */
const PHASE_LABELS: Record<GamePhase, string> = {
  SETUP: 'PREPARE FOR BATTLE',
  COMBAT: '',
  OVERTIME: 'OVERTIME!',
  ENDED: 'GAME ENDED',
};

export class GameStatusPanel extends UIComponent {
  // --- Reactive state ---
  private phase = this.signal<GamePhase>('SETUP');
  private winner = this.signal<string | null>(null);
  private bleedText = this.signal('');

  /** Track previous phase class for cleanup */
  private prevPhaseClass = '';

  protected build(): void {
    this.root.className = styles.container;
    this.root.innerHTML = `
      <div data-ref="phase" class="${styles.phaseText}"></div>
      <div data-ref="bleed" class="${styles.bleed} ${styles.bleedHidden}"></div>
    `;
  }

  protected onMount(): void {
    // Effect: phase text + styling
    this.effect(() => {
      const phase = this.phase.value;
      const winner = this.winner.value;

      // Update text
      const label = phase === 'ENDED' && winner
        ? `${winner} VICTORY!`
        : PHASE_LABELS[phase];
      this.text('[data-ref="phase"]', label);

      // Swap phase class on root
      if (this.prevPhaseClass) {
        this.root.classList.remove(this.prevPhaseClass);
      }
      const cls = PHASE_CLASSES[phase];
      this.root.classList.add(cls);
      this.prevPhaseClass = cls;
    });

    // Effect: bleed indicator
    this.effect(() => {
      const text = this.bleedText.value;
      const bleedEl = this.$('[data-ref="bleed"]');
      if (!bleedEl) return;

      if (text) {
        bleedEl.textContent = text;
        bleedEl.classList.remove(styles.bleedHidden);
      } else {
        bleedEl.textContent = '';
        bleedEl.classList.add(styles.bleedHidden);
      }
    });
  }

  // --- Public API ---

  /**
   * Update game state. Called by HUDUpdater per tick.
   * @param phase Current match phase
   * @param winner Winner faction name (only used when phase is ENDED)
   * @param bleedText Bleed rate text (e.g. "US -1.5/s") or empty string
   */
  setGameState(phase: GamePhase, winner: string | null, bleedText: string): void {
    this.phase.value = phase;
    this.winner.value = winner;
    this.bleedText.value = bleedText;
  }
}
