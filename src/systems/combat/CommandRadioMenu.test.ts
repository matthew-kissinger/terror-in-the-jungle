/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// Behaviour tests for the revived radio dial (cycle-2026-06-29-radio-dial-revival):
// T opens ONE catalog-driven surface listing every fire-support call-in, every
// squad order, direct smoke-armed fire support, and the radio stations. We assert
// what the player can reach and what selecting a sector does — not the DOM
// shape of any single view.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HUDLayout } from '../../ui/layout/HUDLayout';
import { SquadCommand } from './types';
import { CommandInputManager } from './CommandInputManager';
import { getQuickCommandOption, SQUAD_QUICK_COMMAND_OPTIONS } from './SquadCommandPresentation';
import { ViewportManager } from '../../ui/design/responsive';
import {
  AIR_SUPPORT_RADIO_ASSETS,
} from '../airsupport/AirSupportRadioCatalog';
import { RADIO_STATIONS } from '../../config/radioStations';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** The currently-shown dial surface (desktop wheel) is a visible [role="dialog"]. */
function visibleDial(): HTMLElement | null {
  const dialogs = Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]'));
  return dialogs.find((d) => d.dataset.visible === 'true') ?? null;
}

/** Drill into a category on the wheel, then return the dial for sector lookup. */
function focusCategory(categoryId: string): HTMLElement {
  const dial = visibleDial();
  expect(dial, 'expected the radio dial to be open').toBeTruthy();
  dial!.querySelector<HTMLElement>(`[data-radio-category="${categoryId}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true }),
  );
  return dial!;
}

describe('revived radio dial', () => {
  let layout: HUDLayout;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    ViewportManager.resetForTest();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => createCanvasContextStub() as never
    );
    layout = new HUDLayout();
    layout.init();
  });

  function openDial(extra?: (m: CommandInputManager) => void) {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      }),
    } as any);
    extra?.(manager);
    manager.toggleRadioMenu();
    return { controller, manager };
  }

  it('opens a radio surface on T listing every fire-support asset', () => {
    const { manager } = openDial();
    const dial = focusCategory('fire-support');

    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      expect(
        dial.querySelector(`[data-radio-option="${asset.id}"]`),
        `missing fire-support sector for ${asset.id}`,
      ).toBeTruthy();
    }
    expect(AIR_SUPPORT_RADIO_ASSETS.length).toBe(7);

    manager.dispose();
    layout.dispose();
  });

  it('reaches every squad order through the dial', () => {
    const { manager } = openDial();
    const dial = focusCategory('squad');

    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      expect(
        dial.querySelector(`[data-radio-option="slot-${option.slot}"]`),
        `missing squad sector for slot ${option.slot}`,
      ).toBeTruthy();
    }
    expect(SQUAD_QUICK_COMMAND_OPTIONS.length).toBe(6);

    manager.dispose();
    layout.dispose();
  });

  it('selects a fire-support asset as a direct smoke marker action', () => {
    const smoke = createSmokeMarkerStub();
    const heldModes: string[] = [];
    const { manager } = openDial((m) => {
      m.configureHeldEquipment({
        firstPersonWeapon: createWeaponVisibilityStub(true) as any,
        heldEquipment: { setMode: vi.fn((mode: string) => heldModes.push(mode)) } as any,
        smokeMarkerSystem: smoke.system as any,
      });
    });
    const dial = focusCategory('fire-support');
    const asset = AIR_SUPPORT_RADIO_ASSETS[0];

    dial.querySelector<HTMLElement>(`[data-radio-option="${asset.id}"]`)?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(visibleDial()).toBeNull();
    expect(smoke.system.beginThrowMode).toHaveBeenCalledTimes(1);
    expect(heldModes.at(-1)).toBe('smoke-marker');
    expect(document.body.textContent).toContain('SMOKE MARKER ARMED');
    expect(document.body.textContent).not.toContain('Use Active Smoke');
    expect(document.body.textContent).not.toContain('Aim Mark');
    expect(document.body.textContent).not.toContain('Reticle/Grid');

    manager.dispose();
    layout.dispose();
  });

  it('moves station tuning under Signals', () => {
    const { manager } = openDial();
    const dial = focusCategory('signals');

    for (const station of RADIO_STATIONS) {
      expect(
        dial.querySelector(`[data-radio-option="${station.id}"]`),
        `missing station sector for ${station.id}`,
      ).toBeTruthy();
    }

    manager.dispose();
    layout.dispose();
  });

  it('greys a cooling-down fire-support asset so it cannot be called', () => {
    const requestSupport = vi.fn(() => true);
    const { manager } = openDial((m) => {
      // The air-support manager is the cooldown authority: the arclight sortie
      // is cooling down, every other sortie is ready.
      m.setAirSupportManager({
        requestSupport,
        getCooldownRemaining: vi.fn((type: string) => (type === 'arclight' ? 200 : 0)),
      } as any);
      m.setTerrainSystem({ getHeightAt: () => 0 } as any);
      m.setPlayerController(lookController());
    });
    const dial = focusCategory('fire-support');

    // The arclight sector is disabled; clicking it must not launch a sortie.
    dial.querySelector<HTMLElement>('[data-radio-option="b52_arclight"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect(requestSupport).not.toHaveBeenCalled();

    manager.dispose();
    layout.dispose();
  });

  it('still issues squad orders from the same dial', () => {
    const { controller, manager } = openDial((m) => {
      m.setTerrainSystem({ getHeightAt: () => 0 } as any);
      m.setPlayerController(lookController());
    });
    const dial = focusCategory('squad');

    // FOLLOW ME executes immediately (no ground point needed) and closes the dial.
    dial.querySelector<HTMLElement>('[data-radio-option="slot-1"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();
    expect(visibleDial()).toBeNull();

    manager.dispose();
    layout.dispose();
  });

  it('opens even without a squad so fire support stays reachable', () => {
    const controller = createSquadControllerStub({ hasSquad: false, memberCount: 0 });
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      }),
    } as any);

    manager.toggleRadioMenu();
    expect(visibleDial()).toBeTruthy();

    // Fire-support sectors remain enabled; squad sectors are disabled without a squad.
    const fireDial = focusCategory('fire-support');
    expect(
      fireDial.querySelector<HTMLElement>('[data-radio-option="f4_bombs"] .sectorPath, [data-radio-option="f4_bombs"]')
    ).toBeTruthy();

    const squadDial = focusCategory('squad');
    // No-squad: clicking a squad sector issues nothing.
    squadDial.querySelector<HTMLElement>('[data-radio-option="slot-1"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    expect((controller.issueQuickCommand as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();

    manager.dispose();
    layout.dispose();
  });
});

function lookController() {
  return {
    getCamera: () => ({
      getWorldPosition: (v: THREE.Vector3) => v.set(0, 12, 0),
      getWorldDirection: (v: THREE.Vector3) => v.set(0, -0.5, 1).normalize(),
    }),
    getPosition: (v: THREE.Vector3) => v.set(0, 0, 0),
  } as any;
}

function createSquadControllerStub(overrides?: { hasSquad?: boolean; memberCount?: number }) {
  const listeners = new Set<(state: any) => void>();
  let state = {
    hasSquad: overrides?.hasSquad ?? true,
    currentCommand: SquadCommand.NONE,
    isCommandModeOpen: false,
    memberCount: overrides?.memberCount ?? 7,
    commandPosition: undefined,
    selectedSquadId: 'squad-player',
    selectedLeaderId: 'leader-player',
    selectedFormation: 'wedge',
    selectedFaction: 'US',
  };

  return {
    getCommandState: vi.fn(() => state),
    onCommandStateChange: vi.fn((listener: (s: any) => void) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    issueQuickCommand: vi.fn((slot: number) => {
      const option = getQuickCommandOption(slot);
      if (!option) return;
      state = { ...state, currentCommand: option.command };
      listeners.forEach((l) => l(state));
    }),
    issueCommandAtPosition: vi.fn((command: SquadCommand, position: THREE.Vector3) => {
      state = { ...state, currentCommand: command, commandPosition: position as never };
      listeners.forEach((l) => l(state));
    }),
    selectSquad: vi.fn(() => true),
    getPlayerSquadId: vi.fn(() => state.selectedSquadId),
  };
}

function createSmokeMarkerStub() {
  let hook: ((reason: 'cancelled' | 'thrown') => void) | undefined;
  const system = {
    setThrowModeEndHook: vi.fn((cb: (reason: 'cancelled' | 'thrown') => void) => {
      hook = cb;
    }),
    beginThrowMode: vi.fn(),
    cancelThrowMode: vi.fn(() => {
      hook?.('cancelled');
      return true;
    }),
    isHandlingInput: vi.fn(() => true),
    getActiveMark: vi.fn(() => null),
    clearActiveMark: vi.fn(),
  };
  return { system };
}

function createWeaponVisibilityStub(visible: boolean) {
  return {
    getWeaponPresentationState: vi.fn(() => ({ requestedVisible: visible })),
    setWeaponVisibility: vi.fn(),
  };
}

function createCanvasContextStub() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    closePath: vi.fn(),
  };
}
