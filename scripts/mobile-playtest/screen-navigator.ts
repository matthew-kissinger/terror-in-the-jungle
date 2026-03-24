import type { CDPBridge } from './cdp-bridge';
import type { ADBController } from './adb-controller';
import type { TouchInjector } from './touch-injector';

export type ScreenSnap = (label: string) => Promise<void>;

/**
 * Navigates through the game's UI screens.
 *
 * For menu taps we use Playwright's page.locator().tap() which handles
 * coordinate mapping correctly on remote devices. Raw CDP touch injection
 * is reserved for gameplay multi-touch (via TouchInjector).
 *
 * ADB input tap is the fallback if Playwright tap doesn't work.
 */
export class ScreenNavigator {
  constructor(
    private bridge: CDPBridge,
    private touch: TouchInjector,
    private adb: ADBController,
  ) {}

  /** Tap an element by evaluating its bounding rect and using ADB input tap. */
  private async tapElement(selector: string, description: string): Promise<void> {
    // Get element position in CSS viewport coords
    const pos = await this.bridge.evaluate(`
      (() => {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      })()
    `);
    if (!pos) {
      console.warn(`    ${description}: element not found (${selector}), trying text search...`);
      return;
    }
    console.log(`    ${description}: tap at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}) [${pos.w.toFixed(0)}x${pos.h.toFixed(0)}]`);

    // Try Playwright tap first (handles coordinate mapping)
    try {
      await this.bridge.page.locator(selector).first().tap({ timeout: 3000 });
      return;
    } catch {
      console.log(`    Playwright tap failed for ${selector}, falling back to CDP touch...`);
    }

    // Fallback: CDP touch
    await this.touch.tap(pos.x, pos.y);
  }

  /** Tap a button by text content using Playwright text selector. */
  private async tapButtonByText(text: string, description: string): Promise<void> {
    console.log(`    ${description}: looking for button with text "${text}"...`);
    try {
      const locator = this.bridge.page.locator(`button:has-text("${text}")`).first();
      await locator.tap({ timeout: 5000 });
      return;
    } catch {
      console.log(`    Playwright text tap failed, trying evaluate + CDP...`);
    }

    // Fallback: find by text via evaluate, tap via CDP
    const pos = await this.bridge.evaluate(`
      (() => {
        const buttons = [...document.querySelectorAll('button')];
        const btn = buttons.find(b => b.textContent?.includes('${text}'));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()
    `);
    if (!pos) throw new Error(`Button with text "${text}" not found`);
    await this.touch.tap(pos.x, pos.y);
  }

  /** Wait for a condition, taking periodic screenshots during the wait. */
  private async waitWithScreenshots(
    fn: string,
    timeoutMs: number,
    snap: ScreenSnap,
    label: string,
    intervalMs: number = 10_000,
  ): Promise<void> {
    const startTime = Date.now();
    let snapCount = 0;

    // Take a screenshot periodically while waiting
    const interval = setInterval(async () => {
      snapCount++;
      try {
        await snap(`${label}-waiting-${snapCount}`);
      } catch { /* ignore screenshot failures during wait */ }
    }, intervalMs);

    try {
      await this.bridge.waitForFunction(fn, timeoutMs);
    } finally {
      clearInterval(interval);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`    Wait for ${label} completed in ${elapsed}s`);
  }

  // ---- Screen Flow ----

  /** Wait for title screen to be fully loaded and ready to play. */
  async waitForTitleReady(snap: ScreenSnap): Promise<void> {
    console.log('  Waiting for title screen...');
    await this.waitWithScreenshots(`
      (() => {
        const buttons = [...document.querySelectorAll('button')];
        const start = buttons.find(b => b.textContent?.includes('START GAME'));
        if (!start) return false;
        const style = getComputedStyle(start);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })()
    `, 120_000, snap, 'title', 15_000);
    await sleep(500);
    await snap('title-ready');
  }

  /** Tap START GAME button. */
  async tapStartGame(snap: ScreenSnap): Promise<void> {
    console.log('  Tapping START GAME...');
    await this.tapButtonByText('START GAME', 'START GAME');
    await sleep(2000); // fullscreen + transition time
    await snap('after-start');
  }

  /** Wait for mode select screen and tap a mode card. */
  async selectMode(mode: string, snap: ScreenSnap): Promise<void> {
    console.log(`  Waiting for mode select, choosing ${mode}...`);
    const selector = `[data-mode="${mode}"]`;

    await this.waitWithScreenshots(`
      (() => {
        const card = document.querySelector('[data-mode="${mode}"]');
        if (!card) return false;
        const style = getComputedStyle(card);
        return style.display !== 'none';
      })()
    `.replace(/\$\{mode\}/g, mode), 30_000, snap, 'mode-select', 5_000);
    await sleep(300);
    await snap('mode-select');

    await this.tapElement(selector, `Mode card: ${mode}`);
    await sleep(500);
    await snap('mode-selected');
  }

