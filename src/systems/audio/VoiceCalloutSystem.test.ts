import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { VoiceCalloutSystem, CalloutType } from './VoiceCalloutSystem';
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

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    scene = new THREE.Scene();
    system = new VoiceCalloutSystem(scene, mockAudioListener);
    await system.init();

    system.setPlayerPosition(new THREE.Vector3(0, 0, 0));
  });

  afterEach(() => {
    system.dispose();
    vi.useRealTimers();
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
