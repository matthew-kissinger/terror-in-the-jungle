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
    it('uses mounted element refs for reticle, spread, and cue updates', () => {
      const root = crosshair.element;
      const fixedWing = root.querySelector('[data-ref="fixedWing"]') as HTMLElement;
      const spreadRing = root.querySelector('[data-ref="spreadRing"]') as HTMLElement;
      const mgRight = root.querySelector('[data-ref="mgStopRight"]') as HTMLElement;
      const dgRight = root.querySelector('[data-ref="dgStopRight"]') as HTMLElement;
      const gun = root.querySelector('[data-ref="pipperGun"]') as HTMLElement;
      const rocket = root.querySelector('[data-ref="pipperRocket"]') as HTMLElement;
      const cue = root.querySelector('[data-ref="rocketCue"]') as HTMLElement;

      const querySelector = vi.spyOn(root, 'querySelector');
      querySelector.mockImplementation(() => {
        throw new Error('CrosshairSystem should use cached mounted refs for updates');
      });
      const querySelectorAll = vi.spyOn(root, 'querySelectorAll');
      querySelectorAll.mockImplementation(() => {
        throw new Error('CrosshairSystem should use cached pipper icon refs for updates');
      });

      expect(() => {
        crosshair.setMode('fixed_wing');
        crosshair.setSpread(20);
        crosshair.setTraverseStop('right');
        crosshair.setMode('helicopter_attack');
        crosshair.setHelicopterWeapon('rockets');
        crosshair.setRocketCueOffset(12);
      }).not.toThrow();

      expect(fixedWing.style.display).toBe('none');
      expect(spreadRing.style.width).toBe('40px');
      expect(spreadRing.style.height).toBe('40px');
      expect(mgRight.classList.contains('mgStopActive')).toBe(true);
      expect(dgRight.classList.contains('dgStopActive')).toBe(true);
      expect(gun.style.display).toBe('none');
      expect(rocket.style.display).toBe('');
      expect(cue.style.display).toBe('');
      expect(cue.style.transform).toContain('12px');
    });

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

    it('should switch to door_gun and show only the door-gun open cross', () => {
      crosshair.setMode('door_gun');
      expect(crosshair.getMode()).toBe('door_gun');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const emplacementMg = crosshair.element.querySelector('[data-ref="emplacementMg"]') as HTMLElement;
      const doorGun = crosshair.element.querySelector('[data-ref="doorGun"]') as HTMLElement;
      const fixedWing = crosshair.element.querySelector('[data-ref="fixedWing"]') as HTMLElement;
      expect(doorGun.style.display).toBe('');
      expect(infantry.style.display).toBe('none');
      expect(emplacementMg.style.display).toBe('none');
      expect(fixedWing.style.display).toBe('none');
    });

    it('should restore the infantry crosshair when leaving the door gun', () => {
      crosshair.setMode('door_gun');
      crosshair.setMode('infantry');

      const infantry = crosshair.element.querySelector('[data-ref="infantry"]') as HTMLElement;
      const doorGun = crosshair.element.querySelector('[data-ref="doorGun"]') as HTMLElement;
      expect(infantry.style.display).toBe('');
      expect(doorGun.style.display).toBe('none');
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

  describe('door-gun arc-stop cue', () => {
    // The door-gun reticle reuses the same traverse-stop signal as the
    // emplacement MG, but with its own edge-tick elements (dgStop*).
    function litDoorGunEdges(): string[] {
      const refs = ['dgStopUp', 'dgStopDown', 'dgStopLeft', 'dgStopRight'];
      return refs.filter((ref) => {
        const el = crosshair.element.querySelector(`[data-ref="${ref}"]`) as HTMLElement;
        return el.classList.contains('dgStopActive');
      });
    }

    it('lights exactly the door-gun edge the gun is pinned against', () => {
      crosshair.setMode('door_gun');

      crosshair.setTraverseStop('left');
      expect(litDoorGunEdges()).toEqual(['dgStopLeft']);

      crosshair.setTraverseStop('down');
      expect(litDoorGunEdges()).toEqual(['dgStopDown']);

      crosshair.setTraverseStop(null);
      expect(litDoorGunEdges()).toEqual([]);
    });
  });

  describe('attack-helicopter per-weapon reticle (gunship-reticle-upgrade)', () => {
    function pipperEls() {
      return {
        gun: crosshair.element.querySelector('[data-ref="pipperGun"]') as HTMLElement,
        rocket: crosshair.element.querySelector('[data-ref="pipperRocket"]') as HTMLElement,
        cue: crosshair.element.querySelector('[data-ref="rocketCue"]') as HTMLElement,
      };
    }

    it('defaults to the gun pipper with the rocket cue hidden', () => {
      crosshair.setMode('helicopter_attack');
      const { gun, rocket, cue } = pipperEls();
      expect(gun.style.display).toBe('');
      expect(rocket.style.display).toBe('none');
      expect(cue.style.display).toBe('none');
      expect(crosshair.getHelicopterWeapon()).toBe('gun');
    });

    it('raises the rocket pipper + reveals the fall cue when rockets are selected', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.setHelicopterWeapon('rockets');

      const { gun, rocket, cue } = pipperEls();
      expect(rocket.style.display).toBe('');
      expect(cue.style.display).toBe('');
      // Gun pipper steps back while rockets are up.
      expect(gun.style.display).toBe('none');
    });

    it('swaps reticle prominence back to the gun on weapon cycle', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.setHelicopterWeapon('rockets');
      crosshair.setHelicopterWeapon('gun');

      const { gun, rocket, cue } = pipperEls();
      expect(gun.style.display).toBe('');
      expect(rocket.style.display).toBe('none');
      expect(cue.style.display).toBe('none');
    });

    it('drops the rocket-fall cue below the boresight by the pushed offset', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.setHelicopterWeapon('rockets');

      crosshair.setRocketCueOffset(24);
      const { cue } = pipperEls();
      // The cue translates straight down by the offset (below the bore).
      expect(cue.style.transform).toContain('24px');
      expect(crosshair.getRocketCueOffset()).toBe(24);
    });

    it('updates rocket cue offset without rewriting stable pipper display styles', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.setHelicopterWeapon('rockets');
      crosshair.setRocketCueOffset(12);
      const { gun, rocket, cue } = pipperEls();
      const gunDisplayWrites = trackStyleWrites(gun.style, 'display');
      const rocketDisplayWrites = trackStyleWrites(rocket.style, 'display');
      const cueDisplayWrites = trackStyleWrites(cue.style, 'display');
      const cueTransformWrites = trackStyleWrites(cue.style, 'transform');

      crosshair.setRocketCueOffset(24);

      expect(gunDisplayWrites).toEqual([]);
      expect(rocketDisplayWrites).toEqual([]);
      expect(cueDisplayWrites).toEqual([]);
      expect(cueTransformWrites).toEqual(['translate(-50%, calc(-50% + 24px))']);
    });

    it('clamps a negative cue offset to zero', () => {
      crosshair.setMode('helicopter_attack');
      crosshair.setHelicopterWeapon('rockets');
      crosshair.setRocketCueOffset(-10);
      expect(crosshair.getRocketCueOffset()).toBe(0);
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

function trackStyleWrites(style: CSSStyleDeclaration, property: 'display' | 'transform'): string[] {
  let current = style[property];
  const writes: string[] = [];
  Object.defineProperty(style, property, {
    configurable: true,
    get: () => current,
    set: (value: string) => {
      current = value;
      writes.push(value);
    },
  });
  return writes;
}
