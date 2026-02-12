export function isPortraitViewport(): boolean {
  return window.innerHeight > window.innerWidth;
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
