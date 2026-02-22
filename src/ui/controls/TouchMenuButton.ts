/**
 * Touch menu button (hamburger icon) for mobile pause/menu access.
 * Positioned top-right corner, small and unobtrusive.
 * On tap: shows a pause overlay with Resume and Quit to Menu options.
 */

import { UIComponent } from '../engine/UIComponent';
import styles from './TouchControls.module.css';

export class TouchMenuButton extends UIComponent {
  private overlay: HTMLDivElement | null = null;
  private isOverlayVisible = false;

  private onPauseCallback?: () => void;
  private onResumeCallback?: () => void;
  private onSquadCommandCallback?: () => void;
  private onScoreboardCallback?: () => void;

  protected build(): void {
    this.root.className = styles.menuBtn;
    this.root.id = 'touch-menu-btn';

    // Create hamburger icon (3 horizontal lines)
    for (let i = 0; i < 3; i++) {
      const line = document.createElement('div');
      line.className = styles.menuLine;
      this.root.appendChild(line);
    }
  }

  protected onMount(): void {
    this.listen(this.root, 'pointerdown', this.onButtonTap, { passive: false });
  }

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
    this.overlay.className = styles.pauseOverlay;

    // Prevent pointer events from passing through
    this.overlay.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    }, { passive: false });

    // Title
    const title = document.createElement('div');
    title.className = styles.pauseTitle;
    title.textContent = 'PAUSED';
    this.overlay.appendChild(title);

    // Resume
    this.overlay.appendChild(
      this.createOverlayButton('Resume', () => this.hideOverlay())
    );

    // Squad Commands
    this.overlay.appendChild(
      this.createOverlayButton('Squad Commands', () => {
        this.hideOverlay();
        this.onSquadCommandCallback?.();
      })
    );

    // Scoreboard
    this.overlay.appendChild(
      this.createOverlayButton('Scoreboard', () => {
        this.hideOverlay();
        this.onScoreboardCallback?.();
      })
    );

    // Quit to Menu
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
    btn.className = styles.pauseBtn;
    btn.textContent = label;

    btn.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add(styles.pressed);
    }, { passive: false });

    btn.addEventListener('pointerup', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.remove(styles.pressed);
      onClick();
    }, { passive: false });

    btn.addEventListener('pointercancel', (e: PointerEvent) => {
      e.preventDefault();
      btn.classList.remove(styles.pressed);
    }, { passive: false });

    return btn;
  }

  /** Whether the pause overlay is currently showing */
  isPaused(): boolean {
    return this.isOverlayVisible;
  }

  /** Re-parent into a grid slot. */
  mountTo(parent: HTMLElement): void {
    this.root.classList.add(styles.slotted);
    this.reparentTo(parent);
  }

  show(): void {
    this.root.style.display = 'flex';
  }

  hide(): void {
    this.root.style.display = 'none';
    if (this.isOverlayVisible) {
      this.hideOverlay();
    }
  }

  override dispose(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    super.dispose();
  }
}
