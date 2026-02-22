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
    // Disable QoL features for deterministic linear tests
    look.setDeadZone(0);
    look.setAcceleration(1.0);
    zone = document.getElementById('touch-look-zone') as HTMLDivElement;
  });

  it('creates look zone with expected dimensions', () => {
    expect(zone).toBeTruthy();
    expect(zone.style.width).toBe('60%');
    expect(zone.style.height).toBe('70%');
    expect(zone.style.right).toBe('0px');
    expect(zone.style.top).toBe('0px');
  });

  it('accumulates movement delta on pointer move with default sensitivity', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 150, 75));

    expect(look.delta.x).toBeCloseTo(0.2, 5);
    expect(look.delta.y).toBeCloseTo(-0.1, 5);
  });

  it('multiple pointer moves accumulate before consume', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 110, 105));
    zone.dispatchEvent(pointerEvent('pointermove', 130, 115));

    const delta = look.consumeDelta();
    expect(delta.x).toBeCloseTo(0.12, 5);
    expect(delta.y).toBeCloseTo(0.06, 5);
  });

  it('consumeDelta returns accumulated delta and resets to zero', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 90));

    expect(look.consumeDelta()).toEqual({ x: 0.08, y: -0.04 });
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });

  it('pointer up stops accumulation', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 100));
    zone.dispatchEvent(pointerEvent('pointerup', 120, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 180, 100));

    expect(look.consumeDelta()).toEqual({ x: 0.08, y: 0 });
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
    // So output is 3.16 * 0.004 = ~0.01265 instead of linear 10 * 0.004 = 0.04
    expect(Math.abs(curvedDelta.x)).toBeLessThan(0.04);
    expect(Math.abs(curvedDelta.x)).toBeGreaterThan(0);
  });
});
