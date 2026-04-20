import { describe, expect, it } from 'vitest';
import { AircraftModels } from '../assets/modelPaths';
import {
  AIRFIELD_TEMPLATES,
  getAirfieldTemplateCompatibilityIssues,
  type AirfieldTemplate,
} from './AirfieldTemplates';

describe('AirfieldTemplates', () => {
  it('ships airfield templates that satisfy fixed-wing runway requirements', () => {
    expect(getAirfieldTemplateCompatibilityIssues(AIRFIELD_TEMPLATES.us_airbase)).toEqual([]);
    expect(getAirfieldTemplateCompatibilityIssues(AIRFIELD_TEMPLATES.forward_strip)).toEqual([]);
  });

  it('keeps A-1, AC-47, and F-4 parked at the main airbase so the player can claim them', () => {
    const mainAirbase = AIRFIELD_TEMPLATES.us_airbase;
    const parkedAircraft = mainAirbase.parkingSpots.map((spot) => spot.modelPath);

    const countOf = (modelPath: string) =>
      parkedAircraft.filter((p) => p === modelPath).length;

    expect(countOf(AircraftModels.A1_SKYRAIDER)).toBe(1);
    expect(countOf(AircraftModels.AC47_SPOOKY)).toBe(1);
    expect(countOf(AircraftModels.F4_PHANTOM)).toBe(1);

    // None of the main-airbase parking spots may carry an NPC auto-flight
    // mission — auto-launching on boot strands the player at an empty field.
    for (const spot of mainAirbase.parkingSpots) {
      expect(spot.npcAutoFlight, `spot ${spot.standId ?? spot.modelPath} must spawn parked`).toBeUndefined();
    }
  });

  it('reports compatibility issues for undersized runways', () => {
    const invalidTemplate: AirfieldTemplate = {
      ...AIRFIELD_TEMPLATES.forward_strip,
      id: 'invalid_short_strip',
      runwayLength: 180,
      parkingSpots: [
        {
          modelPath: AircraftModels.F4_PHANTOM,
          offsetAlongRunway: 0,
          offsetLateral: 40,
        },
      ],
    };

    expect(getAirfieldTemplateCompatibilityIssues(invalidTemplate)).toEqual([
      {
        modelPath: AircraftModels.F4_PHANTOM,
        minimumRunwayLength: 420,
        actualRunwayLength: 180,
      },
    ]);
  });
});
