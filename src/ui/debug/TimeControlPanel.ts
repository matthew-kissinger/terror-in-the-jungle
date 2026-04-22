import { zIndex } from '../design/tokens';
import type { DebugPanel } from './DebugHudRegistry';
import type { TimeScale } from '../../core/TimeScale';

/**
 * TimeControlPanel — top-right surface showing current sim speed and exposing
 * pause / step / slower / faster / reset buttons. The panel owns no state
 * beyond its own DOM; the authoritative scale lives on the shared `TimeScale`.
 */
export class TimeControlPanel implements DebugPanel {
  readonly id = 'time-control';
  readonly label = 'Time Control';
  readonly defaultVisible = false;

  private container: HTMLDivElement;
  private visible = false;
  private readonly timeScale: TimeScale;
  private readonly speedLabel: HTMLDivElement;
  private readonly pauseButton: HTMLButtonElement;
  private accumDt = 0;

  constructor(timeScale: TimeScale) {
    this.timeScale = timeScale;

    this.container = document.createElement('div');
    this.container.className = 'time-control-panel';
    Object.assign(this.container.style, {
      position: 'fixed', top: '16px', right: '16px', width: '200px',
      padding: '10px 12px', background: 'rgba(12, 16, 22, 0.85)',
      border: '1px solid rgba(217, 180, 127, 0.45)', borderRadius: '8px',
      fontFamily: '"Courier New", monospace', fontSize: '11px', color: '#f1dfc9',
      zIndex: String(zIndex.debug), pointerEvents: 'auto', display: 'none',
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.35)',
    });

    const title = document.createElement('div');
    title.textContent = 'TIME CONTROL';
    Object.assign(title.style, { fontWeight: 'bold', marginBottom: '6px' });
    this.container.appendChild(title);

    this.speedLabel = document.createElement('div');
    Object.assign(this.speedLabel.style, { marginBottom: '8px', fontSize: '14px' });
    this.container.appendChild(this.speedLabel);

    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' });
    this.container.appendChild(row);

    this.pauseButton = this.makeButton('Pause', () => this.timeScale.togglePause());
    row.appendChild(this.pauseButton);
    row.appendChild(this.makeButton('Step', () => this.timeScale.stepOneFrame()));
    row.appendChild(this.makeButton('-', () => this.timeScale.slower()));
    row.appendChild(this.makeButton('+', () => this.timeScale.faster()));
    row.appendChild(this.makeButton('1.0x', () => this.timeScale.reset()));

    this.refreshReadout();
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      flex: '0 0 auto', padding: '4px 8px', background: 'rgba(40, 50, 62, 0.9)',
      border: '1px solid rgba(217, 180, 127, 0.5)', color: '#f1dfc9',
      fontFamily: 'inherit', fontSize: '11px', cursor: 'pointer', borderRadius: '4px',
    });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onClick();
      this.refreshReadout();
    });
    return btn;
  }

  mount(container: HTMLElement): void { container.appendChild(this.container); }
  unmount(): void {
    if (this.container.parentElement) this.container.parentElement.removeChild(this.container);
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
    if (visible) this.refreshReadout();
  }
  isVisible(): boolean { return this.visible; }

  update(dt: number): void {
    if (!this.visible) return;
    this.accumDt += dt;
    if (this.accumDt < 0.2) return;
    this.accumDt = 0;
    this.refreshReadout();
  }

  private refreshReadout(): void {
    const scale = this.timeScale.getScale();
    const paused = this.timeScale.isPaused();
    let text: string;
    let color: string;
    if (paused) {
      text = `PAUSED (${formatScale(scale)})`;
      color = '#ffb87a';
    } else if (scale < 1) {
      text = `${formatScale(scale)} SLOW`;
      color = '#7fb4d9';
    } else if (scale > 1) {
      text = `${formatScale(scale)} FAST`;
      color = '#f5d77a';
    } else {
      text = '1.0x';
      color = '#b9f5e2';
    }
    this.speedLabel.textContent = text;
    this.speedLabel.style.color = color;
    this.pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }
}

function formatScale(scale: number): string {
  return `${scale.toFixed(scale < 1 ? 2 : 1)}x`;
}
