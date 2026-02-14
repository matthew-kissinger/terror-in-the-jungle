import { zIndex } from '../design/tokens';

export class TimeIndicator {
  private container: HTMLDivElement;
  private visible = false;
  private timeText: HTMLDivElement;
  private iconContainer: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'time-indicator';
    this.container.style.position = 'fixed';
    this.container.style.top = '16px';
    this.container.style.left = '16px';
    this.container.style.padding = '10px 14px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(79, 148, 120, 0.5)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '14px';
    this.container.style.color = '#a9f1d8';
    this.container.style.zIndex = String(zIndex.debug);
    this.container.style.pointerEvents = 'none';
    this.container.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.35)';
    this.container.style.backdropFilter = 'blur(6px)';
    this.container.style.display = 'none';
    this.container.style.alignItems = 'center';
    this.container.style.gap = '8px';

    // Icon container (sun/moon)
    this.iconContainer = document.createElement('div');
    this.iconContainer.style.fontSize = '18px';
    this.iconContainer.style.lineHeight = '1';
    this.iconContainer.innerText = '';

    // Time text
    this.timeText = document.createElement('div');
    this.timeText.style.fontWeight = 'bold';
    this.timeText.innerText = '12:00';

    // Keep hidden by default - toggle with F4
    this.container.appendChild(this.iconContainer);
    this.container.appendChild(this.timeText);

    document.body.appendChild(this.container);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'flex' : 'none';
  }

  show(): void {
    this.visible = true;
    this.container.style.display = 'flex'; // Use flex for icon + text layout
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Update time display
   * @param timeString Formatted time string (e.g., "12:30")
   * @param nightFactor 0.0 (day) to 1.0 (night)
   */
  update(timeString: string, nightFactor: number): void {
    if (!this.visible) return;

    this.timeText.innerText = timeString;

    // Update icon based on time
    if (nightFactor > 0.7) {
      // Night
      this.iconContainer.innerText = '';
      this.container.style.color = '#6b9bd8'; // Blue tint for night
    } else if (nightFactor > 0.4) {
      // Dusk/Dawn
      this.iconContainer.innerText = '🌆';
      this.container.style.color = '#f0b070'; // Orange tint
    } else {
      // Day
      this.iconContainer.innerText = '';
      this.container.style.color = '#a9f1d8'; // Default green
    }
  }

  dispose(): void {
    this.hide();
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
