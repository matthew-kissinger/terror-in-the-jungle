import { zIndex } from '../../design/tokens';
import type { DebugPanel } from '../DebugHudRegistry';
import { GameMode, WeatherState } from '../../../config/gameModeTypes';
import { getGameModeDefinition } from '../../../config/gameModeDefinitions';

interface ModeSource {
  getMode(): GameMode;
  getWeather(): WeatherState | string;
  getTimeOfDaySeconds(): number;
  getScenarioName(): string | undefined;
}

/**
 * Thin panel describing the current scenario: GameMode enum + human name,
 * weather state, and simulation time of day (HH:MM derived from the
 * AtmosphereSystem simulation-time seconds).
 */
export class CurrentModePanel implements DebugPanel {
  readonly id = 'current-mode';
  readonly label = 'Current Mode';
  readonly defaultVisible = true;

  private container: HTMLDivElement;
  private visible = false;
  private source?: ModeSource;
  private accumDt = 0;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'current-mode-panel';
    this.container.style.position = 'fixed';
    this.container.style.top = '16px';
    this.container.style.left = '16px';
    // Offset below TimeIndicator (also at top-left) when both are visible.
    this.container.style.marginTop = '48px';
    this.container.style.padding = '8px 12px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(127, 180, 217, 0.45)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '11px';
    this.container.style.color = '#c9e3f1';
    this.container.style.zIndex = String(zIndex.debug);
    this.container.style.pointerEvents = 'none';
    this.container.style.whiteSpace = 'pre';
    this.container.style.display = 'none';
    this.container.innerText = 'MODE\n(no data)';
  }

  setSource(source: ModeSource): void {
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
    if (this.accumDt < 0.5) return;
    this.accumDt = 0;

    if (!this.source) {
      this.container.innerText = 'MODE\n—';
      return;
    }

    const mode = this.source.getMode();
    let modeName = String(mode);
    try {
      modeName = getGameModeDefinition(mode).config.name ?? modeName;
    } catch {
      // definition not available — fall back to enum value
    }
    const scenario = this.source.getScenarioName() ?? '—';
    const weather = String(this.source.getWeather());
    const tod = formatClock(this.source.getTimeOfDaySeconds());

    this.container.innerText = [
      'MODE',
      `${mode}  ${modeName}`,
      `scenario ${scenario}`,
      `weather ${weather}`,
      `tod ${tod}`,
    ].join('\n');
  }
}

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.floor(seconds)) % 86400;
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}
