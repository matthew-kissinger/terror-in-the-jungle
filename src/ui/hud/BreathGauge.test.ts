/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BreathGauge } from './BreathGauge';

vi.mock('./BreathGauge.module.css', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => String(prop),
  }),
}));

describe('BreathGauge', () => {
  let gauge: BreathGauge;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    gauge = new BreathGauge();
    gauge.mount(parent);
  });

  afterEach(() => {
    gauge.dispose();
    document.body.removeChild(parent);
  });

  it('starts hidden so dry play does not show the gauge', () => {
    expect(gauge.isVisible()).toBe(false);
  });

  it('becomes visible when submerged (show called by HUDSystem)', () => {
    gauge.show();
    expect(gauge.isVisible()).toBe(true);
    // Visible class toggles on the root element so the CSS .visible rule applies.
    expect(gauge.element.classList.contains('visible')).toBe(true);
  });

  it('hides again on surface', () => {
    gauge.show();
    gauge.hide();
    expect(gauge.isVisible()).toBe(false);
    expect(gauge.element.classList.contains('visible')).toBe(false);
  });

  it('renders remaining seconds in the readout text', () => {
    gauge.show();
    gauge.setBreath(30, 45);
    const text = gauge.element.querySelector('[data-ref="text"]') as HTMLElement;
    expect(text.textContent).toBe('30s');

    gauge.setBreath(5, 45);
    expect(text.textContent).toBe('5s');

    gauge.setBreath(0, 45);
    expect(text.textContent).toBe('0s');
  });
});
