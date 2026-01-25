export interface SystemTiming {
  name: string;
  timeMs: number;
  budgetMs: number;
}

export interface PerformanceStats {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  chunkQueueSize: number;
  loadedChunks: number;
  usCombatants: number;
  opforCombatants: number;
  vegetationActive: number;
  vegetationReserved: number;
  suppressedLogs: number;
  geometries: number;
  textures: number;
  programs: number;
  combatLastMs: number;
  combatEmaMs: number;
  combatLodHigh: number;
  combatLodMedium: number;
  combatLodLow: number;
  combatLodCulled: number;
  combatantCount: number;
  octreeNodes?: number;
  octreeMaxDepth?: number;
  octreeAvgPerLeaf?: number;
  systemTimings?: SystemTiming[];
}

export class PerformanceOverlay {
  private container: HTMLDivElement;
  private visible = false;
  private fpsHistory: number[] = [];
  private readonly maxHistory = 60;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'performance-overlay';
    this.container.style.position = 'fixed';
    this.container.style.top = '16px';
    this.container.style.right = '16px';
    this.container.style.padding = '12px 16px';
    this.container.style.background = 'rgba(10, 16, 18, 0.82)';
    this.container.style.border = '1px solid rgba(79, 148, 120, 0.5)';
    this.container.style.borderRadius = '8px';
    this.container.style.fontFamily = '"Courier New", monospace';
    this.container.style.fontSize = '12px';
    this.container.style.color = '#a9f1d8';
    this.container.style.zIndex = '10004';
    this.container.style.pointerEvents = 'none';
    this.container.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.35)';
    this.container.style.backdropFilter = 'blur(6px)';
    this.container.style.display = 'none';

    document.body.appendChild(this.container);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  hide(): void {
    this.visible = false;
    this.container.style.display = 'none';
  }

  isVisible(): boolean {
    return this.visible;
  }

  update(stats: PerformanceStats): void {
    if (!this.visible) return;

    this.pushFps(stats.fps);
    const avgFps = this.getAverageFps();

    // Clear and rebuild container
    this.container.innerHTML = '';

    // Create header section
    const header = document.createElement('div');
    header.style.marginBottom = '12px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid rgba(79, 148, 120, 0.3)';

    const text = [
      'PERFORMANCE',
      `FPS: ${stats.fps.toFixed(0)} (avg ${avgFps.toFixed(0)})`,
      `Frame: ${stats.frameTimeMs.toFixed(2)} ms`,
      `Draw Calls: ${stats.drawCalls}`,
      `Triangles: ${stats.triangles.toLocaleString()}`,
      `Chunks: ${stats.loadedChunks} (queue ${stats.chunkQueueSize})`,
      `Combatants: US ${stats.usCombatants} / OPFOR ${stats.opforCombatants}`,
      `Vegetation: ${stats.vegetationActive} active / ${stats.vegetationReserved} reserved`,
      `Combat: last ${stats.combatLastMs.toFixed(2)} ms (avg ${stats.combatEmaMs.toFixed(2)} ms)`,
      `LOD: high ${stats.combatLodHigh} / med ${stats.combatLodMedium} / low ${stats.combatLodLow} / culled ${stats.combatLodCulled} (total ${stats.combatantCount})`,
      stats.octreeNodes !== undefined
        ? `Octree: ${stats.octreeNodes} nodes / depth ${stats.octreeMaxDepth} / avg ${stats.octreeAvgPerLeaf?.toFixed(1)} per leaf`
        : null,
      `Memory: geom ${stats.geometries} / tex ${stats.textures} / prog ${stats.programs}`,
      `Logs suppressed: ${stats.suppressedLogs}`
    ].filter(line => line !== null);

    header.innerText = text.join('\n');
    this.container.appendChild(header);

    // Add frame budget visualization if system timings are provided
    if (stats.systemTimings && stats.systemTimings.length > 0) {
      this.renderFrameBudget(stats.systemTimings);
    }
  }

  private renderFrameBudget(timings: SystemTiming[]): void {
    const budgetSection = document.createElement('div');
    budgetSection.style.marginTop = '12px';

    // Section title
    const title = document.createElement('div');
    title.innerText = 'FRAME BUDGET (16.67ms target)';
    title.style.marginBottom = '8px';
    title.style.fontWeight = 'bold';
    title.style.color = '#4f9478';
    budgetSection.appendChild(title);

    // Calculate total time
    const totalTime = timings.reduce((sum, t) => sum + t.timeMs, 0);
    const targetBudget = 16.67; // 60 FPS

    // Overall budget bar
    const overallBar = this.createBudgetBar('TOTAL', totalTime, targetBudget);
    budgetSection.appendChild(overallBar);

    // Separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.background = 'rgba(79, 148, 120, 0.2)';
    separator.style.margin = '6px 0';
    budgetSection.appendChild(separator);

    // Individual system bars
    for (const timing of timings) {
      const bar = this.createBudgetBar(timing.name, timing.timeMs, timing.budgetMs);
      budgetSection.appendChild(bar);
    }

    this.container.appendChild(budgetSection);
  }

  private createBudgetBar(label: string, timeMs: number, budgetMs: number): HTMLDivElement {
    const row = document.createElement('div');
    row.style.marginBottom = '4px';

    // Label and time
    const labelDiv = document.createElement('div');
    labelDiv.style.display = 'flex';
    labelDiv.style.justifyContent = 'space-between';
    labelDiv.style.fontSize = '11px';
    labelDiv.style.marginBottom = '2px';

    const nameSpan = document.createElement('span');
    nameSpan.innerText = label;
    labelDiv.appendChild(nameSpan);

    const timeSpan = document.createElement('span');
    const percentage = budgetMs > 0 ? (timeMs / budgetMs) * 100 : 0;
    timeSpan.innerText = `${timeMs.toFixed(2)}ms (${percentage.toFixed(0)}%)`;
    labelDiv.appendChild(timeSpan);

    row.appendChild(labelDiv);

    // Progress bar
    const barContainer = document.createElement('div');
    barContainer.style.width = '100%';
    barContainer.style.height = '8px';
    barContainer.style.background = 'rgba(30, 30, 30, 0.6)';
    barContainer.style.borderRadius = '2px';
    barContainer.style.overflow = 'hidden';

    const barFill = document.createElement('div');
    const fillPercentage = Math.min((timeMs / budgetMs) * 100, 100);
    barFill.style.width = `${fillPercentage}%`;
    barFill.style.height = '100%';
    barFill.style.transition = 'width 0.1s ease-out, background-color 0.2s ease-out';

    // Color coding based on budget usage
    const usage = timeMs / budgetMs;
    if (usage < 0.5) {
      barFill.style.background = '#4ade80'; // Green
    } else if (usage < 0.8) {
      barFill.style.background = '#fbbf24'; // Yellow
    } else {
      barFill.style.background = '#ef4444'; // Red
    }

    barContainer.appendChild(barFill);
    row.appendChild(barContainer);

    return row;
  }

  dispose(): void {
    this.hide();
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
    this.fpsHistory = [];
  }

  private pushFps(value: number): void {
    if (!Number.isFinite(value)) return;
    this.fpsHistory.push(value);
    if (this.fpsHistory.length > this.maxHistory) {
      this.fpsHistory.shift();
    }
  }

  private getAverageFps(): number {
    if (this.fpsHistory.length === 0) {
      return 0;
    }
    const sum = this.fpsHistory.reduce((total, val) => total + val, 0);
    return sum / this.fpsHistory.length;
  }
}
