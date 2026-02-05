import 'three';
import { MeshBVH } from 'three-mesh-bvh';

declare module 'three' {
  interface BufferGeometry {
    computeBoundsTree(options?: any): MeshBVH;
    disposeBoundsTree(): void;
    boundsTree?: MeshBVH;
  }
}
