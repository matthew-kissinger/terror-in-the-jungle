/** Request fullscreen with vendor prefix fallback and navigationUI hide. */
export function requestFullscreenCompat(el: HTMLElement): Promise<void> {
  if (el.requestFullscreen) {
    return el.requestFullscreen({ navigationUI: 'hide' });
  }
  const webkitEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  if (typeof webkitEl.webkitRequestFullscreen === 'function') {
    return Promise.resolve(webkitEl.webkitRequestFullscreen());
  }
  return Promise.reject(new Error('Fullscreen API not supported'));
}
