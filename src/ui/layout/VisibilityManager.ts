/**
 * Backward-compatible alias for the gameplay presentation controller.
 *
 * The HUD layout historically exposed a VisibilityManager that only handled
 * phase/device/vehicle/ADS. It now owns the broader gameplay presentation
 * state used by HUD, touch controls, overlays, and vehicle contexts.
 */

import { GameplayPresentationController } from './GameplayPresentationController';

export class VisibilityManager extends GameplayPresentationController {}
