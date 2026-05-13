import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { chromium, type Browser, type Page } from 'playwright';
import { parseServerModeArg, startServer, stopServer, type ServerHandle } from './preview-server';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 9296;
const DEFAULT_MODE = 'open_frontier';

function parseStringFlag(name: string, fallback: string): string {
  const eq = process.argv.find(arg => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function parseNumberFlag(name: string, fallback: number): number {
  const raw = parseStringFlag(name, String(fallback));
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function artifactDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return join(process.cwd(), 'artifacts', 'perf', stamp, 'konveyer-terrain-fire-authority');
}

async function waitForGame(page: Page, mode: string): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__engine?.startGameWithMode), null, { timeout: 90_000 });
  await page.evaluate(async selectedMode => {
    const engine = (window as any).__engine;
    await engine.startGameWithMode(selectedMode);
  }, mode);
  await page.waitForFunction(() => Boolean((window as any).__engine?.gameStarted), null, { timeout: 90_000 });
  await page.waitForTimeout(2_500);
}

async function runProbe(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const win = window as any;
    const engine = win.__engine;
    const systems = engine?.systemManager;
    const terrain = systems?.terrainSystem;
    const combatants = systems?.combatantSystem;
    const playerController = systems?.playerController;
    const capabilities = win.__rendererBackendCapabilities?.() ?? null;

    if (!engine || !systems || !terrain || !combatants) {
      return { status: 'fail', reason: 'engine systems unavailable', capabilities };
    }

    const playerPos = playerController?.getPosition?.();
    const Vector3 = (playerPos?.constructor ?? terrain.getNormalAt(0, 0).constructor) as any;
    const makeVector = (x: number, y: number, z: number) => new Vector3(x, y, z);
    const toPlain = (v: any) => v ? ({ x: Number(v.x), y: Number(v.y), z: Number(v.z) }) : null;
    const hasTerrainAt = (x: number, z: number) => terrain.hasTerrainAt?.(x, z) ?? true;
    const getHeight = (x: number, z: number) => {
      const effective = Number(terrain.getEffectiveHeightAt?.(x, z));
      if (Number.isFinite(effective)) return effective;
      const base = Number(terrain.getHeightAt?.(x, z));
      return Number.isFinite(base) ? base : 0;
    };

    const actorCenterY = 1.6;
    const closeRangeLimit = 199;
    const sampleStep = 2;
    const endpointPadding = 4;
    const closeRidgeMargin = 1.0;
    const requiredConsecutive = 2;
    const worldSize = Number(terrain.getPlayableWorldSize?.() ?? terrain.getWorldSize?.() ?? 512);
    const halfWorld = Math.max(80, worldSize * 0.5 - 24);
    const clampWorld = (value: number) => Math.max(-halfWorld, Math.min(halfWorld, value));

    const seedCenters: Array<{ x: number; z: number }> = [];
    if (playerPos) seedCenters.push({ x: Number(playerPos.x), z: Number(playerPos.z) });
    seedCenters.push({ x: 0, z: 0 });
    for (const x of [-180, -90, 0, 90, 180]) {
      for (const z of [-180, -90, 0, 90, 180]) {
        seedCenters.push({ x, z });
      }
    }

    const scanLine = (origin: any, direction: any, distance: number) => {
      let consecutive = 0;
      let firstBlockingDistance = 0;
      let maxClearance = Number.NEGATIVE_INFINITY;
      const blockingSamples: Array<{ d: number; x: number; z: number; lineY: number; terrainY: number; clearance: number }> = [];
      const summarySamples: Array<{ d: number; x: number; z: number; lineY: number; terrainY: number; clearance: number }> = [];

      for (let d = endpointPadding; d < distance - endpointPadding; d += sampleStep) {
        const point = origin.clone().addScaledVector(direction, d);
        const terrainY = getHeight(point.x, point.z);
        const clearance = terrainY - point.y;
        maxClearance = Math.max(maxClearance, clearance);
        if (summarySamples.length < 12 || clearance >= closeRidgeMargin) {
          summarySamples.push({
            d,
            x: point.x,
            z: point.z,
            lineY: point.y,
            terrainY,
            clearance,
          });
        }

        if (clearance >= closeRidgeMargin) {
          if (consecutive === 0) firstBlockingDistance = d;
          consecutive++;
          blockingSamples.push({
            d,
            x: point.x,
            z: point.z,
            lineY: point.y,
            terrainY,
            clearance,
          });
          if (consecutive >= requiredConsecutive) {
            return {
              blocked: true,
              firstBlockingDistance,
              maxClearance,
              blockingSamples,
              summarySamples,
            };
          }
        } else {
          consecutive = 0;
        }
      }

      return {
        blocked: false,
        firstBlockingDistance: null,
        maxClearance,
        blockingSamples,
        summarySamples,
      };
    };

    let best: any = null;
    const distances = [70, 90, 110, 130, 150, 170, 190];
    for (const seed of seedCenters) {
      const originX = clampWorld(seed.x);
      const originZ = clampWorld(seed.z);
      if (!hasTerrainAt(originX, originZ)) continue;
      const origin = makeVector(originX, getHeight(originX, originZ) + actorCenterY, originZ);

      for (let angleDeg = 0; angleDeg < 360; angleDeg += 12) {
        const angle = angleDeg * Math.PI / 180;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        for (const horizontalDistance of distances) {
          const targetX = clampWorld(originX + dx * horizontalDistance);
          const targetZ = clampWorld(originZ + dz * horizontalDistance);
          if (!hasTerrainAt(targetX, targetZ)) continue;
          const target = makeVector(targetX, getHeight(targetX, targetZ) + actorCenterY, targetZ);
          const direction = target.clone().sub(origin);
          const distance = direction.length();
          if (!Number.isFinite(distance) || distance <= 35 || distance > closeRangeLimit) continue;
          direction.normalize();
          const profile = scanLine(origin, direction, distance);
          if (!profile.blocked) continue;
          const score = profile.maxClearance + (profile.blockingSamples.length * 0.1);
          if (!best || score > best.score) {
            best = {
              score,
              angleDeg,
              horizontalDistance,
              origin,
              target,
              direction,
              distance,
              profile,
            };
          }
        }
      }
    }

    if (!best) {
      return {
        status: 'blocker',
        reason: 'no sub-200m real-terrain strong-ridge shot candidate found',
        capabilities,
        worldSize,
      };
    }

    const targetId = combatants.materializeAgent({
      faction: 'NVA',
      x: best.target.x,
      y: best.target.y,
      z: best.target.z,
      health: 100,
    });
    const target = combatants.combatants.get(targetId);
    if (!target) {
      return { status: 'fail', reason: 'materialized target missing', capabilities };
    }

    const allCombatants = new Map([[targetId, target]]);
    const aimPoint = makeVector(
      target.position.x,
      getHeight(target.position.x, target.position.z) + actorCenterY,
      target.position.z,
    );
    const shotDirection = aimPoint.clone().sub(best.origin);
    const shotDistance = shotDirection.length();
    shotDirection.normalize();
    const ray = { origin: best.origin, direction: shotDirection };
    const realTerrainHit = terrain.raycastTerrain(best.origin, shotDirection, shotDistance);
    const rawCombatHit = combatants.combatantCombat.hitDetection.raycastCombatants(
      ray,
      'US',
      allCombatants,
      { positionMode: 'visual' },
    );

    const combatModule = combatants.combatantCombat as any;
    const savedSandbag = combatModule.sandbagSystem;
    const savedRaycastTerrain = terrain.raycastTerrain;
    combatModule.sandbagSystem = undefined;
    terrain.raycastTerrain = () => ({ hit: false });

    const beforeHealth = Number(target.health);
    const preview = combatModule.previewPlayerShot(ray, allCombatants);
    const shot = combatModule.handlePlayerShot(ray, () => 50, allCombatants, 'terrain-fire-probe');
    const afterHealth = Number(target.health);

    terrain.raycastTerrain = savedRaycastTerrain;
    combatModule.sandbagSystem = savedSandbag;
    combatants.dematerializeAgent(targetId);

    const profile = scanLine(best.origin, shotDirection, shotDistance);
    const fallbackBlocked = preview?.hit === false && shot?.hit === false && afterHealth === beforeHealth;
    const hitWouldHaveResolved = rawCombatHit?.combatant?.id === targetId;

    return {
      status: fallbackBlocked && hitWouldHaveResolved ? 'pass' : 'fail',
      capabilities,
      worldSize,
      candidate: {
        score: best.score,
        angleDeg: best.angleDeg,
        horizontalDistance: best.horizontalDistance,
        origin: toPlain(best.origin),
        aimPoint: toPlain(aimPoint),
        targetAnchor: toPlain(target.position),
        shotDistance,
      },
      realTerrainHit: {
        hit: Boolean(realTerrainHit?.hit),
        distance: realTerrainHit?.distance ?? null,
        point: toPlain(realTerrainHit?.point),
      },
      forcedBvhMiss: true,
      rawCombatHit: rawCombatHit ? {
        targetId: rawCombatHit.combatant.id,
        distance: rawCombatHit.distance,
        point: toPlain(rawCombatHit.point),
        headshot: Boolean(rawCombatHit.headshot),
      } : null,
      preview: {
        hit: Boolean(preview?.hit),
        point: toPlain(preview?.point),
      },
      shot: {
        hit: Boolean(shot?.hit),
        point: toPlain(shot?.point),
        damage: shot?.damage ?? null,
      },
      health: {
        before: beforeHealth,
        after: afterHealth,
      },
      profile: {
        blocked: profile.blocked,
        firstBlockingDistance: profile.firstBlockingDistance,
        maxClearance: profile.maxClearance,
        blockingSamples: profile.blockingSamples.slice(0, 8),
        summarySamples: profile.summarySamples.slice(0, 20),
      },
    };
  });
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    console.log('Usage: npx tsx scripts/konveyer-terrain-fire-authority-probe.ts --renderer webgpu-strict --mode open_frontier --headed');
    return;
  }

  const mode = parseStringFlag('mode', DEFAULT_MODE);
  const renderer = parseStringFlag('renderer', 'webgpu-strict');
  const port = parseNumberFlag('port', DEFAULT_PORT);
  const headed = hasFlag('headed');
  const forceBuild = hasFlag('force-build');
  const serverMode = parseServerModeArg(process.argv, 'perf');
  const outDir = artifactDir();
  await mkdir(outDir, { recursive: true });

  const consoleMessages: string[] = [];
  let server: ServerHandle | null = null;
  let browser: Browser | null = null;

  try {
    server = await startServer({
      mode: serverMode,
      port,
      forceBuild,
      stdio: 'ignore',
      log: message => console.log(`[terrain-fire-authority] ${message}`),
    });
    browser = await chromium.launch({
      headless: !headed,
      args: renderer.includes('webgpu') ? ['--enable-unsafe-webgpu'] : [],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript({
      content: 'globalThis.__name = globalThis.__name || function(target) { return target; };',
    });
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', error => {
      consoleMessages.push(`[pageerror] ${error.message}`);
    });

    const url = `http://${HOST}:${port}/?perf=1&diag=1&renderer=${encodeURIComponent(renderer)}&logLevel=warn`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.evaluate('globalThis.__name = globalThis.__name || function(target) { return target; };');
    await waitForGame(page, mode);
    const proof = await runProbe(page);
    const output = {
      generatedAt: new Date().toISOString(),
      mode,
      renderer,
      serverMode,
      url,
      proof,
      consoleMessages,
    };
    const outPath = join(outDir, 'terrain-fire-authority.json');
    await writeFile(outPath, JSON.stringify(output, null, 2));
    console.log(`[terrain-fire-authority] wrote ${outPath}`);
    if (proof.status !== 'pass') {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    if (server) await stopServer(server);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
