import type { HydrologyBakeArtifact, HydrologyChannelPolyline } from './HydrologyBake';

export function resolveHydrologyPeakAccumulationCells(
  artifact: HydrologyBakeArtifact,
  channels: readonly HydrologyChannelPolyline[] = artifact.channelPolylines,
): number {
  return Math.max(
    artifact.thresholds.accumulationP99Cells,
    ...channels.map(channel => channel.maxAccumulationCells),
  );
}

export function resolveHydrologyAccumulationFactor(
  accumulationCells: number,
  artifact: HydrologyBakeArtifact,
  peakAccumulationCells = resolveHydrologyPeakAccumulationCells(artifact),
): number {
  const p98 = Math.max(1, artifact.thresholds.accumulationP98Cells);
  const peak = Math.max(p98 + 1, artifact.thresholds.accumulationP99Cells, peakAccumulationCells);
  return clamp(
    (Math.log1p(Math.max(0, accumulationCells)) - Math.log1p(p98))
    / Math.max(0.001, Math.log1p(peak) - Math.log1p(p98)),
    0,
    1,
  );
}

export function resolveHydrologyRiverWidthMeters(
  accumulationCells: number,
  artifact: HydrologyBakeArtifact,
  peakAccumulationCells = resolveHydrologyPeakAccumulationCells(artifact),
): number {
  const cellSize = artifact.cellSizeMeters;
  const minWidth = clamp(cellSize * 0.8, 8, 28);
  const maxWidth = clamp(cellSize * 7.0, 72, 150);
  const t = Math.pow(resolveHydrologyAccumulationFactor(accumulationCells, artifact, peakAccumulationCells), 1.55);
  return minWidth + (maxWidth - minWidth) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
