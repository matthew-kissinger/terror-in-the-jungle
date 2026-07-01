/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger


import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GameEventBus, type TargetMark } from '../../core/GameEventBus';
import { HUDLayout } from '../../ui/layout/HUDLayout';
import { SquadCommand, Faction } from './types';
import { CommandInputManager } from './CommandInputManager';
import { getQuickCommandOption } from './SquadCommandPresentation';
import { ViewportManager } from '../../ui/design/responsive';
import { AIR_SUPPORT_RADIO_ASSETS } from '../airsupport/AirSupportRadioCatalog';

const RADIO_ASSET_COUNT = AIR_SUPPORT_RADIO_ASSETS.length;

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

describe('CommandInputManager', () => {
  let layout: HUDLayout;
  let canvasContext: ReturnType<typeof createCanvasContextStub>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    GameEventBus.clear();
    ViewportManager.resetForTest();
    canvasContext = createCanvasContextStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => canvasContext as never);
    layout = new HUDLayout();
    layout.init();
  });

  it('mounts the command overlay as a body-level modal', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);

    manager.mountTo(layout);

    expect(document.body.querySelector('.command-mode-overlay')).toBeTruthy();
    expect(document.body.querySelector('[role="dialog"]')).toBeTruthy();
    expect(layout.getSlot('center').querySelector('.command-mode-overlay')).toBeNull();

    manager.dispose();
    layout.dispose();
  });

  it('calls TouchControls modal overlay hooks when opening and closing squad UI', () => {
    const begin = vi.fn();
    const end = vi.fn();
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => ({ beginModalOverlays: begin, endModalOverlays: end }),
      onInputModeChange: vi.fn((cb) => {
        cb('touch');
        return () => {};
      }),
    } as any);

    manager.toggleCommandMode();
    expect(begin).toHaveBeenCalledTimes(1);

    manager.handleCancel();
    expect(end).toHaveBeenCalledTimes(1);

    manager.dispose();
    layout.dispose();
  });

  it('opens the map-first overlay for gamepad', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('gamepad');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');

    expect(overlay?.dataset.visible).toBe('true');

    manager.dispose();
    layout.dispose();
  });

  it('opens the command overlay for keyboard/touch and closes on cancel', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    const unlockPointer = vi.fn();
    const relockPointer = vi.fn();
    manager.bindInputManager({
      unlockPointer,
      relockPointer,
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('true');
    expect(unlockPointer).toHaveBeenCalledTimes(1);

    manager.handleCancel();
    expect(overlay?.dataset.visible).toBe('false');
    expect(relockPointer).toHaveBeenCalledTimes(1);

    manager.dispose();
    layout.dispose();
  });

  it('opens the shared radio dial from the squad overlay without issuing a squad command', () => {
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
      })
    } as any);

    manager.toggleCommandMode();
    document.body.querySelector<HTMLButtonElement>('.command-mode-overlay__radio')?.click();

    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');
    const dial = visibleDialog();
    expect(dial?.dataset.visible).toBe('true');
    expect(dial?.querySelector('[data-radio-category="fire-support"]')).toBeTruthy();
    expect(dial?.querySelector('[data-radio-category="squad"]')).toBeTruthy();
    expect(dial?.querySelector('[data-radio-category="signals"]')).toBeTruthy();
    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();

    manager.dispose();
    layout.dispose();
  });

  it('opens the radio dial on T and greys a cooling-down fire-support asset', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    const relockPointer = vi.fn();
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer,
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    const requestSupport = vi.fn(() => true);
    // The air-support manager is the cooldown authority: the spooky sortie (which
    // the AC-47 orbit fulfils) is cooling down; every other sortie is ready.
    manager.setAirSupportManager({
      requestSupport,
      getCooldownRemaining: vi.fn((type: string) => (type === 'spooky' ? 75 : 0)),
    } as any);
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);
    manager.setPlayerController(lookDownController());
    // T opens the revived dial: one surface for fire support AND squad orders.
    manager.toggleRadioMenu();

    const dial = visibleDialog();
    expect(dial?.dataset.visible).toBe('true');
    drillCategory(dial!, 'fire-support');
    // The cooling-down asset's sector cannot launch a sortie.
    clickSector(dial!, 'ac47_orbit');
    expect(requestSupport).not.toHaveBeenCalled();
    expect(RADIO_ASSET_COUNT).toBe(7);

    expect(manager.handleCancel()).toBe(true);
    expect(visibleDialog()).toBeNull();
    expect(relockPointer).toHaveBeenCalledTimes(1);

    manager.dispose();
    layout.dispose();
  });

  it('drills fire support into target methods without issuing a squad command', () => {
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
      })
    } as any);

    manager.toggleRadioMenu();
    const dial = visibleDialog()!;
    drillCategory(dial, 'fire-support');
    clickSector(dial, 'ac47_orbit');

    // Fire support now drills into target methods before any strike is armed.
    expect(visibleDialog()).not.toBeNull();
    expect(dial.querySelector('[data-radio-option="ac47_orbit:reticle-grid"]')).toBeTruthy();
    expect(dial.querySelector('[data-radio-option="ac47_orbit:throw-smoke-marker"]')).toBeTruthy();
    expect(dial.textContent).toContain('Aim Mark');
    expect(dial.textContent).toContain('Use Active Smoke');
    expect(dial.textContent).not.toContain('Reticle/Grid');
    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();

    manager.dispose();
    layout.dispose();
  });

  it('arms smoke marker equipment with a visible prompt without calling support', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    const smoke = createSmokeMarkerStub();
    const weapon = createWeaponVisibilityStub(true);
    const heldModes: string[] = [];
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);
    const requestSupport = vi.fn(() => true);
    manager.setAirSupportManager({ requestSupport, getCooldownRemaining: vi.fn(() => 0) } as any);
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);
    manager.setPlayerController(lookDownController());
    manager.configureHeldEquipment({
      firstPersonWeapon: weapon as any,
      heldEquipment: { setMode: vi.fn((mode: string) => heldModes.push(mode)) } as any,
      smokeMarkerSystem: smoke.system as any,
    });

    manager.toggleRadioMenu();
    const dial = visibleDialog()!;
    drillCategory(dial, 'fire-support');
    clickSector(dial, 'a1_napalm');
    clickSector(dial, 'a1_napalm:throw-smoke-marker');

    expect(visibleDialog()).toBeNull();
    expect(smoke.system.beginThrowMode).toHaveBeenCalledTimes(1);
    expect(heldModes.at(-1)).toBe('smoke-marker');
    expect(weapon.setWeaponVisibility).toHaveBeenCalledWith(false);
    expect(requestSupport).not.toHaveBeenCalled();
    expect(document.body.querySelector<HTMLElement>('[aria-live="polite"]')?.getAttribute('aria-hidden')).toBe('false');
    expect(document.body.textContent).toContain('SMOKE MARKER ARMED');
    expect(document.body.textContent).toContain('A-1 NAPALM');

    expect(manager.handleCancel()).toBe(true);
    expect(smoke.system.cancelThrowMode).toHaveBeenCalledTimes(1);
    expect(heldModes.at(-1)).toBe('none');
    expect(weapon.setWeaponVisibility).toHaveBeenLastCalledWith(true);
    expect(document.body.querySelector<HTMLElement>('[aria-live="polite"]')?.getAttribute('aria-hidden')).toBe('true');

    manager.dispose();
    layout.dispose();
  });

  it('pressing radio while smoke is armed cancels the throw and returns to that mission target choices', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    const smoke = createSmokeMarkerStub();
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);
    manager.setAirSupportManager({ requestSupport: vi.fn(() => true), getCooldownRemaining: vi.fn(() => 0) } as any);
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);
    manager.setPlayerController(lookDownController());
    manager.configureHeldEquipment({
      firstPersonWeapon: createWeaponVisibilityStub(true) as any,
      heldEquipment: { setMode: vi.fn() } as any,
      smokeMarkerSystem: smoke.system as any,
    });

    manager.toggleRadioMenu();
    const dial = visibleDialog()!;
    drillCategory(dial, 'fire-support');
    clickSector(dial, 'a1_napalm');
    clickSector(dial, 'a1_napalm:throw-smoke-marker');

    manager.toggleRadioMenu();

    const reopened = visibleDialog();
    expect(reopened).not.toBeNull();
    expect(smoke.system.cancelThrowMode).toHaveBeenCalledTimes(1);
    expect(reopened?.querySelector('[data-radio-option="a1_napalm:throw-smoke-marker"]')).toBeTruthy();
    expect(reopened?.querySelector('[data-radio-option="a1_napalm:reticle-grid"]')).toBeTruthy();
    expect(reopened?.textContent).toContain('Aim Mark');

    manager.dispose();
    layout.dispose();
  });

  it('calls the selected asset on a settled smoke marker after throw mode ends', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    const smoke = createSmokeMarkerStub();
    const requestSupport = vi.fn(() => true);
    const mark: TargetMark = {
      id: 'smoke-marker-test',
      kind: 'smoke-marker',
      position: new THREE.Vector3(36, 0, 84),
      createdAt: 1,
      source: 'player',
    };
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);
    manager.setAirSupportManager({ requestSupport, getCooldownRemaining: vi.fn(() => 0) } as any);
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);
    manager.setPlayerController(lookDownController());
    manager.configureHeldEquipment({
      firstPersonWeapon: createWeaponVisibilityStub(true) as any,
      heldEquipment: { setMode: vi.fn() } as any,
      smokeMarkerSystem: smoke.system as any,
    });

    manager.toggleRadioMenu();
    const dial = visibleDialog()!;
    drillCategory(dial, 'fire-support');
    clickSector(dial, 'b52_arclight');
    clickSector(dial, 'b52_arclight:throw-smoke-marker');

    smoke.emitThrown();
    smoke.setActiveMark(mark);
    GameEventBus.emit('target_mark_set', { mark });
    GameEventBus.flush();

    expect(visibleDialog()).toBeNull();
    expect(requestSupport).not.toHaveBeenCalled();
    expect(manager.handleStrikeConfirm()).toBe(true);
    expect(requestSupport).toHaveBeenCalledTimes(1);
    expect(requestSupport.mock.calls[0][0]).toMatchObject({
      type: 'arclight',
      requesterFaction: Faction.US,
      marking: 'smoke',
    });
    expect(requestSupport.mock.calls[0][0].targetPosition).toEqual(mark.position);
    expect(smoke.system.clearActiveMark).toHaveBeenCalledTimes(1);

    manager.dispose();
    layout.dispose();
  });

  it('arms a designate step on asset select, then dispatches the call-in on confirm', () => {
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
      })
    } as any);

    const requestSupport = vi.fn(() => true);
    manager.setAirSupportManager({
      requestSupport,
      getCooldownRemaining: vi.fn(() => 0),
    } as any);
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);
    manager.setPlayerController(lookDownController());

    manager.toggleRadioMenu();
    const dial = visibleDialog()!;
    drillCategory(dial, 'fire-support');
    clickSector(dial, 'ac47_orbit');
    clickSector(dial, 'ac47_orbit:reticle-grid');

    // Choosing the aim-mark target method closes the dial and enters
    // DESIGNATE (re-aimable). The strike only goes out on confirm.
    expect(requestSupport).not.toHaveBeenCalled();
    expect(visibleDialog()).toBeNull();

    manager.update(0.1); // track the view ray onto the ground

    // LMB confirms the painted target.
    expect(manager.handleStrikeConfirm()).toBe(true);

    expect(requestSupport).toHaveBeenCalledTimes(1);
    const request = requestSupport.mock.calls[0][0];
    expect(request.type).toBe('spooky'); // ac47_orbit fulfils via the spooky sortie
    expect(request.requesterFaction).toBe(Faction.US); // called strikes spare friendlies
    expect(request.marking).toBe('smoke'); // active mark threaded into the request
    expect(request.targetPosition).toBeInstanceOf(THREE.Vector3);

    manager.dispose();
    layout.dispose();
  });

  it('closes the overlay after issuing a quick command from keyboard mode', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    const relockPointer = vi.fn();
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer,
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.issueQuickCommand(1);

    const overlay = document.body.querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('false');
    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(relockPointer).toHaveBeenCalledTimes(1);

    manager.dispose();
    layout.dispose();
  });

  // ── Look-to-mark squad commands (SVYAZ-4 Stage 1) ──────────────────────────
  const makeLookController = (origin: THREE.Vector3, dir: THREE.Vector3) => {
    const camera = {
      getWorldPosition: vi.fn((t: THREE.Vector3) => t.copy(origin)),
      getWorldDirection: vi.fn((t: THREE.Vector3) => t.copy(dir).normalize()),
    };
    return {
      getCamera: vi.fn(() => camera),
      getPosition: vi.fn((t?: THREE.Vector3) => (t ?? new THREE.Vector3()).copy(origin)),
    };
  };

  it('pings a target command at the looked-at ground point, not the player feet', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    // Camera 20 m up over the origin, looking forward + down toward +z.
    manager.setPlayerController(
      makeLookController(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -0.7, 0.7)) as any
    );
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);

    // Overlay CLOSED: a hotkey HOLD must look-to-mark, never anchor on the player.
    manager.issueQuickCommand(2);

    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.issueCommandAtPosition).toHaveBeenCalledTimes(1);
    const [cmd, pos] = controller.issueCommandAtPosition.mock.calls[0];
    expect(cmd).toBe(SquadCommand.HOLD_POSITION);
    // Marked well ahead of the player (origin), never on their feet.
    expect(pos.z).toBeGreaterThan(15);
    expect(Math.hypot(pos.x, pos.z)).toBeGreaterThan(15);

    manager.dispose();
    layout.dispose();
  });

  it('reaches ATTACK on slot 6 via look-to-mark', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setPlayerController(
      makeLookController(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -0.7, 0.7)) as any
    );
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);

    manager.issueQuickCommand(6);

    expect(controller.issueCommandAtPosition).toHaveBeenCalledTimes(1);
    expect(controller.issueCommandAtPosition.mock.calls[0][0]).toBe(SquadCommand.ATTACK_HERE);

    manager.dispose();
    layout.dispose();
  });

  it('routes non-target commands (FOLLOW) straight through with no target point', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setPlayerController(
      makeLookController(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -0.7, 0.7)) as any
    );
    manager.setTerrainSystem({ getHeightAt: () => 0 } as any);

    manager.issueQuickCommand(1);

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();

    manager.dispose();
    layout.dispose();
  });

  it('arms placement orders in the overlay and dispatches them after a map click', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setGameModeManager({
      getCurrentConfig: () => ({ minimapScale: 400 })
    } as any);
    manager.setPlayerController(createPlayerControllerStub(new THREE.Vector3(120, 5, -40)) as any);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.update(0.1);

    document.body.querySelector<HTMLButtonElement>('[data-action="slot-2"]')?.click();

    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();

    const canvas = document.body.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    expect(canvas).toBeTruthy();
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 160, button: 0 }));

    expect(controller.issueCommandAtPosition).toHaveBeenCalledWith(
      SquadCommand.HOLD_POSITION,
      expect.objectContaining({ x: 120, y: 5, z: -40 })
    );
    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

    manager.dispose();
    layout.dispose();
  });

  it('arms attack-here as a placed squad command', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setGameModeManager({
      getCurrentConfig: () => ({ minimapScale: 400 })
    } as any);
    manager.setPlayerController(createPlayerControllerStub(new THREE.Vector3(25, 3, 75)) as any);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.update(0.1);
    document.body.querySelector<HTMLButtonElement>('[data-action="slot-6"]')?.click();

    const canvas = document.body.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });
    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 160, clientY: 160, button: 0 }));

    expect(controller.issueCommandAtPosition).toHaveBeenCalledWith(
      SquadCommand.ATTACK_HERE,
      expect.objectContaining({ x: 25, y: 3, z: 75 })
    );

    manager.dispose();
    layout.dispose();
  });

  it('supports gamepad confirmation for armed placement orders in the overlay', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setGameModeManager({
      getCurrentConfig: () => ({ minimapScale: 400 })
    } as any);
    manager.setPlayerController(createPlayerControllerStub(new THREE.Vector3(120, 5, -40)) as any);
    manager.bindInputManager({
      getGamepadManager: () => ({
        getMovementVector: () => ({ x: 0, z: 0 }),
      }),
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('gamepad');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.update(0.1);
    manager.issueQuickCommand(2);

    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(manager.handlePrimaryConfirm()).toBe(true);
    expect(controller.issueCommandAtPosition).toHaveBeenCalledWith(
      SquadCommand.HOLD_POSITION,
      expect.objectContaining({ x: 120, y: 5, z: -40 })
    );
    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

    manager.dispose();
    layout.dispose();
  });

  it('selects friendly squads from the overlay tactical map', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.setCombatantSystem({
      getAllCombatants: () => [
        { state: 'patrolling', squadId: 'squad-player', faction: 'US', position: new THREE.Vector3(0, 0, 0) },
        { state: 'patrolling', squadId: 'squad-player', faction: 'US', position: new THREE.Vector3(4, 0, 0) },
        { state: 'patrolling', squadId: 'squad-support', faction: 'US', position: new THREE.Vector3(40, 0, 0) },
        { state: 'patrolling', squadId: 'squad-support', faction: 'US', position: new THREE.Vector3(44, 0, 0) },
      ]
    } as any);
    manager.setGameModeManager({
      getCurrentConfig: () => ({ minimapScale: 320 })
    } as any);
    manager.setPlayerController(createPlayerControllerStub(new THREE.Vector3(0, 0, 0)) as any);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.update(0.1);

    const canvas = document.body.querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
    expect(canvas).toBeTruthy();
    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }),
      configurable: true
    });

    canvas?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 202, clientY: 160, button: 0 }));

    expect(controller.selectSquad).toHaveBeenCalledWith('squad-support');
    expect(document.body.textContent).toContain('SQUAD SUPPORT');

    manager.dispose();
    layout.dispose();
  });

  it('executes direct overlay commands immediately instead of waiting for map placement', () => {
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
      })
    } as any);

    manager.toggleCommandMode();
    document.body.querySelector<HTMLButtonElement>('[data-action="slot-1"]')?.click();

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();
    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

    manager.dispose();
    layout.dispose();
  });

  it('executes stand down immediately and clears the prior command point', () => {
    const controller = createSquadControllerStub();
    controller.emit({
      ...controller.getCommandState(),
      currentCommand: SquadCommand.HOLD_POSITION,
      commandPosition: new THREE.Vector3(42, 0, -20)
    });
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    manager.bindInputManager({
      unlockPointer: vi.fn(),
      relockPointer: vi.fn(),
      getTouchControls: () => undefined,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    document.body.querySelector<HTMLButtonElement>('[data-action="slot-5"]')?.click();

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(5);
    expect(controller.getCommandState().currentCommand).toBe(SquadCommand.FREE_ROAM);
    expect(controller.getCommandState().commandPosition).toBeUndefined();
    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

    manager.dispose();
    layout.dispose();
  });

  it('keeps cancel as modal close instead of issuing stand down implicitly', () => {
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
      })
    } as any);

    manager.toggleCommandMode();
    expect(manager.handleCancel()).toBe(true);

    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.getCommandState().currentCommand).toBe(SquadCommand.NONE);
    expect(document.body.querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

    manager.dispose();
    layout.dispose();
  });
});

