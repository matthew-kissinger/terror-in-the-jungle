# Three Model Optimizer

Private incubation package for reducing draw calls from static Three.js object
trees.

## Provenance

Extracted from Terror in the Jungle at commit
`5f585f7d4bf5ad2c0c85450235ac4c9950988d83`.

Original source:

- `src/systems/assets/ModelDrawCallOptimizer.ts`

Changed during extraction:

- replaced TIJ-specific exclusion policy with caller-provided preservation
  predicates;
- preserved skinned, morph-target, multi-material, and parent/control meshes by
  default;
- removed world-feature and asset-catalog assumptions;
- added independent package tests and a viewer example.

## API

```ts
import { optimizeStaticModelDrawCalls } from '@game-field-kits/three-model-optimizer';

const result = optimizeStaticModelDrawCalls(model, {
  strategy: 'merge',
  batchNamePrefix: 'optimized-prop',
  preserveMesh: (mesh) => mesh.name.includes('Rotor'),
});
```

## Non-Goals

- No animation retargeting.
- No skinned mesh optimization.
- No app-specific asset policy.
- No automatic decision that a model is visually safe to optimize.


