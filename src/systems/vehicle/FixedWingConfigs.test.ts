import { describe, it, expect } from 'vitest';
import { getFixedWingDisplayInfo } from './FixedWingConfigs';

describe('FixedWingDisplayInfo modelYawOffset', () => {
  it('A-1 Skyraider overrides modelYawOffset to 0 (GLB authored facing -Z)', () => {
    const a1 = getFixedWingDisplayInfo('A1_SKYRAIDER');
    expect(a1).not.toBeNull();
    expect(a1!.modelYawOffset).toBe(0);
  });

  it('AC-47 and F-4 do not override modelYawOffset (default Math.PI flip applies)', () => {
    const ac47 = getFixedWingDisplayInfo('AC47_SPOOKY');
    const f4 = getFixedWingDisplayInfo('F4_PHANTOM');
    expect(ac47?.modelYawOffset).toBeUndefined();
    expect(f4?.modelYawOffset).toBeUndefined();
  });
});
