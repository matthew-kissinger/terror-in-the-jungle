import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DeployFlowController } from './DeployFlowController';
import { GameMode } from '../../config/gameModeTypes';
import type { DeploySessionModel } from '../world/runtime/DeployFlowSession';

const session: DeploySessionModel = {
  kind: 'initial',
  mode: GameMode.ZONE_CONTROL,
  modeName: 'Zone Control',
  modeDescription: 'desc',
  flow: 'standard',
  mapVariant: 'zones',
  flowLabel: 'Frontline deployment',
  headline: 'BATTLEFIELD INSERTION',
  subheadline: 'Choose a starting position before the match goes live.',
  mapTitle: 'TACTICAL MAP - SELECT DEPLOYMENT',
  selectedSpawnTitle: 'SELECTED SPAWN POINT',
  emptySelectionText: 'Select a spawn point on the map',
  readySelectionText: 'Ready to deploy',
  countdownLabel: 'Deployment available in',
  readyLabel: 'Ready for deployment',
  actionLabel: 'DEPLOY',
  secondaryActionLabel: 'BACK TO MODE SELECT',
  allowSpawnSelection: true,
  allowLoadoutEditing: true,
  sequenceTitle: 'Deployment Checklist',
  sequenceSteps: ['step 1', 'step 2'],
};

describe('DeployFlowController', () => {
  it('tracks open state and resolves initial deploy promises on confirm', async () => {
    const controller = new DeployFlowController();
    const openUi = vi.fn(() => controller.open('initial', session));
    const deployPromise = controller.beginInitialDeploy(openUi);

    expect(openUi).toHaveBeenCalledTimes(1);
    expect(controller.getState().visible).toBe(true);

    const target = new THREE.Vector3(1, 2, 3);
    expect(controller.confirm(target)).toBe('initial');
    await expect(deployPromise).resolves.toEqual(target);
    expect(controller.getState().visible).toBe(false);
  });

  it('cancels initial deploy flows and rejects the pending promise', async () => {
    const controller = new DeployFlowController();
    const openUi = vi.fn(() => controller.open('initial', session));
    const deployPromise = controller.beginInitialDeploy(openUi);

    expect(controller.cancelInitialDeploy(new Error('cancelled'))).toBe(true);
    await expect(deployPromise).rejects.toThrow('cancelled');
    expect(controller.getState().visible).toBe(false);
  });
});
