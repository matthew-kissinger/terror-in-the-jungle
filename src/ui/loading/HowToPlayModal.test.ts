/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/DeviceDetector', () => ({
  isTouchDevice: () => false,
}));

import { HowToPlayModal } from './HowToPlayModal';

describe('HowToPlayModal', () => {
  let container: HTMLDivElement;
  let modal: HowToPlayModal;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    modal = new HowToPlayModal();
    modal.mount(container);
  });

  afterEach(() => {
    modal.dispose();
    container.remove();
  });

  it('has role="dialog" and aria-modal on mount', () => {
    const root = modal.element;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('How To Play');
  });

  it('close button has aria-label', () => {
    const closeBtn = modal.element.querySelector('[data-ref="close"]');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBe('Close');
  });

  it('includes helicopter controls section', () => {
    const headings = modal.element.querySelectorAll('h3');
    const headingTexts = Array.from(headings).map((h) => h.textContent);
    expect(headingTexts).toContain('HELICOPTER CONTROLS');
  });

  it('helicopter section lists expected controls on desktop', () => {
    const html = modal.element.innerHTML;
    expect(html).toContain('Collective (altitude)');
    expect(html).toContain('Yaw (rotation)');
    expect(html).toContain('Cyclic (pitch/roll)');
    expect(html).toContain('Auto-hover toggle');
    expect(html).toContain('Deploy squad (low hover)');
    expect(html).toContain('Camera mode');
  });

  it('Escape key closes modal when visible', () => {
    modal.show();
    const root = modal.element;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('visible')).toBe(false);
  });
});
