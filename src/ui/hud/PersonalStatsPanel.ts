import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';

export class PersonalStatsPanel {
  private container: HTMLDivElement;
  private killsElement: HTMLSpanElement;
  private deathsElement: HTMLSpanElement;
  private kdRatioElement: HTMLSpanElement;
  private killStreakElement: HTMLDivElement;
  private lastKillTime = 0;
  private currentStreak = 0;
  private readonly KILL_STREAK_TIMEOUT = 10000; // 10 seconds

  constructor(private statsTracker: PlayerStatsTracker) {
    this.container = this.createPanel();
    this.killsElement = this.container.querySelector('.stat-kills') as HTMLSpanElement;
    this.deathsElement = this.container.querySelector('.stat-deaths') as HTMLSpanElement;
    this.kdRatioElement = this.container.querySelector('.stat-kd') as HTMLSpanElement;
    this.killStreakElement = this.createKillStreakElement();
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'personal-stats-panel';
    panel.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      background: rgba(10, 10, 14, 0.4);
      backdrop-filter: blur(6px) saturate(1.1);
      -webkit-backdrop-filter: blur(6px) saturate(1.1);
      padding: 12px 16px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: white;
      min-width: 140px;
      pointer-events: none;
      z-index: 105;
    `;

    panel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; text-transform: uppercase; font-size: 11px; opacity: 0.7; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">Your Stats</div>
      <div style="margin: 5px 0; display: flex; justify-content: space-between;">
        <span>Kills:</span>
        <span class="stat-kills" style="color: #4ade80; font-weight: bold;">0</span>
      </div>
      <div style="margin: 5px 0; display: flex; justify-content: space-between;">
        <span>Deaths:</span>
        <span class="stat-deaths" style="color: #f87171; font-weight: bold;">0</span>
      </div>
      <div style="margin: 5px 0; display: flex; justify-content: space-between;">
        <span>K/D:</span>
        <span class="stat-kd" style="color: #fbbf24; font-weight: bold;">0.00</span>
      </div>
    `;

    return panel;
  }

  private createKillStreakElement(): HTMLDivElement {
    const streakEl = document.createElement('div');
    streakEl.className = 'kill-streak-notification';
    streakEl.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -100px);
      background: rgba(255, 0, 0, 0.1);
      border: 2px solid rgba(255, 100, 100, 0.8);
      padding: 20px 40px;
      border-radius: 12px;
      font-family: 'Courier New', monospace;
      font-size: 28px;
      font-weight: bold;
      color: #ff4444;
      text-align: center;
      pointer-events: none;
      z-index: 150;
      display: none;
      text-shadow: 0 0 10px rgba(255, 0, 0, 0.8);
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.3);
    `;

    return streakEl;
  }

  update(): void {
    const stats = this.statsTracker.getStats();
    const kdRatio = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;

    this.killsElement.textContent = stats.kills.toString();
    this.deathsElement.textContent = stats.deaths.toString();
    this.kdRatioElement.textContent = kdRatio.toFixed(2);

    // Check for kill streak timeout
    if (this.currentStreak > 0 && Date.now() - this.lastKillTime > this.KILL_STREAK_TIMEOUT) {
      this.currentStreak = 0;
    }
  }

  onKill(): void {
    const now = Date.now();

    // Check if kill is part of a streak
    if (now - this.lastKillTime < this.KILL_STREAK_TIMEOUT) {
      this.currentStreak++;
    } else {
      this.currentStreak = 1;
    }

    this.lastKillTime = now;

    // Show kill streak notifications
    this.checkKillStreakMilestone();
  }

  onDeath(): void {
    // Reset streak on death
    this.currentStreak = 0;
  }

  private checkKillStreakMilestone(): void {
    let message = '';
    let color = '#ff4444';

    switch (this.currentStreak) {
      case 3:
        message = 'KILLING SPREE';
        color = '#ff8844';
        break;
      case 5:
        message = 'RAMPAGE';
        color = '#ff4444';
        break;
      case 7:
        message = 'DOMINATING';
        color = '#ff0000';
        break;
      case 10:
        message = 'UNSTOPPABLE';
        color = '#ff0088';
        break;
      case 15:
        message = 'GODLIKE';
        color = '#ff00ff';
        break;
      default:
        return; // No milestone
    }

    this.showKillStreakNotification(message, color);
  }

  private showKillStreakNotification(message: string, color: string): void {
    this.killStreakElement.textContent = message;
    this.killStreakElement.style.color = color;
    this.killStreakElement.style.borderColor = color;
    this.killStreakElement.style.display = 'block';
    this.killStreakElement.style.animation = 'streakPulse 0.5s ease-out';

    // Hide after 3 seconds
    setTimeout(() => {
      this.killStreakElement.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => {
        this.killStreakElement.style.display = 'none';
      }, 300);
    }, 3000);
  }

  attachToDOM(): void {
    document.body.appendChild(this.container);
    document.body.appendChild(this.killStreakElement);
    this.injectStyles();
  }

  private injectStyles(): void {
    const styleId = 'personal-stats-panel-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes streakPulse {
        0% {
          transform: translate(-50%, -100px) scale(0.5);
          opacity: 0;
        }
        50% {
          transform: translate(-50%, -100px) scale(1.1);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -100px) scale(1);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    if (this.killStreakElement.parentNode) {
      this.killStreakElement.parentNode.removeChild(this.killStreakElement);
    }

    const styleEl = document.getElementById('personal-stats-panel-styles');
    if (styleEl) {
      styleEl.remove();
    }
  }
}
