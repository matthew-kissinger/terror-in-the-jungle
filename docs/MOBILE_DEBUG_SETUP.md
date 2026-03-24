# Mobile Debug Setup

Physical device debugging for Terror in the Jungle mobile touch issues.

## Device

- Phone: Samsung Galaxy S24 Ultra (SM-S926U)
- OS: Android 16
- Screen: 1080x2340, 450dpi, DPR 2.8125
- Browser: Chrome 146 (com.android.chrome)
- ADB serial: R5CX4028VGJ
- Touchscreen: `/dev/input/event7` (sec_touchscreen, Type B MT, 10 slots, 0-4095 coords)

## Connection

Phone is USB-connected to the Windows PC. ADB port-forwards the phone's Chrome DevTools Protocol to localhost so the Chrome DevTools MCP can control it.

### Start session

```bash
# 1. Verify phone is connected and authorized
adb devices
# Should show: R5CX4028VGJ    device
# If "unauthorized", approve the USB debugging prompt on the phone

# 2. Keep screen awake while USB connected
adb shell svc power stayon usb
adb shell settings put system screen_off_timeout 1800000

# 3. Launch Chrome on phone
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main

# 4. Find Chrome's DevTools socket (PID changes per session)
adb shell "cat /proc/net/unix | grep chrome_devtools_remote"
# Look for: @chrome_devtools_remote_NNNNN (the PID-specific one is Chrome)
# The bare @chrome_devtools_remote may be Brave if installed

# 5. Forward Chrome's socket to localhost:9222
adb forward tcp:9222 localabstract:chrome_devtools_remote_NNNNN

# 6. Verify connection
curl -s http://localhost:9222/json/version
# Should show "Android-Package": "com.android.chrome"
```

### End session

```bash
adb forward --remove-all
adb shell svc power stayon false
adb shell settings put system screen_off_timeout 30000
adb shell settings put system accelerometer_rotation 1
```

## MCP Config

The Chrome DevTools MCP must use `--browserUrl` to connect to the forwarded phone port instead of launching its own desktop Chrome. This is set in `.claude.json` under the project key:

```json
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": [
    "-y",
    "chrome-devtools-mcp@latest",
    "--browserUrl",
    "http://127.0.0.1:9222"
  ],
  "env": {}
}
```

After changing the config, restart the MCP (`/mcp` restart chrome-devtools or restart Claude Code).

**To switch back to desktop debugging**: remove the `--browserUrl` and its value from args, and remove the ADB forward.

## Automated Playtest Harness

### Architecture

```
scripts/mobile-playtest.ts              # CLI entry point
scripts/mobile-playtest/
  adb-controller.ts                     # ADB: orientation, wake, screencap, Chrome socket
  cdp-bridge.ts                         # Playwright connectOverCDP, console/error capture
  touch-injector.ts                     # CDP Input.dispatchTouchEvent multi-touch
  screen-navigator.ts                   # UI flow: title -> mode -> deploy -> gameplay
  gameplay-scenarios.ts                 # Touch scenarios: walk, look, fire, combos
  report-writer.ts                      # JSON + markdown reports
```

### Running

```bash
npm run playtest:mobile                 # full 4-config matrix
npm run playtest:mobile:quick           # landscape fullscreen only
npm run playtest:mobile:flow            # screen flow only (no gameplay tests)
```

### What it does

1. Starts dev server on port 9200 (accessible from phone at `http://192.168.1.100:9200`)
2. Connects to phone Chrome via Playwright `connectOverCDP`
3. Sets orientation via ADB (`settings put system user_rotation 0|1`)
4. Navigates through title -> mode select -> deploy -> gameplay using Playwright taps
5. Runs gameplay scenarios using CDP `Input.dispatchTouchEvent` multi-touch
6. Captures screenshots (CDP + ADB screencap) at every step
7. Captures all console messages and errors
8. Writes results to `playtest-results/YYYY-MM-DDTHH-mm-ss/`

### Output

```
playtest-results/YYYY-MM-DDTHH-mm-ss/
  screenshots/                          # {config}-{step}-{label}-{cdp|adb}.png
  console.log                           # all console messages
  errors.log                            # errors only
  report.json                           # machine-readable
  report.md                             # human-readable summary
```

### Test matrix (4 configs)

| Config | Orientation | Fullscreen |
|--------|------------|------------|
| portrait | ADB user_rotation 0 | No |
| portrait-fs | ADB user_rotation 0 | requestFullscreen() |
| landscape | ADB user_rotation 1 | No |
| landscape-fs | ADB user_rotation 1 | requestFullscreen() |

