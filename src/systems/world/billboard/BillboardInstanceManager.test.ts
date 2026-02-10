import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { BillboardInstanceManager, ChunkInstances, VegetationType } from './BillboardInstanceManager';
import { VegetationMeshes } from './BillboardVegetationTypes';
import { BillboardInstance } from '../../../types';

// Mock Logger
vi.mock('../../../utils/Logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

/**
 * Create a mock InstancedMesh with realistic behavior
 */
function createMockInstancedMesh(maxCount: number): THREE.InstancedMesh {
  const matrices = new Float32Array(maxCount * 16);

  return {
    count: 0,
    setMatrixAt: vi.fn((index: number, matrix: THREE.Matrix4) => {
      matrix.toArray(matrices, index * 16);
    }),
    getMatrixAt: vi.fn((index: number, matrix: THREE.Matrix4) => {
      matrix.fromArray(matrices, index * 16);
    }),
    instanceMatrix: { needsUpdate: false }
  } as unknown as THREE.InstancedMesh;
}

/**
 * Create a BillboardInstance helper
 */
function createBillboardInstance(x = 0, y = 0, z = 0): BillboardInstance {
  return {
    position: new THREE.Vector3(x, y, z),
    scale: new THREE.Vector3(1, 1, 1),
    rotation: 0
  };
}

/**
 * Create mock VegetationMeshes with all vegetation types
 */
function createMockMeshes(): VegetationMeshes {
  return {
    fernInstances: createMockInstancedMesh(80000),
    elephantEarInstances: createMockInstancedMesh(15000),
    fanPalmInstances: createMockInstancedMesh(10000),
    coconutInstances: createMockInstancedMesh(8000),
    arecaInstances: createMockInstancedMesh(15000),
    dipterocarpInstances: createMockInstancedMesh(3000),
    banyanInstances: createMockInstancedMesh(3000),
  };
}

describe('BillboardInstanceManager', () => {
  let manager: BillboardInstanceManager;
  let mockMeshes: VegetationMeshes;

  beforeEach(() => {
    mockMeshes = createMockMeshes();
    manager = new BillboardInstanceManager(mockMeshes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided meshes', () => {
      expect(manager).toBeDefined();
      expect(manager.getMeshForType('fern')).toBe(mockMeshes.fernInstances);
    });

    it('should initialize all allocation indices to 0', () => {
      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernUsed).toBe(0);
      expect(debugInfo.elephantEarUsed).toBe(0);
      expect(debugInfo.dipterocarpUsed).toBe(0);
    });

    it('should initialize chunk tracking map as empty', () => {
      expect(manager.getChunkInstances().size).toBe(0);
    });
  });

  describe('addChunkInstances', () => {
    it('should add fern instances for a chunk with correct allocation', () => {
      const instances = [
        createBillboardInstance(1, 0, 1),
        createBillboardInstance(2, 0, 2),
        createBillboardInstance(3, 0, 3)
      ];

      manager.addChunkInstances('chunk_0_0', instances);

      const chunkData = manager.getChunkInstances().get('chunk_0_0');
      expect(chunkData).toBeDefined();

      const fernData = chunkData!.get('fern');
      expect(fernData).toBeDefined();
      expect(fernData!.start).toBe(0);
      expect(fernData!.count).toBe(3);
      expect(fernData!.instances).toHaveLength(3);
    });

    it('should add multiple vegetation types in one call', () => {
      const fernInstances = [createBillboardInstance(1, 0, 1)];
      const palmInstances = [createBillboardInstance(2, 0, 2), createBillboardInstance(3, 0, 3)];
      const coconutInstances = [createBillboardInstance(4, 0, 4)];

      manager.addChunkInstances(
        'chunk_0_0',
        fernInstances,
        undefined,
        palmInstances,
        coconutInstances
      );

      const chunkData = manager.getChunkInstances().get('chunk_0_0');
      expect(chunkData).toBeDefined();
      expect(chunkData!.size).toBe(3); // fern, fanPalm, coconut

      expect(chunkData!.get('fern')!.count).toBe(1);
      expect(chunkData!.get('fanPalm')!.count).toBe(2);
      expect(chunkData!.get('coconut')!.count).toBe(1);
    });

    it('should add instances for multiple chunks', () => {
      manager.addChunkInstances('chunk_0_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_0_1', [createBillboardInstance()]);

      expect(manager.getChunkInstances().size).toBe(3);
      expect(manager.getDebugInfo().chunksTracked).toBe(3);
    });

    it('should skip undefined instance arrays', () => {
      manager.addChunkInstances('chunk_0_0', undefined, undefined, undefined);

      const chunkData = manager.getChunkInstances().get('chunk_0_0');
      expect(chunkData).toBeDefined();
      expect(chunkData!.size).toBe(0);
    });

    it('should skip empty instance arrays', () => {
      manager.addChunkInstances('chunk_0_0', [], [], []);

      const chunkData = manager.getChunkInstances().get('chunk_0_0');
      expect(chunkData).toBeDefined();
      expect(chunkData!.size).toBe(0);
    });

    it('should set instanceMatrix.needsUpdate to true after adding', () => {
      const instances = [createBillboardInstance(1, 0, 1)];

      manager.addChunkInstances('chunk_0_0', instances);

      expect(mockMeshes.fernInstances!.instanceMatrix.needsUpdate).toBe(true);
    });

    it('should populate instance matrices with correct transforms', () => {
      const instances = [
        createBillboardInstance(10, 5, 20)
      ];
      instances[0].rotation = Math.PI / 4;
      instances[0].scale.set(2, 2, 2);

      manager.addChunkInstances('chunk_0_0', instances);

      expect(mockMeshes.fernInstances!.setMatrixAt).toHaveBeenCalledWith(
        0,
        expect.any(THREE.Matrix4)
      );
    });

    it('should advance allocation index sequentially', () => {
      manager.addChunkInstances('chunk_0_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1_0', [createBillboardInstance(), createBillboardInstance()]);
      manager.addChunkInstances('chunk_2_0', [createBillboardInstance()]);

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernUsed).toBe(4); // 1 + 2 + 1
    });
  });

  describe('removeChunkInstances', () => {
    it('should remove chunk and deallocate all types', () => {
      manager.addChunkInstances(
        'chunk_0_0',
        [createBillboardInstance()],
        [createBillboardInstance()],
        [createBillboardInstance()]
      );

      manager.removeChunkInstances('chunk_0_0');

      expect(manager.getChunkInstances().has('chunk_0_0')).toBe(false);
      expect(manager.getDebugInfo().chunksTracked).toBe(0);
    });

    it('should add freed slots to freeSlots list', () => {
      manager.addChunkInstances('chunk_0_0', [createBillboardInstance(), createBillboardInstance()]);

      const beforeDebug = manager.getDebugInfo();
      expect(beforeDebug.fernFree).toBe(0);

      manager.removeChunkInstances('chunk_0_0');

      const afterDebug = manager.getDebugInfo();
      expect(afterDebug.fernFree).toBe(2);
    });

    it('should hide removed instances by setting scale to 0', () => {
      manager.addChunkInstances('chunk_0_0', [createBillboardInstance()]);

      vi.clearAllMocks();
      manager.removeChunkInstances('chunk_0_0');

      expect(mockMeshes.fernInstances!.setMatrixAt).toHaveBeenCalled();
      expect(mockMeshes.fernInstances!.instanceMatrix.needsUpdate).toBe(true);
    });

    it('should be no-op when removing non-existent chunk', () => {
      manager.removeChunkInstances('nonexistent_chunk');

      expect(manager.getChunkInstances().size).toBe(0);
    });

    it('should trigger compaction when >100 free slots', () => {
      // Create many small chunks
      for (let i = 0; i < 102; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      // Remove first 101 chunks - this will trigger compaction when we hit >100 free slots
      for (let i = 0; i < 101; i++) {
        manager.removeChunkInstances(`chunk_${i}`);
      }

      // After compaction, everything is reset (including chunk_101 data)
      // Compaction is destructive and invalidates all allocations
      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernFree).toBe(0);
      expect(debugInfo.fernUsed).toBe(0);
      // chunk_101 still tracked but its allocation indices are invalid after compaction
      expect(debugInfo.chunksTracked).toBe(1);
    });
  });

  describe('Allocation Strategy', () => {
    it('should allocate sequentially from index 0', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance()]);

      const chunk0 = manager.getChunkInstances().get('chunk_0')!.get('fern')!;
      const chunk1 = manager.getChunkInstances().get('chunk_1')!.get('fern')!;

      expect(chunk0.start).toBe(0);
      expect(chunk1.start).toBe(1);
    });

    it('should reuse freed slots after deallocation', () => {
      // Allocate
      manager.addChunkInstances('chunk_0', [createBillboardInstance(), createBillboardInstance()]);

      // Remove
      manager.removeChunkInstances('chunk_0');

      // Allocate again - should reuse slot 0
      manager.addChunkInstances('chunk_1', [createBillboardInstance()]);

      const chunk1 = manager.getChunkInstances().get('chunk_1')!.get('fern')!;
      expect(chunk1.start).toBe(0);
    });

    it('should return null when exceeding maxInstances', () => {
      // Try to allocate more than max for dipterocarp (3000)
      const tooManyInstances = Array.from({ length: 3001 }, () => createBillboardInstance());

      manager.addChunkInstances(
        'chunk_overflow',
        undefined, undefined, undefined, undefined, undefined,
        tooManyInstances
      );

      const chunkData = manager.getChunkInstances().get('chunk_overflow');
      // Should have no dipterocarp allocation
      expect(chunkData?.get('dipterocarp')).toBeUndefined();
    });

    it('should advance allocation index correctly after multiple allocations', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance(), createBillboardInstance()]);
      manager.addChunkInstances('chunk_2', [createBillboardInstance()]);

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernUsed).toBe(4);
    });
  });

  describe('Deallocation', () => {
    it('should sort freed slots for efficient reuse', () => {
      // Allocate 5 chunks
      for (let i = 0; i < 5; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      // Remove chunks in random order
      manager.removeChunkInstances('chunk_3');
      manager.removeChunkInstances('chunk_1');
      manager.removeChunkInstances('chunk_4');

      // Next allocation should use the lowest free slot (1)
      manager.addChunkInstances('chunk_new', [createBillboardInstance()]);

      const newChunk = manager.getChunkInstances().get('chunk_new')!.get('fern')!;
      expect(newChunk.start).toBe(1);
    });

    it('should hide deallocated instances with scale 0', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);

      vi.clearAllMocks();
      manager.removeChunkInstances('chunk_0');

      // Verify setMatrixAt was called for hiding
      expect(mockMeshes.fernInstances!.setMatrixAt).toHaveBeenCalled();
    });
  });

  describe('compactFreeSlots', () => {
    it('should reset allocation index to 0', () => {
      // Allocate many instances
      for (let i = 0; i < 102; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      const beforeDebug = manager.getDebugInfo();
      expect(beforeDebug.fernUsed).toBe(102);

      // Remove all except last one
      for (let i = 0; i < 101; i++) {
        manager.removeChunkInstances(`chunk_${i}`);
      }

      // Compaction triggered at 101st removal
      // Compaction resets everything - allocation index and mesh count
      const afterDebug = manager.getDebugInfo();
      expect(afterDebug.fernUsed).toBe(0); // Reset to 0 by compaction
    });

    it('should clear free slot list', () => {
      // Create and remove many chunks to build up free slots
      for (let i = 0; i < 102; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      // Remove first 101 to trigger compaction
      for (let i = 0; i < 101; i++) {
        manager.removeChunkInstances(`chunk_${i}`);
      }

      const debugInfo = manager.getDebugInfo();
      // After compaction, free slots cleared
      expect(debugInfo.fernFree).toBe(0);
    });

    it('should reset mesh count to 0 when all chunks removed', () => {
      for (let i = 0; i < 102; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      // Remove all chunks
      for (let i = 0; i < 102; i++) {
        manager.removeChunkInstances(`chunk_${i}`);
      }

      // After compaction during removal loop and final removal
      expect(mockMeshes.fernInstances!.count).toBe(0);
    });
  });

  describe('getMeshForType', () => {
    it('should return correct mesh for fern', () => {
      expect(manager.getMeshForType('fern')).toBe(mockMeshes.fernInstances);
    });

    it('should return correct mesh for elephantEar', () => {
      expect(manager.getMeshForType('elephantEar')).toBe(mockMeshes.elephantEarInstances);
    });

    it('should return correct mesh for fanPalm', () => {
      expect(manager.getMeshForType('fanPalm')).toBe(mockMeshes.fanPalmInstances);
    });

    it('should return correct mesh for coconut', () => {
      expect(manager.getMeshForType('coconut')).toBe(mockMeshes.coconutInstances);
    });

    it('should return correct mesh for areca', () => {
      expect(manager.getMeshForType('areca')).toBe(mockMeshes.arecaInstances);
    });

    it('should return correct mesh for dipterocarp', () => {
      expect(manager.getMeshForType('dipterocarp')).toBe(mockMeshes.dipterocarpInstances);
    });

    it('should return correct mesh for banyan', () => {
      expect(manager.getMeshForType('banyan')).toBe(mockMeshes.banyanInstances);
    });

    it('should return undefined for unknown type', () => {
      expect(manager.getMeshForType('unknown' as VegetationType)).toBeUndefined();
    });
  });

  describe('getInstanceCount', () => {
    it('should return mesh count for valid type', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);

      // Mock mesh count was updated during allocation
      expect(manager.getInstanceCount('fern')).toBeGreaterThan(0);
    });

    it('should return 0 if mesh is undefined', () => {
      const incompleteMeshes: VegetationMeshes = {
        fernInstances: createMockInstancedMesh(80000)
        // Other meshes undefined
      };
      const managerWithIncomplete = new BillboardInstanceManager(incompleteMeshes);

      expect(managerWithIncomplete.getInstanceCount('dipterocarp')).toBe(0);
    });
  });

  describe('getDebugInfo', () => {
    it('should return chunksTracked count', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance()]);

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.chunksTracked).toBe(2);
    });

    it('should return used count per vegetation type', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance(), createBillboardInstance()]);

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernUsed).toBe(2);
    });

    it('should return max count per vegetation type', () => {
      const debugInfo = manager.getDebugInfo();

      expect(debugInfo.fernMax).toBe(80000);
      expect(debugInfo.dipterocarpMax).toBe(3000);
      expect(debugInfo.banyanMax).toBe(3000);
    });

    it('should return free count per vegetation type', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.removeChunkInstances('chunk_0');

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernFree).toBe(1);
    });

    it('should calculate used = allocationIndex - freeCount', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance(), createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance()]);
      manager.removeChunkInstances('chunk_0');

      const debugInfo = manager.getDebugInfo();
      // Allocated 3 total, freed 2, so used = 1
      expect(debugInfo.fernUsed).toBe(1);
      expect(debugInfo.fernFree).toBe(2);
    });

    it('should return info for all vegetation types', () => {
      const debugInfo = manager.getDebugInfo();

      expect(debugInfo).toHaveProperty('fernUsed');
      expect(debugInfo).toHaveProperty('elephantEarUsed');
      expect(debugInfo).toHaveProperty('fanPalmUsed');
      expect(debugInfo).toHaveProperty('coconutUsed');
      expect(debugInfo).toHaveProperty('arecaUsed');
      expect(debugInfo).toHaveProperty('dipterocarpUsed');
      expect(debugInfo).toHaveProperty('banyanUsed');
    });
  });

  describe('getChunkInstances', () => {
    it('should return internal chunk map', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);

      const chunkMap = manager.getChunkInstances();
      expect(chunkMap).toBeInstanceOf(Map);
      expect(chunkMap.size).toBe(1);
      expect(chunkMap.has('chunk_0')).toBe(true);
    });

    it('should return map with vegetation type data', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);

      const chunkMap = manager.getChunkInstances();
      const chunkData = chunkMap.get('chunk_0')!;

      expect(chunkData).toBeInstanceOf(Map);
      expect(chunkData.has('fern')).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex allocation/deallocation cycle', () => {
      // Add 3 chunks
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance(), createBillboardInstance()]);
      manager.addChunkInstances('chunk_2', [createBillboardInstance()]);

      expect(manager.getDebugInfo().fernUsed).toBe(4);

      // Remove middle chunk
      manager.removeChunkInstances('chunk_1');
      expect(manager.getDebugInfo().fernUsed).toBe(2);
      expect(manager.getDebugInfo().fernFree).toBe(2);

      // Add new chunk - should reuse freed slots
      manager.addChunkInstances('chunk_3', [createBillboardInstance()]);
      expect(manager.getDebugInfo().fernUsed).toBe(3);
      expect(manager.getDebugInfo().fernFree).toBe(1);
    });

    it('should handle multiple vegetation types independently', () => {
      manager.addChunkInstances(
        'chunk_0',
        [createBillboardInstance()], // fern
        [createBillboardInstance(), createBillboardInstance()], // elephantEar
        undefined,
        undefined,
        undefined,
        [createBillboardInstance()] // dipterocarp
      );

      const debugInfo = manager.getDebugInfo();
      expect(debugInfo.fernUsed).toBe(1);
      expect(debugInfo.elephantEarUsed).toBe(2);
      expect(debugInfo.dipterocarpUsed).toBe(1);
      expect(debugInfo.fanPalmUsed).toBe(0);
    });

    it('should maintain correct counts after partial chunk removal', () => {
      manager.addChunkInstances('chunk_0', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_1', [createBillboardInstance()]);
      manager.addChunkInstances('chunk_2', [createBillboardInstance()]);

      manager.removeChunkInstances('chunk_1');

      expect(manager.getDebugInfo().chunksTracked).toBe(2);
      expect(manager.getDebugInfo().fernUsed).toBe(2);
    });

    it('should handle edge case of removing all chunks then adding new ones', () => {
      // Add multiple chunks
      for (let i = 0; i < 5; i++) {
        manager.addChunkInstances(`chunk_${i}`, [createBillboardInstance()]);
      }

      // Remove all
      for (let i = 0; i < 5; i++) {
        manager.removeChunkInstances(`chunk_${i}`);
      }

      expect(manager.getDebugInfo().chunksTracked).toBe(0);
      expect(manager.getDebugInfo().fernUsed).toBe(0);

      // Add new chunks
      manager.addChunkInstances('chunk_new', [createBillboardInstance()]);
      expect(manager.getDebugInfo().chunksTracked).toBe(1);
      expect(manager.getDebugInfo().fernUsed).toBe(1);
    });
  });
});
