// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { GameSystem } from '../types';

/**
 * Handles cleanup and disposal of game systems
 */
export class SystemDisposer {
  dispose(systems: GameSystem[]): void {
    for (const system of systems) {
      system.dispose();
    }
  }
}
