import type { CDPBridge } from './cdp-bridge';
import type { TouchInjector } from './touch-injector';
import type { ADBController } from './adb-controller';
import type { ScreenNavigator, ScreenSnap, TouchZones } from './screen-navigator';

export type ScenarioResult = {
  name: string;
  passed: boolean;
  details: string;
  errors: string[];
};

/**
 * Gameplay test scenarios using CDP multi-touch injection.
 * The game code wraps setPointerCapture in try-catch so CDP touch events
 * (which are trusted but fail pointer capture) still drive the controls.
 */
export class GameplayScenarios {
  constructor(
    private bridge: CDPBridge,
    private touch: TouchInjector,
    private nav: ScreenNavigator,
    private adb?: ADBController,
  ) {}

  /** Run all gameplay scenarios. */
  async runAll(snap: ScreenSnap): Promise<ScenarioResult[]> {
    const zones = await this.nav.getTouchZones();
    console.log(`    Touch zones: viewport=${zones.viewport.w}x${zones.viewport.h}`);
    console.log(`    Joystick: (${zones.joystickBase.x.toFixed(0)}, ${zones.joystickBase.y.toFixed(0)})`);
    console.log(`    Look: (${zones.lookCenter.x.toFixed(0)}, ${zones.lookCenter.y.toFixed(0)})`);
    console.log(`    Fire: (${zones.fireCenter.x.toFixed(0)}, ${zones.fireCenter.y.toFixed(0)})`);

    const results: ScenarioResult[] = [];

    // Single touch
    results.push(await this.testWalkForward(zones, snap));
    results.push(await this.testLookAround(zones, snap));
    results.push(await this.testFire(zones, snap));

    // Multi-touch
    results.push(await this.testWalkAndLook(zones, snap));
    results.push(await this.testWalkAndFire(zones, snap));
    results.push(await this.testWalkLookFire(zones, snap));

    // Transitions
    results.push(await this.testSettingsOverlay(zones, snap));
    results.push(await this.testFullscreenToggle(zones, snap));

    return results;
  }

  // ---- Single Touch ----

