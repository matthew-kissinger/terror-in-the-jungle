/**
 * TitleScreen - Minimal title + loading bar + START GAME.
 *
 * During load: title + progress bar + phase text.
 * After load: START GAME button + settings link.
 * No mode cards, no faction selection, no tips, no checklists.
 */

import { UIComponent } from '../engine/UIComponent';
import { LoadingProgress } from '../loading/LoadingProgress';
import { LOADING_PHASES } from '../../config/loading';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { isPortraitViewport, tryLockLandscapeOrientation } from '../../utils/Orientation';
import styles from './TitleScreen.module.css';

export class TitleScreen extends UIComponent {
  private progress!: LoadingProgress;
  private isInitialized = false;
  private initTimeoutId: number | null = null;
  private errorPanel: HTMLDivElement | null = null;
  private fullscreenPrompt: HTMLDivElement | null = null;
  private fullscreenAutoTimerId: ReturnType<typeof setTimeout> | null = null;
  private fullscreenFadeTimerId: ReturnType<typeof setTimeout> | null = null;
  private modeLoadProgress: LoadingProgress | null = null;

  private onStartCallback?: () => void;
  private onSettingsCallback?: () => void;

  protected build(): void {
    this.root.className = styles.screen;

    this.root.innerHTML = `
      <div class="${styles.content}">
        <section class="${styles.heroPanel}">
          <h1 class="${styles.title}">TERROR IN THE JUNGLE</h1>

          <div class="${styles.loadingSection}" data-ref="loading">
            <div class="${styles.loadingHeader}">
              <span class="${styles.loadingLabel}">Loading</span>
            </div>
            <div class="${styles.progressBar}">
              <div class="${styles.progressFill}" data-ref="fill" style="width: 0%"></div>
            </div>
            <div class="${styles.phaseText}" data-ref="phase">Initializing...</div>
          </div>

          <div class="${styles.menuSection}" data-ref="menu">
            <button class="${styles.startButton}" data-ref="start" type="button">START GAME</button>
            <button class="${styles.settingsLink}" data-ref="settings" type="button">SETTINGS</button>
          </div>

          <div class="${styles.preparingText}" data-ref="preparingText" style="display:none"></div>
        </section>
      </div>
    `;

    const dummyPercent = document.createElement('span');
    this.progress = new LoadingProgress(
      this.$('[data-ref="fill"]') as HTMLDivElement,
      dummyPercent,
      this.$('[data-ref="phase"]') as HTMLDivElement,
      document.createElement('div'),
      null
    );
  }

  protected onMount(): void {
    for (const phase of LOADING_PHASES) {
      this.progress.addPhase(phase.id, phase.weight, phase.label);
    }

    const startBtn = this.$('[data-ref="start"]');
    if (startBtn) {
      this.listen(startBtn, 'click', () => this.deferAction(this.handleStart));
    }

    const settingsBtn = this.$('[data-ref="settings"]');
    if (settingsBtn) {
      this.listen(settingsBtn, 'click', () => this.deferAction(() => this.onSettingsCallback?.()));
    }

    this.listen(window, 'keydown', (e) => {
      if ((e.code === 'Enter' || e.code === 'Space') && this.isMenuVisible()) {
        e.preventDefault();
        this.handleStart();
      }
    });

    this.startInitTimeout();
  }

  protected onUnmount(): void {
    this.clearInitTimeout();
    this.dismissFullscreenPrompt();
  }

  // --- Public API ---

  updateProgress(phaseId: string, progress: number): void {
    this.progress.updateProgress(phaseId, progress);
  }

  setPhaseComplete(phaseId: string): void {
    this.progress.setPhaseComplete(phaseId);
  }

  showMenu(): void {
    this.markInitialized();
    this.progress.showComplete();
    const menu = this.$('[data-ref="menu"]');
    if (menu) menu.classList.add(styles.menuVisible);
    if (isTouchDevice()) this.showFullscreenPrompt();
  }

  showPreparing(modeName: string): void {
    const menu = this.$('[data-ref="menu"]');
    if (menu) {
      menu.classList.add(styles.preparing);
      (menu as HTMLElement).style.display = 'none';
    }
    const text = this.$('[data-ref="preparingText"]');
    if (text) {
      text.textContent = `Preparing ${modeName}...`;
      text.style.display = '';
    }
    const startBtn = this.$('[data-ref="start"]') as HTMLButtonElement | null;
    if (startBtn) startBtn.disabled = true;
  }

  /** Reset the progress bar for mode startup phases. */
  initModeLoadProgress(): void {
    this.modeLoadProgress = new LoadingProgress(
      this.$('[data-ref="fill"]') as HTMLDivElement,
      document.createElement('span'),
      this.$('[data-ref="phase"]') as HTMLDivElement,
      document.createElement('div'),
      null
    );
    const phases = [
      { id: 'terrain', weight: 0.05, label: 'Loading terrain' },
      { id: 'features', weight: 0.05, label: 'Compiling features' },
      { id: 'vegetation', weight: 0.50, label: 'Placing vegetation' },
      { id: 'navmesh', weight: 0.15, label: 'Loading navigation mesh' },
      { id: 'spawning', weight: 0.15, label: 'Spawning combatants' },
      { id: 'finalize', weight: 0.10, label: 'Finalizing' },
    ];
    for (const p of phases) {
      this.modeLoadProgress.addPhase(p.id, p.weight, p.label);
    }
    // Show the loading section, hide preparing text
    const loading = this.$('[data-ref="loading"]');
    if (loading) (loading as HTMLElement).style.display = '';
    const fill = this.$('[data-ref="fill"]') as HTMLElement | null;
    if (fill) fill.style.width = '0%';
  }

