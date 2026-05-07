export interface HydrologyBakeInput {
  width: number;
  height: number;
  cellSizeMeters: number;
  heights: Float32Array;
  depressionHandling?: HydrologyDepressionHandling;
}

export type HydrologyDepressionHandling = 'none' | 'epsilon-fill';

export interface HydrologyThresholds {
  accumulationP90Cells: number;
  accumulationP95Cells: number;
  accumulationP98Cells: number;
  accumulationP99Cells: number;
}

export interface HydrologyWetCandidateOptions {
  minAccumulationCells: number;
  maxSlopeDegrees: number;
  maxElevationMeters: number;
}

export interface HydrologyMaskOptions {
  slopes: Float32Array;
  wetCandidate: HydrologyWetCandidateOptions;
  channelMinAccumulationCells: number;
}

export interface HydrologyMasks {
  wetCandidate: Uint8Array;
  channelCandidate: Uint8Array;
}

export const HYDROLOGY_BAKE_ARTIFACT_VERSION = 1 as const;

export interface HydrologyBakeArtifactMasks {
  wetCandidateCells: number[];
  channelCandidateCells: number[];
}

export interface HydrologyBakeArtifact {
  schemaVersion: typeof HYDROLOGY_BAKE_ARTIFACT_VERSION;
  width: number;
  height: number;
  cellSizeMeters: number;
  depressionHandling: HydrologyDepressionHandling;
  transform: HydrologyWorldTransform;
  thresholds: HydrologyThresholds;
  masks: HydrologyBakeArtifactMasks;
  channelPolylines: HydrologyChannelPolyline[];
}

export interface HydrologyBakeArtifactOptions {
  transform: HydrologyWorldTransform;
  masks: HydrologyMasks;
  channelPolylines?: HydrologyChannelPolyline[];
}

export interface HydrologyGridCell {
  gridX: number;
  gridZ: number;
  index: number;
}

export interface HydrologyMaskSample extends HydrologyGridCell {
  wetCandidate: boolean;
  channelCandidate: boolean;
}

export interface HydrologyChannelPath {
  cells: number[];
  headCell: number;
  outletCell: number;
  maxAccumulationCells: number;
}

export interface HydrologyChannelPathOptions {
  minAccumulationCells: number;
  minLengthCells?: number;
}

export interface HydrologyWorldTransform {
  originX: number;
  originZ: number;
  cellSizeMeters: number;
}

export interface HydrologyPolylinePoint {
  cell: number;
  x: number;
  z: number;
  elevationMeters: number;
  accumulationCells: number;
}

export interface HydrologyChannelPolyline {
  headCell: number;
  outletCell: number;
  lengthCells: number;
  lengthMeters: number;
  maxAccumulationCells: number;
  points: HydrologyPolylinePoint[];
}

export interface HydrologyChannelPolylineOptions {
  maxPointsPerPath?: number;
}

export interface HydrologyBakeResult {
  width: number;
  height: number;
  cellSizeMeters: number;
  depressionHandling: HydrologyDepressionHandling;
  heights: Float32Array;
  routedHeights: Float32Array;
  downslope: Int32Array;
  accumulation: Float32Array;
  thresholds: HydrologyThresholds;
}

const NEIGHBOR_OFFSETS = [
  { dx: -1, dz: -1, distance: Math.SQRT2 },
  { dx: 0, dz: -1, distance: 1 },
  { dx: 1, dz: -1, distance: Math.SQRT2 },
  { dx: -1, dz: 0, distance: 1 },
  { dx: 1, dz: 0, distance: 1 },
  { dx: -1, dz: 1, distance: Math.SQRT2 },
  { dx: 0, dz: 1, distance: 1 },
  { dx: 1, dz: 1, distance: Math.SQRT2 },
] as const;

export function hydrologyCellIndex(x: number, z: number, width: number): number {
  return z * width + x;
}

export function getHydrologyPercentile(values: Float32Array | number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)));
  return sorted[index] ?? 0;
}

