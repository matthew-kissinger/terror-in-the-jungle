/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TouchLook } from './TouchLook';

function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId,
    pointerType: 'touch',
    clientX,
    clientY,
  });
}

describe('TouchLook', () => {
  let look: TouchLook;
  let zone: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    look = new TouchLook();
    look.mount(document.body);
    // Disable QoL features for deterministic linear tests
    look.setDeadZone(0);
    look.setAcceleration(1.0);
    zone = document.getElementById('touch-look-zone') as HTMLDivElement;
  });

  it('creates look zone with expected dimensions', () => {
    expect(zone).toBeTruthy();
    expect(zone.className).toContain('lookZone');
  });

  it('accumulates movement delta on pointer move with default sensitivity', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 150, 75));

    // 50px * 0.006 = 0.3, -25px * 0.006 = -0.15 (sensitivity = 0.006)
    expect(look.delta.x).toBeCloseTo(0.3, 5);
    expect(look.delta.y).toBeCloseTo(-0.15, 5);
  });

  it('multiple pointer moves accumulate before consume', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 110, 105));
    zone.dispatchEvent(pointerEvent('pointermove', 118, 110));

    const delta = look.consumeDelta();
    // (10+8)px * 0.006 = 0.108, (5+5)px * 0.006 = 0.06 (sensitivity = 0.006)
    // magnitude = sqrt(0.108² + 0.06²) ≈ 0.124 (under MAX_DELTA_PER_CONSUME of 0.15)
    expect(delta.x).toBeCloseTo(0.108, 5);
    expect(delta.y).toBeCloseTo(0.06, 5);
  });

  it('consumeDelta returns accumulated delta and resets to zero', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 90));

    // 20px * 0.006 = 0.12, -10px * 0.006 = -0.06 (sensitivity = 0.006)
    expect(look.consumeDelta()).toEqual({ x: 0.12, y: -0.06 });
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });

  it('pointer up stops accumulation', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 100));
    zone.dispatchEvent(pointerEvent('pointerup', 120, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 180, 100));

    // 20px * 0.006 = 0.12 (sensitivity = 0.006)
    expect(look.consumeDelta()).toEqual({ x: 0.12, y: 0 });
  });

  it('dispose removes dom and listeners', () => {
    look.dispose();
    expect(document.getElementById('touch-look-zone')).toBeNull();

    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 140, 120));
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });

  it('dead zone ignores small movements', () => {
    look.setDeadZone(3);
    look.setAcceleration(1.0);

    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    // Move 1px (under dead zone of 3px) - should be ignored
    zone.dispatchEvent(pointerEvent('pointermove', 101, 100));
    expect(look.delta.x).toBe(0);
    expect(look.delta.y).toBe(0);

    // Move 5px (above dead zone) - should register
    zone.dispatchEvent(pointerEvent('pointermove', 106, 100));
    expect(look.delta.x).not.toBe(0);
  });

  it('acceleration curve reduces output for small movements', () => {
    look.setDeadZone(0);
    look.setAcceleration(0.5); // Strong curve

    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 110, 100));
    const curvedDelta = look.consumeDelta();

    // With exponent 0.5, 10px movement: scaled = 10^0.5 = ~3.16
    // So output is 3.16 * 0.006 = ~0.019 instead of linear 10 * 0.006 = 0.06
    expect(Math.abs(curvedDelta.x)).toBeLessThan(0.06);
    expect(Math.abs(curvedDelta.x)).toBeGreaterThan(0);
  });

  it('clamps large accumulated delta to prevent camera snap', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    // 400px jump simulates coordinate-space glitch during fullscreen transition
    zone.dispatchEvent(pointerEvent('pointermove', 500, 500));

    const delta = look.consumeDelta();
    const mag = Math.sqrt(delta.x * delta.x + delta.y * delta.y);
    // MAX_DELTA_PER_CONSUME is 0.15
    expect(mag).toBeLessThanOrEqual(0.151);
    expect(mag).toBeGreaterThan(0);
  });
});
