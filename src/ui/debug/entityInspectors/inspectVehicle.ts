import type { IVehicle } from '../../../systems/vehicle/IVehicle';

export interface VehicleSource {
  getVehicle(id: string): IVehicle | null;
}

export function inspectVehicle(source: VehicleSource, id: string): Record<string, unknown> | null {
  const v = source.getVehicle(id);
  if (!v) return null;
  const pos = v.getPosition();
  const vel = v.getVelocity();
  return {
    id: v.vehicleId,
    category: v.category,
    faction: v.faction,
    destroyed: v.isDestroyed(),
    healthPercent: (v.getHealthPercent() * 100).toFixed(1) + '%',
    position: `${pos.x.toFixed(2)}, ${pos.y.toFixed(2)}, ${pos.z.toFixed(2)}`,
    velocity: `${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)}`,
    speed: vel.length().toFixed(2),
    pilot: v.getPilotId(),
    seats: v.getSeats().map(s => ({ index: s.index, role: s.role, occupant: s.occupantId })),
  };
}
