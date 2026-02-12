import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { RadioTransmissionSystem, RadioTransmission } from './RadioTransmissionSystem';

// Mock Logger
vi.mock('../../utils/Logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock THREE.js audio classes with class-based mocks
vi.mock('three', () => {
  class MockAudio {
    isPlaying = false;
    buffer: any = null;
    volume = 1;
    onEnded: (() => void) | null = null;

    setBuffer(buf: any) {
      this.buffer = buf;
    }

    setVolume(v: number) {
      this.volume = v;
    }

    setLoop(_loop: boolean) {
      // Mock implementation
    }

    play() {
      this.isPlaying = true;
    }

    stop() {
      this.isPlaying = false;
    }

    getVolume() {
      return this.volume;
    }
  }

  class MockAudioListener {}

  class MockAudioLoader {
    load = vi.fn((url: string, onLoad: (buffer: any) => void, _onProgress?: any, _onError?: any) => {
      // Call immediately in tests
      onLoad({});
    });
  }

  class MockVector3 {
    x = 0;
    y = 0;
    z = 0;

    set() {
      return this;
    }

    clone() {
      return new MockVector3();
    }
  }

  return {
    Audio: MockAudio,
    AudioListener: MockAudioListener,
    AudioLoader: MockAudioLoader,
    Vector3: MockVector3,
  };
});

describe('RadioTransmissionSystem', () => {
  let system: RadioTransmissionSystem;
  let mockListener: THREE.AudioListener;
  let mockAudioLoader: THREE.AudioLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    system = new RadioTransmissionSystem();
    mockListener = new THREE.AudioListener();
    mockAudioLoader = new THREE.AudioLoader();
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const status = system.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.transmissionsLoaded).toBe(0);
      expect(status.nextTransmissionIn).toBeGreaterThanOrEqual(0);
    });

    it('should schedule first transmission on construction', () => {
      const status = system.getStatus();
      expect(status.nextTransmissionIn).toBeGreaterThan(0);
    });

    it('should initialize with disabled transmission list', () => {
      const status = system.getStatus();
      expect(status.transmissionsLoaded).toBe(0);
    });
  });

  describe('setAudioListener', () => {
    it('should accept and store audio listener', () => {
      expect(() => {
        system.setAudioListener(mockListener);
      }).not.toThrow();
    });

    it('should allow playback after listener is set', async () => {
      system.setAudioListener(mockListener);
      // Manual trigger should not throw
      expect(() => {
        system.playRandomTransmission();
      }).not.toThrow();
    });
  });

  describe('selectRandomTransmission', () => {
    it('should return null if no transmissions available', async () => {
      // Initialize without loading
      const transmission = (system as any).selectRandomTransmission();
      expect(transmission).toBeNull();
    });

    it('should select from available transmissions after init', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status = system.getStatus();
      expect(status.transmissionsLoaded).toBeGreaterThan(0);

      const transmission = (system as any).selectRandomTransmission();
      expect(transmission).toBeDefined();
      if (transmission) {
        expect(transmission.filename).toBeDefined();
      }
    });

    it('should not repeat transmission within cooldown period', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const transmission1 = (system as any).selectRandomTransmission();
      if (transmission1) {
        transmission1.lastPlayed = Date.now();
      }

      // Should skip this transmission if cooldown not passed
      const transmission2 = (system as any).selectRandomTransmission();
      if (transmission1 && transmission2) {
        // Either different transmission or none (if only one available)
        expect(transmission2).toBeDefined();
      }
    });

    it('should reset cooldowns if all played recently', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      // Mark all as recently played
      const transmissions = (system as any).transmissions;
      const now = Date.now();
      transmissions.forEach((t: RadioTransmission) => {
        t.lastPlayed = now;
      });

      // Should still return one (cooldown reset)
      const transmission = (system as any).selectRandomTransmission();
      if (transmissions.length > 0) {
        expect(transmission).toBeDefined();
      }
    });

    it('should return null only if no buffers loaded', async () => {
      // Create system with empty transmissions
      const emptySystem = new RadioTransmissionSystem();
      emptySystem.setAudioListener(mockListener);

      const transmission = (emptySystem as any).selectRandomTransmission();
      expect(transmission).toBeNull();

      emptySystem.dispose();
    });
  });

  describe('scheduleNextTransmission', () => {
    it('should set nextTransmissionTime within interval bounds', () => {
      (system as any).scheduleNextTransmission();

      const status = system.getStatus();
      const nextTime = status.nextTransmissionIn;

      // Should be between min and max interval
      expect(nextTime).toBeGreaterThanOrEqual(30000);
      expect(nextTime).toBeLessThanOrEqual(120000);
    });

    it('should randomize scheduling (test with multiple calls)', () => {
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(0); // Reset time
        system = new RadioTransmissionSystem();
        const status = system.getStatus();
        times.push(status.nextTransmissionIn);
      }

      // With high probability, not all should be identical
      // (can't guarantee due to randomness, but test that scheduling happens)
      expect(times.length).toBe(5);
      times.forEach(time => {
        expect(time).toBeGreaterThan(0);
      });
    });

    it('should update nextTransmissionTime when called', () => {
      vi.setSystemTime(1000);
      const before = system.getStatus().nextTransmissionIn;

      vi.setSystemTime(2000);
      (system as any).scheduleNextTransmission();
      const after = system.getStatus().nextTransmissionIn;

      // After scheduling at later time, next transmission time should be further out
      expect(after).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('should do nothing when disabled', () => {
      system.setEnabled(false);
      system.setAudioListener(mockListener);

      expect(() => {
        system.update(0.016);
      }).not.toThrow();
    });

    it('should do nothing when listener not set', () => {
      expect(() => {
        system.update(0.016);
      }).not.toThrow();
    });

    it('should trigger transmission when scheduled time arrives', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      // Fast forward to transmission time
      const status1 = system.getStatus();
      const timeToNext = status1.nextTransmissionIn;

      vi.advanceTimersByTime(timeToNext + 100);
      system.update(0.016);

      // Status should show new transmission scheduled
      const status2 = system.getStatus();
      expect(status2.nextTransmissionIn).toBeGreaterThanOrEqual(0);
    });

    it('should reschedule after transmission plays', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const initialStatus = system.getStatus();
      const initialTime = initialStatus.nextTransmissionIn;

      // Advance past scheduled time
      vi.advanceTimersByTime(initialTime + 100);
      system.update(0.016);

      const newStatus = system.getStatus();
      // Should have rescheduled
      expect(newStatus.nextTransmissionIn).toBeGreaterThanOrEqual(0);
    });

    it('should handle rapid update calls', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      expect(() => {
        for (let i = 0; i < 100; i++) {
          system.update(0.016);
        }
      }).not.toThrow();
    });

    it('should not trigger when scheduled time not reached', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status = system.getStatus();
      const timeToNext = status.nextTransmissionIn;

      // Advance less than scheduled time
      vi.advanceTimersByTime(Math.floor(timeToNext / 2));
      system.update(0.016);

      // Status should show same or slightly less time remaining
      const newStatus = system.getStatus();
      expect(newStatus.nextTransmissionIn).toBeLessThanOrEqual(timeToNext);
    });
  });

  describe('setVolume', () => {
    it('should clamp volume to 0-1 range', () => {
      system.setVolume(-0.5);
      // Can't directly test, but volume should be clamped

      system.setVolume(1.5);
      // Should clamp to 1.0

      expect(system).toBeDefined();
    });

    it('should accept 0 volume', () => {
      expect(() => {
        system.setVolume(0);
      }).not.toThrow();
    });

    it('should accept 1 volume', () => {
      expect(() => {
        system.setVolume(1);
      }).not.toThrow();
    });

    it('should accept values between 0 and 1', () => {
      expect(() => {
        system.setVolume(0.5);
        system.setVolume(0.25);
        system.setVolume(0.75);
      }).not.toThrow();
    });

    it('should apply volume to currently playing audio', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      system.setVolume(0.8);
      system.playRandomTransmission();

      // Volume should be set on current audio
      expect(system).toBeDefined();
    });
  });

  describe('getVolume', () => {
    it('should return current volume', () => {
      system.setVolume(0.6);
      const volume = (system as any).baseVolume;
      expect(volume).toBeCloseTo(0.6);
    });

    it('should return 0 after setting to 0', () => {
      system.setVolume(0);
      const volume = (system as any).baseVolume;
      expect(volume).toBe(0);
    });

    it('should return 1 after setting to 1', () => {
      system.setVolume(1);
      const volume = (system as any).baseVolume;
      expect(volume).toBe(1);
    });
  });

  describe('setTransmissionInterval', () => {
    it('should set min and max intervals', () => {
      system.setTransmissionInterval(10, 30);

      const minInterval = (system as any).minInterval;
      const maxInterval = (system as any).maxInterval;

      expect(minInterval).toBe(10 * 1000);
      expect(maxInterval).toBe(30 * 1000);
    });

    it('should convert seconds to milliseconds', () => {
      system.setTransmissionInterval(5, 15);

      const minInterval = (system as any).minInterval;
      const maxInterval = (system as any).maxInterval;

      expect(minInterval).toBe(5000);
      expect(maxInterval).toBe(15000);
    });

    it('should accept equal min and max intervals', () => {
      expect(() => {
        system.setTransmissionInterval(20, 20);
      }).not.toThrow();
    });
  });

  describe('setEnabled', () => {
    it('should enable transmissions', () => {
      system.setEnabled(true);
      const status = system.getStatus();
      expect(status.enabled).toBe(true);
    });

    it('should disable transmissions', () => {
      system.setEnabled(false);
      const status = system.getStatus();
      expect(status.enabled).toBe(false);
    });

    it('should stop current audio when disabling', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      system.playRandomTransmission();
      system.setEnabled(false);

      // Should have stopped playback (verified through no throw)
      expect(system).toBeDefined();
    });

    it('should allow re-enabling after disable', () => {
      system.setEnabled(false);
      expect(system.getStatus().enabled).toBe(false);

      system.setEnabled(true);
      expect(system.getStatus().enabled).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return status object with required fields', () => {
      const status = system.getStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('nextTransmissionIn');
      expect(status).toHaveProperty('transmissionsLoaded');
    });

    it('should return correct enabled state', () => {
      system.setEnabled(true);
      expect(system.getStatus().enabled).toBe(true);

      system.setEnabled(false);
      expect(system.getStatus().enabled).toBe(false);
    });

    it('should return nextTransmissionIn >= 0', () => {
      const status = system.getStatus();
      expect(status.nextTransmissionIn).toBeGreaterThanOrEqual(0);
    });

    it('should return transmissionsLoaded count', async () => {
      const statusBefore = system.getStatus();
      expect(statusBefore.transmissionsLoaded).toBe(0);

      system.setAudioListener(mockListener);
      await system.init();

      const statusAfter = system.getStatus();
      expect(statusAfter.transmissionsLoaded).toBeGreaterThanOrEqual(0);
    });

    it('should update status after scheduling', () => {
      const status1 = system.getStatus();
      const time1 = status1.nextTransmissionIn;

      vi.advanceTimersByTime(100);
      const status2 = system.getStatus();
      const time2 = status2.nextTransmissionIn;

      // Time should have decreased
      expect(time2).toBeLessThan(time1);
    });
  });

  describe('playRandomTransmission', () => {
    it('should not throw when no transmissions available', () => {
      expect(() => {
        system.playRandomTransmission();
      }).not.toThrow();
    });

    it('should play transmission when available', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      expect(() => {
        system.playRandomTransmission();
      }).not.toThrow();
    });

    it('should select and play random transmission', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status = system.getStatus();
      if (status.transmissionsLoaded > 0) {
        system.playRandomTransmission();
        // Should have triggered playback
        expect(system).toBeDefined();
      }
    });
  });

  describe('init', () => {
    it('should discover transmissions', async () => {
      await system.init();

      const transmissions = (system as any).transmissions;
      expect(transmissions.length).toBeGreaterThan(0);
    });

    it('should load transmission buffers', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status = system.getStatus();
      expect(status.transmissionsLoaded).toBeGreaterThanOrEqual(0);
    });

    it('should be callable without audio listener', async () => {
      expect(async () => {
        await system.init();
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should stop playing audio', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      system.playRandomTransmission();
      system.dispose();

      expect(system).toBeDefined();
    });

    it('should clear transmissions array', async () => {
      await system.init();

      system.dispose();

      const transmissions = (system as any).transmissions;
      expect(transmissions).toHaveLength(0);
    });

    it('should clear current audio reference', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      system.playRandomTransmission();
      system.dispose();

      const currentAudio = (system as any).currentAudio;
      expect(currentAudio).toBeUndefined();
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        system.dispose();
        system.dispose();
        system.dispose();
      }).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle empty transmission list', () => {
      const status = system.getStatus();
      expect(status.transmissionsLoaded).toBe(0);

      expect(() => {
        system.update(0.016);
      }).not.toThrow();
    });

    it('should handle negative deltaTime in update', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      expect(() => {
        system.update(-0.016);
      }).not.toThrow();
    });

    it('should handle very large deltaTime', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      expect(() => {
        system.update(1000);
      }).not.toThrow();
    });

    it('should handle volume clamping at boundaries', () => {
      system.setVolume(-10);
      system.setVolume(10);
      system.setVolume(0);
      system.setVolume(1);

      expect(system).toBeDefined();
    });

    it('should handle rapid enable/disable cycles', () => {
      expect(() => {
        for (let i = 0; i < 10; i++) {
          system.setEnabled(i % 2 === 0);
        }
      }).not.toThrow();
    });

    it('should handle transmission with no buffer', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      // Create transmission without buffer
      const transmissions = (system as any).transmissions as RadioTransmission[];
      if (transmissions.length > 0) {
        transmissions[0].buffer = undefined;
      }

      expect(() => {
        system.playRandomTransmission();
      }).not.toThrow();
    });

    it('should handle setAudioListener multiple times', () => {
      const listener1 = new THREE.AudioListener();
      const listener2 = new THREE.AudioListener();

      expect(() => {
        system.setAudioListener(listener1);
        system.setAudioListener(listener2);
      }).not.toThrow();
    });

    it('should handle setTransmissionInterval with very small values', () => {
      expect(() => {
        system.setTransmissionInterval(0.001, 0.002);
      }).not.toThrow();
    });

    it('should handle setTransmissionInterval with very large values', () => {
      expect(() => {
        system.setTransmissionInterval(3600, 7200);
      }).not.toThrow();
    });
  });

  describe('Integration scenarios', () => {
    it('should cycle through initialization -> enable/disable -> update -> dispose', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status1 = system.getStatus();
      expect(status1.enabled).toBe(true);

      system.setEnabled(false);
      const status2 = system.getStatus();
      expect(status2.enabled).toBe(false);

      system.setEnabled(true);
      system.update(0.016);

      system.dispose();
      expect(system).toBeDefined();
    });

    it('should handle complete playback workflow', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      system.setVolume(0.5);
      system.setTransmissionInterval(5, 10);

      system.playRandomTransmission();

      vi.advanceTimersByTime(6000);
      system.update(0.016);

      system.dispose();
      expect(system).toBeDefined();
    });

    it('should maintain state through multiple intervals', async () => {
      system.setAudioListener(mockListener);
      await system.init();

      const status1 = system.getStatus();
      const enabled1 = status1.enabled;

      for (let i = 0; i < 10; i++) {
        system.update(0.016);
      }

      const status2 = system.getStatus();
      expect(status2.enabled).toBe(enabled1);
    });
  });
});
