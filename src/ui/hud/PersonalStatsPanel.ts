import { PlayerStatsTracker } from '../../systems/player/PlayerStatsTracker';

/** Frequencies in Hz: C4, G4, C5, E5, G5, C6, E6 */
const C4 = 261.63;
const G4 = 392;
const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;
const E6 = 1318.5;

const KILL_STREAK_GAIN = 0.2;

/**
 * Procedural audio stings for kill streak milestones.
 * Uses Web Audio API with lazy AudioContext (user gesture required in browsers).
 */
function playKillStreakSting(streak: number): void {
  let ctx: AudioContext | undefined;
  try {
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return;
  }

  const resumeAndPlay = (): void => {
    if (ctx!.state === 'suspended') {
      ctx!.resume().then(() => playSting(ctx!, streak)).catch(() => {});
    } else {
      playSting(ctx!, streak);
    }
  };

  resumeAndPlay();
}

function playSting(ctx: AudioContext, streak: number): void {
  const now = ctx.currentTime;

  if (streak === 3) {
    // KILLING SPREE: Quick rising two-tone (C5 -> E5, 100ms)
    playTone(ctx, C5, now, 0.05, 0.05, KILL_STREAK_GAIN);
    playTone(ctx, E5, now + 0.05, 0.05, 0.05, KILL_STREAK_GAIN);
  } else if (streak === 5) {
    // RAMPAGE: Three-tone ascending (C5 -> E5 -> G5, 150ms)
    const seg = 0.05;
    playTone(ctx, C5, now, seg * 0.3, seg * 0.7, KILL_STREAK_GAIN);
    playTone(ctx, E5, now + seg, seg * 0.3, seg * 0.7, KILL_STREAK_GAIN);
    playTone(ctx, G5, now + seg * 2, seg * 0.3, seg * 0.7, KILL_STREAK_GAIN);
  } else if (streak === 7) {
    // DOMINATING: Four-tone ascending (C5 -> E5 -> G5 -> C6, 200ms)
    const seg = 0.05;
    playTone(ctx, C5, now, seg * 0.25, seg * 0.75, KILL_STREAK_GAIN);
    playTone(ctx, E5, now + seg, seg * 0.25, seg * 0.75, KILL_STREAK_GAIN);
    playTone(ctx, G5, now + seg * 2, seg * 0.25, seg * 0.75, KILL_STREAK_GAIN);
    playTone(ctx, C6, now + seg * 3, seg * 0.25, seg * 0.75, KILL_STREAK_GAIN);
  } else if (streak === 10) {
    // UNSTOPPABLE: Power chord C4+G4 -> C5+G5, 250ms with slight sweep
    const dur = 0.125;
    playTone(ctx, C4, now, 0.02, dur - 0.02, KILL_STREAK_GAIN * 0.9);
    playTone(ctx, G4, now, 0.02, dur - 0.02, KILL_STREAK_GAIN * 0.7);
    playTone(ctx, C5, now + dur, 0.02, dur - 0.02, KILL_STREAK_GAIN);
    playTone(ctx, G5, now + dur, 0.02, dur - 0.02, KILL_STREAK_GAIN * 0.8);
  } else if (streak === 15) {
    // GODLIKE: Ascending arpeggio with harmonic (300ms)
    const seg = 0.06;
    const gain = KILL_STREAK_GAIN;
    playTone(ctx, C5, now, seg * 0.2, seg * 0.8, gain);
    playTone(ctx, E5, now + seg, seg * 0.2, seg * 0.8, gain);
    playTone(ctx, G5, now + seg * 2, seg * 0.2, seg * 0.8, gain);
    playTone(ctx, C6, now + seg * 3, seg * 0.2, seg * 0.8, gain);
    // Harmonic overtone
    playTone(ctx, E6, now + seg * 2.5, seg * 0.15, seg * 1.5, gain * 0.4);
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  attack: number,
  release: number,
  volume: number
): void {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.value = frequency;
  filter.type = 'lowpass';
  filter.frequency.value = Math.min(frequency * 3, 4000);
  filter.Q.value = 0.5;

  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(volume, startTime + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + attack + release);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + attack + release);
}

export class PersonalStatsPanel {
  private container: HTMLDivElement;
  private killsElements: NodeListOf<HTMLSpanElement>;
  private deathsElements: NodeListOf<HTMLSpanElement>;
  private kdRatioElements: NodeListOf<HTMLSpanElement>;
  private killStreakElement: HTMLDivElement;
  private lastKillTime = 0;
  private currentStreak = 0;
  private readonly KILL_STREAK_TIMEOUT = 10000; // 10 seconds

