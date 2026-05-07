import type { HydrologyBakeArtifact, HydrologyMasks } from './HydrologyBake';
import { materializeHydrologyMasksFromArtifact, sampleHydrologyMasksAtWorld } from './HydrologyBake';

export interface HydrologyBiomePolicy {
  wetBiomeId: string;
  channelBiomeId: string;
  maxSlopeDeg?: number;
}

export interface HydrologyBiomeClassifier {
  artifact: HydrologyBakeArtifact;
  masks: HydrologyMasks;
  policy: HydrologyBiomePolicy;
}

export function createHydrologyBiomeClassifier(
  artifact: HydrologyBakeArtifact,
  policy: HydrologyBiomePolicy,
): HydrologyBiomeClassifier {
  return {
    artifact,
    masks: materializeHydrologyMasksFromArtifact(artifact),
    policy: { ...policy },
  };
}

export function classifyHydrologyBiome(
  baseBiomeId: string,
  elevation: number,
  slopeDeg: number,
  worldX: number,
  worldZ: number,
  classifier: HydrologyBiomeClassifier | null,
): string {
  if (!classifier) return baseBiomeId;
  if (classifier.policy.maxSlopeDeg !== undefined && slopeDeg > classifier.policy.maxSlopeDeg) {
    return baseBiomeId;
  }

  const sample = sampleHydrologyMasksAtWorld(
    classifier.masks,
    classifier.artifact.width,
    classifier.artifact.height,
    classifier.artifact.transform,
    worldX,
    worldZ,
  );
  if (!sample) return baseBiomeId;

  if (sample.channelCandidate) return classifier.policy.channelBiomeId;
  if (sample.wetCandidate) return classifier.policy.wetBiomeId;

  return baseBiomeId;
}
