// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import 'three';
import { MeshBVH } from 'three-mesh-bvh';

declare module 'three' {
  interface BufferGeometry {
    computeBoundsTree(options?: any): MeshBVH;
    disposeBoundsTree(): void;
    boundsTree?: MeshBVH;
  }
}
