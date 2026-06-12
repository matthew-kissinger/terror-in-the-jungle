/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AirSupportRadioMenu } from './AirSupportRadioMenu';
import { AIR_SUPPORT_RADIO_ASSETS } from '../../systems/airsupport/AirSupportRadioCatalog';

const ASSET_COUNT = AIR_SUPPORT_RADIO_ASSETS.length;

describe('AirSupportRadioMenu', () => {
  let menu: AirSupportRadioMenu;

  beforeEach(() => {
    document.body.innerHTML = '';
    menu = new AirSupportRadioMenu();
    menu.mount(document.body);
  });

  it('stays hidden until explicitly opened while rendering radio options', () => {
    const root = document.querySelector<HTMLElement>('[role="dialog"]');

    expect(root?.dataset.visible).toBe('false');
    expect(document.body.textContent).toContain('A-1 Napalm');
    expect(document.body.textContent).toContain('F-4 Bombs');
    expect(document.body.textContent).toContain('AC-47 Orbit');
    expect(document.body.textContent).toContain('Cobra Rocket Run');
    expect(document.body.textContent).toContain('Huey Gunship Strafe');
    // The top-tier Arc Light row renders from the data-driven catalog.
    expect(document.body.textContent).toContain('B-52 Arc Light');
  });

  it('renders a clickable B-52 Arc Light asset row that dispatches a selection', () => {
    const onAssetSelected = vi.fn();
    menu.setCallbacks({ onAssetSelected });
    menu.setVisible(true);

    const arclight = document.querySelector<HTMLButtonElement>('[data-radio-asset="b52_arclight"]');
    expect(arclight).not.toBeNull();
    arclight?.click();

    expect(onAssetSelected).toHaveBeenCalledWith({
      assetId: 'b52_arclight',
      targetMarking: 'smoke',
    });
  });

  it('selects a target mark and asset without dispatching a mission', () => {
    const onAssetSelected = vi.fn();
    menu.setCallbacks({ onAssetSelected });
    menu.setVisible(true);

    document.querySelector<HTMLButtonElement>('[data-radio-marking="willie_pete"]')?.click();
    document.querySelector<HTMLButtonElement>('[data-radio-asset="ac47_orbit"]')?.click();

    expect(onAssetSelected).toHaveBeenCalledWith({
      assetId: 'ac47_orbit',
      targetMarking: 'willie_pete',
    });
    expect(document.body.textContent).toContain('Willie Pete');
    expect(document.body.textContent).toContain('AC-47 Orbit selected');
  });

  it('shows cooldown HUD state and blocks cooling assets', () => {
    const onAssetSelected = vi.fn();
    menu.setCallbacks({ onAssetSelected });
    menu.setCooldowns({ ac47_orbit: 75 });
    menu.setVisible(true);

    const ac47 = document.querySelector<HTMLButtonElement>('[data-radio-asset="ac47_orbit"]');
    const f4 = document.querySelector<HTMLButtonElement>('[data-radio-asset="f4_bombs"]');

    expect(document.body.textContent).toContain(`${ASSET_COUNT - 1}/${ASSET_COUNT} ready`);
    expect(ac47?.disabled).toBe(true);
    expect(ac47?.textContent).toContain('2m');
    expect(f4?.disabled).toBe(false);

    ac47?.click();
    expect(onAssetSelected).not.toHaveBeenCalled();
  });

  it('emits close from the close control', () => {
    const onCloseRequested = vi.fn();
    menu.setCallbacks({ onCloseRequested });
    menu.setVisible(true);

    document.querySelector<HTMLButtonElement>('button')?.click();

    expect(onCloseRequested).toHaveBeenCalledTimes(1);
  });
});
