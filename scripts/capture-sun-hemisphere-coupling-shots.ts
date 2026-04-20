#!/usr/bin/env tsx
/**
 * Capture review screenshots for `atmosphere-sun-hemisphere-coupling`.
 *
 * Usage:
 *   npx tsx scripts/capture-sun-hemisphere-coupling-shots.ts
 *
 * Boots `vite preview --outDir dist-perf` (perf-harness bundle, exposes
 * `window.__engine`), launches Playwright (Chromium, 1920x1080), starts
 * each scenario, then injects a test sky backend into the live
 * `AtmosphereSystem` to simulate the per-scenario time-of-day that
 * `atmosphere-hosek-wilkie-sky` will eventually provide.
 *
 * Output PNGs land in
 *   docs/cycles/cycle-2026-04-20-atmosphere-foundation/screenshots/atmosphere-sun-hemisphere-coupling/
 *
 * Why inject a backend: the Hosek-Wilkie backend is not on master yet, so
 * the default `NullSkyBackend` produces a single static sun direction for
 * every scenario. This task's job is the LIGHT WIRING, not the sky model —
 * so we swap a test backend per shot to verify the wiring drives moonLight
 * position + color + hemisphere colors from the atmosphere each frame. The
 * reviewer should see:
 *   - Sun light direction visibly changes per injected preset.
 *   - Shadows point opposite the injected sun azimuth.
 *   - Hemisphere sky/ground tints shift with injected zenith/horizon.
 *   - Storm multiplier still dims moonLight intensity (weather wins).
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

type Pose = {
  position: [number, number, number];
  yawDeg: number;
  pitchDeg: number;
};

type InjectedSky = {
  sunDirection: [number, number, number];
  sunColorHex: number;
  zenithHex: number;
  horizonHex: number;
};

type ShotPlan = {
  filename: string;
  mode: string;
  pose: Pose;
  sky: InjectedSky;
  weather?: 'clear' | 'storm';
  description: string;
  settleSec: number;
};

const PORT = 9104;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;

const OUTPUT_DIR = join(
  process.cwd(),
  'docs',
  'cycles',
  'cycle-2026-04-20-atmosphere-foundation',
  'screenshots',
  'atmosphere-sun-hemisphere-coupling'
);

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function shotPlans(): ShotPlan[] {
  return [
    {
      filename: 'ashau-dawn-shadow',
      mode: 'a_shau_valley',
      // Player-eye height (y=12) on the valley floor, looking south so the
      // sun coming from +X (east) throws shadows toward -X (left side of
      // frame). Pitch slightly down so terrain + vegetation shadow
      // receivers fill the frame.
      pose: { position: [40, 12, 10], yawDeg: -10, pitchDeg: -6 },
      sky: {
        // Dawn sun: low-east. Azimuth ~+X, elevation ~10deg.
        sunDirection: [Math.cos(0.175), Math.sin(0.175), 0.0],
        sunColorHex: 0xffb074, // warm amber
        zenithHex: 0x5e7fae,
        horizonHex: 0xd89a6a,
      },
      description: 'A Shau at dawn — low east sun; shadows run westward (left in this -Z-facing frame).',
      settleSec: 10,
    },
    {
      filename: 'openfrontier-noon-water',
      mode: 'open_frontier',
      // Open frontier puts a water plane around y=0. Stand just above it,
      // pitch down toward where the high-noon sun specular highlight lands.
      // Water texture tiles around the camera so any over-water framing
      // shows the water surface.
      pose: { position: [10, 1.5, 0], yawDeg: 90, pitchDeg: -22 },
      sky: {
        // High noon sun (near zenith), slight offset so the specular
        // highlight lands in the lower-center third of the frame.
        sunDirection: [0.15, 0.95, -0.28],
        sunColorHex: 0xfff5d8, // bright neutral
        zenithHex: 0x4a7bbd,
        horizonHex: 0xa4b8c6,
      },
      description: 'Open Frontier at noon — sun specular tracks the injected near-zenith sun direction on the water surface.',
      settleSec: 10,
    },
    {
      filename: 'tdm-dusk-shadow',
      mode: 'tdm',
      // TDM is a small arena. Player-eye height, facing east (+X) so dusk
      // sun coming from -X casts long shadows TOWARD camera (+X direction).
      // Slight pitch down so the long shadows are visible across the floor.
      pose: { position: [-15, 8, 0], yawDeg: 90, pitchDeg: -10 },
      sky: {
        // Dusk sun: low-west. Negative X, elevation ~6deg.
        sunDirection: [-Math.cos(0.105), Math.sin(0.105), 0.2],
        sunColorHex: 0xff7a3a, // deep orange
        zenithHex: 0x2e3f6b,
        horizonHex: 0xd67743,
      },
      description: 'TDM at dusk — low west sun; long shadows stretch eastward (toward +X).',
      settleSec: 10,
    },
    {
      filename: 'combat120-storm',
      mode: 'ai_sandbox',
      // Ground-level combat120 framing: bot-POV-style at y=4, low angle so
      // dense jungle vegetation dominates the foreground (matches the look
      // of the historical combat120 baseline). Storm multiplier dims the
      // moonLight intensity on top of the atmosphere-driven sun color.
      pose: { position: [0, 4, 0], yawDeg: 0, pitchDeg: -2 },
      sky: {
        // Overcast tint at high noon; the STORM multiplier in
        // WeatherAtmosphere.ts will dim intensity on top of this.
        sunDirection: [0.12, 0.97, -0.2],
        sunColorHex: 0xbcc0c4, // overcast grey
        zenithHex: 0x3a4450,
        horizonHex: 0x4a5660,
      },
      weather: 'storm',
      description: 'combat120 under storm — weather multiplier still wins (visibly dim) but shadows persist.',
      settleSec: 12,
    },
  ];
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as any).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS }
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as any).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
  }, mode);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as any).__engine;
      return {
        gameStarted: Boolean(e?.gameStarted),
        phase: String(e?.startupFlow?.getState?.()?.phase ?? ''),
      };
    });
    if (state.gameStarted || state.phase === 'live') return;
    await page.waitForTimeout(250);
  }
  throw new Error(`Mode ${mode} did not enter live phase`);
}

async function dismissBriefingIfPresent(page: Page): Promise<void> {
  const beginBtn = page.locator('[data-ref="beginBtn"]');
  try {
    if (await beginBtn.isVisible({ timeout: 1500 })) {
      await beginBtn.click();
      logStep('Dismissed mission briefing');
      await page.waitForTimeout(500);
    }
  } catch {
    // not present, fine
  }
}

async function injectSkyBackend(page: Page, sky: InjectedSky): Promise<void> {
  // Build the in-page snippet as a string to avoid tsx injecting its
  // `__name` / `__publicField` helpers into the serialized function, which
  // Playwright's page.evaluate does not define.
  const script = `
    (function(s) {
      var engine = window.__engine;
      var atmosphere = engine && engine.systemManager && engine.systemManager.atmosphereSystem;
      var scene = engine && engine.renderer && engine.renderer.scene;
      if (!atmosphere || !scene) throw new Error('atmosphereSystem / scene unavailable');

      var moonLight = engine.renderer.moonLight;
      var ColorCtor = moonLight.color.constructor;
      var Vec3Ctor = moonLight.position.constructor;

      var sunDir = new Vec3Ctor(s.sunDirection[0], s.sunDirection[1], s.sunDirection[2]);
      if (sunDir.lengthSq() > 0) sunDir.normalize();
      var sunColor = new ColorCtor(s.sunColorHex);
      var zenith = new ColorCtor(s.zenithHex);
      var horizon = new ColorCtor(s.horizonHex);

      var backend = {
        update: function (_dt, out) { if (out && typeof out.copy === 'function') out.copy(sunDir); },
        sample: function (_dir, out) { return out.copy(zenith); },
        getSun: function (out) { return out.copy(sunColor); },
        getZenith: function (out) { return out.copy(zenith); },
        getHorizon: function (out) { return out.copy(horizon); }
      };
      atmosphere.setBackend(backend);
      atmosphere.sunDirection.copy(sunDir);
      if (typeof atmosphere.update === 'function') atmosphere.update(0);
    })(${JSON.stringify(sky)});
  `;
  await page.evaluate(script);
}

async function forceWeather(page: Page, weather: 'clear' | 'storm'): Promise<void> {
  const script = `
    (function (w) {
      var engine = window.__engine;
      var weatherSystem = engine && engine.systemManager && engine.systemManager.weatherSystem;
      if (!weatherSystem) return;
      var state = w === 'storm' ? 'storm' : 'clear';
      try {
        // Some modes (ai_sandbox, tdm) ship with weather disabled. Force a
        // minimal enabled config so setWeatherState actually runs the
        // atmosphere modulation chain. cycleDuration is set huge so no
        // automatic transition fights the screenshot.
        weatherSystem.setWeatherConfig({
          enabled: true,
          initialState: state,
          transitionChance: 0,
          cycleDuration: { min: 9999, max: 9999 }
        });
        weatherSystem.setWeatherState(state, true);
      } catch (err) {
        console.warn('forceWeather failed:', err);
      }
    })(${JSON.stringify(weather)});
  `;
  await page.evaluate(script);
}

async function poseAndRender(page: Page, pose: Pose, viewport: { width: number; height: number }): Promise<void> {
  const script = `
    (function (p, vp) {
      var engine = window.__engine;
      var renderer = engine && engine.renderer;
      var camera = renderer && renderer.camera;
      var threeRenderer = renderer && renderer.renderer;
      var scene = renderer && renderer.scene;
      var pp = renderer && renderer.postProcessing;
      if (!engine || !camera || !threeRenderer || !scene) {
        throw new Error('engine/camera/renderer/scene unavailable');
      }

      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      threeRenderer.setSize(vp.width, vp.height, true);
      if (pp && typeof pp.setSize === 'function') pp.setSize(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        if (typeof camera.updateProjectionMatrix === 'function') camera.updateProjectionMatrix();
      }

      camera.position.set(p.position[0], p.position[1], p.position[2]);
      var yawRad = (p.yawDeg * Math.PI) / 180;
      var pitchRad = (p.pitchDeg * Math.PI) / 180;
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitchRad, yawRad, 0);
      camera.updateMatrixWorld(true);

      var skybox = engine.systemManager && engine.systemManager.skybox;
      if (skybox && typeof skybox.updatePosition === 'function') {
        skybox.updatePosition(camera.position);
      }

      // Make sure the atmosphere sees the repositioned camera so the
      // shadow frustum recentering is correct for this shot.
      var atmosphere = engine.systemManager && engine.systemManager.atmosphereSystem;
      if (atmosphere && typeof atmosphere.update === 'function') {
        atmosphere.update(0);
      }

      // Two renders: the first refreshes the shadow map + post-process
      // buffers against the repositioned camera; the second captures a
      // stable frame with the shadows consistent.
      for (var i = 0; i < 2; i++) {
        if (pp && typeof pp.beginFrame === 'function') pp.beginFrame();
        threeRenderer.render(scene, camera);
        if (pp && typeof pp.endFrame === 'function') pp.endFrame();
      }
    })(${JSON.stringify(pose)}, ${JSON.stringify(viewport)});
  `;
  await page.evaluate(script);
}

async function snap(page: Page, outFile: string): Promise<void> {
  const buffer = await page.screenshot({ type: 'png', fullPage: false });
  writeFileSync(outFile, buffer);
  logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
}

async function captureScenario(page: Page, plan: ShotPlan): Promise<void> {
  await startMode(page, plan.mode);
  await dismissBriefingIfPresent(page);

  logStep(`Settling ${plan.settleSec}s for ${plan.mode}`);
  await page.waitForTimeout(plan.settleSec * 1000);

  // Hide the HUD so the screenshot is scene-only.
  await page.addStyleTag({
    content: `
      body > *:not(canvas) { display: none !important; }
      canvas { position: fixed !important; inset: 0 !important; }
    `,
  });

  // Inject the test sky BEFORE pose+render so the atmosphere's update()
  // pushes the injected state onto the renderer lights.
  await injectSkyBackend(page, plan.sky);

  if (plan.weather) {
    await forceWeather(page, plan.weather);
    // Let the weather transition apply before we snap.
    await page.waitForTimeout(200);
  }

  // Let the engine run for a few frames so terrain streams in, shadow
  // map refreshes, and the atmosphere state propagates end-to-end.
  await page.waitForTimeout(1500);

  await poseAndRender(page, plan.pose, VIEWPORT);
  const outFile = join(OUTPUT_DIR, `${plan.filename}.png`);
  await snap(page, outFile);

  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && typeof engine.start === 'function') engine.start();
  });
}

async function main(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    logStep(`Created ${OUTPUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  try {
    server = await startServer({
      mode: 'perf',
      port: PORT,
      buildIfMissing: false,
      log: logStep,
    });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[browser] ${msg.text()}`);
      }
    });

    const url = `http://127.0.0.1:${PORT}/?perf=1&uiTransitions=0`;
    logStep(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
    await waitForEngine(page);

    for (const plan of shotPlans()) {
      try {
        await captureScenario(page, plan);
      } catch (err) {
        console.error(`Failed scenario ${plan.mode}:`, err);
      }
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }
}

main().catch((err) => {
  console.error('capture-sun-hemisphere-coupling-shots failed:', err);
  process.exit(1);
});