export function getHydrologyThresholds(accumulation: Float32Array): HydrologyThresholds {
  return {
    accumulationP90Cells: getHydrologyPercentile(accumulation, 0.9),
    accumulationP95Cells: getHydrologyPercentile(accumulation, 0.95),
    accumulationP98Cells: getHydrologyPercentile(accumulation, 0.98),
    accumulationP99Cells: getHydrologyPercentile(accumulation, 0.99),
  };
}

export function bakeHydrologyFromHeightGrid(input: HydrologyBakeInput): HydrologyBakeResult {
  validateInput(input);

  const depressionHandling = input.depressionHandling ?? 'none';
  const routedHeights = depressionHandling === 'epsilon-fill'
    ? fillHydrologyDepressions(input.heights, input.width, input.height, input.cellSizeMeters)
    : input.heights;
  const downslope = computeD8FlowDirections(routedHeights, input.width, input.height, input.cellSizeMeters);
  const accumulation = computeFlowAccumulation(routedHeights, downslope, input.width, input.height);

  return {
    width: input.width,
    height: input.height,
    cellSizeMeters: input.cellSizeMeters,
    depressionHandling,
    heights: input.heights,
    routedHeights,
    downslope,
    accumulation,
    thresholds: getHydrologyThresholds(accumulation),
  };
}

export function computeD8FlowDirections(
  heights: Float32Array,
  width: number,
  height: number,
  cellSizeMeters: number,
): Int32Array {
  if (width <= 0 || height <= 0) {
    throw new Error('Hydrology grid dimensions must be positive');
  }
  if (heights.length !== width * height) {
    throw new Error(`Hydrology height grid length ${heights.length} does not match ${width}x${height}`);
  }
  if (cellSizeMeters <= 0) {
    throw new Error('Hydrology cell size must be positive');
  }

  const downslope = new Int32Array(width * height);
  downslope.fill(-1);

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = hydrologyCellIndex(x, z, width);
      const elevation = heights[index] ?? 0;
      let bestIndex = -1;
      let bestDropPerMeter = 0;

      for (const neighbor of NEIGHBOR_OFFSETS) {
        const nx = x + neighbor.dx;
        const nz = z + neighbor.dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

        const neighborIndex = hydrologyCellIndex(nx, nz, width);
        const drop = elevation - (heights[neighborIndex] ?? elevation);
        const dropPerMeter = drop / (neighbor.distance * cellSizeMeters);
        if (dropPerMeter > bestDropPerMeter) {
          bestDropPerMeter = dropPerMeter;
          bestIndex = neighborIndex;
        }
      }

      downslope[index] = bestIndex;
    }
  }

  return downslope;
}

export function fillHydrologyDepressions(
  heights: Float32Array,
  width: number,
  height: number,
  cellSizeMeters: number,
): Float32Array {
  const cellCount = width * height;
  if (width <= 0 || height <= 0) {
    throw new Error('Hydrology grid dimensions must be positive');
  }
  if (heights.length !== cellCount) {
    throw new Error(`Hydrology height grid length ${heights.length} does not match ${width}x${height}`);
  }
  if (cellSizeMeters <= 0) {
    throw new Error('Hydrology cell size must be positive');
  }

  const filled = new Float32Array(heights);
  const visited = new Uint8Array(cellCount);
  const queue = new HydrologyMinHeap();
  const epsilon = Math.max(0.001, cellSizeMeters * 0.000001);

  function pushBorder(x: number, z: number): void {
    const index = hydrologyCellIndex(x, z, width);
    if (visited[index]) return;
    visited[index] = 1;
    queue.push({ index, elevation: filled[index] ?? 0 });
  }

  for (let x = 0; x < width; x++) {
    pushBorder(x, 0);
    pushBorder(x, height - 1);
  }
  for (let z = 1; z < height - 1; z++) {
    pushBorder(0, z);
    pushBorder(width - 1, z);
  }

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;
    const x = current.index % width;
    const z = Math.floor(current.index / width);

    for (const neighbor of NEIGHBOR_OFFSETS) {
      const nx = x + neighbor.dx;
      const nz = z + neighbor.dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;

      const neighborIndex = hydrologyCellIndex(nx, nz, width);
      if (visited[neighborIndex]) continue;
      visited[neighborIndex] = 1;

      const originalElevation = heights[neighborIndex] ?? 0;
      const filledElevation = originalElevation <= current.elevation
        ? current.elevation + epsilon
        : originalElevation;
      filled[neighborIndex] = filledElevation;
      queue.push({ index: neighborIndex, elevation: filledElevation });
    }
  }

  return filled;
}

