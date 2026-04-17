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

  it('accumulates look delta while the pointer is active', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 150, 75));

    // Moving right and up should produce positive x, negative y delta.
    // We don't assert on the exact sensitivity value (tuning constant).
    expect(look.delta.x).toBeGreaterThan(0);
    expect(look.delta.y).toBeLessThan(0);
  });

  it('consumeDelta returns accumulated delta and resets to zero', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 90));

    const first = look.consumeDelta();
    expect(first.x).toBeGreaterThan(0);
    expect(first.y).toBeLessThan(0);
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });

  it('pointer up stops accumulation', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 120, 100));
    zone.dispatchEvent(pointerEvent('pointerup', 120, 100));
    zone.dispatchEvent(pointerEvent('pointermove', 180, 100));

    // Only the first pre-release movement contributes.
    const delta = look.consumeDelta();
    expect(delta.x).toBeGreaterThan(0);
    expect(delta.y).toBe(0);
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

  it('clamps huge accumulated deltas to prevent camera snap', () => {
    zone.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    // 400px jump simulates a coordinate-space glitch during fullscreen entry.
    zone.dispatchEvent(pointerEvent('pointermove', 500, 500));

    const delta = look.consumeDelta();
    const mag = Math.sqrt(delta.x * delta.x + delta.y * delta.y);
    // The clamp exists; asserting on the exact ceiling would be tuning.
    expect(mag).toBeLessThan(1);
    expect(mag).toBeGreaterThan(0);
  });
});
