import { describe, expect, it } from 'vitest';

import {
  PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE,
  PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE,
} from './audit-archive/scene-attribution';

describe('scene attribution browser probes', () => {
  it('keep injected evaluation sources parseable', () => {
    expect(() => new Function(PROJEKT_143_SCENE_ATTRIBUTION_EVALUATE_SOURCE)).not.toThrow();
    expect(() => new Function(PROJEKT_143_RENDER_SUBMISSION_ATTRIBUTION_INSTALL_SOURCE)).not.toThrow();
  });
});
