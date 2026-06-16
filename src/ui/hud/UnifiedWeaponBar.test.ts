/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedWeaponBar } from './UnifiedWeaponBar';

const DEFAULT_LAYOUT = [
  { enabled: true, shortLabel: 'SG', fullLabel: 'Shotgun' },
  { enabled: true, shortLabel: 'GRN', fullLabel: 'Grenade' },
  { enabled: true, shortLabel: 'AR', fullLabel: 'Rifle' },
  { enabled: true, shortLabel: 'SB', fullLabel: 'Sandbag' },
  { enabled: true, shortLabel: 'SMG', fullLabel: 'SMG' },
  { enabled: true, shortLabel: 'PST', fullLabel: 'Pistol' },
];

describe('UnifiedWeaponBar', () => {
  let bar: UnifiedWeaponBar;
  let parent: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    bar = new UnifiedWeaponBar();
    bar.mount(parent);
  });

  afterEach(() => {
    bar.dispose();
    vi.restoreAllMocks();
  });

  function slots(): HTMLElement[] {
    return Array.from(parent.querySelectorAll<HTMLElement>('.uwb-slot'));
  }

  function iconContainer(index: number): HTMLElement {
    const element = slots()[index].querySelector<HTMLElement>('.uwb-icon');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  }

  it('renders six weapon slots with slot three active by default', () => {
    expect(slots()).toHaveLength(6);
    expect(slots()[2].classList.contains('uwb-slot--active')).toBe(true);
  });

  it('does not rebuild unchanged slot icon nodes on repeated layout updates', () => {
    bar.setSlotDefinitions(DEFAULT_LAYOUT);
    const arIcon = iconContainer(2).firstChild;
    const smgIcon = iconContainer(4).firstChild;

    bar.setSlotDefinitions(DEFAULT_LAYOUT);
    bar.setSlotDefinitions(DEFAULT_LAYOUT);

    expect(iconContainer(2).firstChild).toBe(arIcon);
    expect(iconContainer(4).firstChild).toBe(smgIcon);
  });

  it('updates only changed slot icon content when a label changes', () => {
    bar.setSlotDefinitions(DEFAULT_LAYOUT);
    const shotgunIcon = iconContainer(0).firstChild;
    const rifleIcon = iconContainer(2).firstChild;
    const nextLayout = DEFAULT_LAYOUT.map((slot) => ({ ...slot }));
    nextLayout[2] = { enabled: true, shortLabel: 'LMG', fullLabel: 'LMG' };

    bar.setSlotDefinitions(nextLayout);

    expect(iconContainer(0).firstChild).toBe(shotgunIcon);
    expect(iconContainer(2).firstChild).not.toBe(rifleIcon);
    expect(slots()[2].title).toBe('LMG');
  });

  it('moves active selection to the first enabled slot if the active slot is disabled', () => {
    const layout = DEFAULT_LAYOUT.map((slot) => ({ ...slot }));
    layout[0].enabled = false;
    layout[1].enabled = false;
    layout[2].enabled = false;

    bar.setSlotDefinitions(layout);

    expect(slots()[2].classList.contains('uwb-slot--active')).toBe(false);
    expect(slots()[3].classList.contains('uwb-slot--active')).toBe(true);
    expect(slots()[2].style.display).toBe('none');
    expect(slots()[2].classList.contains('uwb-slot--disabled')).toBe(true);
  });

  it('updates active classes only for previous and next slots on direct active changes', () => {
    const toggles = slots().map((slot) => vi.spyOn(slot.classList, 'toggle'));

    bar.setActiveSlot(4);

    expect(slots()[2].classList.contains('uwb-slot--active')).toBe(false);
    expect(slots()[4].classList.contains('uwb-slot--active')).toBe(true);
    expect(toggles[0]).not.toHaveBeenCalled();
    expect(toggles[1]).not.toHaveBeenCalled();
    expect(toggles[2]).toHaveBeenCalledWith('uwb-slot--active', false);
    expect(toggles[3]).not.toHaveBeenCalled();
    expect(toggles[4]).toHaveBeenCalledWith('uwb-slot--active', true);
    expect(toggles[5]).not.toHaveBeenCalled();
  });
});