export function computeFlowAccumulation(
  heights: Float32Array,
  downslope: Int32Array,
  width: number,
  height: number,
): Float32Array {
  const cellCount = width * height;
  if (heights.length !== cellCount || downslope.length !== cellCount) {
    throw new Error('Hydrology accumulation inputs must share the same grid dimensions');
  }

  const accumulation = new Float32Array(cellCount);
  accumulation.fill(1);
  const ordered = Array.from({ length: cellCount }, (_, index) => index)
    .sort((a, b) => (heights[b] ?? 0) - (heights[a] ?? 0));

  for (const index of ordered) {
    const target = downslope[index] ?? -1;
    if (target >= 0) {
      accumulation[target] += accumulation[index] ?? 0;
    }
  }

  return accumulation;
}

export function isHydrologyWetCandidate(
  result: HydrologyBakeResult,
  index: number,
  slopeDegrees: number,
  options: HydrologyWetCandidateOptions,
): boolean {
  return (
    (result.accumulation[index] ?? 0) >= options.minAccumulationCells &&
    slopeDegrees <= options.maxSlopeDegrees &&
    (result.heights[index] ?? 0) <= options.maxElevationMeters
  );
}

export function createHydrologyMasks(
  result: HydrologyBakeResult,
  options: HydrologyMaskOptions,
): HydrologyMasks {
  const cellCount = result.width * result.height;
  if (options.slopes.length !== cellCount) {
    throw new Error('Hydrology mask slopes must match the bake grid dimensions');
  }

  const wetCandidate = new Uint8Array(cellCount);
  const channelCandidate = new Uint8Array(cellCount);
  for (let index = 0; index < cellCount; index++) {
    if (isHydrologyWetCandidate(result, index, options.slopes[index] ?? 0, options.wetCandidate)) {
      wetCandidate[index] = 1;
    }
    if ((result.accumulation[index] ?? 0) >= options.channelMinAccumulationCells) {
      channelCandidate[index] = 1;
    }
  }

  return { wetCandidate, channelCandidate };
}

export function createHydrologyBakeArtifact(
  result: HydrologyBakeResult,
  options: HydrologyBakeArtifactOptions,
): HydrologyBakeArtifact {
  const cellCount = result.width * result.height;

  return {
    schemaVersion: HYDROLOGY_BAKE_ARTIFACT_VERSION,
    width: result.width,
    height: result.height,
    cellSizeMeters: result.cellSizeMeters,
    depressionHandling: result.depressionHandling,
    transform: { ...options.transform },
    thresholds: { ...result.thresholds },
    masks: {
      wetCandidateCells: collectHydrologyMaskCells(options.masks.wetCandidate, cellCount, 'wetCandidate'),
      channelCandidateCells: collectHydrologyMaskCells(options.masks.channelCandidate, cellCount, 'channelCandidate'),
    },
    channelPolylines: options.channelPolylines ?? [],
  };
}

export function materializeHydrologyMasksFromArtifact(artifact: HydrologyBakeArtifact): HydrologyMasks {
  validateHydrologyBakeArtifact(artifact);

  const cellCount = artifact.width * artifact.height;
  const wetCandidate = new Uint8Array(cellCount);
  const channelCandidate = new Uint8Array(cellCount);
  fillHydrologyMaskCells(wetCandidate, artifact.masks.wetCandidateCells, 'wetCandidate');
  fillHydrologyMaskCells(channelCandidate, artifact.masks.channelCandidateCells, 'channelCandidate');

  return { wetCandidate, channelCandidate };
}

