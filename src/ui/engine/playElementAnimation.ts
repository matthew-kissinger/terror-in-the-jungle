// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export function playElementAnimation(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): void {
  element.getAnimations?.().forEach((animation) => animation.cancel());

  if (typeof element.animate === 'function') {
    element.animate(keyframes, options);
    return;
  }

  // Older/jsdom fallback: keep the element visible without forcing layout.
  element.style.animation = 'none';
  requestAnimationFrame(() => {
    element.style.animation = '';
  });
}
