/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FullMapInput } from './FullMapInput';
import { InputContextManager } from '../../systems/input/InputContextManager';

/**
 * Regression coverage for the plain-M "3D relief" toggle path (owner decision
 * 2026-06-30, commit f88db617): keydown/keyup must track the 3D mount's own
 * reported open state, not the unrelated 2D Shift+M hold flag. Before this
 * fix, plain M never left the 'gameplay' input context (so movement/firing
 * stayed live under the full-screen map and Escape couldn't close it), and
 * every M release unconditionally ran the 2D hold-to-view teardown.
 */
describe('FullMapInput', () => {
  let input: FullMapInput;
  let onShow: ReturnType<typeof vi.fn>;
  let onHide: ReturnType<typeof vi.fn>;
  let onRender: ReturnType<typeof vi.fn>;
  let onToggleOrbital3D: ReturnType<typeof vi.fn>;
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
    onToggleOrbital3D = vi.fn();
    input = new FullMapInput({ onShow, onHide, onRender, onToggleOrbital3D });
    input.setupEventListeners(document.createElement('canvas'));
  });

  afterEach(() => {
    input.dispose();
    InputContextManager.resetInstance();
  });

  describe('plain M — 3D relief toggle', () => {
    it('opening switches the input context to map without firing 2D show/hide callbacks', () => {
      onToggleOrbital3D.mockReturnValue(true);
      dispatchKey('keydown', 'm');

      expect(onToggleOrbital3D).toHaveBeenCalledTimes(1);
      expect(contextManager.getContext()).toBe('map');
      expect(onShow).not.toHaveBeenCalled();
    });

    it('releasing M after opening the relief does not spuriously tear down map state', () => {
      onToggleOrbital3D.mockReturnValue(true);
      dispatchKey('keydown', 'm');
      dispatchKey('keyup', 'm');

      expect(onHide).not.toHaveBeenCalled();
      expect(contextManager.getContext()).toBe('map');
    });

    it('pressing M again closes the relief and restores gameplay context', () => {
      onToggleOrbital3D.mockReturnValueOnce(true).mockReturnValueOnce(false);
      dispatchKey('keydown', 'm');
      dispatchKey('keyup', 'm');
      dispatchKey('keydown', 'm');

      expect(onToggleOrbital3D).toHaveBeenCalledTimes(2);
      expect(contextManager.getContext()).toBe('gameplay');
    });

    it('Escape closes an open relief and restores gameplay context', () => {
      onToggleOrbital3D.mockReturnValueOnce(true).mockReturnValueOnce(false);
      dispatchKey('keydown', 'm');
      dispatchKey('keyup', 'm');

      dispatchKey('keydown', 'Escape');

      expect(onToggleOrbital3D).toHaveBeenCalledTimes(2);
      expect(contextManager.getContext()).toBe('gameplay');
    });

    it('stays in gameplay context when the toggle reports it could not open (e.g. no live runtime)', () => {
      onToggleOrbital3D.mockReturnValue(false);
      dispatchKey('keydown', 'm');

      expect(contextManager.getContext()).toBe('gameplay');
    });
  });

  describe('Shift+M — 2D tactical peek (hold to view)', () => {
    it('opens on keydown via the 2D show callback', () => {
      dispatchKey('keydown', 'm', { shiftKey: true });

      expect(onShow).toHaveBeenCalledTimes(1);
      expect(onToggleOrbital3D).not.toHaveBeenCalled();
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
