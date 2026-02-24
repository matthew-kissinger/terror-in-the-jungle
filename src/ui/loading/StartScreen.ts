/**
 * StartScreen - Main menu / loading screen.
 *
 * Title + mode cards + progress bar + deploy button.
 * Delegates to SettingsModal and HowToPlayModal as child UIComponents.
 * LoadingProgress handles phase tracking and tip rotation.
 *
 * Replaces: old StartScreen (inline styles via StartScreenStyles.ts)
 */

import { UIComponent } from '../engine/UIComponent';
import { GameMode } from '../../config/gameModes';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { isPortraitViewport, tryLockLandscapeOrientation } from '../../utils/Orientation';
import { SettingsModal } from './SettingsModal';
import { HowToPlayModal } from './HowToPlayModal';
import { LoadingProgress } from './LoadingProgress';
import { LOADING_PHASES } from '../../config/loading';
import { MODE_CARD_CONFIGS } from './ModeCard';
import styles from './StartScreen.module.css';

const START_SCREEN_IMAGE_URL = '/assets/ui/screens/start-screen.webp';
const LOADING_SCREEN_IMAGE_URL = '/assets/ui/screens/loading-screen.webp';

export class StartScreen extends UIComponent {
  private settingsModal: SettingsModal;
  private howToPlayModal: HowToPlayModal;

  // Built lazily in build()
  private progress!: LoadingProgress;
  private modeCards: HTMLDivElement[] = [];

  private isVisible = true;
  private selectedGameMode: GameMode = GameMode.ZONE_CONTROL;
  private onPlayCallback?: (mode: GameMode) => void;
  private initTimeoutId: number | null = null;
  private isInitialized = false;

  // Fullscreen prompt state
  private fullscreenPrompt: HTMLDivElement | null = null;
  private fullscreenFadeTimerId: ReturnType<typeof setTimeout> | null = null;
  private fullscreenAutoTimerId: ReturnType<typeof setTimeout> | null = null;

  // Error panel (appended outside root)
  private errorPanel: HTMLDivElement | null = null;
  private menuGamepadRafId: number | null = null;
  private prevGamepadButtons = { a: false, dpadLeft: false, dpadRight: false };
  private quickStartHintText = '';
  private readonly modeOrder: GameMode[] = [
    GameMode.ZONE_CONTROL,
    GameMode.OPEN_FRONTIER,
    GameMode.TEAM_DEATHMATCH,
    GameMode.A_SHAU_VALLEY,
  ];

  constructor() {
    super();
    this.settingsModal = new SettingsModal();
    this.howToPlayModal = new HowToPlayModal();
    this.preloadScreenImages();
  }

  protected build(): void {
    this.root.className = styles.screen;

    const modeCardsHTML = Object.keys(MODE_CARD_CONFIGS)
      .map((mode, i) => this.buildModeCardHTML(mode, i === 0))
      .join('');

    this.root.innerHTML = `
      <div class="${styles.content}">
        <div>
          <h1 class="${styles.gameTitle}">TERROR IN THE JUNGLE</h1>
          <div class="${styles.subtitle}">US FORCES vs OPFOR</div>
        </div>

        <div class="${styles.loadingSection}">
          <div class="${styles.loadingBar}" data-ref="bar">
            <div class="${styles.progressFill}" data-ref="fill" style="width: 0%"></div>
            <span class="${styles.percentText}" data-ref="percent">0%</span>
          </div>
          <div class="${styles.phaseText}" data-ref="phase">Initializing...</div>
        </div>

        <div class="${styles.tipContainer}">
          <div class="${styles.tipLabel}">INTEL</div>
          <div class="${styles.tipText}" data-ref="tip"></div>
        </div>

        <div class="${styles.modeSelection}" data-ref="modeSection">
          <div class="${styles.modeCards}">${modeCardsHTML}</div>
          <div class="${styles.selectedModeDisplay}" data-ref="modeDisplay">
            Selected: <strong>ZONE CONTROL</strong>
          </div>
        </div>

        <div class="${styles.menuButtons}" data-ref="menuButtons">
          <button class="${styles.menuButton} ${styles.playButton}" data-ref="play">DEPLOY -- ZONE CONTROL</button>
          <div class="${styles.buttonRow}">
            <button class="${styles.menuButton} ${styles.secondaryButton}" data-ref="settings">SETTINGS</button>
            <button class="${styles.menuButton} ${styles.secondaryButton}" data-ref="howToPlay">CONTROLS</button>
          </div>
          <div class="${styles.quickStartHint}" data-ref="quickStartHint"></div>
        </div>
      </div>

      <div class="${styles.loadingStats}">
        <span data-ref="loadTime"></span>
      </div>
    `;

    // Initialize LoadingProgress with DOM refs
    this.progress = new LoadingProgress(
      this.$('[data-ref="fill"]') as HTMLDivElement,
      this.$('[data-ref="percent"]') as HTMLSpanElement,
      this.$('[data-ref="phase"]') as HTMLDivElement,
      this.$('[data-ref="tip"]') as HTMLDivElement,
      this.$('[data-ref="loadTime"]') as HTMLSpanElement | null
    );

    // Cache mode cards
    this.modeCards = Array.from(this.root.querySelectorAll('[data-mode]')) as HTMLDivElement[];
  }

