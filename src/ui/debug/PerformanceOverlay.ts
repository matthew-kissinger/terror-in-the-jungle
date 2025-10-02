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
      `Memory: geom ${stats.geometries} / tex ${stats.textures} / prog ${stats.programs}`,
      `Logs suppressed: ${stats.suppressedLogs}`
    ];

    this.container.innerText = text.join('\n');
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
