// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { ZoneCaptureEffects } from './ZoneCaptureEffects';
import { Faction } from '../combat/types';

type ZoneCapturedHandler = (e: { zoneId: string; zoneName: string; faction: Faction; position: THREE.Vector3; radius: number }) => void;

let capturedEventName: string | undefined;
let capturedHandler: ZoneCapturedHandler | undefined;
const unsubscribeSpy = vi.fn();

vi.mock('../../core/GameEventBus', () => ({
  GameEventBus: {
    subscribe: vi.fn((event: string, handler: ZoneCapturedHandler) => {
      capturedEventName = event;
      capturedHandler = handler;
      return unsubscribeSpy;
    }),
  },
}));

/** Ring/pillar are THREE.Mesh; the ember burst is a single always-present THREE.Points — exclude it. */
function visibleFlashMeshes(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.visible);
}

describe('ZoneCaptureEffects', () => {
  let scene: THREE.Scene;
  let effects: ZoneCaptureEffects;

  beforeEach(async () => {
    scene = new THREE.Scene();
    unsubscribeSpy.mockClear();
    capturedEventName = undefined;
    capturedHandler = undefined;
    effects = new ZoneCaptureEffects(scene);
    await effects.init();
  });

  afterEach(() => {
    effects.dispose();
  });

  it('subscribes to zone_captured on init', () => {
    expect(capturedEventName).toBe('zone_captured');
    expect(capturedHandler).toBeTypeOf('function');
  });

  it('reacts to a zone_captured event by triggering visible feedback at the zone position', () => {
    const position = new THREE.Vector3(120, 5, -40);
    capturedHandler!({ zoneId: 'z1', zoneName: 'Alpha', faction: Faction.US, position, radius: 30 });

    const visible = visibleFlashMeshes(scene);
    expect(visible.length).toBe(2); // ring + pillar
    for (const mesh of visible) {
      expect(mesh.position.x).toBeCloseTo(position.x, 5);
      expect(mesh.position.z).toBeCloseTo(position.z, 5);
    }
  });

  describe('trigger', () => {
    it('colors US and OPFOR captures differently', () => {
      const usScene = new THREE.Scene();
      const usEffects = new ZoneCaptureEffects(usScene);
      usEffects.trigger(new THREE.Vector3(0, 0, 0), 20, Faction.US);
      const usColor = visibleFlashMeshes(usScene)[0].material as THREE.MeshBasicMaterial;

      const opforScene = new THREE.Scene();
      const opforEffects = new ZoneCaptureEffects(opforScene);
      opforEffects.trigger(new THREE.Vector3(0, 0, 0), 20, Faction.NVA);
      const opforColor = visibleFlashMeshes(opforScene)[0].material as THREE.MeshBasicMaterial;

      expect(usColor.color.equals(opforColor.color)).toBe(false);
      // US reads bluer, OPFOR reads redder — matches the faction's existing
      // map/HUD color convention (ZoneRenderer: US 0x0066cc, OPFOR 0xcc0000).
      expect(usColor.color.b).toBeGreaterThan(usColor.color.r);
      expect(opforColor.color.r).toBeGreaterThan(opforColor.color.b);

      usEffects.dispose();
      opforEffects.dispose();
    });

    it('does not throw when triggered more times than there are pooled slots in one frame', () => {
      const position = new THREE.Vector3(0, 0, 0);
      expect(() => {
        for (let i = 0; i < 10; i++) {
          effects.trigger(position, 20, Faction.US);
        }
      }).not.toThrow();
    });

    it('clamps a degenerate zero/negative radius instead of producing a zero-scale ring', () => {
      effects.trigger(new THREE.Vector3(0, 0, 0), 0, Faction.US);
      const ring = visibleFlashMeshes(scene).find(m => m.geometry instanceof THREE.RingGeometry)!;
      expect(ring.scale.x).toBeGreaterThan(0);
    });
  });

  describe('update', () => {
    it('hides the ring and pillar once their lifetime elapses', () => {
      effects.trigger(new THREE.Vector3(5, 0, 5), 20, Faction.US);
      expect(visibleFlashMeshes(scene).length).toBeGreaterThan(0);

      // Step well past both the ring (1.3s) and pillar (0.5s) lifetimes.
      for (let i = 0; i < 150; i++) {
        effects.update(0.016);
      }

      expect(visibleFlashMeshes(scene).length).toBe(0);
    });

    it('drives the ember burst upward and away from the spawn point over time', () => {
      const position = new THREE.Vector3(0, 0, 0);
      effects.trigger(position, 20, Faction.US);
      // Spawned particle state lives CPU-side until the next update() upload —
      // sync once with a zero delta so the "before" snapshot reflects the
      // actual spawn positions rather than the construction-time hidden sentinel.
      effects.update(0);

      const emberMesh = scene.children.find((c): c is THREE.Points => c instanceof THREE.Points)!;
      const positionsBefore = (
        (emberMesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
      ).slice();

      effects.update(0.4);

      const positionsAfter = (emberMesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      let anyRose = false;
      for (let i = 0; i < positionsBefore.length; i += 3) {
        if (positionsBefore[i + 1] < 90000 && positionsAfter[i + 1] > positionsBefore[i + 1]) {
          anyRose = true;
          break;
        }
      }
      expect(anyRose).toBe(true);
    });
  });

  describe('dispose', () => {
    it('unsubscribes and removes all meshes from the scene', () => {
      effects.trigger(new THREE.Vector3(0, 0, 0), 20, Faction.US);
      expect(scene.children.length).toBeGreaterThan(0);

      effects.dispose();

      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
      expect(scene.children.length).toBe(0);
    });
  });
});