  protected onMount(): void {
    // Mount child modals to body
    this.settingsModal.mount(document.body);
    this.howToPlayModal.mount(document.body);

    // Initialize loading phases
    for (const phase of LOADING_PHASES) {
      this.progress.addPhase(phase.id, phase.weight, phase.label);
    }
    this.progress.initializeTips();

    // Mode card selection
    for (const card of this.modeCards) {
      const mode = card.dataset.mode;
      if (!mode) continue;
      const gameMode = this.resolveGameMode(mode);
      this.listen(card, 'pointerdown', () => this.selectGameMode(gameMode));
      this.listen(card, 'click', (e) => e.preventDefault());
    }

    // Button listeners
    const playBtn = this.$('[data-ref="play"]');
    if (playBtn) {
      this.listen(playBtn, 'pointerdown', this.handlePlayClick);
      this.listen(playBtn, 'click', (e) => e.preventDefault());
    }

    const settingsBtn = this.$('[data-ref="settings"]');
    if (settingsBtn) {
      this.listen(settingsBtn, 'pointerdown', () => this.settingsModal.show());
      this.listen(settingsBtn, 'click', (e) => e.preventDefault());
    }

    const howToPlayBtn = this.$('[data-ref="howToPlay"]');
    if (howToPlayBtn) {
      this.listen(howToPlayBtn, 'pointerdown', () => this.howToPlayModal.show());
      this.listen(howToPlayBtn, 'click', (e) => e.preventDefault());
    }

    this.listen(window, 'keydown', this.handleMenuKeyDown);
    this.startMenuGamepadLoop();

    // Start init timeout
    this.startInitTimeout();
  }

  protected onUnmount(): void {
    this.dismissFullscreenPrompt();
    this.stopMenuGamepadLoop();
    this.clearInitTimeout();
  }

  // --- Public API ---

  updateProgress(phaseId: string, progress: number): void {
    this.progress.updateProgress(phaseId, progress);
  }

  setPhaseComplete(phaseId: string): void {
    this.progress.setPhaseComplete(phaseId);
  }

  showMainMenu(): void {
    this.markInitialized();

    const buttons = this.$('[data-ref="menuButtons"]');
    if (buttons) buttons.classList.add(styles.menuButtonsVisible);

    const modeSection = this.$('[data-ref="modeSection"]');
    if (modeSection) modeSection.classList.add(styles.modeSelectionVisible);

    this.progress.showComplete();
    this.updateQuickStartHint();

    if (isTouchDevice()) this.showFullscreenPrompt();
  }

  hide(): void {
    this.markInitialized();
    this.root.classList.add(styles.hidden);
    setTimeout(() => { this.isVisible = false; }, 500);
  }

  show(): void {
    this.root.classList.remove(styles.hidden);
    this.isVisible = true;
  }

  onPlay(callback: (mode: GameMode) => void): void {
    this.onPlayCallback = callback;
  }

  onSettings(_callback: () => void): void {
    // Settings handled internally by SettingsModal
  }

  onHowToPlay(_callback: () => void): void {
    // HowToPlay handled internally by HowToPlayModal
  }

