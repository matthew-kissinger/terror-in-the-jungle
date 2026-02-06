import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { VoiceCalloutSystem, CalloutType } from './VoiceCalloutSystem';
import { Combatant, CombatantState, Faction } from '../combat/types';

// Mock Web Audio API
const mockOscillator = {
  type: 'sine',
  frequency: { value: 0 },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockGainNode = {
  gain: {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
};

const mockBiquadFilter = {
  type: 'lowpass',
  frequency: { value: 0 },
  Q: { value: 0 },
  connect: vi.fn(),
};

const mockBufferSource = {
  buffer: null,
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
};

const mockPannerNode = {
  panningModel: 'HRTF',
  distanceModel: 'inverse',
  refDistance: 1,
  maxDistance: 10000,
  rolloffFactor: 1,
  coneInnerAngle: 360,
  coneOuterAngle: 0,
  coneOuterGain: 0,
  setPosition: vi.fn(),
  setOrientation: vi.fn(),
  connect: vi.fn(),
};

const mockAudioContext = {
  currentTime: 0,
  sampleRate: 44100,
  destination: {},
  createOscillator: vi.fn(() => ({ ...mockOscillator })),
  createGain: vi.fn(() => ({ ...mockGainNode })),
  createBiquadFilter: vi.fn(() => ({ ...mockBiquadFilter })),
  createBuffer: vi.fn((channels: number, length: number, sampleRate: number) => ({
    getChannelData: vi.fn(() => new Float32Array(length)),
  })),
  createBufferSource: vi.fn(() => ({ ...mockBufferSource })),
  createPanner: vi.fn(() => ({ ...mockPannerNode })),
};

// Mock THREE.AudioListener with getInput method
const mockAudioListener = {
  context: mockAudioContext,
  getInput: vi.fn(() => mockGainNode),
} as unknown as THREE.AudioListener;

describe('VoiceCalloutSystem', () => {
  let scene: THREE.Scene;
  let system: VoiceCalloutSystem;
  let mockCombatant: Combatant;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    scene = new THREE.Scene();
    system = new VoiceCalloutSystem(scene, mockAudioListener);
    await system.init();

    // Create mock combatant
    mockCombatant = {
      id: 'combatant-1',
      faction: Faction.US,
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      rotation: 0,
      visualRotation: 0,
      rotationVelocity: 0,
      scale: new THREE.Vector3(1, 1, 1),
      health: 100,
      maxHealth: 100,
      state: CombatantState.IDLE,
      weaponSpec: {} as any,
      gunCore: {} as any,
      skillProfile: {} as any,
      lastShotTime: 0,
      currentBurst: 0,
      burstCooldown: 0,
      reactionTimer: 0,
      suppressionLevel: 0,
      alertTimer: 0,
      isFullAuto: false,
      panicLevel: 0,
      lastHitTime: 0,
      consecutiveMisses: 0,
      wanderAngle: 0,
      timeToDirectionChange: 0,
      lastUpdateTime: 0,
      updatePriority: 0,
      lodLevel: 'high',
      kills: 0,
      deaths: 0,
    };

    // Set player position near combatant
    system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with scene and listener', () => {
      expect(system).toBeDefined();
    });

    it('should accept THREE.AudioListener', () => {
      const newSystem = new VoiceCalloutSystem(scene, mockAudioListener);
      expect(newSystem).toBeDefined();
    });
  });

  describe('CalloutType enum', () => {
    it('should have all 9 callout types', () => {
      expect(CalloutType.CONTACT).toBe('contact');
      expect(CalloutType.TAKING_FIRE).toBe('taking_fire');
      expect(CalloutType.GRENADE).toBe('grenade');
      expect(CalloutType.MAN_DOWN).toBe('man_down');
      expect(CalloutType.RELOADING).toBe('reloading');
      expect(CalloutType.TARGET_DOWN).toBe('target_down');
      expect(CalloutType.SUPPRESSING).toBe('suppressing');
      expect(CalloutType.MOVING).toBe('moving');
      expect(CalloutType.IN_COVER).toBe('in_cover');
    });
  });

  describe('triggerCallout()', () => {
    it('should trigger callout for living combatant', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      // Should create audio nodes
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockAudioContext.createGain).toHaveBeenCalled();
    });

    it('should not trigger callout for dead combatant', () => {
      mockCombatant.state = CombatantState.DEAD;
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should not trigger callout beyond max distance', () => {
      const position = new THREE.Vector3(100, 0, 100); // Far away
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should trigger callout within max distance', () => {
      const position = new THREE.Vector3(10, 0, 10); // Within 50m
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should trigger all callout types', () => {
      const position = new THREE.Vector3(5, 0, 5);
      const types = [
        CalloutType.CONTACT,
        CalloutType.TAKING_FIRE,
        CalloutType.GRENADE,
        CalloutType.MAN_DOWN,
        CalloutType.RELOADING,
        CalloutType.TARGET_DOWN,
        CalloutType.SUPPRESSING,
        CalloutType.MOVING,
        CalloutType.IN_COVER,
      ];

      types.forEach((type, index) => {
        vi.clearAllMocks();
        mockCombatant.id = `combatant-${index}`;
        
        system.triggerCallout(mockCombatant, type, position);
        
        expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      });
    });
  });

  describe('Cooldown management', () => {
    it('should respect global cooldown (5 seconds)', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // First callout should work
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // Immediate second callout should be blocked
      system.triggerCallout(mockCombatant, CalloutType.TAKING_FIRE, position);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
      
      // After 5 seconds, should work again
      vi.setSystemTime(Date.now() + 5001);
      system.triggerCallout(mockCombatant, CalloutType.TAKING_FIRE, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should respect type-specific cooldown (10 seconds)', () => {
      const position = new THREE.Vector3(5, 0, 5);
      const startTime = Date.now();
      
      // First CONTACT callout
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // After 6 seconds, different type should work
      vi.setSystemTime(startTime + 6000);
      system.triggerCallout(mockCombatant, CalloutType.TAKING_FIRE, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // But same type (CONTACT) should still be blocked (only 6 seconds passed)
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
      
      // After 11 seconds from TAKING_FIRE (17 seconds total), CONTACT should work
      // (10 seconds from first CONTACT + 5 seconds global cooldown from TAKING_FIRE)
      vi.setSystemTime(startTime + 17000);
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should track cooldowns per combatant independently', () => {
      const position = new THREE.Vector3(5, 0, 5);
      const combatant2 = { ...mockCombatant, id: 'combatant-2' };
      
      // First combatant triggers callout
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // Second combatant should still be able to trigger immediately
      system.triggerCallout(combatant2, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should prevent rapid repeated calls from same combatant', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // First call succeeds
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // Rapid repeated calls should be blocked
      for (let i = 0; i < 10; i++) {
        system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      }
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('Distance-based volume', () => {
    it('should play callouts from nearby combatants', () => {
      const nearPosition = new THREE.Vector3(5, 0, 5);
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, nearPosition);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should not play callouts from distant combatants', () => {
      const farPosition = new THREE.Vector3(100, 0, 100);
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, farPosition);
      
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should respect MAX_CALLOUT_DISTANCE (50m)', () => {
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      // Just inside range
      const insidePosition = new THREE.Vector3(49, 0, 0);
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, insidePosition);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      mockCombatant.id = 'combatant-2';
      
      // Just outside range
      const outsidePosition = new THREE.Vector3(51, 0, 0);
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, outsidePosition);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('setPlayerPosition()', () => {
    it('should update player position', () => {
      const newPosition = new THREE.Vector3(10, 5, 10);
      system.setPlayerPosition(newPosition);
      
      // Verify by testing distance-based filtering
      const nearPlayer = new THREE.Vector3(15, 5, 15);
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, nearPlayer);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should affect distance calculations', () => {
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      const position = new THREE.Vector3(60, 0, 0);
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
      
      vi.clearAllMocks();
      mockCombatant.id = 'combatant-2';
      
      // Move player closer
      system.setPlayerPosition(new THREE.Vector3(50, 0, 0));
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });
  });

  describe('Faction-specific audio', () => {
    it('should handle US faction callouts', () => {
      mockCombatant.faction = Faction.US;
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should handle OPFOR faction callouts', () => {
      mockCombatant.faction = Faction.OPFOR;
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle unknown combatant IDs', () => {
      const unknownCombatant = { ...mockCombatant, id: 'unknown-999' };
      const position = new THREE.Vector3(5, 0, 5);
      
      expect(() => {
        system.triggerCallout(unknownCombatant, CalloutType.CONTACT, position);
      }).not.toThrow();
    });

    it('should handle rapid repeated calls with different types', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      
      vi.clearAllMocks();
      
      // Different type immediately after should be blocked by global cooldown
      system.triggerCallout(mockCombatant, CalloutType.TAKING_FIRE, position);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it('should handle combatant at exact player position', () => {
      const position = new THREE.Vector3(0, 0, 0);
      system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should handle negative positions', () => {
      const position = new THREE.Vector3(-10, -5, -10);
      system.setPlayerPosition(new THREE.Vector3(-5, -5, -5));
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should handle zero health combatant', () => {
      mockCombatant.health = 0;
      mockCombatant.state = CombatantState.DEAD;
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.MAN_DOWN, position);
      
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('update()', () => {
    it('should clean up old cooldowns', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // Trigger callout
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      // Advance time past stale threshold (60 seconds)
      vi.setSystemTime(Date.now() + 61000);
      
      // Update should clean up
      system.update(0.016);
      
      // After cleanup, should be able to trigger immediately
      vi.clearAllMocks();
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    });

    it('should not affect recent cooldowns', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // Trigger callout
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      // Advance time slightly
      vi.setSystemTime(Date.now() + 1000);
      
      // Update
      system.update(0.016);
      
      // Should still be on cooldown
      vi.clearAllMocks();
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });
  });

  describe('dispose()', () => {
    it('should clear all cooldowns', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // Add some cooldowns
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      const combatant2 = { ...mockCombatant, id: 'combatant-2' };
      system.triggerCallout(combatant2, CalloutType.TAKING_FIRE, position);
      
      // Dispose
      system.dispose();
      
      // After dispose, cooldowns should be cleared
      // (We can't directly test the Map, but we can verify no errors)
      expect(() => system.dispose()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        system.dispose();
        system.dispose();
        system.dispose();
      }).not.toThrow();
    });
  });

  describe('Audio generation', () => {
    it('should create oscillators for voice components', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      // Should create multiple oscillators (fundamental + formants)
      expect(mockAudioContext.createOscillator).toHaveBeenCalled();
      expect(mockAudioContext.createOscillator.mock.calls.length).toBeGreaterThan(1);
    });

    it('should create gain nodes for volume control', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createGain).toHaveBeenCalled();
    });

    it('should create filters for voice shaping', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createBiquadFilter).toHaveBeenCalled();
    });

    it('should create noise components for consonants', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockAudioContext.createBuffer).toHaveBeenCalled();
      expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
    });

    it('should set ADSR envelope on gain nodes', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      expect(mockGainNode.gain.setValueAtTime).toHaveBeenCalled();
      expect(mockGainNode.gain.linearRampToValueAtTime).toHaveBeenCalled();
      expect(mockGainNode.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
    });
  });

  describe('Positional audio', () => {
    it('should create PositionalAudio for 3D sound', () => {
      const position = new THREE.Vector3(5, 0, 5);
      
      // Just verify it doesn't throw
      expect(() => {
        system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      }).not.toThrow();
    });

    it('should add audio to scene temporarily', () => {
      const position = new THREE.Vector3(5, 0, 5);
      const initialChildren = scene.children.length;
      
      system.triggerCallout(mockCombatant, CalloutType.CONTACT, position);
      
      // Should add temporary object to scene
      expect(scene.children.length).toBeGreaterThan(initialChildren);
    });
  });

  describe('Performance', () => {
    it('should handle multiple simultaneous callouts', () => {
      const positions = [
        new THREE.Vector3(5, 0, 5),
        new THREE.Vector3(10, 0, 10),
        new THREE.Vector3(15, 0, 15),
      ];
      
      const combatants = [
        { ...mockCombatant, id: 'c1' },
        { ...mockCombatant, id: 'c2' },
        { ...mockCombatant, id: 'c3' },
      ];
      
      expect(() => {
        combatants.forEach((c, i) => {
          system.triggerCallout(c, CalloutType.CONTACT, positions[i]);
        });
      }).not.toThrow();
    });

    it('should handle high frequency updates', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          system.update(0.016);
        }
      }).not.toThrow();
    });
  });
});
