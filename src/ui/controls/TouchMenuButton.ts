/**
 * Touch menu button (hamburger icon) for mobile pause/menu access.
 * Positioned top-right corner, small and unobtrusive.
 * On tap: shows a pause overlay with Resume and Quit to Menu options.
 */

export class TouchMenuButton {
  private button: HTMLDivElement;
  private overlay: HTMLDivElement | null = null;
  private isOverlayVisible = false;

  private onPauseCallback?: () => void;
  private onResumeCallback?: () => void;
  private onSquadCommandCallback?: () => void;
  private onScoreboardCallback?: () => void;

  constructor() {
    this.button = document.createElement('div');
    this.button.id = 'touch-menu-btn';
    Object.assign(this.button.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      width: 'var(--tc-action-size, 36px)',
      height: 'var(--tc-action-size, 36px)',
      borderRadius: '8px',
      background: 'rgba(0, 0, 0, 0.35)',
      backdropFilter: 'blur(4px)',
      webkitBackdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '3px',
      zIndex: '1002',
      touchAction: 'manipulation',
      pointerEvents: 'auto',
      userSelect: 'none',
      webkitUserSelect: 'none',
      cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);

    // Create hamburger icon (3 horizontal lines)
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      Object.assign(line.style, {
        width: '18px',
        height: '2px',
        background: 'rgba(255, 255, 255, 0.8)',
        borderRadius: '1px',
        pointerEvents: 'none',
      } as Partial<CSSStyleDeclaration>);
      this.button.appendChild(line);
    }

    this.button.addEventListener('pointerdown', this.onButtonTap, { passive: false });

    document.body.appendChild(this.button);
  }

  /**
   * Set callbacks for pause/resume state changes.
   * onPause: called when overlay opens (game should pause input)
   * onResume: called when overlay closes (game should resume input)
   */
  setCallbacks(onPause: () => void, onResume: () => void): void {
    this.onPauseCallback = onPause;
    this.onResumeCallback = onResume;
  }

  setSquadCallback(callback: () => void): void {
    this.onSquadCommandCallback = callback;
  }

  setScoreboardCallback(callback: () => void): void {
    this.onScoreboardCallback = callback;
  }

  private onButtonTap = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    if (this.isOverlayVisible) {
      this.hideOverlay();
    } else {
      this.showOverlay();
    }
  };

  private showOverlay(): void {
    if (this.isOverlayVisible) return;
    this.isOverlayVisible = true;

    this.overlay = document.createElement('div');
    this.overlay.id = 'touch-menu-overlay';
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(6px)',
      webkitBackdropFilter: 'blur(6px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      zIndex: '9990',
      touchAction: 'manipulation',
      pointerEvents: 'auto',
    } as Partial<CSSStyleDeclaration>);

    // Prevent any touch events from passing through to game
    this.overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    }, { passive: false });
    this.overlay.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });

    // Title
    const title = document.createElement('div');
    Object.assign(title.style, {
      fontSize: '24px',
      fontWeight: 'bold',
      color: 'rgba(255, 255, 255, 0.9)',
      marginBottom: '20px',
      fontFamily: 'monospace, sans-serif',
      letterSpacing: '2px',
      textTransform: 'uppercase',
    } as Partial<CSSStyleDeclaration>);
    title.textContent = 'PAUSED';
    this.overlay.appendChild(title);

    // Resume button
    this.overlay.appendChild(
      this.createOverlayButton('Resume', () => {
        this.hideOverlay();
      })
    );

    // Squad Commands button
    this.overlay.appendChild(
      this.createOverlayButton('Squad Commands', () => {
        this.hideOverlay();
        this.onSquadCommandCallback?.();
      })
    );

    // Scoreboard button
    this.overlay.appendChild(
      this.createOverlayButton('Scoreboard', () => {
        this.hideOverlay();
        this.onScoreboardCallback?.();
      })
    );

    // Quit to Menu button
    this.overlay.appendChild(
      this.createOverlayButton('Quit to Menu', () => {
        window.location.reload();
      })
    );

    document.body.appendChild(this.overlay);
    this.onPauseCallback?.();
  }

  private hideOverlay(): void {
    if (!this.isOverlayVisible) return;
    this.isOverlayVisible = false;

    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    this.onResumeCallback?.();
  }

  private createOverlayButton(label: string, onClick: () => void): HTMLDivElement {
    const btn = document.createElement('div');
    Object.assign(btn.style, {
      width: '220px',
      minHeight: '48px',
      borderRadius: '8px',
      background: 'rgba(255, 255, 255, 0.12)',
      border: '1px solid rgba(255, 255, 255, 0.25)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      fontWeight: 'bold',
      color: 'rgba(255, 255, 255, 0.9)',
      fontFamily: 'monospace, sans-serif',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: 'manipulation',
      pointerEvents: 'auto',
      cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>);
    btn.textContent = label;

    btn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 255, 255, 0.25)';
      btn.style.transform = 'scale(0.96)';
    }, { passive: false });

    btn.addEventListener('pointerup', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.style.background = 'rgba(255, 255, 255, 0.12)';
      btn.style.transform = 'scale(1)';
      onClick();
    }, { passive: false });

    btn.addEventListener('pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      btn.style.background = 'rgba(255, 255, 255, 0.12)';
      btn.style.transform = 'scale(1)';
    }, { passive: false });

    // Prevent touch events from reaching game
    btn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    }, { passive: false });

    return btn;
  }

  /** Whether the pause overlay is currently showing */
  isPaused(): boolean {
    return this.isOverlayVisible;
  }

  show(): void {
    this.button.style.display = 'flex';
  }

  hide(): void {
    this.button.style.display = 'none';
    // Also close overlay if open
    if (this.isOverlayVisible) {
      this.hideOverlay();
    }
  }

  dispose(): void {
    this.button.removeEventListener('pointerdown', this.onButtonTap);
    this.button.remove();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
