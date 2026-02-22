/**
 * MatchEndScreen - Full-screen match results overlay.
 *
 * Shows victory/defeat header, two-column stats, awards badges,
 * and play-again / return-to-menu buttons. Content is rebuilt
 * each time show() is called with new stats.
 *
 * Replaces: old MatchEndScreen + MatchEndScreenDOM + MatchEndScreenStyles
 */

import { UIComponent } from '../engine/UIComponent';
import { Logger } from '../../utils/Logger';
import { Faction } from '../../systems/combat/types';
import { GameState } from '../../systems/world/TicketSystem';
import styles from './MatchEndScreen.module.css';

export interface MatchStats {
  kills: number;
  deaths: number;
  assists: number;
  zonesCaptured: number;
  matchDuration: number;
  usTickets: number;
  opforTickets: number;
  usTeamKills: number;
  usTeamDeaths: number;
  opforTeamKills: number;
  opforTeamDeaths: number;
  headshots: number;
  damageDealt: number;
  accuracy: number;
  longestKill: number;
  grenadesThrown: number;
  grenadeKills: number;
  bestKillStreak: number;
  shotsFired: number;
  shotsHit: number;
}

interface Award {
  name: string;
  value: string;
}

export class MatchEndScreen extends UIComponent {
  private onReturnToMenuCallback?: () => void;
  private onPlayAgainCallback?: () => void;

  protected build(): void {
    // Content is set dynamically in show()
  }

  protected onMount(): void {
    // Bind buttons (content must be set before mount)
    const playAgainBtn = this.$('[data-ref="playAgain"]');
    if (playAgainBtn) {
      this.listen(playAgainBtn, 'click', this.handlePlayAgain);
    }

    const returnBtn = this.$('[data-ref="return"]');
    if (returnBtn) {
      this.listen(returnBtn, 'click', this.handleReturnToMenu);
    }
  }

  // --- Public API ---

  show(winner: Faction, gameState: GameState, stats: MatchStats): void {
    // Remove previous if showing
    this.hide();

    const isVictory = winner === Faction.US;
    this.root.className = `${styles.screen} ${isVictory ? styles.victory : styles.defeat}`;
    this.root.innerHTML = this.buildContent(winner, gameState, stats);

    this.mount(document.body);
    Logger.info('ui', `Match end screen shown: ${winner} wins`);
  }

  hide(): void {
    if (this.mounted) {
      this.unmount();
    }
  }

  onReturnToMenu(callback: () => void): void {
    this.onReturnToMenuCallback = callback;
  }

  onPlayAgain(callback: () => void): void {
    this.onPlayAgainCallback = callback;
  }

  // --- Button handlers ---

  private handlePlayAgain = () => {
    if (this.onPlayAgainCallback) {
      this.hide();
      this.onPlayAgainCallback();
    } else {
      Logger.info('ui', 'Restarting match (reloading page)');
      window.location.reload();
    }
  };

  private handleReturnToMenu = () => {
    if (this.onReturnToMenuCallback) {
      this.onReturnToMenuCallback();
    } else {
      Logger.info('ui', 'Returning to main menu (reloading page)');
      window.location.reload();
    }
  };

  // --- Content builder ---

