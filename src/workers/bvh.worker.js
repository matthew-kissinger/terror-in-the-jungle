/**
 * BVH generation worker - runs off main thread
 *
 * Based on three-mesh-bvh/src/workers/generateMeshBVH.worker.js
 * Modified to work with Vite's native worker bundling
 */

import { BufferGeometry, BufferAttribute } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

self.onmessage = ({ data }) => {
  let prevTime = performance.now();

  function onProgressCallback(progress) {
    progress = Math.min(progress, 1);
    const currTime = performance.now();

    if (currTime - prevTime >= 10 && progress !== 1.0) {
      self.postMessage({
        error: null,
        serialized: null,
        position: null,
        progress,
      });
      prevTime = currTime;
    }
  }

  const { index, position, options } = data;

  try {
    // Reconstruct geometry from transferred arrays
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3, false));

    if (index) {
      geometry.setIndex(new BufferAttribute(index, 1, false));
    }

    // Set up progress callback if requested
    if (options.includedProgressCallback) {
      options.onProgress = onProgressCallback;
    }

    // Restore groups
    if (options.groups) {
      for (const group of options.groups) {
        geometry.addGroup(group.start, group.count, group.materialIndex);
      }
    }

    // Generate BVH
    const bvh = new MeshBVH(geometry, options);

    // Serialize for transfer
    const serialized = MeshBVH.serialize(bvh, { copyIndexBuffer: false });

    // Build transfer list
    let toTransfer = [position.buffer, ...serialized.roots];

    if (serialized.index) {
      toTransfer.push(serialized.index.buffer);
    }

    // Filter out SharedArrayBuffers
    toTransfer = toTransfer.filter(
      (v) => typeof SharedArrayBuffer === 'undefined' || !(v instanceof SharedArrayBuffer)
    );

    if (bvh._indirectBuffer) {
      toTransfer.push(serialized.indirectBuffer.buffer);
    }

    // Send result
    self.postMessage(
      {
        error: null,
        serialized,
        position,
        progress: 1,
      },
      toTransfer
    );
  } catch (error) {
    self.postMessage({
      error: error.message || String(error),
      serialized: null,
      position: null,
      progress: 1,
    });
  }
};
