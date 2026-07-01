/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FullMapInput } from './FullMapInput';
import { InputContextManager } from '../../systems/input/InputContextManager';

describe('FullMapInput', () => {
  let input: FullMapInput;
  let onShow: ReturnType<typeof vi.fn>;
  let onHide: ReturnType<typeof vi.fn>;
  let onRender: ReturnType<typeof vi.fn>;
  let contextManager: InputContextManager;

  function dispatchKey(type: 'keydown' | 'keyup', key: string, opts: Partial<KeyboardEventInit> = {}) {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, ...opts }));
  }

  beforeEach(() => {
    InputContextManager.resetInstance();
    contextManager = InputContextManager.getInstance();
    onShow = vi.fn();
    onHide = vi.fn();
    onRender = vi.fn();
    input = new FullMapInput({ onShow, onHide, onRender });
    input.setupEventListeners(document.createElement('canvas'));
  });

  afterEach(() => {
    input.dispose();
    InputContextManager.resetInstance();
  });

  describe('plain M — 2D tactical map hold', () => {
    it('opens the tactical map and switches the input context to map', () => {
      dispatchKey('keydown', 'm');

      expect(onShow).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('map');
    });

    it('hides on key release and restores gameplay context', () => {
      dispatchKey('keydown', 'm');
      dispatchKey('keyup', 'm');

      expect(onHide).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('gameplay');
    });

    it('Escape closes an open tactical map and restores gameplay context', () => {
      dispatchKey('keydown', 'm');

      dispatchKey('keydown', 'Escape');

      expect(onHide).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('gameplay');
    });

    it('ignores repeat keydown while the key is held', () => {
      dispatchKey('keydown', 'm');
      dispatchKey('keydown', 'm', { repeat: true });

      expect(onShow).toHaveBeenCalledTimes(1);
    });
  });

  describe('Shift+M — alternate tactical map hold', () => {
    it('opens on keydown via the same 2D show callback', () => {
      dispatchKey('keydown', 'm', { shiftKey: true });

      expect(onShow).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('map');
    });

    it('hides on key release', () => {
      dispatchKey('keydown', 'm', { shiftKey: true });
      dispatchKey('keyup', 'm');

      expect(onHide).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('gameplay');
    });

    it('Escape closes it too', () => {
      dispatchKey('keydown', 'm', { shiftKey: true });
      dispatchKey('keydown', 'Escape');

      expect(onHide).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('gameplay');
    });
  });
});