  showError(title: string, message: string): void {
    if (this.errorPanel) this.errorPanel.remove();
    this.clearInitTimeout();

    this.errorPanel = document.createElement('div');
    this.errorPanel.className = styles.errorPanel;
    this.errorPanel.innerHTML = `
      <div class="${styles.errorTitle}">${this.escapeHtml(title)}</div>
      <div class="${styles.errorMessage}">${this.escapeHtml(message)}</div>
      <div class="${styles.errorActions}">
        <button class="${styles.errorButton} ${styles.errorButtonPrimary}" data-action="retry">Retry</button>
        <button class="${styles.errorButton}" data-action="report">Report Issue</button>
      </div>
    `;

    const retryBtn = this.errorPanel.querySelector('[data-action="retry"]');
    retryBtn?.addEventListener('pointerdown', () => window.location.reload());
    retryBtn?.addEventListener('click', (e) => e.preventDefault());

    const reportBtn = this.errorPanel.querySelector('[data-action="report"]');
    reportBtn?.addEventListener('pointerdown', () => {
      window.open('https://github.com/matthew-kissinger/terror-in-the-jungle/issues', '_blank');
    });
    reportBtn?.addEventListener('click', (e) => e.preventDefault());

    document.body.appendChild(this.errorPanel);
  }

  startInitTimeout(): void {
    if (this.initTimeoutId !== null) clearTimeout(this.initTimeoutId);

    this.initTimeoutId = window.setTimeout(() => {
      if (!this.isInitialized) {
        this.showError(
          'Initialization Taking Too Long',
          'The game is taking longer than expected to initialize. This may be due to slow network, browser issues, or device limitations. You can try refreshing the page.'
        );
      }
    }, 30000);
  }

  clearInitTimeout(): void {
    if (this.initTimeoutId !== null) {
      clearTimeout(this.initTimeoutId);
      this.initTimeoutId = null;
    }
  }

  markInitialized(): void {
    this.isInitialized = true;
    this.clearInitTimeout();
  }

  override dispose(): void {
    this.dismissFullscreenPrompt();
    this.stopMenuGamepadLoop();
    this.clearInitTimeout();

    if (this.errorPanel) {
      this.errorPanel.remove();
      this.errorPanel = null;
    }

    this.settingsModal.dispose();
    this.howToPlayModal.dispose();

    super.dispose();
  }

  // --- Private ---