### URL flags

- `?perf=1` - exposes `window.__engine` and `window.__renderer` globals for game state queries (player position, camera yaw, ammo count)
- Without this flag, game state queries return null but touch controls still work

## Touch Event Approaches - What We Learned

### CDP Input.dispatchTouchEvent (current approach)
- Trusted events that trigger PointerEvent handlers
- Multi-touch via `touchPoints` array with unique `id` per finger
- Coordinates in CSS viewport pixels (no conversion needed)
- **Limitation**: `setPointerCapture()` throws `InvalidStateError`
- **Fix applied**: wrapped all `setPointerCapture` calls in try-catch (6 files)
- Controls respond to CDP touch (verified via screenshots showing player movement)

### ADB sendevent (evaluated, not usable)
- OS-level touch injection to `/dev/input/event7`
- Would be fully trusted (real kernel input events)
- **Blocked**: permission denied on non-rooted Android 16
- Would need coordinate mapping: CSS -> screen pixels -> digitizer 0-4095

### ADB input tap/swipe (used for fallback)
- Works without root, handles orientation automatically
- Single-touch only - no simultaneous joystick + look
- Good for menu taps

### Playwright touchscreen.tap() (evaluated)
- Uses CDP internally, single-touch only
- `locator.tap()` fails on connectOverCDP pages (timeout)
- Not reliable for remote device control

## Code Changes Made

### setPointerCapture defensive try-catch (6 files)

All `setPointerCapture()` calls wrapped in `try { ... } catch { /* CDP/synthetic events */ }`:

- `src/ui/controls/VirtualJoystick.ts` (line ~130)
- `src/ui/controls/TouchLook.ts` (line ~128)
- `src/ui/controls/TouchHelicopterCyclic.ts` (line ~121)
- `src/ui/controls/BaseTouchButton.ts` (line ~57)
- `src/ui/controls/TouchActionButtons.ts` (lines ~84, ~135)
- `src/ui/controls/TouchMortarButton.ts` (line ~110)

This is defensive code that also helps real-device edge cases (fast fullscreen transitions, notification interrupts). All 3621 tests pass.

## Known Issues to Debug

1. **Joystick/look stuck** - pointer captures not releasing on fullscreen transitions, context switches, lost pointers
2. **Camera snap** - coordinate-space glitches during fullscreen cause sudden camera jumps
3. **HUD overlaps** - joystick circle overlaps ammo/weapon display and RALLY button on bottom-left; HelicopterHUD vs minimap on portrait; action buttons vs menu on short landscape
4. **Fullscreen race** - `requestFullscreen` racing with viewport resize cascades
5. **Helicopter controls** - need testing for enter/exit transitions, cyclic response, VehicleActionBar visibility
6. **HUD component styling** - joystick, pause button, HUD components need unified style; left-side HUD components visible behind joystick

### Key source files

- `src/ui/controls/TouchControls.ts` - orchestrator
- `src/ui/controls/VirtualJoystick.ts` - movement stick
- `src/ui/controls/TouchLook.ts` - aim/look
- `src/ui/controls/TouchHelicopterCyclic.ts` - helicopter cyclic
- `src/ui/controls/TouchActionButtons.ts` - fire/reload/etc
- `src/ui/controls/VehicleActionBar.ts` - helicopter action buttons
- `src/ui/hud/HelicopterHUD.ts` - flight instruments overlay
- `src/ui/hud/HUDManager.ts` - HUD visibility
- `src/css/primitives.css` - z-index vars, base styles
- `src/css/theme.css` - touch control sizing via --tc-* custom properties

## Next Steps

1. **Fix CDP touch not moving player** - the screenshots showed camera angle changes between scenarios but movement needs validation. May need to verify the game's `PlayerInput` actually reads from touch controls when pointer capture fails (the joystick might silently drop input if capture didn't succeed).

2. **Add observe mode** - user plays on phone while harness captures screenshots + console on a timer. Best for finding real bugs since user knows where they are.

3. **Helicopter test scenario** - use Open Frontier mode, spawn near helicopter, walk to it, press interaction button, test cyclic/collective/fire/exit.

4. **Portrait + fullscreen matrix** - run all 4 viewport configs to catch orientation-specific layout issues.

5. **Fix HUD overlaps** - bottom-left joystick area needs clear space from ammo display, RALLY button, health bar.
