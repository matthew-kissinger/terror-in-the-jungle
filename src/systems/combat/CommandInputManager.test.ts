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

  it('mounts the quick command strip into the command-bar region', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);

    manager.mountTo(layout);

    expect(layout.getSlot('command-bar').querySelector('.quick-command-strip')).toBeTruthy();
    expect(layout.getSlot('center').querySelector('.command-mode-overlay')).toBeTruthy();

    manager.dispose();
    layout.dispose();
  });

  it('routes quick commands and gamepad command-mode toggles to the squad controller', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.bindInputManager({
      onInputModeChange: vi.fn((cb) => {
        cb('gamepad');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.issueQuickCommand(2);

    expect(controller.toggleCommandModeSurface).toHaveBeenCalledTimes(1);
    expect(controller.issueQuickCommand).toHaveBeenCalledWith(2);

    manager.dispose();
    layout.dispose();
  });

  it('updates the strip when squad state changes', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);

    controller.emit({
      hasSquad: true,
      currentCommand: SquadCommand.RETREAT,
      isCommandModeOpen: true,
      memberCount: 8,
      commandPosition: undefined
    });

    const retreatButton = layout.getSlot('command-bar').querySelector<HTMLButtonElement>('[data-action="slot-4"]');
    const modeButton = layout.getSlot('command-bar').querySelector<HTMLButtonElement>('[data-action="mode"]');

    expect(retreatButton?.classList.contains('quick-command-strip__button--active')).toBe(true);
    expect(modeButton?.classList.contains('quick-command-strip__button--active')).toBe(true);
    expect(layout.getSlot('command-bar').textContent).toContain('RETREAT');

    manager.dispose();
    layout.dispose();
  });

  it('binds input-mode updates into the strip', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);

    let listener: ((mode: 'keyboardMouse' | 'touch' | 'gamepad') => void) | undefined;
    const unsubscribe = vi.fn();
    manager.bindInputManager({
      onInputModeChange: vi.fn((cb) => {
        listener = cb;
        cb('keyboardMouse');
        return unsubscribe;
      })
    } as any);

    listener?.('touch');
    const strip = layout.getSlot('command-bar').querySelector<HTMLElement>('.quick-command-strip');
    expect(strip?.dataset.inputMode).toBe('touch');

    manager.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    layout.dispose();
  });

  it('opens the command overlay for keyboard/touch instead of toggling the radial fallback', () => {
    const controller = createSquadControllerStub();
    const manager = new CommandInputManager(controller as any);
    manager.mountTo(layout);
    const unlockPointer = vi.fn();
    const relockPointer = vi.fn();
    manager.bindInputManager({
      unlockPointer,
      relockPointer,
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    const overlay = layout.getSlot('center').querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('true');
    expect(unlockPointer).toHaveBeenCalledTimes(1);
    expect(controller.toggleCommandModeSurface).not.toHaveBeenCalled();

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
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.issueQuickCommand(4);

    const overlay = layout.getSlot('center').querySelector<HTMLElement>('.command-mode-overlay');
    expect(overlay?.dataset.visible).toBe('false');
    expect(controller.issueQuickCommand).toHaveBeenCalledWith(4);
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
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    manager.update(0.1);

    layout.getSlot('center').querySelector<HTMLButtonElement>('[data-action="slot-2"]')?.click();

    expect(controller.issueQuickCommand).not.toHaveBeenCalled();
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();

    const canvas = layout.getSlot('center').querySelector<HTMLCanvasElement>('.command-tactical-map__canvas');
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
    expect(layout.getSlot('center').querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

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
      onInputModeChange: vi.fn((cb) => {
        cb('keyboardMouse');
        return () => {};
      })
    } as any);

    manager.toggleCommandMode();
    layout.getSlot('center').querySelector<HTMLButtonElement>('[data-action="slot-1"]')?.click();

    expect(controller.issueQuickCommand).toHaveBeenCalledWith(1);
    expect(controller.issueCommandAtPosition).not.toHaveBeenCalled();
    expect(layout.getSlot('center').querySelector<HTMLElement>('.command-mode-overlay')?.dataset.visible).toBe('false');

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
  }) => void>();

  let state = {
    hasSquad: true,
    currentCommand: SquadCommand.NONE,
    isCommandModeOpen: false,
    memberCount: 7,
    commandPosition: undefined
  };

  return {
    getCommandState: vi.fn(() => state),
    onCommandStateChange: vi.fn((listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    toggleCommandModeSurface: vi.fn(() => {
      state = { ...state, isCommandModeOpen: !state.isCommandModeOpen };
      emitState(listeners, state);
    }),
    closeCommandModeSurface: vi.fn(() => {
      state = { ...state, isCommandModeOpen: false };
      emitState(listeners, state);
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
    getPlayerSquadId: vi.fn(() => 'squad-player'),
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
  }) => void>,
  state: {
    hasSquad: boolean;
    currentCommand: SquadCommand;
    isCommandModeOpen: boolean;
    memberCount: number;
    commandPosition?: { x: number; y: number; z: number } | undefined;
  }
): void {
  for (const listener of listeners) {
    listener(state);
  }
}