  private buildContent(winner: Faction, gameState: GameState, stats: MatchStats): string {
    const isVictory = winner === Faction.US;

    const minutes = Math.floor(gameState.matchDuration / 60);
    const seconds = Math.floor(gameState.matchDuration % 60);
    const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const headshotPct = stats.kills > 0 ? Math.round((stats.headshots / stats.kills) * 100) : 0;
    const accuracy = Math.round(stats.accuracy * 100);

    const awards = this.generateAwards(stats);
    const awardsHTML = awards.length > 0 ? `
      <div class="${styles.awardsSection}">
        <div class="${styles.awardsTitle}">Match Awards</div>
        <div class="${styles.awardsContainer}">
          ${awards.map(award => `
            <div class="${styles.awardBadge}">
              <div class="${styles.awardName}">${award.name}</div>
              <div class="${styles.awardValue}">${award.value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="${styles.header}">
        <div class="${styles.title}">${isVictory ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="${styles.subtitle}">${winner} wins the battle</div>
      </div>

      <div class="${styles.statsPanel}">
        <div class="${styles.statsColumn}">
          <div class="${styles.statsSection}">
            <div class="${styles.statsSectionTitle}">Match Results</div>
            <div class="${styles.ticketComparison}">
              <div class="${styles.factionScore} ${styles.factionUS}">
                <div class="${styles.factionName}">US ${gameState.isTDM ? 'Kills' : 'Tickets'}</div>
                <div class="${styles.factionTickets}">${Math.round(stats.usTickets)}</div>
              </div>
              <div class="${styles.vsDivider}">VS</div>
              <div class="${styles.factionScore} ${styles.factionOPFOR}">
                <div class="${styles.factionName}">OPFOR ${gameState.isTDM ? 'Kills' : 'Tickets'}</div>
                <div class="${styles.factionTickets}">${Math.round(stats.opforTickets)}</div>
              </div>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Match Duration</span>
              <span class="${styles.statValue}">${durationText}</span>
            </div>
          </div>

          <div class="${styles.statsSection}">
            <div class="${styles.statsSectionTitle}">Team Combat Totals</div>
            <div class="${styles.ticketComparison}">
              <div class="${styles.factionScore} ${styles.factionUS}">
                <div class="${styles.factionName}">US K/D</div>
                <div class="${styles.factionTickets}">${stats.usTeamKills} / ${stats.usTeamDeaths}</div>
              </div>
              <div class="${styles.vsDivider}">VS</div>
              <div class="${styles.factionScore} ${styles.factionOPFOR}">
                <div class="${styles.factionName}">OPFOR K/D</div>
                <div class="${styles.factionTickets}">${stats.opforTeamKills} / ${stats.opforTeamDeaths}</div>
              </div>
            </div>
          </div>

          <div class="${styles.statsSection}">
            <div class="${styles.statsSectionTitle}">Combat Performance</div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Kills</span>
              <span class="${styles.statValue} ${styles.statHighlight}">${stats.kills}</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Assists</span>
              <span class="${styles.statValue} ${styles.statHighlight}">${stats.assists}</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Deaths</span>
              <span class="${styles.statValue}">${stats.deaths}</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">K/D Ratio</span>
              <span class="${styles.statValue}">${kd}</span>
            </div>
            ${!gameState.isTDM ? `
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Zones Captured</span>
              <span class="${styles.statValue} ${styles.statHighlight}">${stats.zonesCaptured}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <div class="${styles.statsColumn}">
          <div class="${styles.statsSection}">
            <div class="${styles.statsSectionTitle}">Accuracy & Damage</div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Total Damage</span>
              <span class="${styles.statValue}">${stats.damageDealt.toLocaleString()}</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Accuracy</span>
              <span class="${styles.statValue}">${accuracy}%</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Headshots</span>
              <span class="${styles.statValue}">${stats.headshots} <span style="opacity:0.6; font-size:0.9em">(${headshotPct}%)</span></span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Longest Kill</span>
              <span class="${styles.statValue}">${stats.longestKill}m</span>
            </div>
          </div>

          <div class="${styles.statsSection}">
            <div class="${styles.statsSectionTitle}">Explosives</div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Grenades Thrown</span>
              <span class="${styles.statValue}">${stats.grenadesThrown}</span>
            </div>
            <div class="${styles.statRow}">
              <span class="${styles.statLabel}">Grenade Kills</span>
              <span class="${styles.statValue}">${stats.grenadeKills}</span>
            </div>
          </div>
        </div>
      </div>

      ${awardsHTML}

      <div class="${styles.actions}">
        <button class="${styles.button} ${styles.buttonPrimary}" data-ref="playAgain">Play Again</button>
        <button class="${styles.button}" data-ref="return">Return to Menu</button>
      </div>
    `;
  }

  private generateAwards(stats: MatchStats): Award[] {
    const awards: Award[] = [];

    if (stats.bestKillStreak >= 3) {
      awards.push({ name: 'Kill Streak', value: `${stats.bestKillStreak} kills` });
    }

    const accuracy = Math.round(stats.accuracy * 100);
    if (accuracy >= 40) {
      awards.push({ name: 'Sharpshooter', value: `${accuracy}% accuracy` });
    }

    if (stats.longestKill >= 50) {
      awards.push({ name: 'Long Range', value: `${stats.longestKill}m` });
    }

    if (stats.grenadeKills >= 2) {
      awards.push({ name: 'Grenade Expert', value: `${stats.grenadeKills} grenade kills` });
    }

    if (stats.deaths === 0) {
      awards.push({ name: 'Untouchable', value: 'No deaths' });
    }

    return awards;
  }
}
