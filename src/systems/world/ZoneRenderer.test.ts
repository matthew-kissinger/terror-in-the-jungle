// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Faction } from '../combat/types';
import { type CaptureZone, ZoneState } from './ZoneManager';
import { ZoneRenderer } from './ZoneRenderer';

function makeZone(): CaptureZone {
  const zoneMesh = new THREE.Mesh(
    new THREE.RingGeometry(9, 10, 32),
    new THREE.MeshBasicMaterial(),
  );
  const progressRing = new THREE.Mesh(
    new THREE.RingGeometry(10.5, 11, 32, 1, 0, 0),
    new THREE.MeshBasicMaterial(),
  );
  const usFlagMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial());
  const opforFlagMesh = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial());

  return {
    id: 'hill_937',
    name: 'Hill 937',
    position: new THREE.Vector3(10, 20, 30),
    radius: 10,
    height: 18,
    owner: null,
    state: ZoneState.CONTESTED,
    captureProgress: 50,
    captureSpeed: 1,
    flagPole: new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18, 8), new THREE.MeshBasicMaterial()),
    zoneMesh,
    progressRing,
    usFlagMesh,
    opforFlagMesh,
    currentFlagHeight: 22,
    isHomeBase: false,
    ticketBleedRate: 1,
  };
}

function makeUnrenderedZone(id: string, x: number): CaptureZone {
  const zone = makeZone();
  zone.id = id;
  zone.position.x = x;
  zone.zoneMesh = undefined;
  zone.progressRing = undefined;
  zone.usFlagMesh = undefined;
  zone.opforFlagMesh = undefined;
  zone.flagPole = undefined;
  zone.labelSprite = undefined;
  return zone;
}

function installDocumentStub(): void {
  vi.stubGlobal('document', {
    createElement: vi.fn(() => ({
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillStyle: '',
        font: '',
        textAlign: '',
        fillText: vi.fn(),
      })),
    })),
  });
}

