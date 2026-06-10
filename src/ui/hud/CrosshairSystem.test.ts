/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


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

    it('should switch to tank_gunner and show only the gunner-sight reticle', () => {
      crosshair.setMode('tank_gunner');
      expect(crosshair.getMode()).toBe('tank_gunner');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      const tankGunner = crosshair.element.querySelector('[data-ref="tankGunner"]') as HTMLElement;
      const emplacementMg = crosshair.element.querySelector('[data-ref="emplacementMg"]') as HTMLElement;
      expect(tankGunner.style.display).toBe('');
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('none');
      expect(emplacementMg.style.display).toBe('none');
    });

    it('should switch to emplacement_mg and show only the MG cross reticle', () => {
      crosshair.setMode('emplacement_mg');
      expect(crosshair.getMode()).toBe('emplacement_mg');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      const tankGunner = crosshair.element.querySelector('[data-ref="tankGunner"]') as HTMLElement;
      const emplacementMg = crosshair.element.querySelector('[data-ref="emplacementMg"]') as HTMLElement;
      expect(emplacementMg.style.display).toBe('');
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('none');
      expect(tankGunner.style.display).toBe('none');
    });

    it('should switch to fixed_wing and show only the reflector gunsight', () => {
      crosshair.setMode('fixed_wing');
      expect(crosshair.getMode()).toBe('fixed_wing');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const pipper = crosshair.element.querySelector('[data-ref="pipper"]') as HTMLElement;
      const tankGunner = crosshair.element.querySelector('[data-ref="tankGunner"]') as HTMLElement;
      const emplacementMg = crosshair.element.querySelector('[data-ref="emplacementMg"]') as HTMLElement;
      const fixedWing = crosshair.element.querySelector('[data-ref="fixedWing"]') as HTMLElement;
      expect(fixedWing.style.display).toBe('');
      expect(infantry.style.display).toBe('none');
      expect(pipper.style.display).toBe('none');
      expect(tankGunner.style.display).toBe('none');
      expect(emplacementMg.style.display).toBe('none');
    });

    it('should restore the infantry crosshair when leaving fixed_wing', () => {
      crosshair.setMode('fixed_wing');
      crosshair.setMode('infantry');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const fixedWing = crosshair.element.querySelector('[data-ref="fixedWing"]') as HTMLElement;
      expect(infantry.style.display).toBe('');
      expect(fixedWing.style.display).toBe('none');
    });

    it('should swap cleanly between ground-gunnery modes and back to infantry', () => {
      const tankGunner = crosshair.element.querySelector('[data-ref="tankGunner"]') as HTMLElement;
      const emplacementMg = crosshair.element.querySelector('[data-ref="emplacementMg"]') as HTMLElement;
      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;

      crosshair.setMode('tank_gunner');
      expect(tankGunner.style.display).toBe('');
      expect(emplacementMg.style.display).toBe('none');

      crosshair.setMode('emplacement_mg');
      expect(emplacementMg.style.display).toBe('');
      expect(tankGunner.style.display).toBe('none');

      crosshair.setMode('infantry');
      expect(infantry.style.display).toBe('');
      expect(tankGunner.style.display).toBe('none');
      expect(emplacementMg.style.display).toBe('none');
    });
  });

  describe('emplacement traverse-stop cue', () => {
    // The CSS-module proxy returns the class name verbatim, so the lit edge
    // carries the `mgStopActive` class. We assert the OBSERVABLE behavior —
    // which edge is lit — not the styling values.
    function litEdges(): string[] {
      const refs = ['mgStopUp', 'mgStopDown', 'mgStopLeft', 'mgStopRight'];
      return refs.filter((ref) => {
        const el = crosshair.element.querySelector(`[data-ref="${ref}"]`) as HTMLElement;
        return el.classList.contains('mgStopActive');
      });
    }

    it('lights no edge by default', () => {
      crosshair.setMode('emplacement_mg');
      expect(litEdges()).toEqual([]);
    });

    it('lights exactly the edge the barrel is pinned against', () => {
      crosshair.setMode('emplacement_mg');

      crosshair.setTraverseStop('up');
      expect(litEdges()).toEqual(['mgStopUp']);

      crosshair.setTraverseStop('down');
      expect(litEdges()).toEqual(['mgStopDown']);

      crosshair.setTraverseStop('left');
      expect(litEdges()).toEqual(['mgStopLeft']);

      crosshair.setTraverseStop('right');
      expect(litEdges()).toEqual(['mgStopRight']);
    });

    it('clears the cue when the barrel regains travel', () => {
      crosshair.setMode('emplacement_mg');
      crosshair.setTraverseStop('up');
      expect(litEdges()).toEqual(['mgStopUp']);

      crosshair.setTraverseStop(null);
      expect(litEdges()).toEqual([]);
      expect(crosshair.getTraverseStop()).toBeNull();
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
