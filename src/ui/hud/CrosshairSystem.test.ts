/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CrosshairSystem } from './CrosshairSystem';

vi.mock('./CrosshairSystem.module.css', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => String(prop),
  }),
}));

describe('CrosshairSystem', () => {
  let crosshair: CrosshairSystem;
  let parent: HTMLElement;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    crosshair = new CrosshairSystem();
    crosshair.mount(parent);
  });

  afterEach(() => {
    crosshair.dispose();
    document.body.removeChild(parent);
  });

  describe('initial state', () => {
    it('should default to infantry mode', () => {
      expect(crosshair.getMode()).toBe('infantry');
    });

    it('should show infantry crosshair by default', () => {
      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      expect(infantry.style.display).toBe('');
      expect(pipper.style.display).toBe('none');
    });
  });

  describe('setMode()', () => {
    it('should switch to helicopter_attack and show pipper', () => {
      crosshair.setMode('helicopter_attack');
      expect(crosshair.getMode()).toBe('helicopter_attack');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('');
    });

    it('should hide both reticles for helicopter modes that have no pilot crosshair', () => {
      crosshair.setMode('helicopter_transport');
      let infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      let pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('none');

      crosshair.setMode('helicopter_gunship');
      infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('none');
    });

    it('should restore infantry crosshair', () => {
      crosshair.setMode('helicopter_transport');
      crosshair.setMode('infantry');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      expect(infantry.style.display).toBe('');
    });
  });

  describe('visibility', () => {
    it('hideCrosshair and showCrosshair toggle the hidden state', () => {
      crosshair.hideCrosshair();
      expect(crosshair.element.classList.contains('hidden')).toBe(true);

      crosshair.showCrosshair();
      expect(crosshair.element.classList.contains('hidden')).toBe(false);

      crosshair.hideCrosshair();
      crosshair.showCrosshairAgain();
      expect(crosshair.element.classList.contains('hidden')).toBe(false);
    });
  });

  describe('setSpread()', () => {
    it('should update spread ring size', () => {
      crosshair.setSpread(25);
      const ring = crosshair.element.querySelector('[data-ref="spreadRing"]') as HTMLElement;
      expect(ring.style.width).toBe('50px');
      expect(ring.style.height).toBe('50px');
    });

    it('should clamp negative spread to zero', () => {
      crosshair.setSpread(-5);
      const ring = crosshair.element.querySelector('[data-ref="spreadRing"]') as HTMLElement;
      expect(ring.style.width).toBe('0px');
      expect(ring.style.height).toBe('0px');
    });
  });

  describe('getElement()', () => {
    it('should return the root element', () => {
      expect(crosshair.getElement()).toBe(crosshair.element);
    });
  });

  describe('mode + visibility interaction', () => {
    it('should hide everything when not visible regardless of mode', () => {
      crosshair.setMode('infantry');
      crosshair.hideCrosshair();
      expect(crosshair.element.classList.contains('hidden')).toBe(true);
    });

    it('should respect mode after re-showing', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.hideCrosshair();
      crosshair.showCrosshair();

      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      expect(pipper.style.display).toBe('');
      expect(crosshair.element.classList.contains('hidden')).toBe(false);
    });
  });
});
