import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const TOUCH_DEVICE = '/dev/input/event7';
// Samsung Galaxy S24 Ultra: 1080x2340, touch digitizer range 0-4095
const DIGITIZER_MAX = 4095;
const SCREEN_W_PORTRAIT = 1080;
const SCREEN_H_PORTRAIT = 2340;

export class ADBController {
  private cachedOrientation: number = 0;

  constructor(private serial: string = '') {
    if (!serial) this.serial = this.detectDevice();
  }

  private detectDevice(): string {
    const out = execSync('adb devices').toString();
    const lines = out.split('\n').filter(l => l.includes('\tdevice'));
    if (lines.length === 0) throw new Error('No ADB device connected');
    return lines[0].split('\t')[0];
  }

  // ---- Orientation ----

  setPortrait(): void {
    this.shell('settings put system accelerometer_rotation 0');
    this.shell('settings put system user_rotation 0');
    this.cachedOrientation = 0;
    this.sleep(500); // wait for rotation
  }

  setLandscape(): void {
    this.shell('settings put system accelerometer_rotation 0');
    this.shell('settings put system user_rotation 1');
    this.cachedOrientation = 1;
    this.sleep(500);
  }

  resetOrientation(): void {
    this.shell('settings put system accelerometer_rotation 1');
  }

  getOrientation(): number {
    return this.cachedOrientation;
  }

  // ---- Screen ----

  keepAwake(): void {
    this.shell('svc power stayon usb');
    this.shell('settings put system screen_off_timeout 1800000');
  }

  wake(): void {
    this.shell('input keyevent KEYCODE_WAKEUP');
  }

  getScreenSize(): { width: number; height: number } {
    const out = this.shell('wm size');
    const match = out.match(/(\d+)x(\d+)/);
    if (!match) throw new Error('Cannot determine screen size');
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
  }

  // ---- Screenshots ----

  screencap(outputPath: string): void {
    execSync(`adb -s ${this.serial} exec-out screencap -p > "${outputPath}"`);
  }

  // ---- Simple Input ----

