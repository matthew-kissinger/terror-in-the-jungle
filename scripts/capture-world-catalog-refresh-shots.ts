#!/usr/bin/env tsx
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Worldgen overview capture for cycle-2026-06-11-war-asset-repaint task
 * `world-catalog-refresh` (R3). Boots each game mode against the perf bundle
 * (dist-perf, which carries the diagnostic window globals), settles worldgen,
 * frames an overview of the first firebase / village / airfield feature it can
 * resolve from the live game-mode config, snaps a PNG, and reads renderer draw-
 * call / triangle stats for the budget-delta note.
 *
 * Feature anchors are resolved at runtime from
 * `__engine.systemManager.gameModeManager.getCurrentConfig().features` so the
 * script tolerates config repositions without a code edit. Captures are best-
 * effort: a mode or pose that fails is logged and skipped, never thrown.
 *
 * Usage:
 *   npx tsx scripts/capture-world-catalog-refresh-shots.ts
 *   npx tsx scripts/capture-world-catalog-refresh-shots.ts --tag=before
 *
 * Output: artifacts/cycle-war-asset-repaint/world/ (gitignored; commit with
 * `git add -f`). A summary.json records per-shot renderer stats.
 */

import { chromium, type Page } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { startServer, stopServer, type ServerHandle } from './preview-server';

const PORT = 9203;
const VIEWPORT = { width: 1920, height: 1080 };
const STARTUP_TIMEOUT_MS = 90_000;
const OUT_DIR = join(process.cwd(), 'artifacts', 'cycle-war-asset-repaint', 'world');

type Pose = { position: [number, number, number]; target: [number, number, number] };

interface RenderStats {
  drawCalls: number;
  triangles: number;
  geometries: number;
  // Triangles under the WorldStaticFeatureBatchRoot only — isolates the
  // building/structure/prop budget from terrain + foliage in the whole-scene
  // counters. This is the number the cycle's budget-delta note tracks.
  worldStaticFeatureTriangles: number;
  worldStaticFeatureMeshes: number;
}

interface CaptureRecord {
  mode: string;
  feature: string;
  featureId: string;
  filename: string;
  anchor: { x: number; z: number } | null;
  stats: RenderStats | null;
  notes: string;
}

const MODES = ['open_frontier', 'a_shau_valley', 'zone_control', 'team_deathmatch'] as const;

// Feature-kind groups we want one overview of per mode. The script matches the
// live config feature by prefabId substring, in priority order.
const FEATURE_TARGETS: Array<{ label: string; prefabSubstrings: string[]; kinds?: string[] }> = [
  { label: 'firebase', prefabSubstrings: ['firebase'], kinds: ['firebase'] },
  { label: 'village', prefabSubstrings: ['village_cluster', 'village_market', 'village_riverside', 'village'] },
  { label: 'airfield', prefabSubstrings: ['motor_pool', 'airfield', 'airstrip'], kinds: ['airfield'] },
];

function logStep(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function readFlagValue(name: string): string | null {
  const flagged = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (flagged) return flagged.split('=')[1] ?? null;
  return null;
}

async function waitForEngine(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __engine?: unknown }).__engine),
    undefined,
    { timeout: STARTUP_TIMEOUT_MS },
  );
}

async function startMode(page: Page, mode: string): Promise<void> {
  logStep(`Starting mode ${mode}`);
  await page.evaluate(async (m: string) => {
    const engine = (window as unknown as {
      __engine?: { startGameWithMode?: (mode: string) => Promise<void> };
    }).__engine;
    if (!engine?.startGameWithMode) throw new Error('engine.startGameWithMode unavailable');
    await engine.startGameWithMode(m);
  }, mode);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const e = (window as unknown as {
        __engine?: { gameStarted?: boolean; startupFlow?: { getState?: () => { phase?: string } } };
      }).__engine;
      return { gameStarted: Boolean(e?.gameStarted), phase: String(e?.startupFlow?.getState?.()?.phase ?? '') };
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
      await page.waitForTimeout(500);
    }
  } catch {
    // not present
  }
}

interface FeatureAnchor {
  id: string;
  prefabId: string;
  kind: string;
  x: number;
  z: number;
}

async function resolveFeatureAnchors(page: Page): Promise<FeatureAnchor[]> {
  try {
    return await page.evaluate(() => {
      const engine = (window as unknown as {
        __engine?: {
          systemManager?: {
            gameModeManager?: {
              getCurrentConfig?: () => {
                features?: Array<{
                  id?: string;
                  kind?: string;
                  prefabId?: string;
                  position?: { x?: number; z?: number };
                }>;
              };
            };
          };
        };
      }).__engine;
      const features = engine?.systemManager?.gameModeManager?.getCurrentConfig?.()?.features ?? [];
      const out: FeatureAnchor[] = [];
      for (const f of features) {
        if (!f?.position || typeof f.position.x !== 'number' || typeof f.position.z !== 'number') continue;
        out.push({
          id: String(f.id ?? ''),
          prefabId: String(f.prefabId ?? ''),
          kind: String(f.kind ?? ''),
          x: f.position.x,
          z: f.position.z,
        });
      }
      return out;
    }) as FeatureAnchor[];
  } catch {
    return [];
  }
}

