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
