#!/usr/bin/env tsx

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS } from '../src/systems/combat/PixelForgeNpcRuntime';

type ProbeNpcRow = {
  id: string;
  distance: number;
  faction: string;
  lod: string;
  renderMode: 'close-glb' | 'impostor' | 'culled';
  clip: string | null;
  hasWeapon: boolean;
};

type ProbeSummary = {
  url: string;
  checkedAt: string;
  closeRadiusMeters: number;
  combatantCount: number;
  activeCloseModelCount: number;
  closeModelPoolLoads: number;
  closeModelPoolTargets: Record<string, number>;
  closeModelPoolAvailable: Record<string, number>;
  nearest: ProbeNpcRow[];
  failures: string[];
};

const CLOSE_RADIUS_METERS = PIXEL_FORGE_NPC_CLOSE_MODEL_DISTANCE_METERS;
const DEFAULT_URL = 'http://127.0.0.1:5173/?sandbox=1&npcs=100&seed=2718&diag=1';
const ARTIFACT_DIR = join(process.cwd(), 'artifacts', 'pixel-forge-npc-probe');

function parseStringFlag(name: string, fallback: string): string {
  const eqArg = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eqArg) return String(eqArg.split('=').slice(1).join('=') || fallback);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && index + 1 < process.argv.length) return process.argv[index + 1];
  return fallback;
}

function parseNumberFlag(name: string, fallback: number): number {
  const raw = parseStringFlag(name, String(fallback));
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const url = parseStringFlag('url', DEFAULT_URL);
const waitMs = parseNumberFlag('wait-ms', 3000);
const waitForClose = hasFlag('wait-for-close');
const headed = hasFlag('headed');
if (!existsSync(ARTIFACT_DIR)) mkdirSync(ARTIFACT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors: string[] = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => Boolean((window as any).__engine), undefined, { timeout: 90_000 });
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine && !engine.gameStarted && typeof engine.startGameWithMode === 'function') {
      engine.startGameWithMode('ai_sandbox');
    }
  });
  await page.waitForFunction(() => Boolean((window as any).__engine?.gameStarted), undefined, { timeout: 90_000 });
  await page.waitForFunction(() => {
    const combatants = (window as any).__engine?.systemManager?.combatantSystem?.combatants;
    return combatants instanceof Map && combatants.size > 0;
  }, undefined, { timeout: 90_000 });
  await page.waitForTimeout(waitMs);
  if (waitForClose) {
    try {
      await page.waitForFunction(() => (
        ((window as any).__engine?.systemManager?.combatantSystem?.combatantRenderer?.activeCloseModels?.size ?? 0) > 0
      ), undefined, { timeout: Math.max(1000, waitMs) });
    } catch {
      // Keep reporting the observed runtime state below; a timeout here is evidence.
    }
  }

  const summary = await page.evaluate((closeRadiusMeters): ProbeSummary => {
    const engine = (window as any).__engine;
    const combat = engine.systemManager.combatantSystem;
    const renderer = combat.combatantRenderer ?? combat.getRenderer?.();
    const playerPosition = combat.playerPosition ?? engine.playerPosition ?? { x: 0, y: 0, z: 0 };
    const activeCloseModels = renderer?.activeCloseModels instanceof Map
      ? renderer.activeCloseModels
      : new Map();
    const closeModelPoolTargets: Record<string, number> = {};
    if (renderer?.closeModelPoolTargets instanceof Map) {
      renderer.closeModelPoolTargets.forEach((target: number, key: string) => {
        closeModelPoolTargets[key] = target;
      });
    }
    const closeModelPoolAvailable: Record<string, number> = {};
    if (renderer?.closeModelPools instanceof Map) {
      renderer.closeModelPools.forEach((pool: unknown[], key: string) => {
        closeModelPoolAvailable[key] = pool.length;
      });
    }
    const closeModelPoolLoads = renderer?.closeModelPoolLoads instanceof Map
      ? renderer.closeModelPoolLoads.size
      : 0;
    const rows: ProbeNpcRow[] = Array.from(combat.combatants.values()).map((combatant: any) => {
      const dx = combatant.position.x - playerPosition.x;
      const dy = combatant.position.y - playerPosition.y;
      const dz = combatant.position.z - playerPosition.z;
      const distance = Math.hypot(dx, dy, dz);
      const closeInstance = activeCloseModels.get(combatant.id);
      const renderMode = closeInstance
        ? 'close-glb'
        : combatant.billboardIndex !== undefined && combatant.billboardIndex >= 0
          ? 'impostor'
          : 'culled';
      return {
        id: combatant.id,
        distance,
        faction: String(combatant.faction),
        lod: String(combatant.lodLevel),
        renderMode,
        clip: closeInstance?.activeClip ?? null,
        hasWeapon: Boolean(closeInstance?.hasWeapon),
      };
    }).sort((a, b) => a.distance - b.distance);

    const nearest = rows.slice(0, 24);
    const failures: string[] = [];
    if (activeCloseModels.size === 0) {
      failures.push('no active close GLB models observed after probe wait');
    }
    for (const row of rows) {
      if (row.distance <= closeRadiusMeters && row.renderMode === 'culled') {
        failures.push(`${row.id} is culled inside close radius at ${row.distance.toFixed(1)}m`);
      }
      if (row.renderMode === 'close-glb' && !row.hasWeapon) {
        failures.push(`${row.id} close GLB has no weapon`);
      }
    }

    return {
      url: window.location.href,
      checkedAt: new Date().toISOString(),
      closeRadiusMeters,
      combatantCount: rows.length,
      activeCloseModelCount: activeCloseModels.size,
      closeModelPoolLoads,
      closeModelPoolTargets,
      closeModelPoolAvailable,
      nearest,
      failures,
    };
  }, CLOSE_RADIUS_METERS);

  summary.failures.push(...consoleErrors.map((error) => `browser error: ${error}`));
  const summaryPath = join(ARTIFACT_DIR, 'summary.json');
  const screenshotPath = join(ARTIFACT_DIR, 'latest.png');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
