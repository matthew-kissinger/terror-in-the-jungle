import { describe, expect, it } from 'vitest';
import { getGameModeDefinition } from '../../../config/gameModeDefinitions';
import { GameMode } from '../../../config/gameModeTypes';
import { createDeploySession } from './DeployFlowSession';

describe('createDeploySession', () => {
  it('builds frontier menu copy from mode policy', () => {
    const session = createDeploySession(
      getGameModeDefinition(GameMode.OPEN_FRONTIER),
      'menu'
    );

    expect(session.flow).toBe('frontier');
    expect(session.flowLabel).toBe('Frontier insertion');
    expect(session.headline).toBe('OPEN FRONTIER');
    expect(session.actionLabel).toBe('STAGE INSERTION');
    expect(session.sequenceTitle).toBe('Launch Sequence');
    expect(session.subheadline).toContain('helipads');
    expect(session.sequenceSteps[0]).toContain('frontier battlefield');
  });

  it('builds air-assault respawn copy from mode policy', () => {
    const session = createDeploySession(
      getGameModeDefinition(GameMode.A_SHAU_VALLEY),
      'respawn'
    );

    expect(session.flow).toBe('air_assault');
    expect(session.headline).toBe('AIR ASSAULT REINSERTION');
    expect(session.selectedSpawnTitle).toBe('SELECTED INSERTION ZONE');
    expect(session.actionLabel).toBe('REINSERT');
    expect(session.secondaryActionLabel).toBeNull();
    expect(session.allowLoadoutEditing).toBe(true);
    expect(session.readyLabel).toBe('Ready for reinsertion');
    expect(session.countdownLabel).toBe('Reinsertion available in');
    expect(session.sequenceTitle).toBe('Redeploy Checklist');
  });

  it('builds initial deploy copy from mode policy', () => {
    const session = createDeploySession(
      getGameModeDefinition(GameMode.A_SHAU_VALLEY),
      'initial'
    );

    expect(session.headline).toBe('AIR ASSAULT STAGING');
    expect(session.actionLabel).toBe('INSERT');
    expect(session.secondaryActionLabel).toBe('BACK TO MODE SELECT');
    expect(session.allowLoadoutEditing).toBe(true);
    expect(session.sequenceSteps[0]).toContain('insertion zone');
  });

  it('builds kill-race deploy copy for team deathmatch', () => {
    const session = createDeploySession(
      getGameModeDefinition(GameMode.TEAM_DEATHMATCH),
      'respawn'
    );

    expect(session.mapTitle).toBe('COMBAT MAP - SELECT SPAWN');
    expect(session.selectedSpawnTitle).toBe('SELECTED COMBAT SPAWN');
    expect(session.readySelectionText).toBe('Combat spawn confirmed');
    expect(session.readyLabel).toBe('Ready for combat redeploy');
  });
});
