/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MatchEndScreen, MatchStats } from './MatchEndScreen';
import { Faction } from '../../systems/combat/types';
import { GameState } from '../../systems/world/TicketSystem';

function makeStats(overrides: Partial<MatchStats> = {}): MatchStats {
  return {
    kills: 10,
    deaths: 3,
    assists: 5,
    zonesCaptured: 2,
    matchDuration: 300,
    usTickets: 150,
    opforTickets: 0,
    usTeamKills: 80,
    usTeamDeaths: 40,
    opforTeamKills: 40,
    opforTeamDeaths: 80,
    headshots: 4,
    damageDealt: 5000,
    accuracy: 0.45,
    longestKill: 120,
    grenadesThrown: 5,
    grenadeKills: 2,
    bestKillStreak: 5,
    shotsFired: 200,
    shotsHit: 90,
    ...overrides,
  };
}

function makeGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameActive: false,
    winner: Faction.US,
    matchDuration: 300,
    phase: 'ENDED',
    isTDM: false,
    ...overrides,
  };
}

describe('MatchEndScreen', () => {
  let screen: MatchEndScreen;

  beforeEach(() => {
    document.body.innerHTML = '';
    screen = new MatchEndScreen();
  });

  it('show() adds end screen to the DOM', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    const container = document.querySelector('.screen');
    expect(container).toBeTruthy();
  });

  it('shows VICTORY when US wins', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    const title = document.querySelector('.title');
    expect(title?.textContent).toBe('VICTORY');
    expect(document.querySelector('.screen.victory')).toBeTruthy();
  });

  it('shows DEFEAT when OPFOR wins', () => {
    screen.show(Faction.OPFOR, makeGameState({ winner: Faction.OPFOR }), makeStats());
    const title = document.querySelector('.title');
    expect(title?.textContent).toBe('DEFEAT');
    expect(document.querySelector('.screen.defeat')).toBeTruthy();
  });

  it('creates Play Again and Return to Menu buttons', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    const playAgainBtn = document.querySelector('[data-ref="playAgain"]') as HTMLButtonElement;
    const returnBtn = document.querySelector('[data-ref="return"]') as HTMLButtonElement;
    expect(playAgainBtn).toBeTruthy();
    expect(returnBtn).toBeTruthy();
    expect(playAgainBtn.textContent).toBe('Play Again');
    expect(returnBtn.textContent).toBe('Return to Menu');
  });

  it('Play Again button triggers callback on click', () => {
    const callback = vi.fn();
    screen.onPlayAgain(callback);
    screen.show(Faction.US, makeGameState(), makeStats());

    const btn = document.querySelector('[data-ref="playAgain"]') as HTMLButtonElement;
    btn.click();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('Return to Menu button triggers callback on click', () => {
    const callback = vi.fn();
    screen.onReturnToMenu(callback);
    screen.show(Faction.US, makeGameState(), makeStats());

    const btn = document.querySelector('[data-ref="return"]') as HTMLButtonElement;
    btn.click();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('Play Again falls back to page reload when no callback set', () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });

    screen.show(Faction.US, makeGameState(), makeStats());
    const btn = document.querySelector('[data-ref="playAgain"]') as HTMLButtonElement;
    btn.click();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('hide() removes the end screen from the DOM', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    expect(document.querySelector('.screen')).toBeTruthy();

    screen.hide();
    expect(document.querySelector('.screen')).toBeNull();
  });

  it('show() replaces any existing end screen', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    screen.show(Faction.OPFOR, makeGameState({ winner: Faction.OPFOR }), makeStats());
    const containers = document.querySelectorAll('.screen');
    expect(containers).toHaveLength(1);
    expect(document.querySelector('.title')?.textContent).toBe('DEFEAT');
  });

  it('displays player stats correctly', () => {
    screen.show(Faction.US, makeGameState(), makeStats({ kills: 15, deaths: 5, assists: 7 }));
    const statValues = document.querySelectorAll('.statValue');
    const texts = Array.from(statValues).map((el) => el.textContent?.trim());
    // Should include kills: 15, assists: 7, deaths: 5
    expect(texts).toContain('15');
    expect(texts).toContain('7');
    expect(texts).toContain('5');
  });

  it('shows ticket labels for non-TDM modes', () => {
    screen.show(Faction.US, makeGameState({ isTDM: false }), makeStats());
    const factionNames = document.querySelectorAll('.factionName');
    const texts = Array.from(factionNames).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('Tickets'))).toBe(true);
  });

  it('shows kills labels for TDM mode', () => {
    screen.show(Faction.US, makeGameState({ isTDM: true }), makeStats());
    const factionNames = document.querySelectorAll('.factionName');
    const texts = Array.from(factionNames).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('Kills'))).toBe(true);
  });

  it('hides zones captured in TDM mode', () => {
    screen.show(Faction.US, makeGameState({ isTDM: true }), makeStats());
    const labels = document.querySelectorAll('.statLabel');
    const texts = Array.from(labels).map((el) => el.textContent);
    expect(texts).not.toContain('Zones Captured');
  });

  it('shows zones captured in non-TDM mode', () => {
    screen.show(Faction.US, makeGameState({ isTDM: false }), makeStats());
    const labels = document.querySelectorAll('.statLabel');
    const texts = Array.from(labels).map((el) => el.textContent);
    expect(texts).toContain('Zones Captured');
  });

  it('shows awards when earned', () => {
    screen.show(Faction.US, makeGameState(), makeStats({ bestKillStreak: 5, accuracy: 0.5 }));
    const awardNames = document.querySelectorAll('.awardName');
    const texts = Array.from(awardNames).map((el) => el.textContent);
    expect(texts).toContain('Kill Streak');
    expect(texts).toContain('Sharpshooter');
  });

  it('does not show awards section when none earned', () => {
    screen.show(
      Faction.US,
      makeGameState(),
      makeStats({
        bestKillStreak: 1,
        accuracy: 0.1,
        longestKill: 10,
        grenadeKills: 0,
        deaths: 5,
      }),
    );
    expect(document.querySelector('.awardsSection')).toBeNull();
  });

  it('screen root has the correct CSS module class', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    const container = document.querySelector('.screen') as HTMLElement;
    expect(container).toBeTruthy();
    expect(container.classList.contains('screen')).toBe(true);
  });

  it('buttons are present and interactive', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    const playBtn = document.querySelector('[data-ref="playAgain"]') as HTMLButtonElement;
    const returnBtn = document.querySelector('[data-ref="return"]') as HTMLButtonElement;
    expect(playBtn.tagName).toBe('BUTTON');
    expect(returnBtn.tagName).toBe('BUTTON');
  });

  it('dispose cleans up the DOM', () => {
    screen.show(Faction.US, makeGameState(), makeStats());
    screen.dispose();
    expect(document.querySelector('.screen')).toBeNull();
  });
});
