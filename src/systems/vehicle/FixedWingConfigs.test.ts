// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect } from 'vitest';
import {
  FIXED_WING_CONFIGS,
  getFixedWingDisplayInfo,
  getFixedWingCatalogEntry,
  getDormantFixedWingKeys,
  getDormantFixedWingInfo,
} from './FixedWingConfigs';

describe('FixedWingDisplayInfo — repaint axis convention', () => {
  it('no flyable airframe overrides modelYawOffset (repaint fleet is uniformly +Z-forward)', () => {
    // The repaint GLBs are all +Z-forward per the war-asset catalog, so the
    // universal Math.PI flip at load handles every airframe — none override.
    for (const key of ['A1_SKYRAIDER', 'AC47_SPOOKY', 'F4_PHANTOM']) {
      const display = getFixedWingDisplayInfo(key);
      expect(display).not.toBeNull();
      expect(display!.modelYawOffset).toBeUndefined();
    }
  });

  it('every flyable airframe is cataloged +Z-forward (so the flip is correct)', () => {
    for (const key of ['A1_SKYRAIDER', 'AC47_SPOOKY', 'F4_PHANTOM']) {
      const entry = getFixedWingCatalogEntry(key);
      expect(entry).not.toBeNull();
      expect(entry!.forward).toBe('pos-z');
    }
  });
});

describe('FixedWingDisplayInfo — propeller spin from grafted catalog joints', () => {
  it('the A-1 spins its single grafted propeller hub around the catalog axis', () => {
    const display = getFixedWingDisplayInfo('A1_SKYRAIDER')!;
    expect(display.hasPropellers).toBe(true);
    // Sourced from the importer-grafted hub joint, not a fuzzy "propeller" name.
    expect(display.propellerNodes).toContain('Joint_Propeller');
    expect(display.propellerNodes.length).toBeGreaterThan(0);
    expect(display.propellerSpinAxis).toBe('x');
  });

  it('the AC-47 spins both grafted propeller hubs', () => {
    const display = getFixedWingDisplayInfo('AC47_SPOOKY')!;
    expect(display.hasPropellers).toBe(true);
    expect(display.propellerNodes).toEqual(
      expect.arrayContaining(['Joint_PropellerR', 'Joint_PropellerL']),
    );
    expect(display.propellerSpinAxis).toBe('x');
  });

  it('the F-4 jet carries no propeller nodes', () => {
    const display = getFixedWingDisplayInfo('F4_PHANTOM')!;
    expect(display.hasPropellers).toBe(false);
    expect(display.propellerNodes).toHaveLength(0);
  });

  it('propeller node names match the airframe catalog joints', () => {
    for (const key of ['A1_SKYRAIDER', 'AC47_SPOOKY']) {
      const display = getFixedWingDisplayInfo(key)!;
      const entry = getFixedWingCatalogEntry(key)!;
      const catalogPropNames = (entry.joints ?? [])
        .filter((j) => j.name.startsWith('Joint_Propeller'))
        .map((j) => j.name);
      expect(display.propellerNodes).toEqual(catalogPropNames);
    }
  });
});

describe('FixedWingConfigs — gear clearance seats on measured catalog dims', () => {
  it('parks each airframe so its lowest mesh point (catalog minY) touches the ground', () => {
    // gearClearance is the origin-above-ground offset; it must equal -minY so the
    // GLB's lowest point sits exactly on the runway (no float, no ground-clip).
    for (const key of ['A1_SKYRAIDER', 'AC47_SPOOKY', 'F4_PHANTOM']) {
      const entry = getFixedWingCatalogEntry(key)!;
      const config = FIXED_WING_CONFIGS[key];
      expect(config.physics.gearClearance).toBeCloseTo(-entry.minY, 2);
    }
  });

  it('the AC-47 parked clearance is driven by landing gear, not misplaced propeller tips', () => {
    expect(FIXED_WING_CONFIGS.AC47_SPOOKY.physics.gearClearance)
      .toBeLessThan(0.5);
  });
});

describe('FixedWingConfigs — dormant repaint registrations', () => {
  it('registers the net-new airframes as dormant (cataloged, not yet flyable)', () => {
    const keys = getDormantFixedWingKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'B52_STRATOFORTRESS',
        'C130_HERCULES',
        'OV10_BRONCO',
        'A37_DRAGONFLY',
        'MIG17_NVA',
      ]),
    );
  });

  it('dormant airframes carry no flight config (not spawnable as flyable)', () => {
    for (const key of getDormantFixedWingKeys()) {
      expect(FIXED_WING_CONFIGS[key]).toBeUndefined();
    }
  });

  it('dormant airframes are not resolved as flyable catalog slugs', () => {
    for (const key of getDormantFixedWingKeys()) {
      const info = getDormantFixedWingInfo(key)!;
      expect(info.displayName.length).toBeGreaterThan(0);
      // Dormant keys are not in the flyable slug map (only A1/AC47/F4 are).
      expect(getFixedWingCatalogEntry(key)).toBeNull();
    }
  });

  it('flags the A-37 Dragonfly for a scale re-roll advisory', () => {
    expect(getDormantFixedWingInfo('A37_DRAGONFLY')!.scaleRerollAdvisory).toBe(true);
    expect(getDormantFixedWingInfo('B52_STRATOFORTRESS')!.scaleRerollAdvisory).toBe(false);
  });
});