/** The currently-shown radio dial surface (desktop wheel) is a visible dialog. */
function visibleDialog(): HTMLElement | null {
  const dialogs = Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]'));
  return dialogs.find((d) => d.dataset.visible === 'true') ?? null;
}

/** Drill into a category sector on the wheel (the click bubbles to the group). */
function drillCategory(dial: HTMLElement, categoryId: string): void {
  dial.querySelector<HTMLElement>(`[data-radio-category="${categoryId}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  );
}

/** Click an option sector on the wheel. */
function clickSector(dial: HTMLElement, optionId: string): void {
  dial.querySelector<HTMLElement>(`[data-radio-option="${optionId}"]`)?.dispatchEvent(
    new MouseEvent('click', { bubbles: true })
  );
}

/** Camera looking forward + down so the ground pick resolves a call-in target. */
function lookDownController() {
  return {
    getCamera: () => ({
      getWorldPosition: (v: THREE.Vector3) => v.set(0, 12, 0),
      getWorldDirection: (v: THREE.Vector3) => v.set(0, -0.5, 1).normalize(),
    }),
    getPosition: (v: THREE.Vector3) => v.set(0, 0, 0),
  } as any;
}

function createSquadControllerStub() {
  const listeners = new Set<(state: {
    hasSquad: boolean;
    currentCommand: SquadCommand;
    isCommandModeOpen: boolean;
    memberCount: number;
    commandPosition?: { x: number; y: number; z: number } | undefined;
    selectedSquadId?: string | undefined;
    selectedLeaderId?: string | undefined;
    selectedFormation?: string | undefined;
    selectedFaction?: string | undefined;
  }) => void>();

  let state = {
    hasSquad: true,
    currentCommand: SquadCommand.NONE,
    isCommandModeOpen: false,
    memberCount: 7,
    commandPosition: undefined,
    selectedSquadId: 'squad-player',
    selectedLeaderId: 'leader-player',
    selectedFormation: 'wedge',
    selectedFaction: 'US'
  };

  return {
    getCommandState: vi.fn(() => state),
    onCommandStateChange: vi.fn((listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    issueQuickCommand: vi.fn((slot: number) => {
      const option = getQuickCommandOption(slot);
      if (!option) return;
      state = {
        ...state,
        currentCommand: option.command,
        commandPosition: option.command === SquadCommand.FREE_ROAM ? undefined : state.commandPosition
      };
      emitState(listeners, state);
    }),
    issueCommandAtPosition: vi.fn((command: SquadCommand, position: THREE.Vector3) => {
      state = { ...state, currentCommand: command, commandPosition: position };
      emitState(listeners, state);
    }),
    selectSquad: vi.fn((squadId: string) => {
      state = {
        ...state,
        selectedSquadId: squadId,
        selectedLeaderId: squadId === 'squad-support' ? 'leader-support' : 'leader-player',
      };
      emitState(listeners, state);
      return true;
    }),
    getPlayerSquadId: vi.fn(() => state.selectedSquadId),
    emit(nextState: typeof state) {
      state = nextState;
      emitState(listeners, state);
    }
  };
}

function createPlayerControllerStub(position: THREE.Vector3) {
  const cameraDirection = new THREE.Vector3(0, 0, -1);
  return {
    getCamera: vi.fn(() => ({
      getWorldDirection: vi.fn((target: THREE.Vector3) => target.copy(cameraDirection))
    })),
    getPosition: vi.fn((target?: THREE.Vector3) => (target ?? new THREE.Vector3()).copy(position))
  };
}

function createWeaponVisibilityStub(visible: boolean) {
  return {
    getWeaponPresentationState: vi.fn(() => ({ requestedVisible: visible })),
    setWeaponVisibility: vi.fn(),
  };
}

function createSmokeMarkerStub() {
  let activeMark: TargetMark | null = null;
  let handlingInput = false;
  let throwEndHook: ((reason: 'cancelled' | 'thrown') => void) | undefined;
  const system = {
    setThrowModeEndHook: vi.fn((hook: (reason: 'cancelled' | 'thrown') => void) => {
      throwEndHook = hook;
    }),
    beginThrowMode: vi.fn(() => {
      handlingInput = true;
    }),
    cancelThrowMode: vi.fn(() => {
      handlingInput = false;
      throwEndHook?.('cancelled');
      return true;
    }),
    isHandlingInput: vi.fn(() => handlingInput),
    getActiveMark: vi.fn(() => activeMark),
    clearActiveMark: vi.fn(() => {
      activeMark = null;
    }),
  };
  return {
    system,
    setActiveMark(mark: TargetMark | null) {
      activeMark = mark;
    },
    emitThrown() {
      handlingInput = false;
      throwEndHook?.('thrown');
    },
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
    closePath: vi.fn()
  };
}

function emitState(
  listeners: Set<(state: {
    hasSquad: boolean;
    currentCommand: SquadCommand;
    isCommandModeOpen: boolean;
    memberCount: number;
    commandPosition?: { x: number; y: number; z: number } | undefined;
    selectedSquadId?: string | undefined;
    selectedLeaderId?: string | undefined;
    selectedFormation?: string | undefined;
    selectedFaction?: string | undefined;
  }) => void>,
  state: {
    hasSquad: boolean;
    currentCommand: SquadCommand;
    isCommandModeOpen: boolean;
    memberCount: number;
    commandPosition?: { x: number; y: number; z: number } | undefined;
    selectedSquadId?: string | undefined;
    selectedLeaderId?: string | undefined;
    selectedFormation?: string | undefined;
    selectedFaction?: string | undefined;
  }
): void {
  for (const listener of listeners) {
    listener(state);
  }
}
