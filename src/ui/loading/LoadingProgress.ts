import { LOADING_TIPS } from '../../config/loading';

interface LoadingPhase {
  name: string;
  weight: number;
  progress: number;
  status: 'pending' | 'loading' | 'complete';
}

interface LoadingTip {
  text: string;
  category: 'controls' | 'gameplay' | 'lore' | 'tips';
}

export class LoadingProgress {
  private phases: Map<string, LoadingPhase> = new Map();
  private currentPhase: string = '';
  private totalProgress: number = 0;
  private startTime: number = Date.now();

  private tips: LoadingTip[] = [...LOADING_TIPS];
  private currentTipIndex: number = 0;
  private lastTipTime: number = Date.now();
  private tipRotationInterval: number = 3000;

  // UI elements
  private progressFill: HTMLDivElement;
  private percentText: HTMLSpanElement;
  private phaseText: HTMLDivElement;
  private tipText: HTMLDivElement;
  private loadTimeText: HTMLSpanElement | null;

  constructor(
    progressFill: HTMLDivElement,
    percentText: HTMLSpanElement,
    phaseText: HTMLDivElement,
    tipText: HTMLDivElement,
    loadTimeText: HTMLSpanElement | null = null
  ) {
    this.progressFill = progressFill;
    this.percentText = percentText;
    this.phaseText = phaseText;
    this.tipText = tipText;
    this.loadTimeText = loadTimeText;
  }

  addPhase(id: string, weight: number, name: string): void {
    this.phases.set(id, {
      name,
      weight,
      progress: 0,
      status: 'pending'
    });
  }

  updateProgress(phaseId: string, progress: number): void {
    const phase = this.phases.get(phaseId);
    if (!phase) return;

    // Update phase
    phase.progress = Math.min(1, Math.max(0, progress));
    phase.status = progress >= 1 ? 'complete' : 'loading';

    // Update current phase text
    if (phase.status === 'loading') {
      this.currentPhase = phaseId;
      this.phaseText.textContent = phase.name + '...';
    }

    // Calculate total progress
    let total = 0;
    this.phases.forEach(p => {
      total += p.progress * p.weight;
    });
    this.totalProgress = Math.min(1, total);

    // Update UI
    const percent = Math.floor(this.totalProgress * 100);
    this.progressFill.style.width = `${percent}%`;
    this.percentText.textContent = `${percent}%`;

    // Rotate tips
    if (Date.now() - this.lastTipTime > this.tipRotationInterval) {
      this.showNextTip();
    }

    // Update load time
    this.updateLoadTime();
  }

  private showNextTip(): void {
    this.currentTipIndex = (this.currentTipIndex + 1) % this.tips.length;
    const tip = this.tips[this.currentTipIndex];

    this.tipText.style.animation = 'none';
    setTimeout(() => {
      this.tipText.textContent = tip.text;
      this.tipText.style.animation = 'fadeIn 0.5s ease-in';
    }, 50);

    this.lastTipTime = Date.now();
  }

  private updateLoadTime(): void {
    const loadTime = ((Date.now() - this.startTime) / 1000).toFixed(1);
    if (this.loadTimeText) {
      this.loadTimeText.textContent = `Load time: ${loadTime}s`;
    }
  }

  setPhaseComplete(phaseId: string): void {
    this.updateProgress(phaseId, 1);
  }

  showComplete(): void {
    this.phaseText.textContent = 'Ready to play!';
    this.progressFill.style.width = '100%';
    this.percentText.textContent = '100%';
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }

  getTotalProgress(): number {
    return this.totalProgress;
  }

  initializeTips(): void {
    this.showNextTip();
  }
}