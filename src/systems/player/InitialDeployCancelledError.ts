// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

export class InitialDeployCancelledError extends Error {
  constructor() {
    super('Initial deploy cancelled');
    this.name = 'InitialDeployCancelledError';
  }
}