describe('ZoneRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates contested progress-ring geometry in place as the displayed angle changes', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();

    const geometry = zone.progressRing!.geometry;
    const dispose = vi.spyOn(geometry, 'dispose');
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;

    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });

    expect(zone.progressRing!.visible).toBe(true);
    expect(zone.progressRing!.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
    expect(zone.progressRing!.userData.progressAngle).toBeCloseTo(Math.PI, 5);
    expect(position.getX(position.count - 1)).toBeCloseTo(-(zone.radius + 1), 5);
    expect(position.getY(position.count - 1)).toBeCloseTo(0, 5);

    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });

    expect(zone.progressRing!.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();

    zone.captureProgress = 75;
    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });

    expect(zone.progressRing!.geometry).toBe(geometry);
    expect(dispose).not.toHaveBeenCalled();
    expect(zone.progressRing!.userData.progressAngle).toBeCloseTo(Math.PI * 1.5, 5);
    expect(position.getX(position.count - 1)).toBeCloseTo(0, 5);
    expect(position.getY(position.count - 1)).toBeCloseTo(-(zone.radius + 1), 5);
  });

  it('assigns the shared zone state material instead of copying it every frame', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();

    zone.state = ZoneState.OPFOR_CONTROLLED;
    zone.owner = Faction.NVA;

    renderer.updateZoneVisuals(zone, { us: 0, opfor: 1 });
    const opforMaterial = zone.zoneMesh!.material;

    expect(opforMaterial).toBe(renderer.getMaterialForState(ZoneState.OPFOR_CONTROLLED));

    renderer.updateZoneVisuals(zone, { us: 0, opfor: 1 });

    expect(zone.zoneMesh!.material).toBe(opforMaterial);
  });

  it('shares static flag geometry and materials across created zones', () => {
    installDocumentStub();
    const renderer = new ZoneRenderer(new THREE.Scene());
    const first = makeUnrenderedZone('alpha', 0);
    const second = makeUnrenderedZone('bravo', 100);

    renderer.createZoneVisuals(first);
    renderer.createZoneVisuals(second);

    expect(first.usFlagMesh!.geometry).toBe(second.usFlagMesh!.geometry);
    expect(first.opforFlagMesh!.geometry).toBe(second.opforFlagMesh!.geometry);
    expect(first.usFlagMesh!.material).toBe(second.usFlagMesh!.material);
    expect(first.opforFlagMesh!.material).toBe(second.opforFlagMesh!.material);
    expect(first.flagPole!.material).toBe(second.flagPole!.material);

    const sharedFlagGeometryDispose = vi.spyOn(first.usFlagMesh!.geometry, 'dispose');
    renderer.disposeZoneVisuals(first);
    expect(sharedFlagGeometryDispose).not.toHaveBeenCalled();

    renderer.dispose();
    expect(sharedFlagGeometryDispose).toHaveBeenCalledTimes(1);
  });

  it('keeps frozen static zone matrices in sync when terrain height changes', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();

    zone.zoneMesh!.matrixAutoUpdate = false;
    zone.zoneMesh!.matrixWorldAutoUpdate = false;
    zone.flagPole!.matrixAutoUpdate = false;
    zone.flagPole!.matrixWorldAutoUpdate = false;
    zone.progressRing!.matrixAutoUpdate = false;
    zone.progressRing!.matrixWorldAutoUpdate = false;

    renderer.updateZonePositions(zone, 42);

    expect(zone.zoneMesh!.matrixWorld.elements[13]).toBeCloseTo(42.1, 5);
    expect(zone.flagPole!.matrixWorld.elements[13]).toBeCloseTo(51, 5);
    expect(zone.progressRing!.matrixWorld.elements[13]).toBeCloseTo(42.2, 5);
  });

  it('does not resync frozen zone matrices when terrain height is unchanged', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();

    zone.position.y = 42;
    const updateMatrix = vi.spyOn(zone.zoneMesh!, 'updateMatrix');

    renderer.updateZonePositions(zone, 42);

    expect(updateMatrix).not.toHaveBeenCalled();
  });

  it('syncs frozen flag matrices after ownership height and wave animation changes', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();

    zone.owner = Faction.US;
    zone.state = ZoneState.BLUFOR_CONTROLLED;
    zone.currentFlagHeight = 22;
    zone.usFlagMesh!.matrixAutoUpdate = false;
    zone.usFlagMesh!.matrixWorldAutoUpdate = false;

    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });

    expect(zone.usFlagMesh!.visible).toBe(true);
    expect(zone.usFlagMesh!.matrixWorld.elements[13]).toBeCloseTo(
      THREE.MathUtils.lerp(22, zone.position.y + zone.height - 2, 0.05),
      5,
    );

    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1000);
    renderer.animateFlags(new Map([[zone.id, zone]]));

    const expectedRotationY = Math.sin(1 + zone.position.x) * 0.2;
    expect(zone.usFlagMesh!.rotation.y).toBeCloseTo(expectedRotationY, 5);
    expect(zone.usFlagMesh!.matrixWorld.elements[0]).toBeCloseTo(Math.cos(expectedRotationY), 5);
    dateNow.mockRestore();
  });

  it('does not resync stable visible flag height during unchanged zone updates', () => {
    const renderer = new ZoneRenderer(new THREE.Scene());
    const zone = makeZone();
    const targetHeight = zone.position.y + zone.height - 2;

    zone.owner = Faction.US;
    zone.state = ZoneState.BLUFOR_CONTROLLED;
    zone.currentFlagHeight = targetHeight;
    zone.usFlagMesh!.position.y = targetHeight;
    zone.usFlagMesh!.visible = true;
    zone.usFlagMesh!.matrixAutoUpdate = false;
    zone.usFlagMesh!.matrixWorldAutoUpdate = false;

    const updateMatrix = vi.spyOn(zone.usFlagMesh!, 'updateMatrix');

    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });
    renderer.updateZoneVisuals(zone, { us: 1, opfor: 0 });

    expect(updateMatrix).not.toHaveBeenCalled();
    expect(zone.usFlagMesh!.visible).toBe(true);
    expect(zone.usFlagMesh!.position.y).toBe(targetHeight);
  });
});
