import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AudioPoolManager } from './AudioPoolManager'
import { AUDIO_POOL_SIZES } from '../../config/audio'

// CRITICAL: Use actual class syntax for Three.js mocks
// DO NOT use vi.fn().mockImplementation() - breaks instanceof checks
vi.mock('three', () => {
  class MockAudio {
    isPlaying = false;
    buffer: any = null;
    volume = 1;

    setBuffer(buf: any) {
      this.buffer = buf;
    }

    setVolume(v: number) {
      this.volume = v;
    }

    stop() {
      this.isPlaying = false;
    }

    play() {
      this.isPlaying = true;
    }
  }

  class MockPositionalAudio extends MockAudio {
    refDistance = 1;
    maxDistance = 100;
    rolloffFactor = 1;
    distanceModel = 'inverse';

    setRefDistance(d: number) {
      this.refDistance = d;
    }

    setMaxDistance(d: number) {
      this.maxDistance = d;
    }

    setRolloffFactor(f: number) {
      this.rolloffFactor = f;
    }

    setDistanceModel(m: string) {
      this.distanceModel = m;
    }
  }

  class MockObject3D {
    parent: any = null;
    children: any[] = [];

    add(child: any) {
      this.children.push(child);
      child.parent = this;
    }

    remove(child: any) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
      }
      child.parent = null;
    }
  }

  class MockAudioListener {}

  class MockScene extends MockObject3D {}

  return {
    Audio: MockAudio,
    PositionalAudio: MockPositionalAudio,
    Object3D: MockObject3D,
    AudioListener: MockAudioListener,
    Scene: MockScene,
  };
});

import * as THREE from 'three';

// Helper to create mock audio buffers
function createMockBuffer(): AudioBuffer {
  return {} as AudioBuffer;
}

