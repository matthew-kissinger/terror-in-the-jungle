/**
 * @vitest-environment jsdom
 */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { StrikeDesignationController } from './StrikeDesignationController';
import { Faction } from '../combat/types';
import { spawnSmokeCloud } from '../effects/SmokeCloudSystem';

vi.mock('../effects/SmokeCloudSystem', () => ({
  spawnSmokeCloud: vi.fn(),
}));

const spawnSmokeCloudMock = vi.mocked(spawnSmokeCloud);

function makeManager(cooldown = 0) {
  return {
    requestSupport: vi.fn(() => true),
    getCooldownRemaining: vi.fn(() => cooldown),
  };
}

/**
 * Build a controller wired with stub providers. `target` is where the view-ray
 * lands; `hasGround` whether it hit terrain; `friendlies` the danger-close count.
 */
function makeController(opts: {
  manager?: ReturnType<typeof makeManager>;
  target?: THREE.Vector3;
  origin?: THREE.Vector3;
  hasGround?: boolean;
  friendlies?: number;
} = {}) {
  const controller = new StrikeDesignationController();
  controller.mount(document.body);
  const manager = opts.manager ?? makeManager();
  const target = opts.target ?? new THREE.Vector3(100, 0, 0);
  const origin = opts.origin ?? new THREE.Vector3(0, 0, 0);
  controller.setAirSupportManager(manager as never);
  controller.setPickProvider(
    (out) => {
      out.copy(target);
      return { ok: true, hasGround: opts.hasGround ?? true };
    },
    () => origin,
  );
  controller.setFriendlyCountProvider(() => opts.friendlies ?? 0);
  return { controller, manager, target, origin };
}

describe('StrikeDesignationController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    spawnSmokeCloudMock.mockClear();
  });

  it('arms designate for a ready asset', () => {
    const { controller } = makeController();
    expect(controller.begin('ac47_orbit', 'smoke')).toBe('designating');
    expect(controller.isActive()).toBe(true);
  });

  it('rejects a cooling-down asset without entering designate', () => {
    const { controller, manager } = makeController({ manager: makeManager(75) });
    expect(controller.begin('ac47_orbit', 'smoke')).toBe('rejected');
    expect(controller.isActive()).toBe(false);
    expect(manager.requestSupport).not.toHaveBeenCalled();
  });

  it('reports unwired when no air-support manager is set', () => {
    const controller = new StrikeDesignationController();
    controller.mount(document.body);
    controller.setPickProvider((out) => { out.set(1, 0, 1); return { ok: true, hasGround: true }; }, () => new THREE.Vector3());
    expect(controller.begin('ac47_orbit', 'smoke')).toBe('unwired');
  });

  it('fires the call-in only on confirm, threading type/marking/faction', () => {
    const { controller, manager } = makeController({ target: new THREE.Vector3(120, 0, 0) });
    controller.begin('ac47_orbit', 'willie_pete');

    expect(manager.requestSupport).not.toHaveBeenCalled(); // not on select

    expect(controller.confirm()).toBe(true);
    expect(manager.requestSupport).toHaveBeenCalledTimes(1);
    const req = manager.requestSupport.mock.calls[0][0];
    expect(req.type).toBe('spooky');                 // ac47_orbit -> spooky sortie
    expect(req.marking).toBe('willie_pete');
    expect(req.requesterFaction).toBe(Faction.US);
    expect(req.approachDirection.length()).toBeCloseTo(1); // normalised heading
    expect(controller.isActive()).toBe(false);        // designate ends after commit
  });

  it('blocks confirm and stays in designate when out of range', () => {
    // ac47_orbit max call range is 1500m; place the mark well beyond it.
    const { controller, manager } = makeController({ target: new THREE.Vector3(3000, 0, 0) });
    controller.begin('ac47_orbit', 'smoke');

    expect(controller.confirm()).toBe(true);          // consumes the click...
    expect(manager.requestSupport).not.toHaveBeenCalled(); // ...but does not fire
    expect(controller.isActive()).toBe(true);
  });

  it('blocks confirm when the ray missed the ground (sky aim)', () => {
    const { controller, manager } = makeController({ hasGround: false });
    controller.begin('ac47_orbit', 'smoke');
    controller.confirm();
    expect(manager.requestSupport).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(true);
  });

  it('requires a danger-close override: first confirm arms, second fires', () => {
    // b52_arclight carries a 180m danger-close envelope; report friendlies inside.
    const { controller, manager } = makeController({
      target: new THREE.Vector3(200, 0, 0),
      friendlies: 2,
    });
    controller.begin('b52_arclight', 'position_only');

    // First confirm arms the override (no strike yet).
    expect(controller.confirm()).toBe(true);
    expect(manager.requestSupport).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(true);

    // Second confirm commits despite danger-close.
    expect(controller.confirm()).toBe(true);
    expect(manager.requestSupport).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });

  it('aborts on cancel with no call-in and no cooldown spent', () => {
    const { controller, manager } = makeController();
    controller.begin('ac47_orbit', 'smoke');
    expect(controller.cancel()).toBe(true);
    expect(controller.isActive()).toBe(false);
    expect(manager.requestSupport).not.toHaveBeenCalled();
  });

  it('cancel/confirm are inert when not designating', () => {
    const { controller } = makeController();
    expect(controller.cancel()).toBe(false);
    expect(controller.confirm()).toBe(false);
  });

  it('tells the player to close distance when the mark is out of range', () => {
    // Well beyond ac47_orbit range: the hint must not promise a mark that a
    // dead LMB will never place.
    const { controller } = makeController({ target: new THREE.Vector3(3000, 0, 0) });
    controller.begin('ac47_orbit', 'smoke');

    expect(document.body.textContent).toContain('TOO FAR — move closer');
    expect(document.body.textContent).not.toContain('[LMB] mark');
  });

  it('paints a single smoke cloud for a reticle designation on commit', () => {
    const { controller } = makeController({ target: new THREE.Vector3(120, 0, 0) });
    controller.begin('ac47_orbit', 'smoke');
    controller.confirm();

    // Reticle designations have no canister, so the commit cloud is their only
    // smoke.
    expect(spawnSmokeCloudMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT double the smoke cloud when the target came from a settled smoke marker', () => {
    const { controller } = makeController({ target: new THREE.Vector3(120, 0, 0) });
    // beginAtTarget is the smoke-marker fixed-target path; the canister already
    // spawned its own cloud when it settled, so the commit must not add another.
    controller.beginAtTarget('ac47_orbit', 'smoke', new THREE.Vector3(120, 0, 0));
    controller.confirm();

    expect(spawnSmokeCloudMock).not.toHaveBeenCalled();
  });

  it('flashes a visible UNAVAILABLE banner when a call-in is rejected while cooling down', () => {
    const { controller } = makeController({ manager: makeManager(42) });

    controller.flashUnavailable('AC-47 Orbit', 42);

    expect(document.body.textContent).toContain('UNAVAILABLE (42s)');
    expect(controller.isActive()).toBe(false);
  });

  it('does not let an UNAVAILABLE flash stomp a live designation', () => {
    const { controller } = makeController();
    controller.begin('ac47_orbit', 'smoke');

    controller.flashUnavailable('A-1 Napalm', 30);

    // The live designation banner still owns the surface.
    expect(document.body.textContent).not.toContain('UNAVAILABLE');
    expect(controller.isActive()).toBe(true);
  });
});
