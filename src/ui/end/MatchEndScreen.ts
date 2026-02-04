import { Logger } from '../../utils/Logger';
import { Faction } from '../../systems/combat/types';
import { GameState } from '../../systems/world/TicketSystem';
import { MATCH_END_SCREEN_STYLES } from './MatchEndScreenStyles';
import { createMatchEndScreenHTML } from './MatchEndScreenDOM';

export interface MatchStats {
  kills: number;
  deaths: number;
  assists: number;
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
  bestKillStreak: number;
  shotsFired: number;
  shotsHit: number;
}

export class MatchEndScreen {
  private container?: HTMLDivElement;
  private playAgainBtn?: HTMLButtonElement;
  private returnBtn?: HTMLButtonElement;
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

    Logger.info('ui', `Match end screen shown: ${winner} wins`);
  }

  hide(): void {
    if (this.playAgainBtn) {
      this.playAgainBtn.removeEventListener('click', this.handlePlayAgain);
      this.playAgainBtn = undefined;
    }
    if (this.returnBtn) {
      this.returnBtn.removeEventListener('click', this.handleReturnToMenu);
      this.returnBtn = undefined;
    }

    if (this.container?.parentElement) {
      this.container.parentElement.removeChild(this.container);
      this.container = undefined;
    }
  }

  private handlePlayAgain = () => {
    if (this.onPlayAgainCallback) {
      this.hide();
      this.onPlayAgainCallback();
    } else {
      // Default action: reload the page
      Logger.info('ui', ' Restarting match (reloading page)');
      window.location.reload();
    }
  };

  private handleReturnToMenu = () => {
    if (this.onReturnToMenuCallback) {
      this.onReturnToMenuCallback();
    } else {
      // Default action: reload the page to return to menu
      Logger.info('ui', ' Returning to main menu (reloading page)');
      window.location.reload();
    }
  };

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

    // Inject styles and HTML content
    container.innerHTML = `
      <style>${MATCH_END_SCREEN_STYLES}</style>
      ${createMatchEndScreenHTML(winner, gameState, stats)}
    `;

    // Add victory/defeat class
    container.classList.add(isVictory ? 'victory' : 'defeat');

    // Setup button handlers
    this.playAgainBtn = container.querySelector('.play-again-btn') as HTMLButtonElement;
    if (this.playAgainBtn) {
      this.playAgainBtn.addEventListener('click', this.handlePlayAgain);
    }

    this.returnBtn = container.querySelector('.return-menu-btn') as HTMLButtonElement;
    if (this.returnBtn) {
      this.returnBtn.addEventListener('click', this.handleReturnToMenu);
    }

    return container;
  }

  dispose(): void {
    this.hide();
  }
}
