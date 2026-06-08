/**
 * @vitest-environment jsdom
 *
 * Behaviour tests for the deploy screen's "crew a vehicle" section.
 *
 * Caller-visible behaviour we care about:
 *  - With no crewable vehicles, the section is hidden so the deploy
 *    screen looks unchanged.
 *  - With crewable vehicles, each one renders as a selectable choice
 *    and choosing it fires the deploy callback with the vehicle id.
 *  - The choice surfaces the controls hint so a first-time player learns
 *    how to crew the tank without leaving the deploy screen.
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DeployScreen } from './DeployScreen';
import { Faction } from '../../systems/combat/types';
import type { VehicleDeployOption } from '../loadout/LoadoutTypes';

function tankOption(overrides: Partial<VehicleDeployOption> = {}): VehicleDeployOption {
  return {
    id: 'm48_tank_alpha',
    name: 'M48 Patton',
    classLabel: 'ARMOR',
    description: 'Crew the M48.',
    position: { x: 10, z: -20 },
    faction: Faction.US,
    controlsHint: 'E enter / exit  -  F board / swap  -  W/S drive  -  A/D turn  -  LMB fire',
    ...overrides,
  };
}

describe('DeployScreen crew-a-vehicle section', () => {
  let screen: DeployScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new DeployScreen();
  });

  it('hides the vehicle section when no crewable vehicles exist', () => {
    screen.updateVehicleDeployOptions([]);

    const panel = document.getElementById('respawn-vehicle-options-panel')!;
    expect(panel.style.display).toBe('none');
    expect(document.querySelectorAll('#respawn-vehicle-options [data-vehicle-id]')).toHaveLength(0);
  });

  it('renders a selectable choice for each crewable vehicle', () => {
    screen.updateVehicleDeployOptions([
      tankOption({ id: 'm48_a', name: 'M48 Patton' }),
      tankOption({ id: 'm48_b', name: 'M48 Bravo' }),
    ]);

    const panel = document.getElementById('respawn-vehicle-options-panel')!;
    expect(panel.style.display).not.toBe('none');

    const choices = document.querySelectorAll('#respawn-vehicle-options [data-vehicle-id]');
    expect(choices).toHaveLength(2);
    expect(document.querySelector('[aria-label="ARMOR M48 Patton"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="ARMOR M48 Bravo"]')).toBeTruthy();
  });

  it('places crewable vehicles before the spawn list for discoverability', () => {
    screen.updateVehicleDeployOptions([tankOption()]);

    const insertionView = document.getElementById('respawn-insertion-view')!;
    const sectionIds = Array.from(insertionView.children).map((child) => child.id);

    expect(sectionIds.indexOf('respawn-vehicle-options-panel')).toBeLessThan(
      sectionIds.indexOf('respawn-spawn-options-panel'),
    );
  });

  it('fires the deploy callback with the chosen vehicle id', () => {
    const onSelect = vi.fn();
    screen.setVehicleDeployOptionCallback(onSelect);
    screen.updateVehicleDeployOptions([tankOption({ id: 'm48_a', name: 'M48 Patton' })]);

    document.querySelector('[aria-label="ARMOR M48 Patton"]')!
      .dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith('m48_a', 'M48 Patton');
  });

  it('surfaces the controls hint on the choice', () => {
    screen.updateVehicleDeployOptions([
      tankOption({ controlsHint: 'E enter / exit  -  F board / swap  -  W/S drive  -  A/D turn  -  LMB fire' }),
    ]);

    const choice = document.querySelector('[aria-label="ARMOR M48 Patton"]')!;
    expect(choice.textContent).toContain('E enter');
    expect(choice.textContent).toContain('W/S drive');
    expect(choice.textContent).toContain('board / swap');
  });

  it('marks the selected vehicle as pressed for accessibility', () => {
    screen.updateVehicleDeployOptions(
      [tankOption({ id: 'm48_a' }), tankOption({ id: 'm48_b', name: 'M48 Bravo' })],
      'm48_b',
    );

    const selected = document.querySelector('[aria-label="ARMOR M48 Bravo"]')!;
    const other = document.querySelector('[aria-label="ARMOR M48 Patton"]')!;
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(other.getAttribute('aria-pressed')).toBe('false');
  });
});
