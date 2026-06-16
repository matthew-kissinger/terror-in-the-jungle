/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeaponSwitchFeedback } from './WeaponSwitchFeedback';

describe('WeaponSwitchFeedback', () => {
  let feedback: WeaponSwitchFeedback;
  let parent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    parent = document.createElement('div');
    document.body.appendChild(parent);
    feedback = new WeaponSwitchFeedback();
    feedback.attachToDOM(parent);
  });

  afterEach(() => {
    feedback.dispose();
    vi.useRealTimers();
  });

  function container(): HTMLElement {
    const element = parent.querySelector<HTMLElement>('.weapon-switch-feedback');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  }

  it('shows weapon icon, name, and ammo with stable child nodes', () => {
    feedback.show('RIFLE', 'AR', '30 / 90');

    const icon = parent.querySelector<HTMLElement>('.weapon-switch-icon');
    const name = parent.querySelector<HTMLElement>('.weapon-switch-name');
    const ammo = parent.querySelector<HTMLElement>('.weapon-switch-ammo');
    expect(icon?.textContent).toBe('AR');
    expect(name?.textContent).toBe('RIFLE');
    expect(ammo?.textContent).toBe('30 / 90');

    feedback.show('SMG', 'SM', '20 / 80');

    expect(parent.querySelector('.weapon-switch-icon')).toBe(icon);
    expect(parent.querySelector('.weapon-switch-name')).toBe(name);
    expect(parent.querySelector('.weapon-switch-ammo')).toBe(ammo);
    expect(icon?.textContent).toBe('SM');
    expect(name?.textContent).toBe('SMG');
    expect(ammo?.textContent).toBe('20 / 80');
  });

  it('hides optional ammo without removing the ammo element', () => {
    feedback.show('RIFLE', 'AR', '30 / 90');
    const ammo = parent.querySelector<HTMLElement>('.weapon-switch-ammo');

    feedback.show('GRENADE', 'GR');

    expect(parent.querySelector('.weapon-switch-ammo')).toBe(ammo);
    expect(ammo?.textContent).toBe('');
    expect(ammo?.style.display).toBe('none');
  });

  it('does not let an older hide timer hide a newer weapon switch', () => {
    feedback.show('RIFLE', 'AR', '30 / 90');

    vi.advanceTimersByTime(2000);
    expect(container().classList.contains('fade-out')).toBe(true);

    feedback.show('SMG', 'SM', '20 / 80');
    expect(container().style.display).toBe('flex');
    expect(container().classList.contains('fade-out')).toBe(false);

    vi.advanceTimersByTime(500);
    expect(container().style.display).toBe('flex');

    vi.advanceTimersByTime(1500);
    expect(container().classList.contains('fade-out')).toBe(true);

    vi.advanceTimersByTime(500);
    expect(container().style.display).toBe('none');
  });

  it('hide clears pending fade and hide timers', () => {
    feedback.show('RIFLE', 'AR', '30 / 90');
    vi.advanceTimersByTime(2000);
    feedback.hide();

    expect(container().style.display).toBe('none');
    expect(container().classList.contains('fade-out')).toBe(false);

    feedback.show('SMG', 'SM', '20 / 80');
    vi.advanceTimersByTime(500);

    expect(container().style.display).toBe('flex');
    expect(container().classList.contains('fade-out')).toBe(false);
  });

  it('dispose removes the container and injected styles', () => {
    feedback.show('RIFLE', 'AR', '30 / 90');
    expect(document.getElementById('weapon-switch-feedback-styles')).not.toBeNull();

    feedback.dispose();

    expect(parent.querySelector('.weapon-switch-feedback')).toBeNull();
    expect(document.getElementById('weapon-switch-feedback-styles')).toBeNull();
    vi.advanceTimersByTime(5000);
    expect(parent.querySelector('.weapon-switch-feedback')).toBeNull();
  });
});
