import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { VoiceCalloutSystem, CalloutType } from './VoiceCalloutSystem';
import { Combatant, CombatantState, Faction } from '../combat/types';

const mockAudioContext = {
  currentTime: 0,
  sampleRate: 44100,
  destination: {},
};

const mockAudioListener = {
  context: mockAudioContext,
  getInput: vi.fn(() => ({})),
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

    system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
  });

  it('exposes expected callout enum values', () => {
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

  it('is a no-op while callout audio is disabled', () => {
    const beforeChildren = scene.children.length;
    system.triggerCallout(mockCombatant, CalloutType.CONTACT, new THREE.Vector3(5, 0, 5));
    expect(scene.children.length).toBe(beforeChildren);
    expect((system as any).cooldowns.size).toBe(0);
  });

  it('removes stale cooldowns during update', () => {
    (system as any).cooldowns.set('old', {
      combatantId: 'old',
      lastCalloutTime: Date.now() - 120_000,
      lastCalloutType: CalloutType.CONTACT,
    });

    system.update(0.016);
    expect((system as any).cooldowns.has('old')).toBe(false);
  });
});