function pickAnchor(
  anchors: FeatureAnchor[],
  target: { prefabSubstrings: string[]; kinds?: string[] },
): FeatureAnchor | null {
  for (const sub of target.prefabSubstrings) {
    const hit = anchors.find((a) => a.prefabId.includes(sub));
    if (hit) return hit;
  }
  if (target.kinds) {
    for (const kind of target.kinds) {
      const hit = anchors.find((a) => a.kind === kind);
      if (hit) return hit;
    }
  }
  return null;
}

async function terrainHeightAt(page: Page, x: number, z: number): Promise<number> {
  try {
    const h = await page.evaluate(
      ({ qx, qz }: { qx: number; qz: number }) => {
        const t = (window as unknown as {
          __engine?: { systemManager?: { terrainSystem?: { getHeightAt?: (x: number, z: number) => number } } };
        }).__engine?.systemManager?.terrainSystem;
        const v = t?.getHeightAt?.(qx, qz);
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
      },
      { qx: x, qz: z },
    );
    return Number(h) || 0;
  } catch {
    return 0;
  }
}

async function poseAndRender(page: Page, pose: Pose): Promise<RenderStats | null> {
  return (await page.evaluate(
    ({ p, vp }: { p: Pose; vp: { width: number; height: number } }) => {
      type EngineLike = {
        renderer?: {
          camera?: {
            position: { set: (x: number, y: number, z: number) => void };
            aspect?: number;
            up?: { set: (x: number, y: number, z: number) => void };
            lookAt?: (x: number, y: number, z: number) => void;
            updateProjectionMatrix?: () => void;
            updateMatrixWorld?: (force?: boolean) => void;
          };
          renderer?: { setSize: (w: number, h: number, u?: boolean) => void; render: (s: unknown, c: unknown) => void };
          scene?: unknown;
          postProcessing?: { setSize?: (w: number, h: number) => void; beginFrame?: () => void; endFrame?: () => void };
          getPerformanceStats?: () => { drawCalls: number; triangles: number; geometries: number };
        };
        isLoopRunning?: boolean;
        animationFrameId?: number | null;
        systemManager?: {
          atmosphereSystem?: { syncDomePosition?: (pos: unknown) => void; update?: (dt: number) => void };
          skybox?: { updatePosition?: (pos: unknown) => void };
        };
      };
      const engine = (window as unknown as { __engine?: EngineLike }).__engine;
      const renderer = engine?.renderer;
      const camera = renderer?.camera;
      const threeRenderer = renderer?.renderer;
      const scene = renderer?.scene;
      const pp = renderer?.postProcessing;
      if (!engine || !camera || !threeRenderer || !scene) throw new Error('engine/camera/renderer/scene unavailable');

      engine.isLoopRunning = false;
      if (engine.animationFrameId !== null && engine.animationFrameId !== undefined) {
        cancelAnimationFrame(engine.animationFrameId);
        engine.animationFrameId = null;
      }

      threeRenderer.setSize(vp.width, vp.height, true);
      if (pp && typeof pp.setSize === 'function') pp.setSize(vp.width, vp.height);
      if (typeof camera.aspect === 'number') {
        camera.aspect = vp.width / vp.height;
        camera.updateProjectionMatrix?.();
      }
      camera.position.set(p.position[0], p.position[1], p.position[2]);
      camera.up?.set(0, 1, 0);
      camera.lookAt?.(p.target[0], p.target[1], p.target[2]);
      camera.updateMatrixWorld?.(true);

      const skybox = engine.systemManager?.skybox;
      skybox?.updatePosition?.(camera.position);
      const atm = engine.systemManager?.atmosphereSystem;
      atm?.syncDomePosition?.(camera.position);
      atm?.update?.(0.016);

      pp?.beginFrame?.();
      threeRenderer.render(scene, camera);
      pp?.endFrame?.();

      // Sum triangles under the world-static-feature batch root only.
      let wsfTris = 0;
      let wsfMeshes = 0;
      const root = (scene as { getObjectByName?: (n: string) => unknown }).getObjectByName?.(
        'WorldStaticFeatureBatchRoot',
      ) as { traverse?: (cb: (o: unknown) => void) => void } | undefined;
      root?.traverse?.((obj: unknown) => {
        const mesh = obj as {
          isMesh?: boolean;
          visible?: boolean;
          geometry?: { index?: { count: number } | null; attributes?: { position?: { count: number } } };
        };
        if (!mesh?.isMesh || !mesh.geometry) return;
        wsfMeshes++;
        const idx = mesh.geometry.index?.count ?? 0;
        const pos = mesh.geometry.attributes?.position?.count ?? 0;
        wsfTris += idx > 0 ? idx / 3 : pos / 3;
      });

      const stats = renderer?.getPerformanceStats?.();
      return stats
        ? {
            drawCalls: stats.drawCalls,
            triangles: stats.triangles,
            geometries: stats.geometries,
            worldStaticFeatureTriangles: Math.round(wsfTris),
            worldStaticFeatureMeshes: wsfMeshes,
          }
        : null;
    },
    { p: pose, vp: VIEWPORT },
  )) as RenderStats | null;
}

