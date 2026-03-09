/**
 * FocusTrap - Traps Tab/Shift+Tab focus within a container element.
 *
 * Utility class (not a UIComponent). Designed for modal dialogs
 * to keep keyboard focus within the dialog while open.
 */

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export class FocusTrap {
  private container: HTMLElement;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Focus first focusable element and start trapping Tab navigation. */
  activate(): void {
    this.deactivate();

    this.handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = this.getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    this.container.addEventListener('keydown', this.handleKeyDown);

    const focusable = this.getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  }

  /** Stop trapping focus. Does not move focus. */
  deactivate(): void {
    if (this.handleKeyDown) {
      this.container.removeEventListener('keydown', this.handleKeyDown);
      this.handleKeyDown = null;
    }
  }

  /** Remove all listeners. */
  dispose(): void {
    this.deactivate();
  }

  private getFocusableElements(): HTMLElement[] {
    return Array.from(this.container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }
}