export function hydrologyGridCellAtWorld(
  worldX: number,
  worldZ: number,
  width: number,
  height: number,
  transform: HydrologyWorldTransform,
): HydrologyGridCell | null {
  if (width <= 0 || height <= 0 || transform.cellSizeMeters <= 0) {
    throw new Error('Hydrology world sampling requires positive grid dimensions and cell size');
  }

  const gridX = Math.round((worldX - transform.originX) / transform.cellSizeMeters);
  const gridZ = Math.round((worldZ - transform.originZ) / transform.cellSizeMeters);
  if (gridX < 0 || gridX >= width || gridZ < 0 || gridZ >= height) {
    return null;
  }

  return {
    gridX,
    gridZ,
    index: hydrologyCellIndex(gridX, gridZ, width),
  };
}

export function sampleHydrologyMasksAtWorld(
  masks: HydrologyMasks,
  width: number,
  height: number,
  transform: HydrologyWorldTransform,
  worldX: number,
  worldZ: number,
): HydrologyMaskSample | null {
  const cellCount = width * height;
  if (masks.wetCandidate.length !== cellCount || masks.channelCandidate.length !== cellCount) {
    throw new Error('Hydrology mask sampling requires masks that match the grid dimensions');
  }

  const cell = hydrologyGridCellAtWorld(worldX, worldZ, width, height, transform);
  if (!cell) return null;

  return {
    ...cell,
    wetCandidate: (masks.wetCandidate[cell.index] ?? 0) > 0,
    channelCandidate: (masks.channelCandidate[cell.index] ?? 0) > 0,
  };
}

export function sampleHydrologyArtifactMasksAtWorld(
  artifact: HydrologyBakeArtifact,
  worldX: number,
  worldZ: number,
): HydrologyMaskSample | null {
  return sampleHydrologyMasksAtWorld(
    materializeHydrologyMasksFromArtifact(artifact),
    artifact.width,
    artifact.height,
    artifact.transform,
    worldX,
    worldZ,
  );
}

export function extractHydrologyChannelPaths(
  result: HydrologyBakeResult,
  options: HydrologyChannelPathOptions,
): HydrologyChannelPath[] {
  const cellCount = result.width * result.height;
  const minLengthCells = options.minLengthCells ?? 2;
  const channel = new Uint8Array(cellCount);
  const incoming = new Uint16Array(cellCount);

  for (let index = 0; index < cellCount; index++) {
    if ((result.accumulation[index] ?? 0) >= options.minAccumulationCells) {
      channel[index] = 1;
    }
  }
  for (let index = 0; index < cellCount; index++) {
    if (!channel[index]) continue;
    const target = result.downslope[index] ?? -1;
    if (target >= 0 && channel[target]) {
      incoming[target]++;
    }
  }

  const visited = new Uint8Array(cellCount);
  const paths: HydrologyChannelPath[] = [];
  for (let index = 0; index < cellCount; index++) {
    if (!channel[index] || incoming[index] > 0 || visited[index]) continue;

    const cells: number[] = [];
    let cursor = index;
    let maxAccumulationCells = 0;
    while (cursor >= 0 && channel[cursor] && !visited[cursor]) {
      visited[cursor] = 1;
      cells.push(cursor);
      maxAccumulationCells = Math.max(maxAccumulationCells, result.accumulation[cursor] ?? 0);
      const target = result.downslope[cursor] ?? -1;
      if (target < 0 || !channel[target]) break;
      cursor = target;
    }

    if (cells.length >= minLengthCells) {
      paths.push({
        cells,
        headCell: cells[0] ?? index,
        outletCell: cells[cells.length - 1] ?? index,
        maxAccumulationCells,
      });
    }
  }

  return paths.sort((a, b) => b.maxAccumulationCells - a.maxAccumulationCells || b.cells.length - a.cells.length);
}