async function hideUiChrome(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `body > *:not(canvas) { display: none !important; } canvas { position: fixed !important; inset: 0 !important; }`,
  });
}

async function snap(page: Page, outFile: string): Promise<number> {
  try {
    const buffer = await page.screenshot({ type: 'png', fullPage: false, timeout: 120_000, animations: 'disabled' });
    writeFileSync(outFile, buffer);
    logStep(`Wrote ${outFile} (${buffer.byteLength} bytes)`);
    return buffer.byteLength;
  } catch (err) {
    logStep(`snap failed for ${outFile}: ${(err as Error).message}`);
    return 0;
  }
}

async function main(): Promise<void> {
  const tag = readFlagValue('tag') ?? 'after';
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
    logStep(`Created ${OUT_DIR}`);
  }

  let server: ServerHandle | null = null;
  const records: CaptureRecord[] = [];
  try {
    server = await startServer({ mode: 'perf', port: PORT, buildIfMissing: false, log: logStep });
    const browser = await chromium.launch({
      headless: true,
      args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-webgpu'],
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[browser:err] ${msg.text()}`);
    });
    const baseUrl = `http://127.0.0.1:${PORT}/`;

    for (const mode of MODES) {
      try {
        await page.goto(`${baseUrl}?perf=1&uiTransitions=0`, { waitUntil: 'load', timeout: STARTUP_TIMEOUT_MS });
        await waitForEngine(page);
        await startMode(page, mode);
        await dismissBriefingIfPresent(page);
        const settleMs = mode === 'a_shau_valley' ? 9000 : 5000;
        await page.waitForTimeout(settleMs);

        const anchors = await resolveFeatureAnchors(page);
        logStep(`${mode}: resolved ${anchors.length} feature anchors`);

        for (const target of FEATURE_TARGETS) {
          const anchor = pickAnchor(anchors, target);
          const filename = join(OUT_DIR, `${mode}-${target.label}-${tag}.png`);
          if (!anchor) {
            records.push({ mode, feature: target.label, featureId: '', filename, anchor: null, stats: null, notes: 'no matching feature in this mode' });
            continue;
          }
          const groundY = await terrainHeightAt(page, anchor.x, anchor.z);
          // Overview: stand back ~48 m to the south, ~40 m above the ground,
          // and look straight at the settlement center (~6 m above ground so
          // the building bodies, not their feet, are framed).
          const pose: Pose = {
            position: [anchor.x, groundY + 40, anchor.z + 48],
            target: [anchor.x, groundY + 6, anchor.z],
          };
          await hideUiChrome(page);
          let stats: RenderStats | null = null;
          try {
            stats = await poseAndRender(page, pose);
          } catch (err) {
            logStep(`poseAndRender failed ${mode}/${target.label}: ${(err as Error).message}`);
          }
          await page.waitForTimeout(400);
          const bytes = await snap(page, filename);
          records.push({
            mode,
            feature: target.label,
            featureId: anchor.id,
            filename,
            anchor: { x: anchor.x, z: anchor.z },
            stats,
            notes: bytes > 0 ? '' : 'snap produced 0 bytes',
          });
        }
      } catch (err) {
        logStep(`mode ${mode} FAILED: ${(err as Error).message}`);
        records.push({ mode, feature: 'all', featureId: '', filename: '', anchor: null, stats: null, notes: `mode failed: ${(err as Error).message}` });
      }
    }

    await context.close();
    await browser.close();
  } finally {
    if (server) await stopServer(server);
  }

  const summaryPath = join(OUT_DIR, `summary-${tag}.json`);
  writeFileSync(summaryPath, `${JSON.stringify({ createdAt: new Date().toISOString(), tag, records }, null, 2)}\n`);
  logStep(`Wrote summary -> ${summaryPath}`);
  const ok = records.filter((r) => r.filename && r.notes === '').length;
  logStep(`Capture summary: ${ok}/${records.length} shots written`);
}

main().catch((err) => {
  console.error('capture-world-catalog-refresh-shots failed:', err);
  process.exit(1);
});