  tap(x: number, y: number): void {
    this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  swipe(x1: number, y1: number, x2: number, y2: number, durationMs: number): void {
    this.shell(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
  }

  // ---- Viewport-to-Screen Coordinate Mapping ----

  /**
   * Convert CSS viewport coordinates to ADB screen pixel coordinates.
   * Accounts for Chrome address bar offset, device pixel ratio, and orientation.
   *
   * @param cssX - X in CSS viewport pixels (from getBoundingClientRect)
   * @param cssY - Y in CSS viewport pixels
   * @param chromeBarHeight - Chrome UI height in screen pixels (address bar + status bar)
   * @param dpr - Device pixel ratio
   */
  cssToScreen(cssX: number, cssY: number, chromeBarHeight: number, dpr: number): { x: number; y: number } {
    return {
      x: Math.round(cssX * dpr),
      y: Math.round(cssY * dpr + chromeBarHeight),
    };
  }

  /**
   * Generate and execute a multi-touch drag gesture script on the device.
   * Uses `input` commands which handle orientation automatically.
   *
   * Each finger has a start point, end point, and duration.
   * All fingers move simultaneously.
   */
  gestureScript(
    fingers: Array<{
      startX: number; startY: number;
      endX: number; endY: number;
    }>,
    durationMs: number,
    steps: number = 30,
    chromeBarHeight: number = 0,
    dpr: number = 1,
  ): void {
    const dev = TOUCH_DEVICE;
    const lines: string[] = ['#!/system/bin/sh'];
    const stepDelayUs = Math.round((durationMs * 1000) / steps);

    // Convert all coordinates to screen pixels, then to digitizer range
    const toRaw = (screenX: number, screenY: number) => {
      // Get current orientation to determine mapping
      // In landscape, screen width=2340 height=1080 but digitizer is always portrait
      const orientation = this.getOrientation();
      let rawX: number, rawY: number;
      if (orientation === 1 || orientation === 3) {
        // Landscape: screen X maps to digitizer Y, screen Y maps to digitizer X (inverted)
        rawX = Math.round((screenY / SCREEN_W_PORTRAIT) * DIGITIZER_MAX);
        rawY = Math.round(((SCREEN_H_PORTRAIT - screenX) / SCREEN_H_PORTRAIT) * DIGITIZER_MAX);
      } else {
        // Portrait: direct mapping
        rawX = Math.round((screenX / SCREEN_W_PORTRAIT) * DIGITIZER_MAX);
        rawY = Math.round((screenY / SCREEN_H_PORTRAIT) * DIGITIZER_MAX);
      }
      return { rawX: Math.max(0, Math.min(DIGITIZER_MAX, rawX)), rawY: Math.max(0, Math.min(DIGITIZER_MAX, rawY)) };
    };

    // Touch down all fingers
    const downCmds: string[] = [];
    for (let f = 0; f < fingers.length; f++) {
      const screen = this.cssToScreen(fingers[f].startX, fingers[f].startY, chromeBarHeight, dpr);
      const raw = toRaw(screen.x, screen.y);
      downCmds.push(`sendevent ${dev} 3 47 ${f}`);
      downCmds.push(`sendevent ${dev} 3 57 ${f}`);
      downCmds.push(`sendevent ${dev} 3 53 ${raw.rawX}`);
      downCmds.push(`sendevent ${dev} 3 54 ${raw.rawY}`);
      downCmds.push(`sendevent ${dev} 3 48 10`);
    }
    downCmds.push(`sendevent ${dev} 0 0 0`);
    lines.push(downCmds.join('\n'));

    // Move frames
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      lines.push(`usleep ${stepDelayUs}`);
      const moveCmds: string[] = [];
      for (let f = 0; f < fingers.length; f++) {
        const cssX = fingers[f].startX + (fingers[f].endX - fingers[f].startX) * t;
        const cssY = fingers[f].startY + (fingers[f].endY - fingers[f].startY) * t;
        const screen = this.cssToScreen(cssX, cssY, chromeBarHeight, dpr);
        const raw = toRaw(screen.x, screen.y);
        moveCmds.push(`sendevent ${dev} 3 47 ${f}`);
        moveCmds.push(`sendevent ${dev} 3 53 ${raw.rawX}`);
        moveCmds.push(`sendevent ${dev} 3 54 ${raw.rawY}`);
      }
      moveCmds.push(`sendevent ${dev} 0 0 0`);
      lines.push(moveCmds.join('\n'));
    }

    // Touch up all fingers
    const upCmds: string[] = [];
    for (let f = 0; f < fingers.length; f++) {
      upCmds.push(`sendevent ${dev} 3 47 ${f}`);
      upCmds.push(`sendevent ${dev} 3 57 4294967295`); // -1 as unsigned 32-bit
    }
    upCmds.push(`sendevent ${dev} 0 0 0`);
    lines.push(upCmds.join('\n'));

    // Push and run
    const script = lines.join('\n');
    const remotePath = '/data/local/tmp/playtest_gesture.sh';
    const localTmp = `${process.env.TEMP || '/tmp'}/playtest_gesture.sh`;
    writeFileSync(localTmp, script.replace(/\r\n/g, '\n'), 'utf-8');
    execSync(`adb -s ${this.serial} push "${localTmp}" ${remotePath} 2>&1`, { stdio: 'pipe' });
    this.shell(`chmod +x ${remotePath} && ${remotePath}`);
    this.shell(`rm ${remotePath}`);
  }

  // ---- Multi-Touch via sendevent ----

  /**
   * Send a multi-touch frame. All touch points are committed atomically via SYN_REPORT.
   * Coordinates are in screen pixels (portrait orientation).
   */
  touchFrame(points: Array<{ slot: number; x: number; y: number; trackingId: number }>): void {
    const cmds: string[] = [];
    for (const p of points) {
      const rawX = Math.round((p.x / SCREEN_W_PORTRAIT) * DIGITIZER_MAX);
      const rawY = Math.round((p.y / SCREEN_H_PORTRAIT) * DIGITIZER_MAX);
      cmds.push(this.se(3, 47, p.slot));       // ABS_MT_SLOT
      cmds.push(this.se(3, 57, p.trackingId)); // ABS_MT_TRACKING_ID (-1 = up)
      if (p.trackingId >= 0) {
        cmds.push(this.se(3, 53, rawX));        // ABS_MT_POSITION_X
        cmds.push(this.se(3, 54, rawY));        // ABS_MT_POSITION_Y
        cmds.push(this.se(3, 48, 10));          // ABS_MT_TOUCH_MAJOR
      }
    }
    cmds.push(this.se(0, 0, 0));                // SYN_REPORT
    this.shell(cmds.join(' && '));
  }

  /**
   * Push a shell script to the device and execute it for low-latency multi-frame gestures.
   * Returns the remote path for cleanup.
   */
  pushAndRunScript(frames: string[][], label: string): void {
    const lines: string[] = ['#!/system/bin/sh'];
    for (const frame of frames) {
      lines.push(frame.join('\n'));
      lines.push('usleep 16000'); // ~60fps frame pacing
    }
    const script = lines.join('\n');
    const remotePath = `/data/local/tmp/playtest_${label}.sh`;
    // Write locally, push, execute
    const localTmp = `${process.env.TEMP || '/tmp'}/playtest_${label}.sh`;
    writeFileSync(localTmp, script, 'utf-8');
    execSync(`adb -s ${this.serial} push "${localTmp}" ${remotePath}`);
    this.shell(`chmod +x ${remotePath} && ${remotePath}`);
    this.shell(`rm ${remotePath}`);
  }

  // ---- Chrome DevTools Socket Discovery ----

  findChromeSocket(): string {
    const out = this.shell('cat /proc/net/unix | grep chrome_devtools_remote');
    const lines = out.split('\n').filter(l => l.includes('@chrome_devtools_remote'));
    // Prefer PID-specific socket (not bare chrome_devtools_remote which may be Brave)
    const pidSocket = lines.find(l => /chrome_devtools_remote_\d+/.test(l));
    if (pidSocket) {
      const match = pidSocket.match(/@(chrome_devtools_remote_\d+)/);
      if (match) return match[1];
    }
    // Fallback to generic
    const generic = lines.find(l => /@chrome_devtools_remote\s*$/.test(l.trim()));
    if (generic) return 'chrome_devtools_remote';
    throw new Error('No Chrome DevTools socket found. Is Chrome running on the device?');
  }

  forwardCDP(localPort: number = 9222): void {
    execSync(`adb -s ${this.serial} forward --remove-all`);
    const socket = this.findChromeSocket();
    execSync(`adb -s ${this.serial} forward tcp:${localPort} localabstract:${socket}`);
    // Verify
    const version = execSync(`curl -s http://127.0.0.1:${localPort}/json/version`).toString();
    const parsed = JSON.parse(version);
    if (!parsed['Android-Package']?.includes('chrome')) {
      console.warn(`Warning: connected to ${parsed['Android-Package']} (expected Chrome)`);
    }
    console.log(`CDP forwarded: port ${localPort} -> ${socket} (${parsed.Browser})`);
  }

  // ---- Chrome Launch ----

  launchChrome(url?: string): void {
    const intent = url
      ? `am start -n com.android.chrome/com.google.android.apps.chrome.Main -d "${url}"`
      : 'am start -n com.android.chrome/com.google.android.apps.chrome.Main';
    this.shell(intent);
  }

  // ---- Helpers ----

  private se(type: number, code: number, value: number): string {
    return `sendevent ${TOUCH_DEVICE} ${type} ${code} ${value}`;
  }

  shell(cmd: string): string {
    return execSync(`adb -s ${this.serial} shell "${cmd.replace(/"/g, '\\"')}"`).toString();
  }

  private sleep(ms: number): void {
    execSync(`powershell -Command "Start-Sleep -Milliseconds ${ms}"`);
  }
}
