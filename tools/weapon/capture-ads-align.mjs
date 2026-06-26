// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger
//
// Boot a match, equip the default weapon, force full ADS, screenshot hip + ADS
// with a center crosshair reference so weapon-sight alignment can be measured.
// Requires a dev server on :5173 (perf harness enabled via ?perf=1).
//   node tools/weapon/capture-ads-align.mjs <outDir> [mode]
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] || '.';
const MODE = process.argv[3] || 'open_frontier';
const VIEW = { width: 1000, height: 720 };

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: VIEW });
const errs = [];
page.on('pageerror', e => errs.push(e.message));

await page.goto('http://localhost:5173/?perf=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => Boolean(window.__engine), undefined, { timeout: 120000 });

await page.evaluate(async (m) => {
  const e = window.__engine;
  if (!e?.startGameWithMode) throw new Error('startGameWithMode unavailable');
  await e.startGameWithMode(m);
}, MODE);

// Wait for live phase.
for (let i = 0; i < 240; i++) {
  const live = await page.evaluate(() => {
    const e = window.__engine;
    return Boolean(e?.gameStarted) || e?.startupFlow?.getState?.()?.phase === 'live';
  });
  if (live) break;
  await page.waitForTimeout(250);
}
// Dismiss briefing if present.
try { const btn = page.locator('[data-ref="beginBtn"]'); if (await btn.isVisible({ timeout: 1500 })) { await btn.click(); } } catch {}
await page.waitForTimeout(1500);

// Inject a center crosshair reference marker overlay (red cross + ring at exact screen center).
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = '__align';
  d.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;z-index:99999;pointer-events:none';
  d.innerHTML = '<div style="position:absolute;left:-40px;top:0;width:80px;height:1px;background:red"></div>' +
                '<div style="position:absolute;left:0;top:-40px;width:1px;height:80px;background:red"></div>' +
                '<div style="position:absolute;left:-9px;top:-9px;width:18px;height:18px;border:1px solid #0ff;border-radius:50%"></div>';
  document.body.appendChild(d);
});

function getWeaponState() {
  return page.evaluate(() => {
    const fpw = window.__engine?.systemManager?.firstPersonWeapon;
    if (!fpw) return { ok: false, reason: 'no firstPersonWeapon' };
    const anims = fpw.animations;
    const rig = fpw.rigManager?.getCurrentRig?.();
    return {
      ok: true,
      hasRig: Boolean(rig),
      adsProgress: anims?.getADSProgress?.() ?? null,
      isADS: anims?.getADS?.() ?? null,
      rigName: rig?.name ?? null,
    };
  });
}

const pre = await getWeaponState();
// HIP screenshot.
await page.screenshot({ path: `${OUT}/ads-hip.png` });

// Force ADS via the public touch path (event-driven, sticks until released).
await page.evaluate(() => {
  const fpw = window.__engine?.systemManager?.firstPersonWeapon;
  fpw?.input?.triggerADS?.(true);
});
await page.waitForTimeout(2000);
const mid = await getWeaponState();
await page.screenshot({ path: `${OUT}/ads-aim.png` });

// Read the current adsPosition the build is using (for the record).
const adsPose = await page.evaluate(() => {
  const fpw = window.__engine?.systemManager?.firstPersonWeapon;
  const a = fpw?.animations;
  return { base: a?.getBasePosition?.() ?? null, ads: a?.getADSPosition?.() ?? null };
});

console.log(JSON.stringify({ pre, mid, adsPose, errors: errs.slice(0, 5) }, null, 2));
await b.close();
