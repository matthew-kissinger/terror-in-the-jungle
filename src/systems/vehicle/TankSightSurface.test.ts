/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TankSightSurface,
  SIGHT_FOV_1X,
  SIGHT_FOV_ZOOM,
  SIGHT_MAG_ZOOM,
} from './TankSightSurface';

vi.mock('../../ui/hud/TankGunnerPanel.module.css', () => ({
  default: new Proxy({}, { get: (_t, prop) => String(prop) }),
}));

function makeInput(buttons: Record<number, boolean>) {
  return { isMouseButtonPressed: vi.fn((b: number) => !!buttons[b]) } as any;
}

describe('TankSightSurface', () => {
  let surface: TankSightSurface;
  let reload01: number;
  let host: HTMLElement;

  beforeEach(() => {
    reload01 = 1;
    surface = new TankSightSurface({
      getTurretYaw: () => 0.5,
      getReloadProgress01: () => reload01,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('toggles zoom on the RMB rising edge only, and resets to 1x on activate', () => {
    const buttons: Record<number, boolean> = { 2: true };
    const input = makeInput(buttons);

    expect(surface.readZoomToggle(input)).toBe(true);
    expect(surface.isZoomed()).toBe(true);
    expect(surface.getSightFov()).toBe(SIGHT_FOV_ZOOM);
    expect(surface.getMagnification()).toBeCloseTo(SIGHT_MAG_ZOOM, 5);

    // Held button does not re-toggle.
    expect(surface.readZoomToggle(input)).toBe(false);
    expect(surface.isZoomed()).toBe(true);

    // Re-entering the seat re-arms to 1x.
    surface.activate();
    expect(surface.isZoomed()).toBe(false);
    expect(surface.getSightFov()).toBe(SIGHT_FOV_1X);
  });

  it('derives the main-gun HUD state from the owner reload gate (one authority)', () => {
    reload01 = 0.4;
    expect(surface.getMainGunState()).toBe('reloading');
    reload01 = 1;
    expect(surface.getMainGunState()).toBe('ready');
  });

  it('mounts the panel on activate-with-host, on late host arrival, and unmounts on deactivate / host teardown', () => {
    // Activate before any host: headless-safe, nothing mounts.
    surface.activate();
    expect(host.childElementCount).toBe(0);

    // Late host (composer session hook fires after onEnter): mounts now.
    surface.setHost(host);
    expect(host.childElementCount).toBeGreaterThan(0);

    surface.deactivate();
    expect(host.childElementCount).toBe(0);

    // Activate with host already present mounts immediately.
    surface.activate();
    expect(host.childElementCount).toBeGreaterThan(0);

    // Host teardown unmounts.
    surface.setHost(null);
    expect(host.childElementCount).toBe(0);
  });
});
