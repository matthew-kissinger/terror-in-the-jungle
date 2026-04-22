import { zIndex } from '../../design/tokens';
import type { DebugPanel } from '../DebugHudRegistry';

interface CombatSource {
  getCombatStats(): { us: number; opfor: number; total: number };
  getTelemetry(): {
    lastMs: number;
    emaMs: number;
    lodHigh: number;
    lodMedium: number;
    lodLow: number;
    lodCulled: number;
    combatantCount: number;
  };
}

/**
 * Thin panel surfacing combatant counts and per-tick AI cost.
 *
 * The cycle brief caps any additive read-only accessor on CombatantSystem at
 * ≤20 LOC. `getCombatStats()` and `getTelemetry()` already exist, so this
 * panel uses them directly — no combat-side change needed. Stall-backtrack
 * count is a TODO: the symbol does not exist today and adding it would fall
 * outside the 20-LOC guard per the brief.
 */
export class CombatStatePanel implements DebugPanel {
  readonly id = 'combat-state';
  readonly label = 'Combat State';
  readonly defaultVisible = true;

  private container: HTMLDivElement;
  private visible = false;
  private source?: CombatSource;
  private accumDt = 0;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'combat-state-panel';
    this.container.style.position = 'fixed';
    this.container.style.top = '96px';
    this.container.style.left = '16px';
    this.container.style.padding = '8px 12px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(201, 86, 74, 0.45)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '11px';
    this.container.style.color = '#f5c5bf';
    this.container.style.zIndex = String(zIndex.debug);
    this.container.style.pointerEvents = 'none';
    this.container.style.whiteSpace = 'pre';
    this.container.style.display = 'none';
    this.container.innerText = 'COMBAT\n(no data)';
  }

  setSource(source: CombatSource): void {
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
    if (this.accumDt < 0.25) return;
    this.accumDt = 0;

    if (!this.source) {
      this.container.innerText = 'COMBAT\n—';
      return;
    }

    const stats = this.source.getCombatStats();
    const tel = this.source.getTelemetry();

    this.container.innerText = [
      'COMBAT',
      `BLUFOR ${stats.us}  OPFOR ${stats.opfor}  total ${stats.total}`,
      `AI tick last ${tel.lastMs.toFixed(2)}ms  avg ${tel.emaMs.toFixed(2)}ms`,
      `LOD H${tel.lodHigh} M${tel.lodMedium} L${tel.lodLow} X${tel.lodCulled}`,
      // TODO(cycle-2026-04-24): wire stall-backtrack once getAIBudgetStarvationPerSecond() lands
      'stall/backtrack —',
    ].join('\n');
  }
}
