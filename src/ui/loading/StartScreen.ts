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
import { GameLaunchSelection, GameMode } from '../../config/gameModeTypes';
import { Alliance, Faction } from '../../systems/combat/types';
import { isTouchDevice } from '../../utils/DeviceDetector';
import { isPortraitViewport, tryLockLandscapeOrientation } from '../../utils/Orientation';
import { SettingsModal } from './SettingsModal';
import { HowToPlayModal } from './HowToPlayModal';
import { LoadingProgress } from './LoadingProgress';
import { LOADING_PHASES } from '../../config/loading';
import { MODE_CARD_CONFIGS } from './ModeCard';
import {
  getFactionOptionsForAlliance,
  getGameModeDefinition,
  getPlayableAlliances,
  resolveLaunchSelection
} from '../../config/gameModeDefinitions';
import { createDeploySession } from '../../systems/world/runtime/DeployFlowSession';
import styles from './StartScreen.module.css';

const SCREEN_ASSET_BASE_URL = import.meta.env.BASE_URL;
const START_SCREEN_IMAGE_URL = `${SCREEN_ASSET_BASE_URL}assets/ui/screens/start-screen.webp`;
const LOADING_SCREEN_IMAGE_URL = `${SCREEN_ASSET_BASE_URL}assets/ui/screens/loading-screen.webp`;

export class StartScreen extends UIComponent {
  private settingsModal: SettingsModal;
  private howToPlayModal: HowToPlayModal;

  // Built lazily in build()
  private progress!: LoadingProgress;
  private modeCards: HTMLDivElement[] = [];

  private isVisible = true;
  private selectedGameMode: GameMode = GameMode.ZONE_CONTROL;
  private onPlayCallback?: (selection: GameLaunchSelection) => void;
  private initTimeoutId: number | null = null;
  private isInitialized = false;
  private readonly launchSelections = new Map<GameMode, Pick<GameLaunchSelection, 'alliance' | 'faction'>>();

  // Fullscreen prompt state
  private fullscreenPrompt: HTMLDivElement | null = null;
  private fullscreenFadeTimerId: ReturnType<typeof setTimeout> | null = null;
  private fullscreenAutoTimerId: ReturnType<typeof setTimeout> | null = null;

  // Error panel (appended outside root)
  private errorPanel: HTMLDivElement | null = null;
  private menuGamepadRafId: number | null = null;
  private prevGamepadButtons = { a: false, dpadLeft: false, dpadRight: false };
  private quickStartHintText = '';
  private isLaunching = false;
  private launchMode: GameMode | null = null;
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
    this.root.style.backgroundImage = `url("${START_SCREEN_IMAGE_URL}")`;

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
            <div class="${styles.selectedModeHeader}">
              <span class="${styles.selectedModeLabel}">
                Selected: <strong data-ref="modeName">ZONE CONTROL</strong>
              </span>
              <span class="${styles.modeStatusBadge}" data-ref="modeStatus">Ready</span>
            </div>
            <div class="${styles.selectedModeFlow}" data-ref="flowSummary"></div>
            <div class="${styles.selectionMatrix}">
              <div class="${styles.selectionGroup}">
                <div class="${styles.selectionGroupLabel}">Side</div>
                <div class="${styles.selectionOptionRow}" data-ref="allianceOptions"></div>
              </div>
              <div class="${styles.selectionGroup}">
                <div class="${styles.selectionGroupLabel}">Faction</div>
                <div class="${styles.selectionOptionRow}" data-ref="factionOptions"></div>
              </div>
              <div class="${styles.selectionSummary}" data-ref="selectionSummary"></div>
            </div>
            <div class="${styles.selectedModeDescription}" data-ref="modeDescription"></div>
            <div class="${styles.selectedModeSequenceBlock}">
              <div class="${styles.selectedModeSequenceTitle}" data-ref="sequenceTitle"></div>
              <ol class="${styles.selectedModeSequence}" data-ref="sequenceList"></ol>
            </div>
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

    const modeDisplay = this.$('[data-ref="modeDisplay"]');
    if (modeDisplay) {
      this.listen(modeDisplay, 'pointerdown', this.handleSelectionPointerDown);
      this.listen(modeDisplay, 'click', this.handleSelectionPointerDown);
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
    this.selectGameMode(this.selectedGameMode);

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
    this.cancelGameLaunch();
    this.root.style.backgroundImage = `url("${START_SCREEN_IMAGE_URL}")`;

    const buttons = this.$('[data-ref="menuButtons"]');
    if (buttons) buttons.classList.add(styles.menuButtonsVisible);

    const modeSection = this.$('[data-ref="modeSection"]');
    if (modeSection) modeSection.classList.add(styles.modeSelectionVisible);

    this.progress.showComplete();
    this.updateQuickStartHint();

    if (isTouchDevice()) this.showFullscreenPrompt();
  }

