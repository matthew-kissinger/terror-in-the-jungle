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
  gpuTimeMs?: number;
  gpuTimingAvailable?: boolean;
  // Terrain mesh merger stats
  terrainMergerRings?: number;
  terrainMergerChunks?: number;
  terrainMergerSavings?: number;
  terrainMergerPending?: boolean;
}

interface BudgetBarRefs {
  row: HTMLDivElement;
  nameSpan: HTMLSpanElement;
  timeSpan: HTMLSpanElement;
  barFill: HTMLDivElement;
}

export class PerformanceOverlay {
  private container: HTMLDivElement;
  private header: HTMLDivElement;
  private budgetSection: HTMLDivElement;
  private systemBarsContainer: HTMLDivElement;
  private overallBar: BudgetBarRefs;
  private systemBars: BudgetBarRefs[] = [];

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

    // Create header section
    this.header = document.createElement('div');
    this.header.style.marginBottom = '12px';
    this.header.style.paddingBottom = '8px';
    this.header.style.borderBottom = '1px solid rgba(79, 148, 120, 0.3)';
    this.header.style.whiteSpace = 'pre';
    this.container.appendChild(this.header);

    // Create budget section
    this.budgetSection = document.createElement('div');
    this.budgetSection.style.marginTop = '12px';
    this.budgetSection.style.display = 'none';

    const title = document.createElement('div');
    title.innerText = 'FRAME BUDGET (16.67ms target)';
    title.style.marginBottom = '8px';
    title.style.fontWeight = 'bold';
    title.style.color = '#4f9478';
    this.budgetSection.appendChild(title);

    // Overall budget bar
    this.overallBar = this.createBudgetBarElements('TOTAL');
    this.budgetSection.appendChild(this.overallBar.row);

    // Separator
    const separator = document.createElement('div');
    separator.style.height = '1px';
    separator.style.background = 'rgba(79, 148, 120, 0.2)';
    separator.style.margin = '6px 0';
    this.budgetSection.appendChild(separator);

    // Container for individual system bars
    this.systemBarsContainer = document.createElement('div');
    this.budgetSection.appendChild(this.systemBarsContainer);

    this.container.appendChild(this.budgetSection);
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

    const text = [
      'PERFORMANCE',
      `FPS: ${stats.fps.toFixed(0)} (avg ${avgFps.toFixed(0)})`,
      `Frame: ${stats.frameTimeMs.toFixed(2)} ms`,
      stats.gpuTimingAvailable
        ? `GPU: ${stats.gpuTimeMs?.toFixed(2) ?? 0} ms`
        : `GPU: N/A (extension not supported)`,
      `Draw Calls: ${stats.drawCalls}`,
      `Triangles: ${stats.triangles.toLocaleString()}`,
      `Chunks: ${stats.loadedChunks} (queue ${stats.chunkQueueSize})`,
      stats.terrainMergerRings !== undefined
        ? `Terrain Merger: ${stats.terrainMergerChunks} chunks -> ${stats.terrainMergerRings} rings (saves ${stats.terrainMergerSavings} draw calls)${stats.terrainMergerPending ? ' [PENDING]' : ''}`
        : null,
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

    this.header.textContent = text.join('\n');

    // Add frame budget visualization if system timings are provided
    if (stats.systemTimings && stats.systemTimings.length > 0) {
      this.budgetSection.style.display = 'block';
      this.updateFrameBudget(stats.systemTimings);
    } else {
      this.budgetSection.style.display = 'none';
    }
  }

  private updateFrameBudget(timings: SystemTiming[]): void {
    // Calculate total time
    const totalTime = timings.reduce((sum, t) => sum + t.timeMs, 0);
    const targetBudget = 16.67; // 60 FPS

    // Update overall budget bar
    this.updateBudgetBar(this.overallBar, 'TOTAL', totalTime, targetBudget);

    // Update individual system bars
    for (let i = 0; i < timings.length; i++) {
      const timing = timings[i];
      if (!this.systemBars[i]) {
        const barRefs = this.createBudgetBarElements(timing.name);
        this.systemBars[i] = barRefs;
        this.systemBarsContainer.appendChild(barRefs.row);
      }

      this.systemBars[i].row.style.display = 'block';
      this.updateBudgetBar(this.systemBars[i], timing.name, timing.timeMs, timing.budgetMs);
    }

    // Hide unused bars
    for (let i = timings.length; i < this.systemBars.length; i++) {
      this.systemBars[i].row.style.display = 'none';
    }
  }

  private createBudgetBarElements(label: string): BudgetBarRefs {
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
    barFill.style.height = '100%';
    barFill.style.transition = 'width 0.1s ease-out, background-color 0.2s ease-out';

    barContainer.appendChild(barFill);
    row.appendChild(barContainer);

    return {
      row,
      nameSpan,
      timeSpan,
      barFill
    };
  }

  private updateBudgetBar(refs: BudgetBarRefs, label: string, timeMs: number, budgetMs: number): void {
    const percentage = budgetMs > 0 ? (timeMs / budgetMs) * 100 : 0;
    
    refs.nameSpan.textContent = label;
    refs.timeSpan.textContent = `${timeMs.toFixed(2)}ms (${percentage.toFixed(0)}%)`;

    const fillPercentage = Math.min((timeMs / budgetMs) * 100, 100);
    refs.barFill.style.width = `${fillPercentage}%`;

    // Color coding based on budget usage
    const usage = timeMs / budgetMs;
    if (usage < 0.5) {
      refs.barFill.style.background = '#4ade80'; // Green
    } else if (usage < 0.8) {
      refs.barFill.style.background = '#fbbf24'; // Yellow
    } else {
      refs.barFill.style.background = '#ef4444'; // Red
    }
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