  /** Update mode startup progress from a GameEventBus event. */
  updateModeLoadProgress(phase: string, progress: number, label: string): void {
    if (!this.modeLoadProgress) return;
    this.modeLoadProgress.updateProgress(phase, progress);
    const text = this.$('[data-ref="preparingText"]');
    if (text) {
      text.textContent = label;
    }
  }

  cancelPreparing(): void {
    const menu = this.$('[data-ref="menu"]');
    if (menu) {
      menu.classList.remove(styles.preparing);
      (menu as HTMLElement).style.display = '';
    }
    const text = this.$('[data-ref="preparingText"]');
    if (text) text.style.display = 'none';
    const startBtn = this.$('[data-ref="start"]') as HTMLButtonElement | null;
    if (startBtn) startBtn.disabled = false;
  }

  hideScreen(): void {
    this.markInitialized();
    this.root.classList.add(styles.hidden);
  }

  showScreen(): void {
    this.root.classList.remove(styles.hidden);
  }

  setOnStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  setOnSettings(callback: () => void): void {
    this.onSettingsCallback = callback;
  }

  showError(title: string, message: string): void {
    this.cancelPreparing();
    if (this.errorPanel) this.errorPanel.remove();
    this.clearInitTimeout();

    this.errorPanel = document.createElement('div');
    this.errorPanel.className = styles.errorPanel;
    this.errorPanel.innerHTML = `
      <div class="${styles.errorTitle}">${this.escapeHtml(title)}</div>
      <div class="${styles.errorMessage}">${this.escapeHtml(message)}</div>
      <div class="${styles.errorActions}">
        <button class="${styles.errorButton} ${styles.errorButtonPrimary}" data-action="retry">Retry</button>
      </div>
    `;

    const retryBtn = this.errorPanel.querySelector('[data-action="retry"]');
    retryBtn?.addEventListener('pointerdown', () => window.location.reload());
    retryBtn?.addEventListener('click', (e) => e.preventDefault());

    document.body.appendChild(this.errorPanel);
  }

  override dispose(): void {
    this.clearInitTimeout();
    this.dismissFullscreenPrompt();
    if (this.errorPanel) {
      this.errorPanel.remove();
      this.errorPanel = null;
    }
    super.dispose();
  }

  // --- Private ---

  private handleStart = (): void => {
    if (!this.isMenuVisible()) return;
    if (isTouchDevice() && !document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {});
      }
    }
    this.dismissFullscreenPrompt();
    this.onStartCallback?.();
  };

  private isMenuVisible(): boolean {
    const menu = this.$('[data-ref="menu"]');
    return !!menu && menu.classList.contains(styles.menuVisible)
      && !menu.classList.contains(styles.preparing);
  }

  private startInitTimeout(): void {
    this.initTimeoutId = window.setTimeout(() => {
      if (!this.isInitialized) {
        this.showError(
          'Initialization Taking Too Long',
          'The game is taking longer than expected. Try refreshing the page.'
        );
      }
    }, 30000);
  }

  private clearInitTimeout(): void {
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  private markInitialized(): void {
    this.isInitialized = true;
    this.clearInitTimeout();
  }

  private showFullscreenPrompt(): void {
    if (this.fullscreenPrompt) return;
    const prompt = document.createElement('div');
    prompt.className = styles.fullscreenPrompt;
    prompt.textContent = isPortraitViewport()
      ? 'TAP FOR FULLSCREEN + LANDSCAPE'
      : 'TAP FOR FULLSCREEN';

    prompt.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {})
          .finally(() => this.dismissFullscreenPrompt());
      } else {
        this.dismissFullscreenPrompt();
      }
    });
    prompt.addEventListener('click', (e) => e.preventDefault());
    this.root.appendChild(prompt);
    this.fullscreenPrompt = prompt;

    this.fullscreenAutoTimerId = setTimeout(() => {
      if (this.fullscreenPrompt) {
        this.fullscreenPrompt.classList.add(styles.fullscreenPromptFading);
        this.fullscreenFadeTimerId = setTimeout(() => this.dismissFullscreenPrompt(), 300);
      }
    }, 6000);
  }

  private dismissFullscreenPrompt(): void {
    if (this.fullscreenAutoTimerId !== null) {
      clearTimeout(this.fullscreenAutoTimerId);
      this.fullscreenAutoTimerId = null;
    }
    if (this.fullscreenFadeTimerId !== null) {
      clearTimeout(this.fullscreenFadeTimerId);
      this.fullscreenFadeTimerId = null;
    }
    if (this.fullscreenPrompt?.parentElement) {
      this.fullscreenPrompt.remove();
      this.fullscreenPrompt = null;
    }
  }

  private deferAction(action: () => void): void {
    window.setTimeout(() => action(), 60);
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
