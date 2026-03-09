/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockIsTouch = false;

vi.mock('../../utils/DeviceDetector', () => ({
  isTouchDevice: () => mockIsTouch,
}));

import { OnboardingOverlay } from './OnboardingOverlay';

describe('OnboardingOverlay', () => {
  let container: HTMLDivElement;
  let overlay: OnboardingOverlay;

  beforeEach(() => {
    mockIsTouch = false;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    overlay = new OnboardingOverlay();
    overlay.mount(container);
  });

  afterEach(() => {
    overlay.dispose();
    container.remove();
    localStorage.clear();
  });

  it('has role="dialog", aria-modal, and aria-label on mount', () => {
    const root = overlay.element;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('Tutorial');
  });

  it('renders all 5 pages', () => {
    const pages = overlay.element.querySelectorAll('[data-page]');
    expect(pages.length).toBe(5);
  });

  it('renders 5 dot indicators', () => {
    const dots = overlay.element.querySelectorAll('[data-dot]');
    expect(dots.length).toBe(5);
  });

  it('shows first page as active on show()', () => {
    overlay.show();
    const firstPage = overlay.element.querySelector('[data-page="0"]');
    expect(firstPage?.classList.contains('pageActive')).toBe(true);

    const secondPage = overlay.element.querySelector('[data-page="1"]');
    expect(secondPage?.classList.contains('pageActive')).toBe(false);
  });

  it('first dot is active on show()', () => {
    overlay.show();
    const firstDot = overlay.element.querySelector('[data-dot="0"]');
    expect(firstDot?.classList.contains('dotActive')).toBe(true);

    const secondDot = overlay.element.querySelector('[data-dot="1"]');
    expect(secondDot?.classList.contains('dotActive')).toBe(false);
  });

  it('Previous button is disabled on first page', () => {
    overlay.show();
    const prevBtn = overlay.element.querySelector('[data-ref="prev"]') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);
  });

  it('Next button navigates to next page', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const secondPage = overlay.element.querySelector('[data-page="1"]');
    expect(secondPage?.classList.contains('pageActive')).toBe(true);

    const firstPage = overlay.element.querySelector('[data-page="0"]');
    expect(firstPage?.classList.contains('pageActive')).toBe(false);
  });

  it('Previous button navigates back after Next', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const prevBtn = overlay.element.querySelector('[data-ref="prev"]') as HTMLButtonElement;
    prevBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const firstPage = overlay.element.querySelector('[data-page="0"]');
    expect(firstPage?.classList.contains('pageActive')).toBe(true);
  });

  it('dot indicators update when navigating', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const firstDot = overlay.element.querySelector('[data-dot="0"]');
    const secondDot = overlay.element.querySelector('[data-dot="1"]');
    expect(firstDot?.classList.contains('dotActive')).toBe(false);
    expect(secondDot?.classList.contains('dotActive')).toBe(true);
  });

  it('Next button is disabled on last page', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;

    for (let i = 0; i < 4; i++) {
      nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }

    expect(nextBtn.disabled).toBe(true);

    const lastPage = overlay.element.querySelector('[data-page="4"]');
    expect(lastPage?.classList.contains('pageActive')).toBe(true);
  });

  it('Previous button is enabled after navigating past first page', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    const prevBtn = overlay.element.querySelector('[data-ref="prev"]') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(false);
  });

  it('Escape key closes overlay when visible', () => {
    overlay.show();
    const root = overlay.element;
    expect(root.classList.contains('visible')).toBe(true);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('visible')).toBe(false);
  });

  it('close button closes overlay', () => {
    overlay.show();
    const closeBtn = overlay.element.querySelector('[data-ref="close"]') as HTMLButtonElement;
    closeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(overlay.element.classList.contains('visible')).toBe(false);
  });

  it('close button has aria-label', () => {
    const closeBtn = overlay.element.querySelector('[data-ref="close"]');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBe('Close');
  });

  it('marks tutorial as seen in localStorage after reaching last page', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;

    for (let i = 0; i < 4; i++) {
      nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }

    expect(localStorage.getItem('terror_tutorial_seen')).toBe('true');
  });

  it('does not mark tutorial as seen before reaching last page', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;

    for (let i = 0; i < 3; i++) {
      nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }

    expect(localStorage.getItem('terror_tutorial_seen')).toBeNull();
  });

  it('resets to first page on each show()', () => {
    overlay.show();
    const nextBtn = overlay.element.querySelector('[data-ref="next"]') as HTMLButtonElement;
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    nextBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    overlay.hide();
    overlay.show();

    const firstPage = overlay.element.querySelector('[data-page="0"]');
    expect(firstPage?.classList.contains('pageActive')).toBe(true);
  });

  it('page titles include expected headings', () => {
    const pageTitles = Array.from(overlay.element.querySelectorAll('[data-page]')).map(
      (el) => el.querySelector('h3')?.textContent
    );
    expect(pageTitles).toEqual(['MOVEMENT', 'COMBAT', 'HELICOPTER', 'OBJECTIVES', 'TIPS']);
  });

  it('backdrop click closes overlay', () => {
    overlay.show();
    const root = overlay.element;
    root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(root.classList.contains('visible')).toBe(false);
  });

  describe('mobile detection', () => {
    beforeEach(() => {
      // Dispose the desktop overlay
      overlay.dispose();
      container.remove();

      // Recreate with touch enabled
      mockIsTouch = true;
      container = document.createElement('div');
      document.body.appendChild(container);
      overlay = new OnboardingOverlay();
      overlay.mount(container);
    });

    it('shows touch controls for movement on mobile', () => {
      const movementPage = overlay.element.querySelector('[data-page="0"]');
      expect(movementPage).not.toBeNull();
      const html = movementPage!.innerHTML;
      expect(html).toContain('joystick');
      expect(html).not.toContain('WASD');
    });

    it('shows touch controls for combat on mobile', () => {
      const combatPage = overlay.element.querySelector('[data-page="1"]');
      expect(combatPage).not.toBeNull();
      const html = combatPage!.innerHTML;
      expect(html).toContain('FIRE');
      expect(html).toContain('ADS');
      expect(html).not.toContain('Left Click');
    });

    it('shows touch controls for helicopter on mobile', () => {
      const heliPage = overlay.element.querySelector('[data-page="2"]');
      expect(heliPage).not.toBeNull();
      const html = heliPage!.innerHTML;
      expect(html).toContain('Interact Button');
      expect(html).not.toContain('Press E');
    });
  });

  describe('desktop content', () => {
    it('shows KBM controls for movement on desktop', () => {
      const movementPage = overlay.element.querySelector('[data-page="0"]');
      const html = movementPage!.innerHTML;
      expect(html).toContain('WASD');
      expect(html).toContain('Mouse');
      expect(html).toContain('Shift');
      expect(html).toContain('Space');
    });

    it('shows KBM controls for combat on desktop', () => {
      const combatPage = overlay.element.querySelector('[data-page="1"]');
      const html = combatPage!.innerHTML;
      expect(html).toContain('Left Click');
      expect(html).toContain('Right Click');
      expect(html).toContain('1-6');
    });

    it('shows desktop helicopter controls', () => {
      const heliPage = overlay.element.querySelector('[data-page="2"]');
      const html = heliPage!.innerHTML;
      expect(html).toContain('Press E');
      expect(html).toContain('W/S');
      expect(html).toContain('A/D');
      expect(html).toContain('Arrow Keys');
      expect(html).toContain('Auto-hover');
    });
  });
});
