/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import { TankGunnerPanel } from './TankGunnerPanel';

// CSS-module proxy: every class name resolves to its own key, mirroring the
// CrosshairSystem test so we can assert behavior without a real stylesheet.
vi.mock('./TankGunnerPanel.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

describe('TankGunnerPanel', () => {
  let panel: TankGunnerPanel;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    panel = new TankGunnerPanel();
    panel.mount(host);
  });

  afterEach(() => {
    panel.dispose();
    document.body.removeChild(host);
  });

  it('shows the main gun READY by default', () => {
    const state = panel.element.querySelector('[data-ref="state"]') as HTMLElement;
    expect(state.textContent).toBe('READY');
    expect(panel.getMainGunState()).toBe('ready');
  });

  it('shows RELOADING when the gun is reloading and clears back to READY', () => {
    panel.setMainGunState('reloading');
    const state = panel.element.querySelector('[data-ref="state"]') as HTMLElement;
    expect(state.textContent).toBe('RELOADING');

    panel.setMainGunState('ready');
    expect(state.textContent).toBe('READY');
  });

  it('fills the reload bar from empty to full as reload progresses', () => {
    const fill = panel.element.querySelector('[data-ref="reloadFill"]') as HTMLElement;

    panel.setReloadProgress(0);
    expect(fill.style.width).toBe('0%');

    panel.setReloadProgress(0.5);
    expect(fill.style.width).toBe('50%');

    panel.setReloadProgress(1);
    expect(fill.style.width).toBe('100%');
  });

  it('clamps out-of-range reload progress to 0..100%', () => {
    const fill = panel.element.querySelector('[data-ref="reloadFill"]') as HTMLElement;
    panel.setReloadProgress(-1);
    expect(fill.style.width).toBe('0%');
    panel.setReloadProgress(5);
    expect(fill.style.width).toBe('100%');
  });

  it('rotates the azimuth needle to the turret yaw and shows the bearing', () => {
    const needle = panel.element.querySelector('[data-ref="needle"]') as HTMLElement;
    const az = panel.element.querySelector('[data-ref="azDeg"]') as HTMLElement;

    // Barrel over the bow → 0 degrees.
    panel.setTurretAzimuth(0);
    expect(needle.style.transform).toContain('rotate(0deg)');
    expect(az.textContent).toBe('0°');

    // Quarter turn right → +90 degrees of needle rotation + readout.
    panel.setTurretAzimuth(Math.PI / 2);
    expect(needle.style.transform).toContain('rotate(90deg)');
    expect(az.textContent).toBe('90°');
  });

  it('shows the current magnification step', () => {
    const zoom = panel.element.querySelector('[data-ref="zoom"]') as HTMLElement;
    expect(zoom.textContent).toBe('1.0x');

    panel.setMagnification(2.8);
    expect(zoom.textContent).toBe('2.8x');
  });

  it('does not rewrite zoom text while the visible magnification is unchanged', () => {
    panel.setMagnification(2.81);
    const zoom = panel.element.querySelector('[data-ref="zoom"]') as HTMLElement;
    expect(zoom.textContent).toBe('2.8x');
    const textWrites = trackTextWrites(zoom);

    panel.setMagnification(2.84);

    expect(textWrites).toEqual([]);

    panel.setMagnification(2.86);

    expect(textWrites).toEqual(['2.9x']);
  });

  it('does not rewrite azimuth text while the rounded bearing is unchanged', () => {
    panel.setTurretAzimuth(0.01);
    const needle = panel.element.querySelector('[data-ref="needle"]') as HTMLElement;
    const az = panel.element.querySelector('[data-ref="azDeg"]') as HTMLElement;
    const needleBefore = needle.style.transform;
    const textWrites = trackTextWrites(az);

    panel.setTurretAzimuth(0.011);

    expect(needle.style.transform).not.toBe(needleBefore);
    expect(textWrites).toEqual([]);

    panel.setTurretAzimuth(0.03);

    expect(textWrites).toEqual(['2°']);
  });
});

function trackTextWrites(element: HTMLElement): string[] {
  let current = element.textContent ?? '';
  const writes: string[] = [];
  Object.defineProperty(element, 'textContent', {
    configurable: true,
    get: () => current,
    set: (value: string | null) => {
      current = value ?? '';
      writes.push(current);
    },
  });
  return writes;
}