  beginGameLaunch(selection: GameLaunchSelection): void {
    this.isLaunching = true;
    this.launchMode = selection.mode;
    this.selectedGameMode = selection.mode;
    this.launchSelections.set(selection.mode, {
      alliance: selection.alliance,
      faction: selection.faction,
    });
    this.root.classList.add(styles.menuLocked, styles.screenPreparing);
    this.root.style.backgroundImage = `url("${LOADING_SCREEN_IMAGE_URL}")`;
    this.setMenuButtonsEnabled(false);

    const definition = getGameModeDefinition(selection.mode);
    this.progress.setStatusText(`Preparing ${definition.config.name} deployment...`);
    this.progress.setTipText('Deployment screen opens next. Confirm insertion and loadout before entering combat.');
    this.selectGameMode(selection.mode);
    this.updateQuickStartHint();
  }

  cancelGameLaunch(): void {
    this.isLaunching = false;
    this.launchMode = null;
    this.root.classList.remove(styles.menuLocked, styles.screenPreparing);
    this.root.style.backgroundImage = `url("${START_SCREEN_IMAGE_URL}")`;
    this.setMenuButtonsEnabled(true);
    this.selectGameMode(this.selectedGameMode);
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

  onPlay(callback: (selection: GameLaunchSelection) => void): void {
    this.onPlayCallback = callback;
  }

  onSettings(_callback: () => void): void {
    // Settings handled internally by SettingsModal
  }

  onHowToPlay(_callback: () => void): void {
    // HowToPlay handled internally by HowToPlayModal
  }

  showError(title: string, message: string): void {
    this.cancelGameLaunch();
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
    if (this.isLaunching) return;
    if (isTouchDevice() && !document.fullscreenElement) {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen()
          .then(() => tryLockLandscapeOrientation())
          .catch(() => {});
      }
    }
    this.dismissFullscreenPrompt();
    if (this.onPlayCallback) this.onPlayCallback(this.getLaunchSelection(this.selectedGameMode));
  };

