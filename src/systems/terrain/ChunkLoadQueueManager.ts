import { ChunkPriorityManager } from './ChunkPriorityManager';
import { ChunkLifecycleManager } from './ChunkLifecycleManager';

/**
 * Manages chunk load queue processing and background loading
 * Handles requestIdleCallback scheduling and queue draining
 */
export class ChunkLoadQueueManager {
  private priorityManager: ChunkPriorityManager;
  private lifecycleManager: ChunkLifecycleManager;
  private loaderHandle: number | null = null;
  private readonly MAX_CHUNKS_PER_FRAME: number;
  private readonly IN_FRAME_BUDGET_MS: number;
  private readonly IDLE_BUDGET_MS: number;
  private readonly LOAD_DELAY_FALLBACK: number;

  constructor(
    priorityManager: ChunkPriorityManager,
    lifecycleManager: ChunkLifecycleManager,
    config: {
      maxChunksPerFrame: number;
      inFrameBudgetMs: number;
      idleBudgetMs: number;
      loadDelayFallback: number;
    }
  ) {
    this.priorityManager = priorityManager;
    this.lifecycleManager = lifecycleManager;
    this.MAX_CHUNKS_PER_FRAME = config.maxChunksPerFrame;
    this.IN_FRAME_BUDGET_MS = config.inFrameBudgetMs;
    this.IDLE_BUDGET_MS = config.idleBudgetMs;
    this.LOAD_DELAY_FALLBACK = config.loadDelayFallback;
  }

  /**
   * Update load queue based on current chunks and loading state
   */
  updateLoadQueue(): void {
    const chunks = this.lifecycleManager.getChunks();
    const loadingChunks = this.lifecycleManager.getLoadingChunks();
    
    // Build sets for priority manager
    const existingChunks = new Set<string>();
    const loadingChunksSet = new Set<string>();
    
    chunks.forEach((_, key) => existingChunks.add(key));
    loadingChunks.forEach(key => loadingChunksSet.add(key));
    
    // Update priority queue
    this.priorityManager.updateLoadQueue(existingChunks, loadingChunksSet);

    if (this.priorityManager.getQueueSize() > 0) {
      this.scheduleBackgroundLoader();
    }
  }

  /**
   * Drain load queue within frame budget
   */
  drainLoadQueue(budgetMs: number, maxChunks: number): void {
    const items = this.priorityManager.drainLoadQueue(budgetMs, maxChunks);
    
    if (items.length > 0) {
      this.lifecycleManager.loadChunksAsync(items);
    }

    if (this.priorityManager.getQueueSize() > 0) {
      this.scheduleBackgroundLoader();
    }
  }

  /**
   * Schedule background loader using requestIdleCallback or setTimeout fallback
   */
  private scheduleBackgroundLoader(): void {
    if (this.loaderHandle !== null || this.priorityManager.getQueueSize() === 0) {
      return;
    }

    const callback = (deadline?: IdleDeadline) => {
      this.loaderHandle = null;

      const budget = deadline ? Math.min(deadline.timeRemaining(), this.IDLE_BUDGET_MS) : this.IDLE_BUDGET_MS;
      this.drainLoadQueue(budget, this.MAX_CHUNKS_PER_FRAME);

      if (this.priorityManager.getQueueSize() > 0) {
        this.scheduleBackgroundLoader();
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      this.loaderHandle = window.requestIdleCallback(callback);
    } else {
      this.loaderHandle = window.setTimeout(() => callback(), this.LOAD_DELAY_FALLBACK);
    }
  }

  /**
   * Cancel background loader
   */
  cancelBackgroundLoader(): void {
    if (this.loaderHandle === null) {
      return;
    }

    if (typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(this.loaderHandle);
    } else {
      clearTimeout(this.loaderHandle);
    }

    this.loaderHandle = null;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.priorityManager.getQueueSize();
  }
}
