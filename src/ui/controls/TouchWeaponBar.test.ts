/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TouchWeaponBar } from './TouchWeaponBar';

function touchEvent(type: string): TouchEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as TouchEvent;
  Object.defineProperty(event, 'changedTouches', { value: [] });
  Object.defineProperty(event, 'touches', { value: [] });
  return event;
}

describe('TouchWeaponBar', () => {
  let weaponBar: TouchWeaponBar;
  let container: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    weaponBar = new TouchWeaponBar();
    container = document.getElementById('touch-weapon-bar') as HTMLDivElement;
  });

  it('creates the weapon bar container with correct ID', () => {
    expect(container).toBeTruthy();
    expect(container.id).toBe('touch-weapon-bar');
    expect(container.style.position).toBe('fixed');
    expect(container.style.top).toBe('12px');
  });

  it('creates 6 weapon slot buttons', () => {
    const buttons = container.querySelectorAll('div');
    expect(buttons.length).toBe(6);
    
    // Check labels (1 SG, 2 GRN, etc)
    expect(buttons[0].textContent).toContain('1SG');
    expect(buttons[2].textContent).toContain('3AR');
    expect(buttons[5].textContent).toContain('6PST');
  });

  it('tapping a slot triggers onWeaponSelect callback', () => {
    const onWeaponSelect = vi.fn();
    weaponBar.setOnWeaponSelect(onWeaponSelect);

    const buttons = container.querySelectorAll('div');
    
    // Tap slot 0 (SG)
    buttons[0].dispatchEvent(touchEvent('touchstart'));
    expect(onWeaponSelect).toHaveBeenCalledWith(0);

    // Tap slot 4 (SMG)
    buttons[4].dispatchEvent(touchEvent('touchstart'));
    expect(onWeaponSelect).toHaveBeenCalledWith(4);
  });

  it('active slot has highlighted styling', () => {
    const buttons = container.querySelectorAll('div');
    
    // Default is slot 2 (3AR)
    expect(buttons[2].style.background).toBe('rgba(255, 200, 50, 0.35)');
    expect(buttons[0].style.background).toBe('rgba(255, 255, 255, 0.12)');

    // Select slot 0
    weaponBar.setActiveSlot(0);
    expect(buttons[0].style.background).toBe('rgba(255, 200, 50, 0.35)');
    expect(buttons[2].style.background).toBe('rgba(255, 255, 255, 0.12)');
  });

  it('show and hide toggle visibility', () => {
    weaponBar.hide();
    expect(container.style.display).toBe('none');

    weaponBar.show();
    expect(container.style.display).toBe('flex');
  });

  it('dispose removes container from DOM', () => {
    weaponBar.dispose();
    expect(document.getElementById('touch-weapon-bar')).toBeNull();
    
    /**
     * NOTE: Known bug - event listeners leak on dispose() because they are added 
     * to slot buttons but never removed. The buttons themselves are removed from 
     * DOM along with the container, but if references were kept, the listeners 
     * would still be active.
     */
  });
});