  /** Wait for deploy screen, select first available spawn, and deploy. */
  async waitAndDeploy(snap: ScreenSnap): Promise<void> {
    console.log('  Waiting for deploy screen...');
    await this.waitWithScreenshots(`
      (() => {
        const ui = document.getElementById('respawn-ui');
        return ui && getComputedStyle(ui).display !== 'none';
      })()
    `, 120_000, snap, 'deploy', 10_000);
    await sleep(1000);
    await snap('deploy-screen');

    // Try to click on the map to select a spawn point
    console.log('  Selecting spawn point...');
    const mapCenter = await this.bridge.getElementCenter('#respawn-map');
    if (mapCenter) {
      try {
        await this.bridge.page.locator('#respawn-map').tap({ timeout: 3000 });
      } catch {
        await this.touch.tap(mapCenter.x, mapCenter.y);
      }
      await sleep(500);
      await snap('spawn-selected');
    }

    // Wait for deploy button to be enabled
    console.log('  Waiting for DEPLOY to be enabled...');
    await this.waitWithScreenshots(`
      (() => {
        const btn = document.getElementById('respawn-button');
        if (!btn) return false;
        return !btn.disabled && getComputedStyle(btn).opacity !== '0.45';
      })()
    `, 120_000, snap, 'deploy-ready', 10_000);
    await snap('deploy-ready');

    await this.tapElement('#respawn-button', 'DEPLOY button');
    await sleep(2000);
    await snap('deployed');
  }

  /** Wait for gameplay HUD to be active. */
  async waitForGameplay(snap: ScreenSnap): Promise<void> {
    console.log('  Waiting for gameplay...');
    // The deploy screen hides after spawn, so just wait for it to disappear
    // or for a canvas to exist. Use a simple check with generous timeout.
    try {
      await this.waitWithScreenshots(`
        (() => {
          const respawnUI = document.getElementById('respawn-ui');
          if (respawnUI && getComputedStyle(respawnUI).display !== 'none') return false;
          return !!document.querySelector('canvas');
        })()
      `, 60_000, snap, 'gameplay', 5_000);
    } catch {
      console.log('  Gameplay wait timed out, proceeding anyway...');
    }
    // Give the game time to stabilize rendering
    await sleep(3000);
    await snap('gameplay-active');
  }

  /** Get positions of touch control zones for gameplay testing. */
  async getTouchZones(): Promise<TouchZones> {
    return this.bridge.evaluate(`
      (() => {
        const vp = { w: window.innerWidth, h: window.innerHeight };
        const joystickBase = { x: vp.w * 0.15, y: vp.h * 0.75 };
        const lookCenter = { x: vp.w * 0.7, y: vp.h * 0.5 };

        function center(sel) {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }

        return {
          viewport: vp,
          joystickBase,
          lookCenter,
          fireCenter: center('[class*="fireBtn"]') || { x: vp.w * 0.85, y: vp.h * 0.6 },
          adsCenter: center('[class*="adsBtn"]') || { x: vp.w * 0.93, y: vp.h * 0.6 },
          reloadCenter: center('[class*="actionBtn"]') || { x: vp.w * 0.88, y: vp.h * 0.35 },
          menuCenter: center('[class*="menuBtn"]') || { x: 30, y: 30 },
        };
      })()
    `);
  }

  /** Enter fullscreen via JS. */
  async requestFullscreen(): Promise<void> {
    await this.bridge.evaluate(`document.documentElement.requestFullscreen().catch(() => {})`);
    await sleep(500);
  }

  /** Exit fullscreen. */
  async exitFullscreen(): Promise<void> {
    await this.bridge.evaluate(`document.exitFullscreen().catch(() => {})`);
    await sleep(500);
  }

  /** Check if fullscreen is active. */
  async isFullscreen(): Promise<boolean> {
    return this.bridge.evaluate(`!!document.fullscreenElement`);
  }

  /** Open settings modal. */
  async openSettings(snap: ScreenSnap): Promise<void> {
    const zones = await this.getTouchZones();
    await this.touch.tap(zones.menuCenter.x, zones.menuCenter.y);
    await sleep(500);
    await snap('settings-open');
  }

  /** Close settings modal. */
  async closeSettings(snap: ScreenSnap): Promise<void> {
    try {
      await this.bridge.page.locator('[class*="closeBtn"]').first().tap({ timeout: 3000 });
    } catch {
      await this.bridge.page.keyboard.press('Escape');
    }
    await sleep(500);
    await snap('settings-closed');
  }

  /** Run full screen flow: title -> mode -> deploy -> gameplay. */
  async runFullFlow(mode: string, snap: ScreenSnap): Promise<void> {
    await this.waitForTitleReady(snap);
    await this.tapStartGame(snap);
    await this.selectMode(mode, snap);
    await this.waitAndDeploy(snap);
    await this.waitForGameplay(snap);
  }
}

export type TouchZones = {
  viewport: { w: number; h: number };
  joystickBase: { x: number; y: number };
  lookCenter: { x: number; y: number };
  fireCenter: { x: number; y: number };
  adsCenter: { x: number; y: number };
  reloadCenter: { x: number; y: number };
  menuCenter: { x: number; y: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
