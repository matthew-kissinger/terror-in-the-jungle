/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { HUDLayout } from '../../ui/layout/HUDLayout';
import { SquadCommand } from './types';
import { CommandInputManager } from './CommandInputManager';
import { getQuickCommandOption } from './SquadCommandPresentation';
import { ViewportManager } from '../../ui/design/responsive';

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
});

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
      state = { ...state, currentCommand: option.command };
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