  private handlePlayClick = () => {
    if (isTouchDevice() && !document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {});
      }
    }
    this.dismissFullscreenPrompt();
    if (this.onPlayCallback) this.onPlayCallback(this.selectedGameMode);
  };

  private handleMenuKeyDown = (event: KeyboardEvent): void => {
    if (!this.isMenuInteractive()) return;
    if (event.code === 'Enter' || event.code === 'Space') {
      event.preventDefault();
      this.handlePlayClick();
      return;
    }
    if (event.code === 'ArrowRight') {
      event.preventDefault();
      this.cycleGameMode(1);
      return;
    }
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      this.cycleGameMode(-1);
    }
  };

  private resolveGameMode(mode: string): GameMode {
    switch (mode) {
      case 'zone_control': return GameMode.ZONE_CONTROL;
      case 'open_frontier': return GameMode.OPEN_FRONTIER;
      case 'tdm': return GameMode.TEAM_DEATHMATCH;
      case 'a_shau_valley': return GameMode.A_SHAU_VALLEY;
      default: return GameMode.ZONE_CONTROL;
    }
  }

  private selectGameMode(mode: GameMode): void {
    this.selectedGameMode = mode;

    for (const card of this.modeCards) {
      const isSelected = this.resolveGameMode(card.dataset.mode || '') === mode;
      card.classList.toggle(styles.modeCardSelected, isSelected);
    }

    const modeName =
      mode === GameMode.ZONE_CONTROL ? 'ZONE CONTROL'
      : mode === GameMode.OPEN_FRONTIER ? 'OPEN FRONTIER'
      : mode === GameMode.A_SHAU_VALLEY ? 'A SHAU VALLEY'
      : 'TEAM DEATHMATCH';

    const display = this.$('[data-ref="modeDisplay"]');
    if (display) display.innerHTML = `Selected: <strong>${modeName}</strong>`;

    const playBtn = this.$('[data-ref="play"]');
    if (playBtn) playBtn.textContent = `DEPLOY -- ${modeName}`;
  }

  private cycleGameMode(direction: 1 | -1): void {
    const currentIndex = this.modeOrder.indexOf(this.selectedGameMode);
    const safeCurrent = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeCurrent + direction + this.modeOrder.length) % this.modeOrder.length;
    this.selectGameMode(this.modeOrder[nextIndex]);
  }

  // --- Mode card HTML builder ---

  private buildModeCardHTML(mode: string, selected: boolean): string {
    const config = MODE_CARD_CONFIGS[mode];
    if (!config) return '';

    const selectedClass = selected ? ` ${styles.modeCardSelected}` : '';
    const tdmClass = config.cssClass === 'team-deathmatch-card' ? ` ${styles.tdmCard}` : '';
    const features = config.features
      .map(f => `<span class="${styles.modeFeature}">${f}</span>`)
      .join('');

    return `
      <div class="${styles.modeCard}${selectedClass}${tdmClass}" data-mode="${mode}">
        <div class="${styles.modeCardIndicator}"></div>
        <div class="${styles.modeCardHeader}">
          <span class="${styles.modeCardTitle}">${config.title}</span>
          <span class="${styles.modeCardSubtitle}">${config.subtitle}</span>
        </div>
        <div class="${styles.modeCardDescription}">${config.description}</div>
        <div class="${styles.modeCardFeatures}">${features}</div>
      </div>
    `;
  }

  // --- Fullscreen prompt ---

  private showFullscreenPrompt(): void {
    if (this.fullscreenPrompt) return;

    const prompt = document.createElement('div');
    prompt.className = styles.fullscreenPrompt;
    prompt.setAttribute('role', 'button');
    prompt.tabIndex = 0;

    const isPortrait = isPortraitViewport();
    prompt.textContent = isPortrait
      ? 'TAP FOR FULLSCREEN + LANDSCAPE'
      : 'TAP FOR FULLSCREEN';

    const handleTap = () => {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {})
          .finally(() => this.dismissFullscreenPrompt());
      } else {
        this.dismissFullscreenPrompt();
      }
    };

    prompt.addEventListener('pointerdown', (e) => { e.preventDefault(); handleTap(); });
    prompt.addEventListener('click', (e) => e.preventDefault());
    this.root.appendChild(prompt);
    this.fullscreenPrompt = prompt;

    // Auto-fade after 6 seconds
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

  private isMenuInteractive(): boolean {
    const buttons = this.$('[data-ref="menuButtons"]');
    return !!buttons && buttons.classList.contains(styles.menuButtonsVisible);
  }

  private startMenuGamepadLoop(): void {
    if (this.menuGamepadRafId !== null) return;
    const tick = () => {
      this.menuGamepadRafId = requestAnimationFrame(tick);
      if (!this.isVisible || !this.isMenuInteractive()) return;
      this.updateQuickStartHint();
      if (typeof navigator.getGamepads !== 'function') return;
      const pads = navigator.getGamepads();
      const gp = pads.find((pad) => !!pad);
      if (!gp) return;

      const aPressed = gp.buttons[0]?.pressed ?? false;
      const leftPressed = gp.buttons[14]?.pressed ?? false;
      const rightPressed = gp.buttons[15]?.pressed ?? false;

      if (aPressed && !this.prevGamepadButtons.a) this.handlePlayClick();
      if (leftPressed && !this.prevGamepadButtons.dpadLeft) this.cycleGameMode(-1);
      if (rightPressed && !this.prevGamepadButtons.dpadRight) this.cycleGameMode(1);

      this.prevGamepadButtons.a = aPressed;
      this.prevGamepadButtons.dpadLeft = leftPressed;
      this.prevGamepadButtons.dpadRight = rightPressed;
    };
    this.menuGamepadRafId = requestAnimationFrame(tick);
  }

  private stopMenuGamepadLoop(): void {
    if (this.menuGamepadRafId !== null) {
      cancelAnimationFrame(this.menuGamepadRafId);
      this.menuGamepadRafId = null;
    }
    this.prevGamepadButtons = { a: false, dpadLeft: false, dpadRight: false };
  }

  private preloadScreenImages(): void {
    const links: string[] = [START_SCREEN_IMAGE_URL, LOADING_SCREEN_IMAGE_URL];
    for (const href of links) {
      if (document.querySelector(`link[data-screen-preload="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.setAttribute('data-screen-preload', href);
      document.head.appendChild(link);
    }
  }

  private updateQuickStartHint(): void {
    const hintEl = this.$('[data-ref="quickStartHint"]');
    if (!hintEl) return;
    let text: string;
    if (isTouchDevice()) {
      text = 'Tap DEPLOY to enter battle.';
    } else if (typeof navigator.getGamepads === 'function' && navigator.getGamepads().some(p => !!p)) {
      text = 'Gamepad: A/Cross deploys, D-pad left/right changes mode.';
    } else {
      text = 'Keyboard: Enter deploys, Left/Right arrows change mode.';
    }
    if (text !== this.quickStartHintText) {
      this.quickStartHintText = text;
      hintEl.textContent = text;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
