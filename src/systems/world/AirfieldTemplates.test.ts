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
