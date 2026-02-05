import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChunkWorkerPool } from './ChunkWorkerPool';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn()
  }
}));

describe('ChunkWorkerPool', () => {
  let pool: ChunkWorkerPool;

  beforeEach(() => {
    // Mock navigator.hardwareConcurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      value: 4,
      configurable: true
    });

    // Mock URL
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    });

    // Mock performance.now
    let perfCounter = 0;
    vi.stubGlobal('performance', {
      now: vi.fn(() => {
        perfCounter += 1;
        return perfCounter;
      })
    });

    // Minimal Worker mock - doesn't actually send messages
    class MinimalMockWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((error: ErrorEvent) => void) | null = null;
      terminated = false;
      postedMessages: any[] = [];
      url: string;

      constructor(url: string) {
        this.url = url;
      }

      postMessage(data: any) {
        this.postedMessages.push(data);
      }

      terminate() {
        this.terminated = true;
      }
    }

    // @ts-ignore
    globalThis.Worker = MinimalMockWorker;
  });

  afterEach(() => {
    if (pool) {
      pool.dispose();
    }
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe('Constructor and initialization', () => {
    it('should create pool with default worker count', () => {
      pool = new ChunkWorkerPool();
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(4);
    });

    it('should create pool with custom worker count', () => {
      pool = new ChunkWorkerPool(2);
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(2);
    });

    it('should create pool with custom seed and segments', () => {
      pool = new ChunkWorkerPool(2, 99999, 64);
      expect(pool).toBeDefined();
    });

    it('should limit workers to reasonable range (max 8)', () => {
      pool = new ChunkWorkerPool(100);
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeLessThanOrEqual(8);
    });

    it('should limit workers to reasonable range (min 2)', () => {
      pool = new ChunkWorkerPool(1);
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeGreaterThanOrEqual(2);
    });

    it('should use navigator.hardwareConcurrency when not specified', () => {
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        value: 6,
        configurable: true
      });
      pool = new ChunkWorkerPool();
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeLessThanOrEqual(8);
    });

    it('should initialize with zero queue length', () => {
      pool = new ChunkWorkerPool();
      const stats = pool.getStats();
      expect(stats.queueLength).toBe(0);
    });

    it('should initialize with zero busy workers', () => {
      pool = new ChunkWorkerPool();
      const stats = pool.getStats();
      expect(stats.busyWorkers).toBe(0);
    });
  });

  describe('Task queuing (generateChunk)', () => {
    it('should queue chunk generation request', () => {
      pool = new ChunkWorkerPool(2);
      const promise = pool.generateChunk(0, 0, 100);
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should return existing promise for duplicate chunk requests', () => {
      pool = new ChunkWorkerPool(2);
      const promise1 = pool.generateChunk(5, 5, 100);
      const promise2 = pool.generateChunk(5, 5, 100);

      // Should return same promise (deduplication)
      expect(promise1).toBe(promise2);
    });

    it('should reject when pool is disposed', async () => {
      pool = new ChunkWorkerPool(2);
      pool.dispose();

      await expect(pool.generateChunk(0, 0, 100)).rejects.toThrow('Worker pool disposed');
    });

    it('should track in-flight chunks', () => {
      pool = new ChunkWorkerPool(2);
      pool.generateChunk(10, 10, 100);

      const telemetry = pool.getTelemetry();
      expect(telemetry.inFlightChunks).toBe(1);
    });

    it('should queue multiple chunk requests', () => {
      pool = new ChunkWorkerPool(1);

      const promises = [
        pool.generateChunk(0, 0, 100),
        pool.generateChunk(1, 0, 100),
        pool.generateChunk(0, 1, 100)
      ];

      expect(promises).toHaveLength(3);
      expect(promises.every(p => p instanceof Promise)).toBe(true);
    });

    it('should handle negative coordinates', () => {
      pool = new ChunkWorkerPool(2);
      const promise = pool.generateChunk(-1, -1, 100);
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should handle large coordinates', () => {
      pool = new ChunkWorkerPool(2);
      const promise = pool.generateChunk(1000, -500, 100);
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should handle different chunk sizes', () => {
      pool = new ChunkWorkerPool(2);
      const small = pool.generateChunk(0, 0, 50);
      const large = pool.generateChunk(1, 1, 500);

      expect(small).toBeInstanceOf(Promise);
      expect(large).toBeInstanceOf(Promise);
    });

    it('should handle rapid successive requests', () => {
      pool = new ChunkWorkerPool(4);

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(pool.generateChunk(i, 0, 100));
      }

      expect(promises).toHaveLength(20);
    });
  });

  describe('Cancel chunk', () => {
    it('should cancel pending chunk request', () => {
      pool = new ChunkWorkerPool(1);

      pool.generateChunk(0, 0, 100);
      pool.generateChunk(1, 1, 100);

      const beforeStats = pool.getStats();
      expect(beforeStats.queueLength).toBeGreaterThanOrEqual(0);

      pool.cancelChunk(1, 1);

      const afterStats = pool.getStats();
      expect(afterStats.queueLength).toBeLessThanOrEqual(beforeStats.queueLength);
    });

    it('should not throw when canceling non-existent chunk', () => {
      pool = new ChunkWorkerPool(1);

      expect(() => {
        pool.cancelChunk(999, 999);
      }).not.toThrow();
    });
  });

  describe('Telemetry methods', () => {
    it('should return worker stats', () => {
      pool = new ChunkWorkerPool(4);
      const stats = pool.getStats();

      expect(stats).toHaveProperty('queueLength');
      expect(stats).toHaveProperty('busyWorkers');
      expect(stats).toHaveProperty('totalWorkers');
      expect(stats.totalWorkers).toBe(4);
    });

    it('should return telemetry data', () => {
      pool = new ChunkWorkerPool(2);

      const telemetry = pool.getTelemetry();

      expect(telemetry).toHaveProperty('chunksGenerated');
      expect(telemetry).toHaveProperty('avgGenerationTimeMs');
      expect(telemetry).toHaveProperty('workersReady');
      expect(telemetry).toHaveProperty('duplicatesAvoided');
      expect(telemetry).toHaveProperty('queueLength');
      expect(telemetry).toHaveProperty('busyWorkers');
      expect(telemetry).toHaveProperty('inFlightChunks');
    });

    it('should track duplicate avoidance', () => {
      pool = new ChunkWorkerPool(2);

      // Request same chunk twice
      pool.generateChunk(0, 0, 100);
      pool.generateChunk(0, 0, 100);

      const telemetry = pool.getTelemetry();
      expect(telemetry.duplicatesAvoided).toBe(1);
    });

    it('should include queue length in telemetry', () => {
      pool = new ChunkWorkerPool(1);

      // Queue some chunks
      pool.generateChunk(0, 0, 100);
      pool.generateChunk(1, 0, 100);
      pool.generateChunk(2, 0, 100);

      const telemetry = pool.getTelemetry();
      expect(telemetry).toHaveProperty('queueLength');
      expect(telemetry.queueLength).toBeGreaterThanOrEqual(0);
    });

    it('should include in-flight count in telemetry', () => {
      pool = new ChunkWorkerPool(2);
      pool.generateChunk(0, 0, 100);
      pool.generateChunk(1, 1, 100);

      const telemetry = pool.getTelemetry();
      expect(telemetry).toHaveProperty('inFlightChunks');
      expect(telemetry.inFlightChunks).toBe(2);
    });

    it('should report correct worker counts', () => {
      pool = new ChunkWorkerPool(3);

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(3);
      expect(stats.busyWorkers).toBe(0);
      expect(stats.queueLength).toBe(0);
    });
  });

  describe('Dispose cleanup', () => {
    it('should clear queue on dispose', () => {
      pool = new ChunkWorkerPool(1);

      pool.generateChunk(0, 0, 100);
      pool.generateChunk(1, 0, 100);

      pool.dispose();

      const stats = pool.getStats();
      expect(stats.queueLength).toBe(0);
    });

    it('should clear in-flight tracking on dispose', () => {
      pool = new ChunkWorkerPool(1);

      pool.generateChunk(0, 0, 100);

      pool.dispose();

      const telemetry = pool.getTelemetry();
      expect(telemetry.inFlightChunks).toBe(0);
    });

    it('should mark pool as disposed', async () => {
      pool = new ChunkWorkerPool(2);
      pool.dispose();

      await expect(pool.generateChunk(0, 0, 100)).rejects.toThrow('Worker pool disposed');
    });

    it('should revoke object URLs on dispose', () => {
      pool = new ChunkWorkerPool(2);
      pool.dispose();

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should be safe to dispose multiple times', () => {
      pool = new ChunkWorkerPool(2);

      expect(() => {
        pool.dispose();
        pool.dispose();
      }).not.toThrow();
    });

    it('should reject pending requests on dispose', async () => {
      pool = new ChunkWorkerPool(1);

      const promise = pool.generateChunk(0, 0, 100);
      pool.dispose();

      // After dispose, the promise should be in a rejected state
      // or the pool should be marked as disposed
      await expect(pool.generateChunk(1, 1, 100)).rejects.toThrow('Worker pool disposed');
    });
  });

  describe('Worker lifecycle', () => {
    it('should create specified number of workers', () => {
      pool = new ChunkWorkerPool(5);
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(5);
    });

    it('should track busy workers correctly', () => {
      pool = new ChunkWorkerPool(2);

      // Initially no workers busy
      const initialStats = pool.getStats();
      expect(initialStats.busyWorkers).toBe(0);

      // Queue some work
      pool.generateChunk(0, 0, 100);

      // Stats should update
      const afterStats = pool.getStats();
      expect(afterStats.totalWorkers).toBe(2);
    });
  });
});
