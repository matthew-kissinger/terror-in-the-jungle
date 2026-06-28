/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

// Behaviour tests for the unified radio menu (radio-command-menu): T opens one
// surface that lists every fire-support call-in AND every squad order. We assert
// what the player sees and what selecting a row does — not the DOM shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HUDLayout } from '../../ui/layout/HUDLayout';
import { Faction, SquadCommand } from './types';
import { CommandInputManager } from './CommandInputManager';
import { getQuickCommandOption, SQUAD_QUICK_COMMAND_OPTIONS } from './SquadCommandPresentation';
import { ViewportManager } from '../../ui/design/responsive';
import {
  AIR_SUPPORT_RADIO_ASSETS,
  AIR_SUPPORT_TARGET_MARKINGS,
} from '../airsupport/AirSupportRadioCatalog';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

describe('unified radio + squad command menu', () => {
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

  function openMenu(extra?: (m: CommandInputManager) => void) {
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

  it('lists all seven fire-support assets when opened with T', () => {
    const { manager } = openMenu();

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('true');

    for (const asset of AIR_SUPPORT_RADIO_ASSETS) {
      const row = overlay?.querySelector(`[data-radio-asset="${asset.id}"]`);
      expect(row, `missing fire-support row for ${asset.id}`).toBeTruthy();
      // CSS uppercases the label visually; the text node keeps the catalog label.
      expect(overlay?.textContent).toContain(asset.label);
    }
    expect(AIR_SUPPORT_RADIO_ASSETS.length).toBe(7);

    manager.dispose();
    layout.dispose();
  });

  it('lists all six squad orders with their plain-language effect', () => {
    const { manager } = openMenu();

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    for (const option of SQUAD_QUICK_COMMAND_OPTIONS) {
      const button = overlay?.querySelector(`[data-action="slot-${option.slot}"]`);
      expect(button, `missing squad row for slot ${option.slot}`).toBeTruthy();
      expect(overlay?.textContent).toContain(option.effect);
    }
    expect(SQUAD_QUICK_COMMAND_OPTIONS.length).toBe(6);

    manager.dispose();
    layout.dispose();
  });

  it('offers the smoke / WP / grid mark modes', () => {
    const { manager } = openMenu();

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    for (const marking of AIR_SUPPORT_TARGET_MARKINGS) {
      expect(overlay?.querySelector(`[data-radio-marking="${marking.id}"]`)).toBeTruthy();
    }

    manager.dispose();
    layout.dispose();
  });

  it('shows a ready / cooling-down state per asset cooldown', () => {
    const { manager } = openMenu((m) => m.setRadioCooldowns({ b52_arclight: 200 }));

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    expect(
      overlay?.querySelector<HTMLButtonElement>('[data-radio-asset="b52_arclight"]')?.disabled
    ).toBe(true);
    expect(
      overlay?.querySelector<HTMLButtonElement>('[data-radio-asset="a1_napalm"]')?.disabled
    ).toBe(false);
    expect(overlay?.textContent).toContain(`${AIR_SUPPORT_RADIO_ASSETS.length - 1}/${AIR_SUPPORT_RADIO_ASSETS.length} ready`);

    manager.dispose();
    layout.dispose();
  });

  it('drives the existing requestSupport path when a fire-support asset is selected', () => {
    const requestSupport = vi.fn(() => true);
    const { manager } = openMenu((m) => {
      m.setAirSupportManager({
        requestSupport,
        getCooldownRemaining: vi.fn(() => 0),
      } as any);
      m.setTerrainSystem({ getHeightAt: () => 0 } as any);
      m.setPlayerController({
        getCamera: () => ({
          getWorldPosition: (v: THREE.Vector3) => v.set(0, 12, 0),
          getWorldDirection: (v: THREE.Vector3) => v.set(0, -0.5, 1).normalize(),
        }),
        getPosition: (v: THREE.Vector3) => v.set(0, 0, 0),
      } as any);
    });

    document.body
      .querySelector<HTMLButtonElement>('[data-radio-asset="cobra_rocket_run"]')
      ?.click();

    expect(requestSupport).toHaveBeenCalledTimes(1);
    const request = requestSupport.mock.calls[0][0];
    expect(request.type).toBe('rocket_run'); // cobra run fulfils via the rocket_run sortie
    expect(request.requesterFaction).toBe(Faction.US); // called strikes spare friendlies
    expect(request.targetPosition).toBeInstanceOf(THREE.Vector3);
    // The menu closes after a launched strike.
    expect(
      document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible
    ).toBe('false');

    manager.dispose();
    layout.dispose();
  });

  it('still issues squad orders from the same menu', () => {
    const { controller, manager } = openMenu();

    // FOLLOW ME executes immediately (no ground point needed) and closes the menu.
    document.body.querySelector<HTMLButtonElement>('[data-action="slot-1"]')?.click();

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();
    expect(
      document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible
    ).toBe('false');

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

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('true');
    // Fire-support rows remain clickable; squad rows are disabled without a squad.
    expect(
      overlay?.querySelector<HTMLButtonElement>('[data-radio-asset="f4_bombs"]')?.disabled
    ).toBe(false);
    expect(
      overlay?.querySelector<HTMLButtonElement>('[data-action="slot-1"]')?.disabled
    ).toBe(true);

    manager.dispose();
    layout.dispose();
  });
});

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
