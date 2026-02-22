/**
 * UI Engine - public API exports.
 *
 * Usage:
 *   import { UIComponent } from '../engine';
 *   import { signal, computed, effect } from '@preact/signals-core';
 */

export { UIComponent } from './UIComponent';

// Re-export layout types for convenience
export type { LayoutComponent, HUDRegion, UIState, LayoutMode } from '../layout/types';
