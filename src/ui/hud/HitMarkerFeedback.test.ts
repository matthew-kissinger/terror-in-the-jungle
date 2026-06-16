/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HitMarkerFeedback } from './HitMarkerFeedback';

describe('HitMarkerFeedback', () => {
  let feedback: HitMarkerFeedback;
  let parent: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    feedback = new HitMarkerFeedback();
    parent = document.createElement('div');
    document.body.appendChild(parent);
    feedback.attachToDOM(parent);
  });

  afterEach(() => {
    feedback.dispose();
    vi.useRealTimers();
  });

  function markers(): HTMLElement[] {
    return Array.from(parent.querySelectorAll<HTMLElement>('.hit-marker-cross'));
  }

  function vignette(): HTMLElement {
    const element = parent.querySelector<HTMLElement>('.hit-feedback-vignette');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  }

  it('shows and expires a hit marker', () => {
    feedback.showHitMarker('hit');

    expect(markers()).toHaveLength(1);
    expect(markers()[0].classList.contains('hit-marker-hit')).toBe(true);

    vi.advanceTimersByTime(300);

    expect(markers()).toHaveLength(0);
  });

  it('keeps marker duration boundaries for headshots and kills', () => {
    feedback.showHitMarker('headshot');
    expect(markers()).toHaveLength(1);
    expect(markers()[0].classList.contains('hit-marker-headshot')).toBe(true);

    vi.advanceTimersByTime(349);
    expect(markers()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(markers()).toHaveLength(0);

    feedback.showHitMarker('kill');
    expect(markers()).toHaveLength(1);
    expect(markers()[0].classList.contains('hit-marker-kill')).toBe(true);

    vi.advanceTimersByTime(399);
    expect(markers()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(markers()).toHaveLength(0);
  });

  it('reuses marker elements after they expire', () => {
    feedback.showHitMarker('hit');
    const firstMarker = markers()[0];

    vi.advanceTimersByTime(300);
    feedback.showHitMarker('kill');

    expect(markers()).toHaveLength(1);
    expect(markers()[0]).toBe(firstMarker);
    expect(markers()[0].classList.contains('hit-marker-kill')).toBe(true);
  });

  it('caps active markers at the preallocated pool size during bursts', () => {
    for (let index = 0; index < 20; index++) {
      feedback.showHitMarker('hit');
    }

    expect(markers()).toHaveLength(16);

    vi.advanceTimersByTime(300);

    expect(markers()).toHaveLength(0);
  });

  it('keeps the latest vignette flash active when flashes overlap', () => {
    feedback.showHitMarker('headshot');
    expect(vignette().classList.contains('vignette-headshot')).toBe(true);

    vi.advanceTimersByTime(200);
    feedback.showHitMarker('kill');
    expect(vignette().classList.contains('vignette-kill')).toBe(true);

    vi.advanceTimersByTime(150);
    expect(vignette().classList.contains('vignette-kill')).toBe(true);

    vi.advanceTimersByTime(250);
    expect(vignette().className).toBe('hit-feedback-vignette');
  });

  it('disposes active markers, vignette, container, and injected style', () => {
    feedback.showHitMarker('kill');
    expect(markers()).toHaveLength(1);
    expect(document.getElementById('hit-marker-feedback-styles')).not.toBeNull();

    feedback.dispose();

    expect(markers()).toHaveLength(0);
    expect(parent.querySelector('.hit-feedback-vignette')).toBeNull();
    expect(parent.querySelector('.hit-marker-feedback-container')).toBeNull();
    expect(document.getElementById('hit-marker-feedback-styles')).toBeNull();

    vi.advanceTimersByTime(1000);
    expect(markers()).toHaveLength(0);
  });
});
