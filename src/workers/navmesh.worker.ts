// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * Off-thread navmesh generation worker.
 * Runs Recast WASM in a Web Worker so the main thread stays responsive.
 */

import { init, exportNavMesh } from '@recast-navigation/core';
import { generateSoloNavMesh, generateTiledNavMesh } from '@recast-navigation/generators';

interface GenerateMessage {
  type: 'generate';
  requestId: number;
  positions: Float32Array;
  indices: Uint32Array;
  config: Record<string, number>;
}

type WorkerMessage = GenerateMessage;

let ready = false;

const initPromise = init()
  .then(() => {
    ready = true;
    (self as unknown as Worker).postMessage({ type: 'ready' });
  })
  .catch((err) => {
    (self as unknown as Worker).postMessage({
      type: 'error',
      requestId: -1,
      message: `WASM init failed: ${err}`,
    });
  });

self.onmessage = async function (event: MessageEvent<WorkerMessage>) {
  const msg = event.data;

  if (msg.type === 'generate') {
    try {
      await initPromise;
    } catch {
      // The init failure path already posted an error to the main thread.
    }

    if (!ready) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        requestId: msg.requestId,
        message: 'Worker WASM not initialized',
      });
      return;
    }

    try {
      // A positive `tileSize` selects tiled generation (large worlds such as
      // A Shau); otherwise solo. Both share the same transferable-buffer
      // request shape, so the main thread offloads either kind identically.
      const tiled = typeof msg.config.tileSize === 'number' && msg.config.tileSize > 0;
      const result = tiled
        ? generateTiledNavMesh(msg.positions, msg.indices, msg.config)
        : generateSoloNavMesh(msg.positions, msg.indices, msg.config);

      if (!result.success || !result.navMesh) {
        (self as unknown as Worker).postMessage({
          type: 'error',
          requestId: msg.requestId,
          message: result.success ? 'No navMesh returned' : result.error,
        });
        return;
      }

      const navMeshData = exportNavMesh(result.navMesh);
      result.navMesh.destroy();

      (self as unknown as Worker).postMessage(
        { type: 'result', requestId: msg.requestId, navMeshData },
        [navMeshData.buffer],
      );
    } catch (error) {
      (self as unknown as Worker).postMessage({
        type: 'error',
        requestId: msg.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
};
