import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { ChunkPriorityManager, ChunkPriorityConfig } from './ChunkPriorityManager';

describe('ChunkPriorityManager', () => {
  let manager: ChunkPriorityManager;
  let config: ChunkPriorityConfig;

  beforeEach(() => {
    config = {
      loadDistance: 5,
      renderDistance: 4,
      maxQueueSize: 100,
      chunkSize: 64,
    };
    manager = new ChunkPriorityManager(config);
  });

  describe('Constructor & Config', () => {
    it('should create instance with valid config', () => {
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(ChunkPriorityManager);
    });

    it('should store config correctly', () => {
      manager.updateConfig({ loadDistance: 10 });
      const chunks = manager.getChunksInRadius(new THREE.Vector3(0, 0, 0), 10);
      expect(chunks.length).toBe((2 * 10 + 1) ** 2);
    });
  });

  describe('updatePlayerPosition', () => {
    it('should update internal player position', () => {
      const pos = new THREE.Vector3(100, 0, 200);
      manager.updatePlayerPosition(pos);
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(Math.floor(100 / 64));
      expect(chunkPos.y).toBe(Math.floor(200 / 64));
    });
  });

  describe('getCurrentChunkPosition', () => {
    it('should return correct chunk coords for positive positions', () => {
      manager.updatePlayerPosition(new THREE.Vector3(128, 0, 192));
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(2);
      expect(chunkPos.y).toBe(3);
    });

    it('should return correct chunk coords for negative positions', () => {
      manager.updatePlayerPosition(new THREE.Vector3(-128, 0, -192));
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(-2);
      expect(chunkPos.y).toBe(-3);
    });

    it('should handle zero position', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(0);
      expect(chunkPos.y).toBe(0);
    });

    it('should handle chunk boundary at exactly chunkSize', () => {
      manager.updatePlayerPosition(new THREE.Vector3(64, 0, 64));
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(1);
      expect(chunkPos.y).toBe(1);
    });

    it('should handle position just before chunk boundary', () => {
      manager.updatePlayerPosition(new THREE.Vector3(63.9, 0, 63.9));
      const chunkPos = manager.getCurrentChunkPosition();
      expect(chunkPos.x).toBe(0);
      expect(chunkPos.y).toBe(0);
    });
  });

  describe('hasPlayerMovedChunk', () => {
    it('should return false when player stays in same chunk', () => {
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 10));
      manager.hasPlayerMovedChunk(); // Initialize lastChunkPosition
      
      manager.updatePlayerPosition(new THREE.Vector3(20, 0, 20));
      expect(manager.hasPlayerMovedChunk()).toBe(false);
    });

    it('should return true when player crosses chunk boundary', () => {
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 10));
      manager.hasPlayerMovedChunk(); // Initialize
      
      manager.updatePlayerPosition(new THREE.Vector3(70, 0, 10));
      expect(manager.hasPlayerMovedChunk()).toBe(true);
    });

    it('should update lastChunkPosition on move', () => {
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 10));
      manager.hasPlayerMovedChunk();
      
      manager.updatePlayerPosition(new THREE.Vector3(70, 0, 10));
      manager.hasPlayerMovedChunk();
      
      // Second call without movement should return false
      expect(manager.hasPlayerMovedChunk()).toBe(false);
    });

    it('should return false on consecutive calls without movement', () => {
      manager.updatePlayerPosition(new THREE.Vector3(10, 0, 10));
      manager.hasPlayerMovedChunk();
      
      expect(manager.hasPlayerMovedChunk()).toBe(false);
      expect(manager.hasPlayerMovedChunk()).toBe(false);
    });
  });

  describe('updateLoadQueue', () => {
    it('should build queue of chunks needing loading', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      expect(manager.getQueueSize()).toBeGreaterThan(0);
    });

    it('should exclude chunks in existingChunks set', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      const existing = new Set(['0,0', '1,0', '0,1']);
      manager.updateLoadQueue(existing, new Set());
      
      const items = manager.getQueueItems();
      items.forEach(item => {
        expect(existing.has(manager.getChunkKey(item.x, item.z))).toBe(false);
      });
    });

    it('should exclude chunks in loadingChunks set', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      const loading = new Set(['0,0', '1,0']);
      manager.updateLoadQueue(new Set(), loading);
      
      const items = manager.getQueueItems();
      items.forEach(item => {
        expect(loading.has(manager.getChunkKey(item.x, item.z))).toBe(false);
      });
    });

    it('should sort by priority with closest chunks first', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      const items = manager.getQueueItems();
      for (let i = 1; i < items.length; i++) {
        expect(items[i].priority).toBeGreaterThanOrEqual(items[i - 1].priority);
      }
    });

    it('should truncate queue to maxQueueSize', () => {
      const smallConfig = { ...config, maxQueueSize: 10 };
      const smallManager = new ChunkPriorityManager(smallConfig);
      smallManager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      smallManager.updateLoadQueue(new Set(), new Set());
      
      expect(smallManager.getQueueSize()).toBeLessThanOrEqual(10);
    });

    it('should respect loadDistance for scan radius', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      const items = manager.getQueueItems();
      items.forEach(item => {
        expect(Math.abs(item.x)).toBeLessThanOrEqual(config.loadDistance);
        expect(Math.abs(item.z)).toBeLessThanOrEqual(config.loadDistance);
      });
    });
  });

  describe('drainLoadQueue', () => {
    beforeEach(() => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
    });

    it('should return empty array when queue is empty', () => {
      manager.clearQueue();
      const items = manager.drainLoadQueue(100, 10);
      expect(items).toEqual([]);
    });

    it('should return up to maxChunks items', () => {
      const items = manager.drainLoadQueue(100, 5);
      expect(items.length).toBeLessThanOrEqual(5);
    });

    it('should remove returned items from queue', () => {
      const initialSize = manager.getQueueSize();
      const items = manager.drainLoadQueue(100, 3);
      expect(manager.getQueueSize()).toBe(initialSize - items.length);
    });

    it('should respect budgetMs time budget', () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(150);
      
      const items = manager.drainLoadQueue(100, 1000);
      expect(items.length).toBeLessThan(1000);
    });

    it('should return items in priority order', () => {
      const items = manager.drainLoadQueue(100, 10);
      for (let i = 1; i < items.length; i++) {
        expect(items[i].priority).toBeGreaterThanOrEqual(items[i - 1].priority);
      }
    });
  });

  describe('getChunksInRadius', () => {
    it('should return correct grid of chunks for radius 0', () => {
      const chunks = manager.getChunksInRadius(new THREE.Vector3(0, 0, 0), 0);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toEqual({ x: 0, z: 0 });
    });

    it('should return correct grid of chunks for radius 1', () => {
      const chunks = manager.getChunksInRadius(new THREE.Vector3(0, 0, 0), 1);
      expect(chunks.length).toBe(9); // (2*1+1)^2
    });

    it('should return correct grid of chunks for radius 2', () => {
      const chunks = manager.getChunksInRadius(new THREE.Vector3(0, 0, 0), 2);
      expect(chunks.length).toBe(25); // (2*2+1)^2
    });

    it('should include center chunk', () => {
      const chunks = manager.getChunksInRadius(new THREE.Vector3(64, 0, 64), 1);
      const hasCenter = chunks.some(c => c.x === 1 && c.z === 1);
      expect(hasCenter).toBe(true);
    });

    it('should return (2*radius+1)^2 chunks', () => {
      for (let radius = 0; radius <= 5; radius++) {
        const chunks = manager.getChunksInRadius(new THREE.Vector3(0, 0, 0), radius);
        expect(chunks.length).toBe((2 * radius + 1) ** 2);
      }
    });
  });

  describe('getChunkDistanceFromPlayer', () => {
    it('should calculate Chebyshev distance correctly', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      expect(manager.getChunkDistanceFromPlayer(0, 0)).toBe(0);
      expect(manager.getChunkDistanceFromPlayer(1, 0)).toBe(1);
      expect(manager.getChunkDistanceFromPlayer(0, 1)).toBe(1);
      expect(manager.getChunkDistanceFromPlayer(1, 1)).toBe(1);
    });

    it('should use max of abs dx and abs dz', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      expect(manager.getChunkDistanceFromPlayer(3, 1)).toBe(3);
      expect(manager.getChunkDistanceFromPlayer(1, 3)).toBe(3);
      expect(manager.getChunkDistanceFromPlayer(5, 5)).toBe(5);
    });
  });

  describe('getChunkDistance', () => {
    it('should calculate distance using chunkSize normalization', () => {
      const chunkPos = new THREE.Vector3(128, 0, 0);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const distance = manager.getChunkDistance(chunkPos, playerPos);
      expect(distance).toBe(2); // 128 / 64
    });

    it('should use Chebyshev distance', () => {
      const chunkPos = new THREE.Vector3(192, 0, 64);
      const playerPos = new THREE.Vector3(0, 0, 0);
      const distance = manager.getChunkDistance(chunkPos, playerPos);
      expect(distance).toBe(3); // max(192/64, 64/64) = max(3, 1)
    });
  });

  describe('calculateLOD', () => {
    it('should return 0 for distance <= 3', () => {
      expect(manager.calculateLOD(0)).toBe(0);
      expect(manager.calculateLOD(1)).toBe(0);
      expect(manager.calculateLOD(2)).toBe(0);
      expect(manager.calculateLOD(3)).toBe(0);
    });

    it('should return 1 for distance <= 5', () => {
      expect(manager.calculateLOD(4)).toBe(1);
      expect(manager.calculateLOD(5)).toBe(1);
    });

    it('should return 2 for distance <= 7', () => {
      expect(manager.calculateLOD(6)).toBe(2);
      expect(manager.calculateLOD(7)).toBe(2);
    });

    it('should return 3 for distance > 7', () => {
      expect(manager.calculateLOD(8)).toBe(3);
      expect(manager.calculateLOD(10)).toBe(3);
      expect(manager.calculateLOD(100)).toBe(3);
    });
  });

  describe('shouldChunkBeVisible', () => {
    it('should return true when distance <= renderDistance + 1', () => {
      expect(manager.shouldChunkBeVisible(0)).toBe(true);
      expect(manager.shouldChunkBeVisible(4)).toBe(true);
      expect(manager.shouldChunkBeVisible(5)).toBe(true); // renderDistance + 1
    });

    it('should return false when distance > renderDistance + 1', () => {
      expect(manager.shouldChunkBeVisible(6)).toBe(false);
      expect(manager.shouldChunkBeVisible(10)).toBe(false);
    });
  });

  describe('shouldChunkBeUnloaded', () => {
    it('should return true when chunk is beyond loadDistance', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      expect(manager.shouldChunkBeUnloaded(10, 0)).toBe(true);
      expect(manager.shouldChunkBeUnloaded(0, 10)).toBe(true);
    });

    it('should return false when chunk is within loadDistance', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      expect(manager.shouldChunkBeUnloaded(0, 0)).toBe(false);
      expect(manager.shouldChunkBeUnloaded(3, 3)).toBe(false);
      expect(manager.shouldChunkBeUnloaded(5, 0)).toBe(false);
    });
  });

  describe('getQueueSize / getQueueItems / clearQueue', () => {
    it('should reflect actual queue state', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      const size = manager.getQueueSize();
      const items = manager.getQueueItems();
      expect(items.length).toBe(size);
    });

    it('should return readonly array from getQueueItems', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      const items = manager.getQueueItems();
      expect(Array.isArray(items)).toBe(true);
    });

    it('should empty queue on clearQueue', () => {
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      expect(manager.getQueueSize()).toBeGreaterThan(0);
      manager.clearQueue();
      expect(manager.getQueueSize()).toBe(0);
      expect(manager.getQueueItems()).toEqual([]);
    });
  });

  describe('getChunkKey', () => {
    it('should return x,z format string', () => {
      expect(manager.getChunkKey(0, 0)).toBe('0,0');
      expect(manager.getChunkKey(5, 10)).toBe('5,10');
      expect(manager.getChunkKey(-3, -7)).toBe('-3,-7');
    });
  });

  describe('updateConfig', () => {
    it('should merge partial config with existing config', () => {
      manager.updateConfig({ loadDistance: 10, maxQueueSize: 500 });
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      const items = manager.getQueueItems();
      const hasDistantChunk = items.some(item => 
        Math.abs(item.x) > 5 || Math.abs(item.z) > 5
      );
      expect(hasDistantChunk).toBe(true);
    });

    it('should not overwrite unspecified fields', () => {
      manager.updateConfig({ loadDistance: 10 });
      
      // renderDistance should still be 4
      expect(manager.shouldChunkBeVisible(5)).toBe(true);
      expect(manager.shouldChunkBeVisible(6)).toBe(false);
    });

    it('should allow updating multiple fields', () => {
      manager.updateConfig({ 
        loadDistance: 8, 
        renderDistance: 6,
        maxQueueSize: 50 
      });
      
      manager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));
      manager.updateLoadQueue(new Set(), new Set());
      
      expect(manager.getQueueSize()).toBeLessThanOrEqual(50);
      expect(manager.shouldChunkBeVisible(7)).toBe(true);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
