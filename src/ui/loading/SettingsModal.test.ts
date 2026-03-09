/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/SettingsManager', () => ({
  SettingsManager: {
    getInstance: () => ({
      getAll: () => ({
        masterVolume: 70,
        mouseSensitivity: 5,
        touchSensitivity: 5,
        graphicsQuality: 'medium',
        showFPS: false,
        enableShadows: true,
        controllerPreset: 'default',
        controllerLookCurve: 'precision',
        controllerDpadMode: 'weapons',
        controllerMoveDeadZone: 15,
        controllerLookDeadZone: 15,
        controllerInvertY: false,
      }),
      set: vi.fn(),
    }),
  },
  GraphicsQuality: {},
  ControllerPreset: {},
  ControllerLookCurve: {},
  ControllerDpadMode: {},
}));

vi.mock('../../utils/DeviceDetector', () => ({
  isTouchDevice: () => false,
}));

import { SettingsModal } from './SettingsModal';

describe('SettingsModal', () => {
  let container: HTMLDivElement;
  let modal: SettingsModal;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    modal = new SettingsModal();
    modal.mount(container);
  });

  afterEach(() => {
    modal.dispose();
    container.remove();
  });

  it('has role="dialog" and aria-modal on mount', () => {
    const root = modal.element;
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('Settings');
  });

  it('close button has aria-label', () => {
    const closeBtn = modal.element.querySelector('[data-ref="close"]');
    expect(closeBtn).not.toBeNull();
    expect(closeBtn?.getAttribute('aria-label')).toBe('Close');
  });

  it('contains fieldset elements with legends', () => {
    const fieldsets = modal.element.querySelectorAll('fieldset');
    expect(fieldsets.length).toBeGreaterThanOrEqual(3);

    const legends = modal.element.querySelectorAll('legend');
    const legendTexts = Array.from(legends).map((l) => l.textContent);
    expect(legendTexts).toContain('Graphics');
    expect(legendTexts).toContain('Audio');
    expect(legendTexts).toContain('Controller');
  });

  it('range inputs have associated labels via for/id', () => {
    const volumeInput = modal.element.querySelector('#setting-masterVolume');
    expect(volumeInput).not.toBeNull();
    const volumeLabel = modal.element.querySelector('label[for="setting-masterVolume"]');
    expect(volumeLabel).not.toBeNull();
  });

  it('shows graphics quality hint text', () => {
    const hint = modal.element.querySelector('[data-ref="graphicsHint"]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe('Moderate pixel (3x), shadows on');
  });

  it('updates graphics hint when quality changes', () => {
    const select = modal.element.querySelector('[data-setting="graphicsQuality"]') as HTMLSelectElement;
    const hint = modal.element.querySelector('[data-ref="graphicsHint"]');
    expect(select).not.toBeNull();

    select!.value = 'low';
    select!.dispatchEvent(new Event('change'));
    expect(hint?.textContent).toBe('Pixelated (4x), no shadows');

    select!.value = 'ultra';
    select!.dispatchEvent(new Event('change'));
    expect(hint?.textContent).toBe('Full resolution, shadows on');
  });

  it('Escape key closes modal when visible', () => {
    modal.show();
    const root = modal.element;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // After pressing Escape, the visible signal should be false
    // We check by looking at the class list (visible class removed)
    expect(root.classList.contains('visible')).toBe(false);
  });
});
