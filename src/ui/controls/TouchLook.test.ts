/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TouchLook } from './TouchLook';

function touch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as Touch;
}

function touchEvent(type: string, touches: Touch[]): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: touches });
  Object.defineProperty(event, 'touches', { value: touches });
  return event;
}

describe('TouchLook', () => {
  let look: TouchLook;
  let zone: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    look = new TouchLook();
    zone = document.getElementById('touch-look-zone') as HTMLDivElement;
  });

  it('creates look zone with expected dimensions', () => {
    expect(zone).toBeTruthy();
    expect(zone.style.width).toBe('60%');
    expect(zone.style.height).toBe('70%');
    expect(zone.style.right).toBe('0px');
    expect(zone.style.top).toBe('0px');
  });

  it('accumulates movement delta on touch move with default sensitivity', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 100, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 150, 75)]));

    expect(look.delta.x).toBeCloseTo(0.2, 5);
    expect(look.delta.y).toBeCloseTo(-0.1, 5);
  });

  it('multiple touch moves accumulate before consume', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 100, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 110, 105)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 130, 115)]));

    const delta = look.consumeDelta();
    expect(delta.x).toBeCloseTo(0.12, 5);
    expect(delta.y).toBeCloseTo(0.06, 5);
  });

  it('consumeDelta returns accumulated delta and resets to zero', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 100, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 90)]));

    expect(look.consumeDelta()).toEqual({ x: 0.08, y: -0.04 });
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });

  it('touch end stops accumulation', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 100, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 100)]));
    zone.dispatchEvent(touchEvent('touchend', [touch(1, 120, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 180, 100)]));

    expect(look.consumeDelta()).toEqual({ x: 0.08, y: 0 });
  });

  it('dispose removes dom and listeners', () => {
    look.dispose();
    expect(document.getElementById('touch-look-zone')).toBeNull();

    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 100, 100)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 140, 120)]));
    expect(look.consumeDelta()).toEqual({ x: 0, y: 0 });
  });
});
