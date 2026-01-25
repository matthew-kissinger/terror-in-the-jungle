import { Faction } from '../../systems/combat/types';
import { GameState } from '../../systems/world/TicketSystem';

export interface MatchStats {
  kills: number;
  deaths: number;
  zonesCaptured: number;
  matchDuration: number;
  usTickets: number;
  opforTickets: number;
  // Detailed stats
  headshots: number;
  damageDealt: number;
  accuracy: number;
  longestKill: number;
  grenadesThrown: number;
  grenadeKills: number;
}

export class MatchEndScreen {
  private container?: HTMLDivElement;
  private onReturnToMenuCallback?: () => void;
  private onPlayAgainCallback?: () => void;

  constructor() {
    // Screen will be created on demand
  }

  show(winner: Faction, gameState: GameState, stats: MatchStats): void {
    // Remove any existing end screen
    this.hide();

    // Create the end screen
    this.container = this.createEndScreen(winner, gameState, stats);
    document.body.appendChild(this.container);

    console.log(`🏆 Match end screen shown: ${winner} wins`);
  }

  hide(): void {
    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = undefined;
    }
  }

  onReturnToMenu(callback: () => void): void {
    this.onReturnToMenuCallback = callback;
  }

  onPlayAgain(callback: () => void): void {
    this.onPlayAgainCallback = callback;
  }

  private createEndScreen(winner: Faction, gameState: GameState, stats: MatchStats): HTMLDivElement {
    const isVictory = winner === Faction.US;
    const container = document.createElement('div');
    container.className = 'match-end-screen';

    const minutes = Math.floor(gameState.matchDuration / 60);
    const seconds = Math.floor(gameState.matchDuration % 60);
    const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
    const headshotPct = stats.kills > 0 ? Math.round((stats.headshots / stats.kills) * 100) : 0;
    const accuracy = Math.round(stats.accuracy * 100);

    container.innerHTML = `
      <style>
        .match-end-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          color: #fff;
          font-family: 'Courier New', monospace;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .match-end-screen.victory {
          background: rgba(20, 50, 20, 0.9);
        }

        .match-end-screen.defeat {
          background: rgba(50, 20, 20, 0.9);
        }

        .end-screen-header {
          text-align: center;
          margin-bottom: 2rem;
          animation: slideDown 0.6s ease-out;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .end-screen-title {
          font-size: 4rem;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.2em;
          margin-bottom: 0.5rem;
          text-shadow: 0 0 20px currentColor;
        }

        .victory .end-screen-title {
          color: #4CAF50;
        }

        .defeat .end-screen-title {
          color: #F44336;
        }

        .end-screen-subtitle {
          font-size: 1.5rem;
          opacity: 0.8;
          letter-spacing: 0.1em;
        }

        .stats-panel {
          background: rgba(20, 35, 50, 0.7);
          border: 2px solid rgba(127, 180, 217, 0.3);
          border-radius: 12px;
          padding: 2rem;
          min-width: 800px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          animation: fadeInUp 0.8s ease-out 0.2s backwards;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .victory .stats-panel {
          border-color: rgba(76, 175, 80, 0.5);
        }

        .defeat .stats-panel {
          border-color: rgba(244, 67, 54, 0.5);
        }

        .stats-column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .stats-section {
          margin-bottom: 0.5rem;
        }

        .stats-section-title {
          font-size: 1.1rem;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          margin-bottom: 0.75rem;
          color: #7FB4D9;
          border-bottom: 1px solid rgba(127, 180, 217, 0.3);
          padding-bottom: 0.5rem;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          padding: 0.3rem 0;
          font-size: 1.0rem;
        }

        .stat-label {
          opacity: 0.8;
        }

        .stat-value {
          font-weight: bold;
          color: #7FB4D9;
        }

        .stat-value.highlight {
          color: #4CAF50;
        }

        .ticket-comparison {
          display: flex;
          justify-content: space-around;
          margin: 1rem 0;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 8px;
        }

        .faction-score {
          text-align: center;
        }

        .faction-name {
          font-size: 0.9rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.7;
          margin-bottom: 0.5rem;
        }

        .faction-tickets {
          font-size: 2rem;
          font-weight: bold;
        }

        .faction-score.us .faction-tickets {
          color: #2196F3;
        }

        .faction-score.opfor .faction-tickets {
          color: #F44336;
        }

        .vs-divider {
          display: flex;
          align-items: center;
          font-size: 1.5rem;
          opacity: 0.5;
        }

        .end-screen-actions {
          margin-top: 2rem;
          display: flex;
          gap: 1rem;
          animation: fadeInUp 1s ease-out 0.4s backwards;
        }

        .end-screen-button {
          background: rgba(127, 180, 217, 0.2);
          border: 2px solid rgba(127, 180, 217, 0.5);
          color: #fff;
          padding: 1rem 2rem;
          font-size: 1.1rem;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .end-screen-button:hover {
          background: rgba(127, 180, 217, 0.3);
          border-color: #7FB4D9;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(127, 180, 217, 0.3);
        }

        .end-screen-button.primary {
          background: rgba(127, 180, 217, 0.4);
          border-color: #7FB4D9;
        }

        .end-screen-button.primary:hover {
          background: rgba(127, 180, 217, 0.6);
        }
      </style>

      <div class="end-screen-header">
        <div class="end-screen-title">${isVictory ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="end-screen-subtitle">${winner} wins the battle</div>
      </div>

      <div class="stats-panel">
        <div class="stats-column">
          <div class="stats-section">
            <div class="stats-section-title">Match Results</div>
            <div class="ticket-comparison">
              <div class="faction-score us">
                <div class="faction-name">US Forces</div>
                <div class="faction-tickets">${Math.round(stats.usTickets)}</div>
              </div>
              <div class="vs-divider">VS</div>
              <div class="faction-score opfor">
                <div class="faction-name">OPFOR</div>
                <div class="faction-tickets">${Math.round(stats.opforTickets)}</div>
              </div>
            </div>
            <div class="stat-row">
              <span class="stat-label">Match Duration</span>
              <span class="stat-value">${durationText}</span>
            </div>
          </div>

          <div class="stats-section">
            <div class="stats-section-title">Combat Performance</div>
            <div class="stat-row">
              <span class="stat-label">Kills</span>
              <span class="stat-value highlight">${stats.kills}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Deaths</span>
              <span class="stat-value">${stats.deaths}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">K/D Ratio</span>
              <span class="stat-value">${kd}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Zones Captured</span>
              <span class="stat-value highlight">${stats.zonesCaptured}</span>
            </div>
          </div>
        </div>

        <div class="stats-column">
          <div class="stats-section">
            <div class="stats-section-title">Accuracy & Damage</div>
            <div class="stat-row">
              <span class="stat-label">Total Damage</span>
              <span class="stat-value">${stats.damageDealt.toLocaleString()}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Accuracy</span>
              <span class="stat-value">${accuracy}%</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Headshots</span>
              <span class="stat-value">${stats.headshots} <span style="opacity:0.6; font-size:0.9em">(${headshotPct}%)</span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Longest Kill</span>
              <span class="stat-value">${stats.longestKill}m</span>
            </div>
          </div>

          <div class="stats-section">
            <div class="stats-section-title">Explosives</div>
            <div class="stat-row">
              <span class="stat-label">Grenades Thrown</span>
              <span class="stat-value">${stats.grenadesThrown}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Grenade Kills</span>
              <span class="stat-value">${stats.grenadeKills}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="end-screen-actions">
        <button class="end-screen-button primary play-again-btn">Play Again</button>
        <button class="end-screen-button return-menu-btn">Return to Menu</button>
      </div>
    `;

    // Add victory/defeat class
    container.classList.add(isVictory ? 'victory' : 'defeat');

    // Setup button handlers
    const playAgainBtn = container.querySelector('.play-again-btn') as HTMLButtonElement;
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => {
        if (this.onPlayAgainCallback) {
          this.hide();
          this.onPlayAgainCallback();
        } else {
          // Default action: reload the page
          console.log('🔄 Restarting match (reloading page)');
          window.location.reload();
        }
      });
    }

    const returnBtn = container.querySelector('.return-menu-btn') as HTMLButtonElement;
    if (returnBtn) {
      returnBtn.addEventListener('click', () => {
        if (this.onReturnToMenuCallback) {
          this.onReturnToMenuCallback();
        } else {
          // Default action: reload the page to return to menu
          console.log('🔄 Returning to main menu (reloading page)');
          window.location.reload();
        }
      });
    }

    return container;
  }

  dispose(): void {
    this.hide();
  }
}
