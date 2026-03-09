/**
 * Shared dead-zone math for virtual joysticks.
 * Remaps magnitude from [deadZone, 1] to [0, 1], zeroing inputs below the dead zone.
 */

export function applyDeadZone(
  normX: number,
  normY: number,
  deadZone: number,
): { x: number; y: number } {
  const magnitude = Math.sqrt(normX * normX + normY * normY);
  if (magnitude < deadZone) {
    return { x: 0, y: 0 };
  }
  if (magnitude > 0) {
    const remapped = (magnitude - deadZone) / (1 - deadZone);
    const scale = remapped / magnitude;
    return { x: normX * scale, y: normY * scale };
  }
  return { x: 0, y: 0 };
}
