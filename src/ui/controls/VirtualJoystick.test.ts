/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualJoystick } from './VirtualJoystick';

function touch(identifier: number, clientX: number, clientY: number): Touch {
  return { identifier, clientX, clientY } as Touch;
}

function touchEvent(type: string, touches: Touch[]): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: touches });
  Object.defineProperty(event, 'touches', { value: touches });
  return event;
}

describe('VirtualJoystick', () => {
  let joystick: VirtualJoystick;
  let zone: HTMLDivElement;
  let base: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    joystick = new VirtualJoystick();
    zone = document.getElementById('touch-joystick-zone') as HTMLDivElement;
    base = zone.firstElementChild as HTMLDivElement;

    vi.spyOn(base, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 120,
      height: 120,
      right: 120,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  });

  it('creates container, base, and thumb elements', () => {
    expect(zone).toBeTruthy();
    expect(base).toBeTruthy();
    expect(base.firstElementChild).toBeTruthy();
  });

  it('activates on touch start and updates movement on touch move', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 60, 60)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 60)]));

    expect(joystick.output.x).toBeCloseTo(1, 5);
    expect(joystick.output.z).toBeCloseTo(0, 5);
  });

  it('keeps movement vector within [-1, 1] bounds', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 60, 60)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 2000, -2000)]));

    expect(joystick.output.x).toBeLessThanOrEqual(1);
    expect(joystick.output.x).toBeGreaterThanOrEqual(-1);
    expect(joystick.output.z).toBeLessThanOrEqual(1);
    expect(joystick.output.z).toBeGreaterThanOrEqual(-1);
  });

  it('fires sprint callbacks above threshold and stops below threshold', () => {
    const onSprintStart = vi.fn();
    const onSprintStop = vi.fn();
    joystick.setSprintCallbacks(onSprintStart, onSprintStop);

    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 60, 60)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 60)]));
    expect(onSprintStart).toHaveBeenCalledTimes(1);

    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 90, 60)]));
    expect(onSprintStop).toHaveBeenCalledTimes(1);
  });

  it('resets movement and deactivates on touch end', () => {
    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 60, 60)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 60)]));
    zone.dispatchEvent(touchEvent('touchend', [touch(1, 120, 60)]));

    expect(joystick.output).toEqual({ x: 0, z: 0 });

    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 120)]));
    expect(joystick.output).toEqual({ x: 0, z: 0 });
  });

  it('show and hide toggle visibility', () => {
    joystick.hide();
    expect(zone.style.display).toBe('none');

    joystick.show();
    expect(zone.style.display).toBe('block');
  });

  it('dispose removes dom and listeners', () => {
    joystick.dispose();
    expect(document.getElementById('touch-joystick-zone')).toBeNull();

    zone.dispatchEvent(touchEvent('touchstart', [touch(1, 60, 60)]));
    zone.dispatchEvent(touchEvent('touchmove', [touch(1, 120, 60)]));
    expect(joystick.output).toEqual({ x: 0, z: 0 });
  });
});
