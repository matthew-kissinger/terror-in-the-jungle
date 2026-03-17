import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { StrategicRoutePlanner } from './StrategicRoutePlanner';

function createRidgelineHeight(x: number, z: number): number {
  const ridgeX = Math.max(0, 240 - Math.abs(x - 500));
  const ridgeZ = Math.max(0, 180 - Math.abs(z));
  return ridgeX * ridgeZ * 0.005;
}

describe('StrategicRoutePlanner', () => {
  it('prefers authored corridor nodes when direct travel crosses a steep ridgeline', () => {
    const planner = new StrategicRoutePlanner(
      {
        worldSize: 1600,
        zones: [
          { id: 'us_base', position: new THREE.Vector3(0, 0, 0), radius: 30, isHomeBase: true },
          { id: 'hill_objective', position: new THREE.Vector3(1000, 0, 0), radius: 30, isHomeBase: false },
        ],
        features: [
          {
            id: 'trail_gap',
            kind: 'road',
            name: 'Trail Gap',
            position: new THREE.Vector3(500, 0, 260),
            footprint: { shape: 'circle', radius: 26 },
            surface: { kind: 'jungle_trail', innerRadius: 18, outerRadius: 26 },
          },
        ],
      },
      createRidgelineHeight,
    );

    const route = planner.findRoute(0, 0, 1000, 0, 'hill_objective');

    expect(route.some((waypoint) => waypoint.sourceId === 'feature:trail_gap')).toBe(true);
    expect(route[route.length - 1]).toMatchObject({
      x: 1000,
      z: 0,
      kind: 'objective',
    });
  });
});
