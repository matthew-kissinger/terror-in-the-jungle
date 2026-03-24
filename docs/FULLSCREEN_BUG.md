# Mobile Fullscreen Bug - Android Chrome Stale State

## Problem
On Android Chrome (Galaxy S24+, Chrome 146), `requestFullscreen()` resolves as "success" but does NOT actually enter visual fullscreen. The browser address bar and navigation remain visible.

## Root Cause
Android Chrome retains `document.fullscreenElement` across page reloads/navigation. After a previous fullscreen session, Chrome reports `fullscreenElement: "HTML"` or `"BODY"` even though the page is NOT visually fullscreen. Per the Fullscreen API spec, calling `requestFullscreen()` on an element that is already `document.fullscreenElement` is a no-op - it resolves immediately without visual change.

## What We've Tried (all failed)
1. **Check before request**: `if (!document.fullscreenElement)` - skips because stale state
2. **Always request**: Resolves as "success" but no visual change (no-op per spec)
3. **Exit then request**: `document.exitFullscreen()` is async, loses user gesture context for the subsequent `requestFullscreen()` call
4. **Request on different element**: Tried alternating between `documentElement` and `body` - Chrome still doesn't visually enter fullscreen
5. **Clear stale state on mount**: `exitFullscreen()` on TitleScreen mount - Chrome doesn't reliably clear the state
6. **`{ navigationUI: 'hide' }` option**: Added, no effect on the stale state issue
7. **PWA manifest `display: fullscreen`**: Added for home-screen installs but doesn't help in-browser

## What DOES Work
- A fresh browser tab (no prior fullscreen state) - START GAME correctly enters fullscreen
- Hard refresh (Ctrl+Shift+R) sometimes clears the stale state
- The Fullscreen API itself IS functional (test buttons work on fresh pages)

## Key Findings
- `document.fullscreenElement` reports "HTML" or "BODY" on page load even when NOT visually fullscreen
- `document.exitFullscreen()` resolves but `fullscreenElement` sometimes stays set
- `requestFullscreen()` Promise resolves with "success" but browser chrome remains visible
- `display-mode` CSS media query correctly reports `browser` (not `fullscreen`) - the visual state IS detectable
- Viewport height (298-384px) vs `screen.availHeight` (355-755px) confirms NOT visually fullscreen

## Files Involved
- `src/ui/screens/TitleScreen.ts` - START GAME click handler (line ~74), fullscreen prompt (line ~287)
- `src/ui/loading/SettingsModal.ts` - Toggle Fullscreen button (line ~238)
- `src/utils/Orientation.ts` - `requestFullscreenCompat()` helper
- `src/ui/engine/theme.css` - `--screen-*` variables (changed from blue to amber)
- `public/manifest.json` - PWA manifest (new, `display: fullscreen`)
- `index.html` - manifest link + mobile-web-app-capable meta tags (new)

## Environment
- Device: Samsung Galaxy S24+ (SM-S926U)
- Browser: Chrome 146.0.7680.119
- Viewport: 384x698 (portrait), 832x384 (landscape fullscreen)
- Screen: 384x832, availHeight: 755 (portrait)
- Dev server: Vite on `http://192.168.1.100:5174/`
- ADB + Chrome DevTools Protocol for remote debugging

## Possible Next Steps
1. **Force clear via navigation**: Navigate to `about:blank` then back to clear fullscreen state
2. **Use `document.open()`/`document.close()`** to reset document state
3. **Service worker intercept**: Clear fullscreen state on `activate` event
4. **setTimeout wrapper**: Exit fullscreen on mount, delay START button appearance by 500ms to ensure exit completes, then request works normally
5. **Accept the limitation**: Only reliable on fresh tabs; add "Add to Home Screen" PWA prompt for reliable fullscreen via manifest
6. **Research Chrome bug tracker**: This may be a known Chrome bug with fullscreen state persistence

## Settings Toggle Also Broken
Same root cause. The settings "Toggle Fullscreen" button uses `click` event (correct for user gesture) but the stale `fullscreenElement` makes `requestFullscreen()` a no-op. Same workaround needed.

## Other Changes Made This Session (working)
- HUD layout redesigned (grid, minimap alignment, health below minimap, stats in status-bar)
- Rally button in grid (portrait: below hamburger, landscape: left of hamburger)
- Weapon cycler ammo display (DOM event + data attribute for late-mount)
- Helicopter HUD compact strip (bottom-center landscape, below minimap portrait)
- Vehicle action bar 2-column landscape layout
- LOOK button hidden on touch
- Infantry health hidden in helicopter mode
- Theme colors changed from blue to amber (`--screen-*` variables)
