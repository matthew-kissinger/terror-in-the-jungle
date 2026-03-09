import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateFirebaseLayout } from './FirebaseLayoutGenerator';
import { FIREBASE_TEMPLATES } from './FirebaseTemplates';

describe('FirebaseLayoutGenerator', () => {
  const center = new THREE.Vector3(100, 0, 200);
  const rotation = 0;

  describe('us_small template', () => {
    const template = FIREBASE_TEMPLATES.us_small;

    it('generates placements within structure count range', () => {
      const placements = generateFirebaseLayout(template, center, rotation);
      expect(placements.length).toBeGreaterThanOrEqual(template.structureCount.min);
      // Corner structures (up to 4) are placed in addition to the target count
      expect(placements.length).toBeLessThanOrEqual(template.structureCount.max + 4);
    });

    it('all placements have valid model paths', () => {
      const placements = generateFirebaseLayout(template, center, rotation);
      for (const p of placements) {
        expect(p.modelPath).toBeTruthy();
        expect(p.modelPath.endsWith('.glb')).toBe(true);
      }
    });

    it('no placements overlap (minimum spacing)', () => {
      const placements = generateFirebaseLayout(template, center, rotation);
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const dx = placements[i].offset.x - placements[j].offset.x;
          const dz = placements[i].offset.z - placements[j].offset.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          // Minimum possible spacing is 3 (props)
          expect(dist).toBeGreaterThanOrEqual(2.9);
        }
      }
    });
  });

  describe('us_medium template', () => {
    it('generates more structures than small', () => {
      const small = generateFirebaseLayout(FIREBASE_TEMPLATES.us_small, center, rotation);
      const medium = generateFirebaseLayout(FIREBASE_TEMPLATES.us_medium, center, rotation);
      expect(medium.length).toBeGreaterThanOrEqual(small.length);
    });
  });

  describe('us_large template', () => {
    it('generates placements within range', () => {
      const template = FIREBASE_TEMPLATES.us_large;
      const placements = generateFirebaseLayout(template, center, rotation);
      expect(placements.length).toBeGreaterThanOrEqual(template.structureCount.min);
    });

    it('all placements within footprint radius', () => {
      const template = FIREBASE_TEMPLATES.us_large;
      const placements = generateFirebaseLayout(template, center, rotation);
      for (const p of placements) {
        const dist = Math.sqrt(p.offset.x ** 2 + p.offset.z ** 2);
        expect(dist).toBeLessThanOrEqual(template.footprintRadius + 5);
      }
    });
  });

  describe('determinism', () => {
    it('produces same layout for same seed', () => {
      const template = FIREBASE_TEMPLATES.us_small;
      const a = generateFirebaseLayout(template, center, rotation, 'test_seed');
      const b = generateFirebaseLayout(template, center, rotation, 'test_seed');
      expect(a.length).toBe(b.length);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].offset.x).toBeCloseTo(b[i].offset.x);
        expect(a[i].offset.z).toBeCloseTo(b[i].offset.z);
        expect(a[i].modelPath).toBe(b[i].modelPath);
      }
    });

    it('produces different layout for different seeds', () => {
      const template = FIREBASE_TEMPLATES.us_medium;
      const a = generateFirebaseLayout(template, center, rotation, 'seed_a');
      const b = generateFirebaseLayout(template, center, rotation, 'seed_b');
      // At least one placement should differ (extremely unlikely to be identical)
      const hasDifference = a.some((pa, i) => {
        if (i >= b.length) return true;
        return Math.abs(pa.offset.x - b[i].offset.x) > 0.1;
      });
      expect(hasDifference).toBe(true);
    });
  });

  describe('rotation', () => {
    it('rotates entrance position with rotation parameter', () => {
      const template = FIREBASE_TEMPLATES.us_small;
      const noRotation = generateFirebaseLayout(template, center, 0, 'rot_test');
      const rotated = generateFirebaseLayout(template, center, Math.PI, 'rot_test');
      // Entrance should be in different direction
      const entranceA = noRotation.find(p => p.id?.startsWith('entrance'));
      const entranceB = rotated.find(p => p.id?.startsWith('entrance'));
      if (entranceA && entranceB) {
        // Positions should differ due to rotation
        expect(
          Math.abs(entranceA.offset.x - entranceB.offset.x) > 1 ||
          Math.abs(entranceA.offset.z - entranceB.offset.z) > 1,
        ).toBe(true);
      }
    });
  });
});
