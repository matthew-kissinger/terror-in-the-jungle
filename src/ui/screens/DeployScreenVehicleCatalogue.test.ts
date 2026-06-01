/**
 * @vitest-environment jsdom
 *
 * Behaviour test for the live wiring between the per-mode crewable-vehicle
 * catalogue (`getVehicleDeployOptionsForMode`) and the deploy screen's
 * "CREW A VEHICLE" panel.
 *
 * `DeployScreenVehicleOptions.test.ts` already covers the panel's DOM
 * behaviour with hand-built options. The distinct thing verified here is that
 * feeding the real per-mode catalogue (the same call the deploy flow makes)
 * surfaces the M48 choice for Open Frontier and leaves the panel hidden for a
 * mode that has no crewable vehicle (Team Deathmatch). This guards the
 * discoverability seam that was shipped UI-only and previously never fed.
 */
import { beforeEach, describe, it, expect } from 'vitest';
import { DeployScreen } from './DeployScreen';
import { GameMode } from '../../config/gameModeTypes';
import { getVehicleDeployOptionsForMode } from '../loadout/LoadoutTypes';

describe('DeployScreen fed by the per-mode vehicle catalogue', () => {
  let screen: DeployScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new DeployScreen();
  });

  it('shows the M48 crew choice for Open Frontier', () => {
    screen.updateVehicleDeployOptions(getVehicleDeployOptionsForMode(GameMode.OPEN_FRONTIER));

    const panel = document.getElementById('respawn-vehicle-options-panel')!;
    expect(panel.style.display).not.toBe('none');

    const choices = document.querySelectorAll('#respawn-vehicle-options [data-vehicle-id]');
    expect(choices).toHaveLength(1);
    expect(document.querySelector("[data-vehicle-id='m48_tank_of_us_fob']")).toBeTruthy();
  });

  it('keeps the vehicle panel hidden for Team Deathmatch (no crewable vehicle)', () => {
    screen.updateVehicleDeployOptions(getVehicleDeployOptionsForMode(GameMode.TEAM_DEATHMATCH));

    const panel = document.getElementById('respawn-vehicle-options-panel')!;
    expect(panel.style.display).toBe('none');
    expect(document.querySelectorAll('#respawn-vehicle-options [data-vehicle-id]')).toHaveLength(0);
  });
});
