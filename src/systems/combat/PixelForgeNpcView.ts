export interface PixelForgeNpcViewTile {
  column: number;
  row: number;
}

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const DEFAULT_VIEW_GRID_SIZE = 7;
const MODEL_FORWARD_ROOT_YAW = Math.PI / 2;

function clampTile(value: number, size: number): number {
  return Math.min(size - 1, Math.max(0, value));
}

export function getPixelForgeNpcOctahedralViewTile(
  localX: number,
  localY: number,
  localZ: number,
  gridSize = DEFAULT_VIEW_GRID_SIZE,
): PixelForgeNpcViewTile {
  const length = Math.hypot(localX, localY, localZ) || 1;
  const x = localX / length;
  const y = localY / length;
  const z = localZ / length;
  const invL1 = 1 / (Math.abs(x) + Math.abs(y) + Math.abs(z) || 1);
  let u = x * invL1;
  let v = z * invL1;

  if (y < 0) {
    const oldU = u;
    u = (1 - Math.abs(v)) * Math.sign(oldU || 1);
    v = (1 - Math.abs(oldU)) * Math.sign(v || 1);
  }

  return {
    column: clampTile(Math.floor(((u + 1) * 0.5) * gridSize), gridSize),
    row: clampTile(Math.floor(((1 - v) * 0.5) * gridSize), gridSize),
  };
}

export function getPixelForgeNpcViewTileForCamera(
  sourcePosition: Vec3Like,
  cameraPosition: Vec3Like,
  visualRotation: number,
  gridSize = DEFAULT_VIEW_GRID_SIZE,
): PixelForgeNpcViewTile {
  const dx = cameraPosition.x - sourcePosition.x;
  const dy = cameraPosition.y - sourcePosition.y;
  const dz = cameraPosition.z - sourcePosition.z;
  const rootYaw = MODEL_FORWARD_ROOT_YAW - visualRotation;
  const cos = Math.cos(rootYaw);
  const sin = Math.sin(rootYaw);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return getPixelForgeNpcOctahedralViewTile(localX, dy, localZ, gridSize);
}
