import type { LogEntry } from '../../utils/Logger';
import { zIndex } from '../design/tokens';
import type { DebugPanel } from './DebugHudRegistry';

export class LogOverlay implements DebugPanel {
  readonly id = 'log';
  readonly label = 'Log Overlay';
  readonly defaultVisible = false;
  readonly defaultHotkey = 'F3';

  private container: HTMLDivElement;
  private visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'log-overlay';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '16px';
    this.container.style.left = '16px';
    this.container.style.width = '360px';
    this.container.style.maxHeight = '40vh';
    this.container.style.overflow = 'auto';
    this.container.style.padding = '12px 16px';
    this.container.style.background = 'rgba(12, 18, 20, 0.85)';
    this.container.style.border = '1px solid rgba(94, 168, 140, 0.45)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '11px';
    this.container.style.color = '#b9f5e2';
    this.container.style.whiteSpace = 'pre-wrap';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = String(zIndex.debugLog);
    this.container.style.display = 'none';
    this.container.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.35)';
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.container);
  }

  unmount(): void {
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  hide(): void {
    this.setVisible(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateEntries(entries: LogEntry[]): void {
    if (!this.visible) return;

    if (entries.length === 0) {
      this.container.innerText = 'LOG OVERLAY\n(no recent entries)';
      return;
    }

    const firstTs = entries[0].timestamp;
    const text = ['LOG OVERLAY'];

    for (const entry of entries) {
      const delta = ((entry.timestamp - firstTs) / 1000).toFixed(2);
      const line = `${delta}s [${entry.level.toUpperCase()}] (${entry.category}) ${entry.message}`;
      text.push(line);
      if (entry.args && entry.args.length > 0) {
        text.push(`    ↳ ${entry.args.map(arg => stringifyArg(arg)).join(' ')}`);
      }
    }

    this.container.innerText = text.join('\n');
  }

  dispose(): void {
    this.hide();
    this.unmount();
  }
}

function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return '[object]';
  }
}
