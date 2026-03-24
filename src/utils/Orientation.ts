export function isPortraitViewport(): boolean {
  return window.innerHeight > window.innerWidth;
}

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

export function tryLockLandscapeOrientation(): void {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: 'any' | 'natural' | 'landscape' | 'portrait' | 'portrait-primary' | 'portrait-secondary' | 'landscape-primary' | 'landscape-secondary') => Promise<void>;
    };
    if (orientation && typeof orientation.lock === 'function') {
      void orientation.lock('landscape').catch(() => {
        // Best-effort only; unsupported or disallowed on many browsers.
      });
    }
  } catch {
    // Ignore unsupported environments.
  }
}
