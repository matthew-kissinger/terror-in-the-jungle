import { GameMode } from '../../config/gameModes';

export class GameModeSelection {
  private container: HTMLDivElement;
  private cardHandlers: Map<HTMLElement, () => void> = new Map();
  private backButtonHandler?: () => void;
  private onModeSelected?: (mode: GameMode) => void;

  constructor() {
    this.container = this.createSelectionPanel();
  }

  private handleCardClick = (mode: GameMode) => {
    if (this.onModeSelected) {
      this.onModeSelected(mode);
      this.hide();
    }
  };

  private handleBackClick = () => {
    this.hide();
  };

  private createSelectionPanel(): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'game-mode-selection';
    container.innerHTML = `
      <style>
        .game-mode-selection {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          z-index: 1000;
          animation: fadeIn 0.5s ease;
        }

        .game-mode-selection.visible {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mode-selection-container {
          max-width: 1200px;
          padding: 40px;
        }

        .mode-selection-title {
          text-align: center;
          color: #fff;
          font-size: 48px;
          font-weight: bold;
          margin-bottom: 20px;
          text-transform: uppercase;
          letter-spacing: 4px;
          font-family: 'Courier New', monospace;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        }

        .mode-selection-subtitle {
          text-align: center;
          color: #999;
          font-size: 18px;
          margin-bottom: 60px;
          font-family: 'Courier New', monospace;
        }

        .game-modes-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 40px;
        }

        .game-mode-card {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%);
          border: 2px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 30px;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .game-mode-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.05), transparent);
          transform: translateX(-100%);
          transition: transform 0.6s ease;
        }

        .game-mode-card:hover {
          border-color: rgba(255, 255, 255, 0.3);
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.04) 100%);
          transform: translateY(-5px);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .game-mode-card:hover::before {
          transform: translateX(100%);
        }

        .mode-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .mode-card-title {
          color: #fff;
          font-size: 28px;
          font-weight: bold;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .mode-card-badge {
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
        }

        .mode-card-description {
          color: #ccc;
          font-size: 16px;
          line-height: 1.6;
          margin-bottom: 25px;
          font-family: 'Courier New', monospace;
        }

        .mode-card-features {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 15px;
        }

        .mode-feature {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #999;
          font-size: 14px;
          font-family: 'Courier New', monospace;
        }

        .mode-feature-icon {
          width: 20px;
          height: 20px;
          background: rgba(76, 175, 80, 0.2);
          border: 1px solid rgba(76, 175, 80, 0.5);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #4CAF50;
          font-weight: bold;
          font-size: 12px;
        }

        .zone-control-card {
          border-color: rgba(68, 136, 255, 0.3);
        }

        .zone-control-card:hover {
          border-color: rgba(68, 136, 255, 0.6);
          box-shadow: 0 10px 40px rgba(68, 136, 255, 0.2);
        }

        .zone-control-card .mode-card-badge {
          background: rgba(68, 136, 255, 0.2);
          color: #4488ff;
        }

        .open-frontier-card {
          border-color: rgba(255, 68, 68, 0.3);
        }

        .open-frontier-card:hover {
          border-color: rgba(255, 68, 68, 0.6);
          box-shadow: 0 10px 40px rgba(255, 68, 68, 0.2);
        }

        .open-frontier-card .mode-card-badge {
          background: rgba(255, 68, 68, 0.2);
          color: #ff4444;
        }

        .mode-back-button {
          display: block;
          margin: 0 auto;
          padding: 12px 40px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #999;
          font-size: 16px;
          font-family: 'Courier New', monospace;
          text-transform: uppercase;
          letter-spacing: 2px;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 4px;
        }

        .mode-back-button:hover {
          border-color: rgba(255, 255, 255, 0.4);
          color: #fff;
          background: rgba(255, 255, 255, 0.05);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      </style>

      <div class="mode-selection-container">
        <h1 class="mode-selection-title">SELECT GAME MODE</h1>
        <p class="mode-selection-subtitle">Choose your battlefield experience</p>

        <div class="game-modes-grid">
          <!-- Team Deathmatch Mode -->
          <div class="game-mode-card" data-mode="tdm" style="border-color: rgba(76, 175, 80, 0.3);">
            <div class="mode-card-header">
              <div class="mode-card-title">Team Deathmatch</div>
              <div class="mode-card-badge" style="background: rgba(76, 175, 80, 0.2); color: #4CAF50;">Tactical</div>
            </div>
            <div class="mode-card-description">
              Pure tactical combat. First team to reach 75 kills wins. Fast-paced 15v15 infantry combat in a compact jungle arena.
            </div>
            <div class="mode-card-features">
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>75 Kill Target</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>30 Combatants</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>5 Min Matches</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>Infantry Only</span>
              </div>
            </div>
          </div>

          <!-- Zone Control Mode -->
          <div class="game-mode-card zone-control-card" data-mode="zone_control">
            <div class="mode-card-header">
              <div class="mode-card-title">Zone Control</div>
              <div class="mode-card-badge">Classic</div>
            </div>
            <div class="mode-card-description">
              Fast-paced tactical combat over 3 strategic zones. Control the majority to drain enemy tickets in intense 3-minute matches.
            </div>
            <div class="mode-card-features">
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>3 Capture Zones</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>60 Combatants</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>3 Min Matches</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>300 Tickets</span>
              </div>
            </div>
          </div>

          <!-- Open Frontier Mode -->
          <div class="game-mode-card open-frontier-card" data-mode="open_frontier">
            <div class="mode-card-header">
              <div class="mode-card-title">Open Frontier</div>
              <div class="mode-card-badge">Large Scale</div>
            </div>
            <div class="mode-card-description">
              Massive warfare across a 2x2 mile battlefield with 10 strategic zones. Spawn at any controlled position in 15-minute campaigns.
            </div>
            <div class="mode-card-features">
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>10 Capture Zones</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>120+ Combatants</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>15 Min Matches</span>
              </div>
              <div class="mode-feature">
                <div class="mode-feature-icon">✓</div>
                <span>1000 Tickets</span>
              </div>
            </div>
          </div>
        </div>

        <button class="mode-back-button">Back to Menu</button>
      </div>
    `;

    // Add event listeners
    const cards = container.querySelectorAll('.game-mode-card');
    cards.forEach(card => {
      const mode = card.getAttribute('data-mode') as GameMode;
      if (mode) {
        const handler = () => this.handleCardClick(mode);
        card.addEventListener('click', handler);
        this.cardHandlers.set(card as HTMLElement, handler);
      }
    });

    const backButton = container.querySelector('.mode-back-button');
    if (backButton) {
      this.backButtonHandler = this.handleBackClick;
      backButton.addEventListener('click', this.backButtonHandler);
    }

    return container;
  }

  public show(): void {
    if (!this.container.parentElement) {
      document.body.appendChild(this.container);
    }
    setTimeout(() => {
      this.container.classList.add('visible');
    }, 10);
  }

  public hide(): void {
    this.container.classList.remove('visible');
  }

  public onModeSelect(callback: (mode: GameMode) => void): void {
    this.onModeSelected = callback;
  }

  public dispose(): void {
    // Remove card listeners
    this.cardHandlers.forEach((handler, card) => {
      card.removeEventListener('click', handler);
    });
    this.cardHandlers.clear();

    // Remove back button listener
    const backButton = this.container.querySelector('.mode-back-button');
    if (backButton && this.backButtonHandler) {
      backButton.removeEventListener('click', this.backButtonHandler);
    }

    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }

    this.onModeSelected = undefined;
  }
}