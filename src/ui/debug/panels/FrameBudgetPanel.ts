import { zIndex } from '../../design/tokens';
import type { DebugPanel } from '../DebugHudRegistry';

interface SystemTiming {
  name: string;
  timeMs: number;
  budgetMs: number;
}

/**
 * Per-system frame-time breakdown panel. Consumes the already-exposed
 * `SystemUpdater.getSystemTimings()` — no combat-side accessor needed. Each
 * system gets a row with a color-coded bar (green/amber/red by usage ratio).
 * Updates at 5Hz.
 */
export class FrameBudgetPanel implements DebugPanel {
  readonly id = 'frame-budget';
  readonly label = 'Frame Budget';
  readonly defaultVisible = true;

  private container: HTMLDivElement;
  private list: HTMLDivElement;
  private visible = false;
  private source?: () => SystemTiming[];
  private accumDt = 0;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'frame-budget-panel';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '16px';
    this.container.style.right = '16px';
    this.container.style.width = '260px';
    this.container.style.maxHeight = '40vh';
    this.container.style.overflow = 'auto';
    this.container.style.padding = '8px 12px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(79, 148, 120, 0.5)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '10px';
    this.container.style.color = '#a9f1d8';
    this.container.style.zIndex = String(zIndex.debug);
    this.container.style.pointerEvents = 'none';
    this.container.style.display = 'none';

    const title = document.createElement('div');
    title.innerText = 'FRAME BUDGET';
    title.style.marginBottom = '6px';
    title.style.fontWeight = 'bold';
    this.container.appendChild(title);

    this.list = document.createElement('div');
    this.container.appendChild(this.list);
  }

  setSource(source: () => SystemTiming[]): void {
    this.source = source;
  }

  mount(container: HTMLElement): void { container.appendChild(this.container); }
  unmount(): void {
    if (this.container.parentElement) this.container.parentElement.removeChild(this.container);
  }
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }
  isVisible(): boolean { return this.visible; }

  update(dt: number): void {
    if (!this.visible) return;
    this.accumDt += dt;
    if (this.accumDt < 0.2) return;
    this.accumDt = 0;

    const timings = (this.source?.() ?? []).slice().sort((a, b) => b.timeMs - a.timeMs);
    this.renderList(timings);
  }

  private renderList(timings: SystemTiming[]): void {
    // Render a simple sortable list with color-coded bar per row.
    const html: string[] = [];
    for (const t of timings) {
      const ratio = t.budgetMs > 0 ? Math.min(1, t.timeMs / t.budgetMs) : 0;
      const pct = Math.round(ratio * 100);
      const color = ratio < 0.5 ? '#4ade80' : ratio < 0.8 ? '#fbbf24' : '#ef4444';
      const nameCell = escapeHtml(t.name);
      const timeCell = `${t.timeMs.toFixed(2)}ms`;
      html.push(
        `<div style="margin-bottom:3px">` +
          `<div style="display:flex;justify-content:space-between">` +
            `<span>${nameCell}</span><span>${timeCell} (${pct}%)</span>` +
          `</div>` +
          `<div style="height:4px;background:rgba(30,30,30,0.6);border-radius:2px;overflow:hidden">` +
            `<div style="height:100%;width:${pct}%;background:${color}"></div>` +
          `</div>` +
        `</div>`,
      );
    }
    if (html.length === 0) html.push('<div>(no data)</div>');
    this.list.innerHTML = html.join('');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
