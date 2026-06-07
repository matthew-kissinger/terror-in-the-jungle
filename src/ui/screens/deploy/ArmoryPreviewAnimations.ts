// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import * as THREE from 'three';
import { sanitizePixelForgeNpcAnimationClip } from '../../../systems/combat/PixelForgeNpcRuntime';

export interface PreviewAnimationOption {
  id: string;
  label: string;
  clip: THREE.AnimationClip;
}

const DEFAULT_ANIMATION_PREFERENCE = [
  'walk_fight_forward',
  'idle',
  'patrol_walk',
  'rest',
];
const NON_DEPLOY_PREVIEW_ANIMATION_TOKENS = ['death', 'dead'];

export function createPreviewAnimationOptions(
  animations: readonly THREE.AnimationClip[],
): PreviewAnimationOption[] {
  const seen = new Set<string>();
  const options = animations.flatMap((clip) => {
    const id = clip.name.trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: getPreviewAnimationLabel(id), clip }];
  });
  const deployOptions = options.filter(option => (
    !NON_DEPLOY_PREVIEW_ANIMATION_TOKENS.some(token => option.id.toLowerCase().includes(token))
  ));
  return deployOptions.length > 0 ? deployOptions : options;
}

export function createPreviewAnimationActions(
  mixer: THREE.AnimationMixer,
  options: readonly PreviewAnimationOption[],
): Map<string, THREE.AnimationAction> {
  const actions = new Map<string, THREE.AnimationAction>();
  for (const option of options) {
    const action = mixer.clipAction(sanitizePixelForgeNpcAnimationClip(option.clip));
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    actions.set(option.id, action);
  }
  return actions;
}

export function pickPreviewAnimationId(
  options: readonly PreviewAnimationOption[],
  selectedAnimationId: string | undefined,
): string | undefined {
  if (selectedAnimationId && options.some(option => option.id === selectedAnimationId)) {
    return selectedAnimationId;
  }
  for (const preferred of DEFAULT_ANIMATION_PREFERENCE) {
    const found = options.find(option => option.id === preferred);
    if (found) return found.id;
  }
  return options[0]?.id;
}

function getPreviewAnimationLabel(id: string): string {
  switch (id) {
    case 'walk_fight_forward':
      return 'Fight';
    case 'patrol_walk':
      return 'Patrol';
    case 'idle':
      return 'Idle';
    case 'rest':
      return 'Rest';
    default:
      return id
        .replace(/^.*?:/, '')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/\b\w/g, value => value.toUpperCase());
  }
}