export function createHydrologyChannelPolylines(
  result: HydrologyBakeResult,
  paths: HydrologyChannelPath[],
  transform: HydrologyWorldTransform,
  options: HydrologyChannelPolylineOptions = {},
): HydrologyChannelPolyline[] {
  const maxPointsPerPath = Math.max(2, options.maxPointsPerPath ?? 96);

  return paths.map((path) => {
    const stride = Math.max(1, Math.ceil(path.cells.length / maxPointsPerPath));
    const sampledCells: number[] = [];
    for (let index = 0; index < path.cells.length; index += stride) {
      sampledCells.push(path.cells[index] as number);
    }
    const outlet = path.cells[path.cells.length - 1];
    if (typeof outlet === 'number' && sampledCells[sampledCells.length - 1] !== outlet) {
      sampledCells.push(outlet);
    }

    return {
      headCell: path.headCell,
      outletCell: path.outletCell,
      lengthCells: path.cells.length,
      lengthMeters: path.cells.length * transform.cellSizeMeters,
      maxAccumulationCells: path.maxAccumulationCells,
      points: sampledCells.map((cell) => {
        const x = cell % result.width;
        const z = Math.floor(cell / result.width);
        return {
          cell,
          x: transform.originX + x * transform.cellSizeMeters,
          z: transform.originZ + z * transform.cellSizeMeters,
          elevationMeters: result.heights[cell] ?? 0,
          accumulationCells: result.accumulation[cell] ?? 0,
        };
      }),
    };
  });
}

function validateInput(input: HydrologyBakeInput): void {
  if (input.width <= 0 || input.height <= 0) {
    throw new Error('Hydrology grid dimensions must be positive');
  }
  if (input.cellSizeMeters <= 0) {
    throw new Error('Hydrology cell size must be positive');
  }
  if (input.heights.length !== input.width * input.height) {
    throw new Error(`Hydrology height grid length ${input.heights.length} does not match ${input.width}x${input.height}`);
  }
}

function collectHydrologyMaskCells(mask: Uint8Array, expectedLength: number, label: string): number[] {
  if (mask.length !== expectedLength) {
    throw new Error(`Hydrology ${label} mask length ${mask.length} does not match expected ${expectedLength}`);
  }

  const cells: number[] = [];
  for (let index = 0; index < mask.length; index++) {
    if ((mask[index] ?? 0) > 0) cells.push(index);
  }
  return cells;
}

function validateHydrologyBakeArtifact(artifact: HydrologyBakeArtifact): void {
  if (artifact.schemaVersion !== HYDROLOGY_BAKE_ARTIFACT_VERSION) {
    throw new Error(`Unsupported hydrology artifact schema version ${artifact.schemaVersion}`);
  }
  if (artifact.width <= 0 || artifact.height <= 0 || artifact.cellSizeMeters <= 0) {
    throw new Error('Hydrology artifact grid dimensions and cell size must be positive');
  }
  if (artifact.transform.cellSizeMeters <= 0) {
    throw new Error('Hydrology artifact transform cell size must be positive');
  }
}

function fillHydrologyMaskCells(mask: Uint8Array, cells: number[], label: string): void {
  for (const cell of cells) {
    if (!Number.isInteger(cell) || cell < 0 || cell >= mask.length) {
      throw new Error(`Hydrology ${label} artifact mask cell ${cell} is out of range`);
    }
    mask[cell] = 1;
  }
}

interface HydrologyQueueItem {
  index: number;
  elevation: number;
}

class HydrologyMinHeap {
  private readonly items: HydrologyQueueItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HydrologyQueueItem): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): HydrologyQueueItem | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last) return first;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(current, parent) >= 0) break;
      this.swap(current, parent);
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (left < this.items.length && this.compare(left, smallest) < 0) {
        smallest = left;
      }
      if (right < this.items.length && this.compare(right, smallest) < 0) {
        smallest = right;
      }
      if (smallest === current) break;
      this.swap(current, smallest);
      current = smallest;
    }
  }

  private compare(leftIndex: number, rightIndex: number): number {
    const left = this.items[leftIndex];
    const right = this.items[rightIndex];
    if (!left || !right) return 0;
    return left.elevation - right.elevation || left.index - right.index;
  }

  private swap(left: number, right: number): void {
    const item = this.items[left];
    if (!item) return;
    this.items[left] = this.items[right] as HydrologyQueueItem;
    this.items[right] = item;
  }
}
