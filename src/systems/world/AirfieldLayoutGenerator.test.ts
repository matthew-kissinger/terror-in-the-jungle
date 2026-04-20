import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { generateAirfieldLayout } from './AirfieldLayoutGenerator';
import { AIRFIELD_TEMPLATES } from './AirfieldTemplates';

describe('AirfieldLayoutGenerator', () => {
  const center = new THREE.Vector3(500, 0, 500);
  const heading = 0;

  describe('us_airbase template', () => {
    const template = AIRFIELD_TEMPLATES.us_airbase;

    it('generates runway surface patch', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const runway = layout.surfacePatches.find(p => p.surface === 'runway');
      expect(runway).toBeDefined();
      expect(runway!.width).toBe(template.runwayWidth);
      expect(runway!.length).toBe(template.runwayLength);
    });

    it('generates apron and taxiway surface patches', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const packedEarthPatches = layout.surfacePatches.filter(p => p.surface === 'packed_earth');
      expect(packedEarthPatches.length).toBe(template.aprons.length + template.taxiways.length);
    });

    it('includes aircraft parking spots', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const parkingPlacements = layout.placements.filter(p => p.id?.startsWith('parking'));
      expect(parkingPlacements.length).toBe(template.parkingSpots.length);
    });

    it('keeps aircraft parking offsets in feature-local space', () => {
      const layoutA = generateAirfieldLayout(template, center, 0);
      const layoutB = generateAirfieldLayout(template, center, Math.PI * 0.5);
      const parkingA = layoutA.placements.filter(p => p.id?.startsWith('parking'));
      const parkingB = layoutB.placements.filter(p => p.id?.startsWith('parking'));

      expect(parkingA.map((p) => p.offset.toArray())).toEqual(parkingB.map((p) => p.offset.toArray()));
    });

    it('arranges fixed-wing parking spots side-by-side on the apron', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const parkingPlacements = layout.placements.filter(p => p.id?.startsWith('parking'));
      const apronLateral = parkingPlacements.map((p) => p.offset.x);
      const alongOffsets = parkingPlacements.map((p) => p.offset.z);

      expect(new Set(apronLateral).size).toBe(1);
      expect(Math.min(...alongOffsets)).toBeLessThan(0);
      expect(Math.max(...alongOffsets)).toBeGreaterThan(0);
    });

    it('orients each parked aircraft toward the first non-coincident taxi-route waypoint', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const fixedWingParking = layout.placements.filter((p) => p.fixedWingSpawn);
      expect(fixedWingParking.length).toBeGreaterThan(0);

      for (const placement of fixedWingParking) {
        const route = placement.fixedWingSpawn!.taxiRoute!;
        const entry = route.find((point) => point.distanceTo(placement.offset) > 0.5);
        expect(entry, `route must have a non-coincident waypoint for ${placement.id}`).toBeDefined();

        // Physics forward is local -Z, rotated by yaw around Y. Apply same
        // transform as the runtime to derive the facing vector.
        const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          placement.yaw ?? 0,
        );
        const desired = new THREE.Vector3(
          entry!.x - placement.offset.x,
          0,
          entry!.z - placement.offset.z,
        ).normalize();

        // Dot product of unit vectors ≈ 1 when they align.
        expect(forward.dot(desired)).toBeGreaterThan(0.999);
      }
    });

    it('attaches stand, taxi-route, and runway-start metadata to fixed-wing parking spots', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const fixedWingParking = layout.placements.filter((p) => p.fixedWingSpawn);

      expect(fixedWingParking).toHaveLength(3);
      expect(fixedWingParking[0].fixedWingSpawn).toEqual(expect.objectContaining({
        standId: 'stand_a1',
        taxiRoute: expect.any(Array),
        runwayStart: expect.objectContaining({ id: 'south_departure' }),
      }));
      expect(fixedWingParking[1].fixedWingSpawn?.standId).toBe('stand_ac47');
      expect(fixedWingParking[2].fixedWingSpawn?.runwayStart?.id).toBe('north_departure');
    });

    it('generates structures within count range', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      const structures = layout.placements.filter(p => p.id?.startsWith('struct'));
      expect(structures.length).toBeGreaterThanOrEqual(template.structureCount.min);
      expect(structures.length).toBeLessThanOrEqual(template.structureCount.max);
    });

    it('no structures overlap', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      for (let i = 0; i < layout.placements.length; i++) {
        for (let j = i + 1; j < layout.placements.length; j++) {
          const dx = layout.placements[i].offset.x - layout.placements[j].offset.x;
          const dz = layout.placements[i].offset.z - layout.placements[j].offset.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          expect(dist).toBeGreaterThanOrEqual(5.9);
        }
      }
    });

    it('all placements have valid model paths', () => {
      const layout = generateAirfieldLayout(template, center, heading);
      for (const p of layout.placements) {
        expect(p.modelPath).toBeTruthy();
        expect(p.modelPath.endsWith('.glb')).toBe(true);
      }
    });
  });

  describe('forward_strip template', () => {
    it('has shorter runway than us_airbase', () => {
      const full = generateAirfieldLayout(AIRFIELD_TEMPLATES.us_airbase, center, heading);
      const strip = generateAirfieldLayout(AIRFIELD_TEMPLATES.forward_strip, center, heading);
      const fullRunway = full.surfacePatches.find(p => p.surface === 'runway')!;
      const stripRunway = strip.surfacePatches.find(p => p.surface === 'runway')!;
      expect(stripRunway.length).toBeLessThan(fullRunway.length);
    });

    it('has fewer parking spots', () => {
      const full = generateAirfieldLayout(AIRFIELD_TEMPLATES.us_airbase, center, heading);
      const strip = generateAirfieldLayout(AIRFIELD_TEMPLATES.forward_strip, center, heading);
      const fullParking = full.placements.filter(p => p.id?.startsWith('parking'));
      const stripParking = strip.placements.filter(p => p.id?.startsWith('parking'));
      expect(stripParking.length).toBeLessThan(fullParking.length);
    });

    it('includes a single apron service area and taxi connector', () => {
      const strip = generateAirfieldLayout(AIRFIELD_TEMPLATES.forward_strip, center, heading);
      expect(strip.surfacePatches.filter((p) => p.surface === 'packed_earth').length)
        .toBe(AIRFIELD_TEMPLATES.forward_strip.aprons.length + AIRFIELD_TEMPLATES.forward_strip.taxiways.length);
    });

    it('orients the forward-strip A-1 toward its taxi-route entry', () => {
      const strip = generateAirfieldLayout(AIRFIELD_TEMPLATES.forward_strip, center, heading);
      const fixedWingSpot = strip.placements.find((p) => p.fixedWingSpawn);
      expect(fixedWingSpot).toBeDefined();
      const entry = fixedWingSpot!.fixedWingSpawn!.taxiRoute!.find(
        (point) => point.distanceTo(fixedWingSpot!.offset) > 0.5,
      );
      expect(entry).toBeDefined();

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        fixedWingSpot!.yaw ?? 0,
      );
      const desired = new THREE.Vector3(
        entry!.x - fixedWingSpot!.offset.x,
        0,
        entry!.z - fixedWingSpot!.offset.z,
      ).normalize();

      expect(forward.dot(desired)).toBeGreaterThan(0.999);
    });

    it('only adds fixed-wing spawn metadata to fixed-wing parking placements', () => {
      const strip = generateAirfieldLayout(AIRFIELD_TEMPLATES.forward_strip, center, heading);
      const helicopterSpot = strip.placements.find((p) => p.modelPath.includes('uh1'));
      const fixedWingSpot = strip.placements.find((p) => p.fixedWingSpawn);

      expect(helicopterSpot?.fixedWingSpawn).toBeUndefined();
      expect(fixedWingSpot?.fixedWingSpawn).toEqual(expect.objectContaining({
        standId: 'strip_a1',
        runwayStart: expect.objectContaining({ id: 'strip_south_departure' }),
      }));
    });
  });

  describe('determinism', () => {
    it('produces same layout for same seed', () => {
      const template = AIRFIELD_TEMPLATES.us_airbase;
      const a = generateAirfieldLayout(template, center, heading, 'test_seed');
      const b = generateAirfieldLayout(template, center, heading, 'test_seed');
      expect(a.placements.length).toBe(b.placements.length);
      expect(a.surfacePatches.length).toBe(b.surfacePatches.length);
    });
  });

  describe('heading rotation', () => {
    it('runway yaw matches heading', () => {
      const template = AIRFIELD_TEMPLATES.us_airbase;
      const rotatedHeading = Math.PI / 4;
      const layout = generateAirfieldLayout(template, center, rotatedHeading);
      const runway = layout.surfacePatches.find(p => p.surface === 'runway')!;
      expect(runway.yaw).toBeCloseTo(rotatedHeading);
    });
  });
});