  private handleMenuKeyDown = (event: KeyboardEvent): void => {
    if (!this.isMenuInteractive()) return;
    if (this.hasFocusedMenuControl()) return;
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
    const definition = getGameModeDefinition(mode);
    const deploySession = createDeploySession(definition, 'menu');
    const launchSelection = this.getLaunchSelection(mode);
    const isPreparing = this.isLaunching && this.launchMode === mode;

    for (const card of this.modeCards) {
      const isSelected = this.resolveGameMode(card.dataset.mode || '') === mode;
      card.classList.toggle(styles.modeCardSelected, isSelected);
    }

    const modeName = definition.config.name.toUpperCase();
    const modeNameEl = this.$('[data-ref="modeName"]');
    if (modeNameEl) modeNameEl.textContent = modeName;

    const flowSummary = this.$('[data-ref="flowSummary"]');
    if (flowSummary) {
      flowSummary.textContent = `${deploySession.flowLabel} - ${deploySession.subheadline}`;
    }

    const allianceOptions = this.$('[data-ref="allianceOptions"]');
    if (allianceOptions) {
      const playableAlliances = getPlayableAlliances(definition);
      allianceOptions.innerHTML = playableAlliances.map(alliance => `
        <button
          type="button"
          class="${styles.selectionOption}${launchSelection.alliance === alliance ? ` ${styles.selectionOptionActive}` : ''}"
          data-alliance="${alliance}"
          ${this.isLaunching ? 'disabled' : ''}
        >${this.getAllianceLabel(alliance)}</button>
      `).join('');
    }

    const factionOptions = this.$('[data-ref="factionOptions"]');
    if (factionOptions) {
      const availableFactions = getFactionOptionsForAlliance(definition, launchSelection.alliance);
      factionOptions.innerHTML = availableFactions.map(faction => `
        <button
          type="button"
          class="${styles.selectionOption}${launchSelection.faction === faction ? ` ${styles.selectionOptionActive}` : ''}"
          data-faction="${faction}"
          ${this.isLaunching ? 'disabled' : ''}
        >${this.getFactionLabel(faction)}</button>
      `).join('');
    }

    const selectionSummary = this.$('[data-ref="selectionSummary"]');
    if (selectionSummary) {
      selectionSummary.textContent = `Operating as ${this.getFactionLabel(launchSelection.faction)} on the ${this.getAllianceLabel(launchSelection.alliance)} side.`;
    }

    const modeDescription = this.$('[data-ref="modeDescription"]');
    if (modeDescription) {
      modeDescription.textContent = definition.config.description;
    }

    const sequenceTitle = this.$('[data-ref="sequenceTitle"]');
    if (sequenceTitle) {
      sequenceTitle.textContent = deploySession.sequenceTitle;
    }

    const sequenceList = this.$('[data-ref="sequenceList"]');
    if (sequenceList) {
      sequenceList.innerHTML = deploySession.sequenceSteps.map(step => `<li>${step}</li>`).join('');
    }

    const modeStatus = this.$('[data-ref="modeStatus"]');
    if (modeStatus) {
      modeStatus.textContent = isPreparing ? 'Preparing' : 'Ready';
      modeStatus.classList.toggle(styles.modeStatusPreparing, isPreparing);
      modeStatus.classList.toggle(styles.modeStatusReady, !isPreparing);
    }

    const playBtn = this.$('[data-ref="play"]');
    if (playBtn) {
      playBtn.textContent = isPreparing
        ? `${this.getPreparingActionLabel(deploySession.flow)} ${this.getFactionLabel(launchSelection.faction)} -- ${modeName}`
        : `${deploySession.actionLabel} ${this.getFactionLabel(launchSelection.faction)} -- ${modeName}`;
    }
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
    return !this.isLaunching && !!buttons && buttons.classList.contains(styles.menuButtonsVisible);
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
    if (this.isLaunching) {
      text = 'Preparing battlefield and opening the deploy screen...';
    } else if (isTouchDevice()) {
      text = 'Choose mode and side, then tap deploy to continue.';
    } else if (typeof navigator.getGamepads === 'function' && navigator.getGamepads().some(p => !!p)) {
      text = 'Gamepad: A/Cross deploys, D-pad left/right changes mode. Use side buttons for faction selection.';
    } else {
      text = 'Keyboard: Enter deploys, Left/Right arrows change mode, Tab reaches side and faction selectors.';
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

  private setMenuButtonsEnabled(enabled: boolean): void {
    const buttonRefs = ['play', 'settings', 'howToPlay'];
    for (const ref of buttonRefs) {
      const button = this.$(`[data-ref="${ref}"]`) as HTMLButtonElement | null;
      if (button) {
        button.disabled = !enabled;
      }
    }
  }

  private handleSelectionPointerDown = (event: Event): void => {
    if (this.isLaunching) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    const allianceButton = target.closest<HTMLElement>('[data-alliance]');
    if (allianceButton?.dataset.alliance) {
      event.preventDefault();
      this.updateLaunchSelection(this.selectedGameMode, {
        alliance: allianceButton.dataset.alliance as Alliance,
      });
      this.selectGameMode(this.selectedGameMode);
      return;
    }

    const factionButton = target.closest<HTMLElement>('[data-faction]');
    if (factionButton?.dataset.faction) {
      event.preventDefault();
      const currentSelection = this.getLaunchSelection(this.selectedGameMode);
      this.updateLaunchSelection(this.selectedGameMode, {
        alliance: currentSelection.alliance,
        faction: factionButton.dataset.faction as Faction,
      });
      this.selectGameMode(this.selectedGameMode);
    }
  };

  private getLaunchSelection(mode: GameMode): GameLaunchSelection {
    const definition = getGameModeDefinition(mode);
    const resolved = resolveLaunchSelection(definition, this.launchSelections.get(mode));
    this.launchSelections.set(mode, resolved);
    return {
      mode,
      alliance: resolved.alliance,
      faction: resolved.faction,
    };
  }

  private updateLaunchSelection(
    mode: GameMode,
    selection: Partial<Pick<GameLaunchSelection, 'alliance' | 'faction'>>
  ): void {
    const definition = getGameModeDefinition(mode);
    const currentSelection = this.launchSelections.get(mode);
    this.launchSelections.set(mode, resolveLaunchSelection(definition, {
      ...currentSelection,
      ...selection,
    }));
  }

  private getAllianceLabel(alliance: Alliance): string {
    return alliance === Alliance.BLUFOR ? 'BLUFOR' : 'OPFOR';
  }

  private getFactionLabel(faction: Faction): string {
    switch (faction) {
      case Faction.ARVN:
        return 'ARVN';
      case Faction.NVA:
        return 'NVA';
      case Faction.VC:
        return 'VC';
      case Faction.US:
      default:
        return 'US';
    }
  }

  private hasFocusedMenuControl(): boolean {
    const activeElement = document.activeElement as HTMLElement | null;
    if (!activeElement) {
      return false;
    }

    return !!activeElement.closest(`.${styles.selectionOption}, .${styles.menuButton}, .${styles.modeCard}`);
  }

  private getPreparingActionLabel(flow: ReturnType<typeof createDeploySession>['flow']): string {
    switch (flow) {
      case 'frontier':
        return 'PREPARING FRONTIER';
      case 'air_assault':
        return 'PREPARING INSERTION';
      case 'sandbox':
        return 'PREPARING SIMULATION';
      case 'standard':
      default:
        return 'PREPARING DEPLOYMENT';
    }
  }
}