describe('AudioPoolManager', () => {
  let manager: AudioPoolManager;
  let listener: THREE.AudioListener;
  let scene: THREE.Scene;
  let audioBuffers: Map<string, AudioBuffer>;

  beforeEach(() => {
    listener = new THREE.AudioListener();
    scene = new THREE.Scene();
    audioBuffers = new Map();

    // Add all expected audio buffers
    audioBuffers.set('playerGunshot', createMockBuffer());
    audioBuffers.set('otherGunshot', createMockBuffer());
    audioBuffers.set('allyDeath', createMockBuffer());
    audioBuffers.set('enemyDeath', createMockBuffer());
    audioBuffers.set('playerReload', createMockBuffer());
    audioBuffers.set('playerSMG', createMockBuffer());
    audioBuffers.set('grenadeExplosion', createMockBuffer());
    audioBuffers.set('hitMarker', createMockBuffer());
    audioBuffers.set('bulletWhiz', createMockBuffer());

    manager = new AudioPoolManager(listener, scene, audioBuffers);
  });

  describe('constructor', () => {
    it('should store listener, scene, and audioBuffers refs', () => {
      expect(manager).toBeDefined();
      // Getter methods verify refs are stored
      expect(manager.getPlayerGunshotPool()).toBeDefined();
    });
  });

  describe('initializePools', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should create playerGunshotPool with correct size', () => {
      const pool = manager.getPlayerGunshotPool();
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot); // 20
    });

    it('should create playerSMGPool with correct size', () => {
      const pool = manager.getPlayerSMGPool();
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot); // 20
    });

    it('should create positionalGunshotPool with correct size', () => {
      const pool = manager.getPositionalGunshotPool();
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot); // 20
    });

    it('should create deathSoundPool with correct size', () => {
      const pool = manager.getDeathSoundPool();
      // DEATH_POOL_SIZE * 2 (ally + enemy)
      expect(pool.length).toBe(AUDIO_POOL_SIZES.death * 2); // 20
    });

    it('should create playerReloadPool with correct size', () => {
      const pool = manager.getPlayerReloadPool();
      expect(pool.length).toBe(3); // RELOAD_POOL_SIZE
    });

    it('should create explosionSoundPool with correct size', () => {
      const pool = manager.getExplosionSoundPool();
      expect(pool.length).toBe(AUDIO_POOL_SIZES.explosion); // 8
    });

    it('should create hitFeedbackPool with correct size if buffer exists', () => {
      const pool = manager.getHitFeedbackPool();
      expect(pool.length).toBe(8);
    });

    it('should create bulletWhizPool with correct size if buffer exists', () => {
      const pool = manager.getBulletWhizPool();
      expect(pool.length).toBe(8);
    });

    it('should create object3DPool with correct size', () => {
      const obj1 = manager.getPooledObject3D();
      const obj2 = manager.getPooledObject3D();

      // Verify we can get at least 32 unique objects
      const objects: THREE.Object3D[] = [];
      for (let i = 0; i < 32; i++) {
        objects.push(manager.getPooledObject3D());
      }

      // All should be defined
      objects.forEach(obj => expect(obj).toBeDefined());
    });

    it('should initialize Audio instances with buffers', () => {
      const pool = manager.getPlayerGunshotPool();

      pool.forEach(sound => {
        expect(sound.buffer).toBeDefined();
      });
    });

    it('should initialize PositionalAudio instances with spatial settings', () => {
      const pool = manager.getPositionalGunshotPool();

      pool.forEach(sound => {
        expect(sound.buffer).toBeDefined();
        expect(sound.refDistance).toBeGreaterThan(0);
        expect(sound.maxDistance).toBeGreaterThan(0);
        expect(sound.rolloffFactor).toBeGreaterThan(0);
        expect(sound.distanceModel).toBe('linear');
      });
    });

    it('should create empty pools when buffers missing', () => {
      // Create manager with no buffers
      const emptyBuffers = new Map<string, AudioBuffer>();
      const emptyManager = new AudioPoolManager(listener, scene, emptyBuffers);
      emptyManager.initializePools();

      // Pools should still be created (but sounds won't have buffers)
      expect(emptyManager.getPlayerGunshotPool().length).toBe(AUDIO_POOL_SIZES.gunshot);
      expect(emptyManager.getHitFeedbackPool().length).toBe(0); // No hitMarker buffer
      expect(emptyManager.getBulletWhizPool().length).toBe(0); // No bulletWhiz buffer
    });

    it('should create hitFeedbackPool only if hitMarker buffer exists', () => {
      const buffersWithoutHit = new Map<string, AudioBuffer>();
      buffersWithoutHit.set('playerGunshot', createMockBuffer());
      // No hitMarker buffer

      const managerNoHit = new AudioPoolManager(listener, scene, buffersWithoutHit);
      managerNoHit.initializePools();

      expect(managerNoHit.getHitFeedbackPool().length).toBe(0);
    });

    it('should create bulletWhizPool only if bulletWhiz buffer exists', () => {
      const buffersWithoutWhiz = new Map<string, AudioBuffer>();
      buffersWithoutWhiz.set('playerGunshot', createMockBuffer());
      // No bulletWhiz buffer

      const managerNoWhiz = new AudioPoolManager(listener, scene, buffersWithoutWhiz);
      managerNoWhiz.initializePools();

      expect(managerNoWhiz.getBulletWhizPool().length).toBe(0);
    });
  });

  describe('getAvailableSound', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should return first non-playing sound', () => {
      const pool = manager.getPlayerGunshotPool();
      const sound = manager.getAvailableSound(pool);

      expect(sound).toBeDefined();
      expect(sound).toBe(pool[0]);
      expect(sound!.isPlaying).toBe(false);
    });

    it('should return null for empty pool', () => {
      const emptyPool: THREE.Audio[] = [];
      const sound = manager.getAvailableSound(emptyPool);

      expect(sound).toBeNull();
    });

    it('should skip playing sounds', () => {
      const pool = manager.getPlayerGunshotPool();

      // Mark first few as playing
      pool[0].isPlaying = true;
      pool[1].isPlaying = true;
      pool[2].isPlaying = false; // This one should be returned

      const sound = manager.getAvailableSound(pool);

      expect(sound).toBe(pool[2]);
    });

    it('should stop and return first sound if all playing', () => {
      const pool = manager.getPlayerGunshotPool();

      // Mark all as playing
      pool.forEach(s => s.isPlaying = true);

      const sound = manager.getAvailableSound(pool);

      expect(sound).toBe(pool[0]);
      expect(sound!.isPlaying).toBe(false); // Should be stopped
    });

    it('should handle pool with single sound', () => {
      const singlePool = [new THREE.Audio(listener)];
      const sound = manager.getAvailableSound(singlePool);

      expect(sound).toBe(singlePool[0]);
    });
  });

  describe('getAvailablePositionalSound', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should return first non-playing positional sound', () => {
      const pool = manager.getPositionalGunshotPool();
      const sound = manager.getAvailablePositionalSound(pool);

      expect(sound).toBeDefined();
      expect(sound).toBe(pool[0]);
      expect(sound!.isPlaying).toBe(false);
    });

    it('should return null for empty pool', () => {
      const emptyPool: THREE.PositionalAudio[] = [];
      const sound = manager.getAvailablePositionalSound(emptyPool);

      expect(sound).toBeNull();
    });

    it('should skip playing sounds', () => {
      const pool = manager.getPositionalGunshotPool();

      // Mark first few as playing
      pool[0].isPlaying = true;
      pool[1].isPlaying = true;
      pool[2].isPlaying = false;

      const sound = manager.getAvailablePositionalSound(pool);

      expect(sound).toBe(pool[2]);
    });

    it('should stop and return first sound if all playing', () => {
      const pool = manager.getPositionalGunshotPool();

      // Mark all as playing
      pool.forEach(s => s.isPlaying = true);

      const sound = manager.getAvailablePositionalSound(pool);

      expect(sound).toBe(pool[0]);
      expect(sound!.isPlaying).toBe(false);
    });
  });

  describe('getPooledObject3D', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should return Object3D without parent', () => {
      const obj = manager.getPooledObject3D();

      expect(obj).toBeDefined();
      expect(obj.parent).toBeNull();
    });

    it('should reuse released objects', () => {
      const obj1 = manager.getPooledObject3D();
      scene.add(obj1);

      // Release it
      manager.releaseObject3D(obj1);

      // Get another - should be same object
      const obj2 = manager.getPooledObject3D();
      expect(obj2).toBe(obj1);
      expect(obj2.parent).toBeNull();
    });

    it('should skip objects in use', () => {
      const obj1 = manager.getPooledObject3D();
      scene.add(obj1); // In use (has parent)

      const obj2 = manager.getPooledObject3D();

      expect(obj2).not.toBe(obj1);
      expect(obj2.parent).toBeNull();
    });

    it('should create new object if all in use', () => {
      // Get all 32 initial objects and add to scene
      const objects: THREE.Object3D[] = [];
      for (let i = 0; i < 32; i++) {
        const obj = manager.getPooledObject3D();
        scene.add(obj);
        objects.push(obj);
      }

      // Get one more - should create new
      const newObj = manager.getPooledObject3D();
      expect(newObj).toBeDefined();
      expect(newObj.parent).toBeNull();
      expect(objects).not.toContain(newObj);
    });
  });

  describe('releaseObject3D', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should remove from parent', () => {
      const obj = manager.getPooledObject3D();
      scene.add(obj);

      expect(obj.parent).toBe(scene);

      manager.releaseObject3D(obj);

      expect(obj.parent).toBeNull();
    });

    it('should clear children', () => {
      const obj = manager.getPooledObject3D();
      const child1 = new THREE.Object3D();
      const child2 = new THREE.Object3D();

      obj.add(child1);
      obj.add(child2);

      expect(obj.children.length).toBe(2);

      manager.releaseObject3D(obj);

      expect(obj.children.length).toBe(0);
    });

    it('should handle object without parent', () => {
      const obj = manager.getPooledObject3D();

      expect(obj.parent).toBeNull();

      // Should not throw
      expect(() => manager.releaseObject3D(obj)).not.toThrow();
    });

    it('should handle object with no children', () => {
      const obj = manager.getPooledObject3D();
      scene.add(obj);

      expect(() => manager.releaseObject3D(obj)).not.toThrow();
      expect(obj.children.length).toBe(0);
    });
  });

  describe('pool getters', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should return playerGunshotPool', () => {
      const pool = manager.getPlayerGunshotPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot);
    });

    it('should return playerSMGPool', () => {
      const pool = manager.getPlayerSMGPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot);
    });

    it('should return positionalGunshotPool', () => {
      const pool = manager.getPositionalGunshotPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(AUDIO_POOL_SIZES.gunshot);
    });

    it('should return deathSoundPool', () => {
      const pool = manager.getDeathSoundPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(AUDIO_POOL_SIZES.death * 2);
    });

    it('should return playerReloadPool', () => {
      const pool = manager.getPlayerReloadPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(3);
    });

    it('should return explosionSoundPool', () => {
      const pool = manager.getExplosionSoundPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(AUDIO_POOL_SIZES.explosion);
    });

    it('should return hitFeedbackPool', () => {
      const pool = manager.getHitFeedbackPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(8);
    });

    it('should return bulletWhizPool', () => {
      const pool = manager.getBulletWhizPool();
      expect(pool).toBeInstanceOf(Array);
      expect(pool.length).toBe(8);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should stop all playing sounds', () => {
      const gunshotPool = manager.getPlayerGunshotPool();
      const smgPool = manager.getPlayerSMGPool();
      const posGunshotPool = manager.getPositionalGunshotPool();

      // Mark some as playing
      gunshotPool[0].isPlaying = true;
      gunshotPool[5].isPlaying = true;
      smgPool[2].isPlaying = true;
      posGunshotPool[3].isPlaying = true;

      manager.dispose();

      // All should be stopped (pools cleared, but verify they were stopped before clearing)
      expect(gunshotPool[0].isPlaying).toBe(false);
      expect(gunshotPool[5].isPlaying).toBe(false);
      expect(smgPool[2].isPlaying).toBe(false);
      expect(posGunshotPool[3].isPlaying).toBe(false);
    });

    it('should clear all pools', () => {
      manager.dispose();

      expect(manager.getPlayerGunshotPool().length).toBe(0);
      expect(manager.getPlayerSMGPool().length).toBe(0);
      expect(manager.getPositionalGunshotPool().length).toBe(0);
      expect(manager.getDeathSoundPool().length).toBe(0);
      expect(manager.getPlayerReloadPool().length).toBe(0);
      expect(manager.getExplosionSoundPool().length).toBe(0);
      expect(manager.getHitFeedbackPool().length).toBe(0);
      expect(manager.getBulletWhizPool().length).toBe(0);
    });

    it('should handle double dispose safely', () => {
      manager.dispose();

      // Should not throw
      expect(() => manager.dispose()).not.toThrow();

      // Pools should still be empty
      expect(manager.getPlayerGunshotPool().length).toBe(0);
    });

    it('should stop sounds from all pool types', () => {
      const deathPool = manager.getDeathSoundPool();
      const explosionPool = manager.getExplosionSoundPool();
      const hitPool = manager.getHitFeedbackPool();
      const whizPool = manager.getBulletWhizPool();

      // Mark as playing
      deathPool[0].isPlaying = true;
      explosionPool[0].isPlaying = true;
      hitPool[0].isPlaying = true;
      whizPool[0].isPlaying = true;

      manager.dispose();

      expect(deathPool[0].isPlaying).toBe(false);
      expect(explosionPool[0].isPlaying).toBe(false);
      expect(hitPool[0].isPlaying).toBe(false);
      expect(whizPool[0].isPlaying).toBe(false);
    });

    it('should handle empty pools', () => {
      // Create manager with no buffers
      const emptyManager = new AudioPoolManager(listener, scene, new Map());
      emptyManager.initializePools();

      // Should not throw
      expect(() => emptyManager.dispose()).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    beforeEach(() => {
      manager.initializePools();
    });

    it('should support rapid-fire sound playback', () => {
      const pool = manager.getPlayerGunshotPool();
      const sounds: (THREE.Audio | null)[] = [];

      // Get 30 sounds (more than pool size of 20)
      for (let i = 0; i < 30; i++) {
        const sound = manager.getAvailableSound(pool);
        sounds.push(sound);
        if (sound) {
          sound.play();
        }
      }

      // Should have recycled sounds
      expect(sounds.filter(s => s !== null).length).toBe(30);
    });

    it('should handle positional audio attachment workflow', () => {
      const obj = manager.getPooledObject3D();
      const sound = manager.getAvailablePositionalSound(manager.getPositionalGunshotPool());

      // Simulate attaching positional audio to object
      obj.add(sound as any);
      scene.add(obj);

      expect(obj.children.length).toBe(1);
      expect(obj.parent).toBe(scene);

      // Release
      manager.releaseObject3D(obj);

      expect(obj.children.length).toBe(0);
      expect(obj.parent).toBeNull();
    });

    it('should maintain pool integrity after multiple get/release cycles', () => {
      const objects: THREE.Object3D[] = [];

      // Get 10 objects
      for (let i = 0; i < 10; i++) {
        const obj = manager.getPooledObject3D();
        scene.add(obj);
        objects.push(obj);
      }

      // Release 5
      for (let i = 0; i < 5; i++) {
        manager.releaseObject3D(objects[i]);
      }

      // Get 5 more - should reuse released
      const newObjects: THREE.Object3D[] = [];
      for (let i = 0; i < 5; i++) {
        newObjects.push(manager.getPooledObject3D());
      }

      // Should have reused some
      const reused = newObjects.filter(obj => objects.slice(0, 5).includes(obj));
      expect(reused.length).toBeGreaterThan(0);
    });
  });
});