  constructor(private statsTracker: PlayerStatsTracker) {
    this.container = this.createPanel();
    this.killsElements = this.container.querySelectorAll('.stat-kills');
    this.deathsElements = this.container.querySelectorAll('.stat-deaths');
    this.kdRatioElements = this.container.querySelectorAll('.stat-kd');
    this.killStreakElement = this.createKillStreakElement();
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'personal-stats-panel';

    panel.innerHTML = `
      <div class="stats-desktop">
        <div style="font-weight: 700; margin-bottom: 6px; text-transform: uppercase; font-size: 9px; letter-spacing: 1.5px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 3px; color: rgba(220, 225, 230, 0.4);">Stats</div>
        <div style="margin: 3px 0; display: flex; justify-content: space-between; gap: 16px;">
          <span style="color: rgba(220, 225, 230, 0.5); font-size: 11px;">K</span>
          <span class="stat-kills" style="color: rgba(220, 225, 230, 0.9); font-weight: 700;">0</span>
        </div>
        <div style="margin: 3px 0; display: flex; justify-content: space-between; gap: 16px;">
          <span style="color: rgba(220, 225, 230, 0.5); font-size: 11px;">D</span>
          <span class="stat-deaths" style="color: rgba(220, 225, 230, 0.55); font-weight: 700;">0</span>
        </div>
        <div style="margin: 3px 0; display: flex; justify-content: space-between; gap: 16px;">
          <span style="color: rgba(220, 225, 230, 0.5); font-size: 11px;">K/D</span>
          <span class="stat-kd" style="color: rgba(220, 225, 230, 0.65); font-weight: 700;">0.00</span>
        </div>
      </div>
      <div class="stats-mobile">
        <span style="color: rgba(220, 225, 230, 0.9); font-weight: 700;">K:<span class="stat-kills">0</span></span>
        <span style="color: rgba(220, 225, 230, 0.55); font-weight: 700; margin-left: 8px;">D:<span class="stat-deaths">0</span></span>
        <span style="color: rgba(220, 225, 230, 0.65); font-weight: 700; margin-left: 8px;">KD:<span class="stat-kd">0.00</span></span>
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
      background: rgba(8, 12, 18, 0.7);
      border: 1px solid rgba(201, 86, 74, 0.5);
      padding: 14px 32px;
      border-radius: 4px;
      font-family: 'Rajdhani', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: rgba(220, 225, 230, 0.95);
      text-align: center;
      pointer-events: none;
      z-index: 150;
      display: none;
      letter-spacing: 2px;
      text-transform: uppercase;
      backdrop-filter: blur(8px);
    `;

    return streakEl;
  }

  update(): void {
    const stats = this.statsTracker.getStats();
    const kdRatio = stats.deaths === 0 ? stats.kills : stats.kills / stats.deaths;

    this.killsElements.forEach(el => el.textContent = stats.kills.toString());
    this.deathsElements.forEach(el => el.textContent = stats.deaths.toString());
    this.kdRatioElements.forEach(el => el.textContent = kdRatio.toFixed(2));

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
    let color = 'rgba(201, 86, 74, 0.9)';

    switch (this.currentStreak) {
      case 3:
        message = 'KILLING SPREE';
        color = 'rgba(212, 163, 68, 0.9)';
        break;
      case 5:
        message = 'RAMPAGE';
        color = 'rgba(201, 120, 74, 0.9)';
        break;
      case 7:
        message = 'DOMINATING';
        color = 'rgba(201, 86, 74, 0.9)';
        break;
      case 10:
        message = 'UNSTOPPABLE';
        color = 'rgba(184, 58, 94, 0.9)';
        break;
      case 15:
        message = 'GODLIKE';
        color = 'rgba(220, 225, 230, 1)';
        break;
      default:
        return; // No milestone
    }

    this.showKillStreakNotification(message, color, this.currentStreak);
  }

  private showKillStreakNotification(message: string, color: string, streak: number): void {
    this.killStreakElement.textContent = message;
    this.killStreakElement.style.color = color;
    this.killStreakElement.style.borderColor = color;
    this.killStreakElement.style.display = 'block';
    this.killStreakElement.style.animation = 'streakPulse 0.5s ease-out';

    playKillStreakSting(streak);

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
      .personal-stats-panel {
        position: fixed;
        bottom: 76px;
        left: 16px;
        background: rgba(8, 12, 18, 0.55);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        padding: 6px 12px;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 4px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 12px;
        color: rgba(220, 225, 230, 0.8);
        min-width: 110px;
        pointer-events: none;
        z-index: 105;
      }

      .stats-mobile {
        display: none;
      }

      @media (max-width: 768px) {
        .personal-stats-panel {
          left: 10px;
          bottom: 170px;
          font-size: 11px;
          padding: 6px 10px;
          min-width: 100px;
        }
      }

      @media (max-width: 480px) {
        .personal-stats-panel {
          bottom: 200px;
          left: 8px;
          background: rgba(8, 12, 18, 0.6);
          padding: 3px 8px;
          min-width: 0;
          border-radius: 3px;
        }

        .stats-desktop {
          display: none;
        }

        .stats-mobile {
          display: flex;
          align-items: center;
          font-size: 10px;
          white-space: nowrap;
        }

        .kill-streak-notification {
          font-size: 18px !important;
          padding: 10px 20px !important;
          transform: translate(-50%, -80px) !important;
        }
      }

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