  private async testWalkForward(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'walk-forward';
    console.log(`    [${name}] Joystick drag up 3s...`);
    try {
      const posBefore = await this.getPlayerPosition();
      await this.touch.drag(
        zones.joystickBase,
        { x: zones.joystickBase.x, y: zones.joystickBase.y - 60 },
        3000, 0, 30,
      );
      await sleep(500);
      const posAfter = await this.getPlayerPosition();
      await snap(name);

      const moved = posBefore && posAfter && dist(posBefore, posAfter) > 0.1;
      return { name, passed: !!moved, details: `pos: ${fmt(posBefore)} -> ${fmt(posAfter)}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  private async testLookAround(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'look-around';
    console.log(`    [${name}] Look drag right 3s...`);
    try {
      const yawBefore = await this.getCameraYaw();
      await this.touch.drag(
        zones.lookCenter,
        { x: zones.lookCenter.x + 150, y: zones.lookCenter.y },
        3000, 1, 30,
      );
      await sleep(500);
      const yawAfter = await this.getCameraYaw();
      await snap(name);

      const turned = yawBefore !== null && yawAfter !== null && Math.abs(yawAfter - yawBefore) > 0.01;
      return { name, passed: !!turned, details: `yaw: ${yawBefore?.toFixed(3)} -> ${yawAfter?.toFixed(3)}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  private async testFire(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'fire-weapon';
    console.log(`    [${name}] Hold fire 2s...`);
    try {
      const ammoBefore = await this.getAmmo();
      await this.touch.hold(zones.fireCenter.x, zones.fireCenter.y, 2000, 2);
      await sleep(500);
      const ammoAfter = await this.getAmmo();
      await snap(name);

      const fired = ammoBefore !== null && ammoAfter !== null && ammoAfter < ammoBefore;
      return { name, passed: !!fired, details: `ammo: ${ammoBefore} -> ${ammoAfter}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  // ---- Multi-Touch ----

  private async testWalkAndLook(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'walk-and-look';
    console.log(`    [${name}] Dual drag 5s...`);
    try {
      const posBefore = await this.getPlayerPosition();
      const yawBefore = await this.getCameraYaw();

      await this.touch.dualDrag(
        { start: zones.joystickBase, end: { x: zones.joystickBase.x, y: zones.joystickBase.y - 60 } },
        { start: zones.lookCenter, end: { x: zones.lookCenter.x + 150, y: zones.lookCenter.y } },
        5000, 50,
      );
      await sleep(500);

      const posAfter = await this.getPlayerPosition();
      const yawAfter = await this.getCameraYaw();
      await snap(name);

      const walked = posBefore && posAfter && dist(posBefore, posAfter) > 0.1;
      const looked = yawBefore !== null && yawAfter !== null && Math.abs(yawAfter - yawBefore) > 0.01;
      return { name, passed: !!walked && !!looked, details: `walked: ${walked}, looked: ${looked}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  private async testWalkAndFire(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'walk-and-fire';
    console.log(`    [${name}] Walk + fire 3s...`);
    try {
      const ammoBefore = await this.getAmmo();

      await this.touch.dualDrag(
        { start: zones.joystickBase, end: { x: zones.joystickBase.x, y: zones.joystickBase.y - 60 } },
        { start: zones.fireCenter, end: zones.fireCenter }, // hold fire stationary
        3000, 30,
      );
      await sleep(500);

      const ammoAfter = await this.getAmmo();
      await snap(name);

      const fired = ammoBefore !== null && ammoAfter !== null && ammoAfter < ammoBefore;
      return { name, passed: !!fired, details: `ammo: ${ammoBefore} -> ${ammoAfter}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  private async testWalkLookFire(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'walk-look-fire';
    console.log(`    [${name}] Triple touch 5s...`);
    try {
      const posBefore = await this.getPlayerPosition();
      const ammoBefore = await this.getAmmo();

      await this.touch.tripleTouchDragHold(
        { start: zones.joystickBase, end: { x: zones.joystickBase.x + 30, y: zones.joystickBase.y - 50 } },
        { start: zones.lookCenter, end: { x: zones.lookCenter.x + 100, y: zones.lookCenter.y - 20 } },
        zones.fireCenter,
        5000, 50,
      );
      await sleep(500);

      const posAfter = await this.getPlayerPosition();
      const ammoAfter = await this.getAmmo();
      await snap(name);

      const walked = posBefore && posAfter && dist(posBefore, posAfter) > 0.1;
      const fired = ammoBefore !== null && ammoAfter !== null && ammoAfter < ammoBefore;
      return { name, passed: !!walked && !!fired, details: `walked: ${walked}, fired: ${fired}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  // ---- Transitions ----

  private async testSettingsOverlay(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'settings-overlay';
    console.log(`    [${name}] Open/close settings...`);
    try {
      await this.touch.tap(zones.menuCenter.x, zones.menuCenter.y);
      await sleep(1000);
      await snap(`${name}-open`);

      await this.bridge.page.keyboard.press('Escape');
      await sleep(1000);
      await snap(`${name}-closed`);

      // Verify controls still work
      const posBefore = await this.getPlayerPosition();
      await this.touch.drag(
        zones.joystickBase,
        { x: zones.joystickBase.x, y: zones.joystickBase.y - 50 },
        1500, 0, 15,
      );
      await sleep(500);
      const posAfter = await this.getPlayerPosition();
      await snap(`${name}-controls-after`);

      const stillWorks = posBefore && posAfter && dist(posBefore, posAfter) > 0.05;
      return { name, passed: !!stillWorks, details: `controls after settings: ${stillWorks}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  private async testFullscreenToggle(zones: TouchZones, snap: ScreenSnap): Promise<ScenarioResult> {
    const name = 'fullscreen-toggle';
    console.log(`    [${name}] Exit/re-enter fullscreen...`);
    try {
      await this.nav.exitFullscreen();
      await sleep(1500);
      await snap(`${name}-exited`);

      await this.nav.requestFullscreen();
      await sleep(1500);
      await snap(`${name}-re-entered`);

      const updatedZones = await this.nav.getTouchZones();
      const posBefore = await this.getPlayerPosition();
      await this.touch.drag(
        updatedZones.joystickBase,
        { x: updatedZones.joystickBase.x, y: updatedZones.joystickBase.y - 50 },
        1500, 0, 15,
      );
      await sleep(500);
      const posAfter = await this.getPlayerPosition();
      await snap(`${name}-controls-after`);

      const stillWorks = posBefore && posAfter && dist(posBefore, posAfter) > 0.05;
      return { name, passed: !!stillWorks, details: `controls after FS toggle: ${stillWorks}`, errors: [] };
    } catch (e) {
      await snap(`${name}-error`);
      return { name, passed: false, details: String(e), errors: [String(e)] };
    }
  }

  // ---- Game State Queries ----

  private async getPlayerPosition(): Promise<{ x: number; y: number; z: number } | null> {
    return this.bridge.evaluate(`
      (() => {
        try {
          const e = window.__engine;
          if (!e) return null;
          const p = e.player?.mesh?.position
            || e.player?.position
            || e.playerController?.position
            || e.systems?.player?.mesh?.position;
          if (!p) return null;
          return { x: p.x, y: p.y, z: p.z };
        } catch { return null; }
      })()
    `);
  }

  private async getCameraYaw(): Promise<number | null> {
    return this.bridge.evaluate(`
      (() => {
        try {
          const r = window.__renderer;
          if (r?.camera) return r.camera.rotation.y;
          const e = window.__engine;
          if (e?.camera) return e.camera.rotation.y;
          return null;
        } catch { return null; }
      })()
    `);
  }

  private async getAmmo(): Promise<number | null> {
    return this.bridge.evaluate(`
      (() => {
        try {
          const e = window.__engine;
          if (!e) return null;
          const w = e.player?.weapon
            || e.player?.weaponSystem?.currentWeapon
            || e.systems?.weaponSystem?.currentWeapon;
          if (!w) return null;
          return w.ammo ?? w.currentAmmo ?? w.magazineAmmo ?? null;
        } catch { return null; }
      })()
    `);
  }
}

function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
}

function fmt(obj: unknown): string {
  if (!obj) return 'null';
  return JSON.stringify(obj, (_k, v) => typeof v === 'number' ? Math.round(v * 100) / 100 : v);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
