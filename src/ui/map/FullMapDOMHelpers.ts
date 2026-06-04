// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

/**
 * DOM element creation helpers for the Full Map System
 */

import { FullMapInput } from './FullMapInput';

export function createLegend(): HTMLDivElement {
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(43, 38, 32, 0.95);"></div>
      <span>You</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(79, 107, 58, 0.9);"></div>
      <span>US Forces</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(158, 59, 46, 0.9);"></div>
      <span>OPFOR</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(168, 116, 42, 0.9);"></div>
      <span>Contested</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(138, 126, 107, 0.8);"></div>
      <span>Neutral</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(79, 107, 58, 0.5); border-radius: 50%; font-size: 8px; color: #2b2620; display: flex; align-items: center; justify-content: center; font-weight: bold;">H</div>
      <span>Helipad</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(82, 120, 140, 0.95); height: 4px; border-radius: 2px; box-shadow: 0 0 0 2px rgba(38, 60, 74, 0.75);"></div>
      <span>Water</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: rgba(79, 107, 58, 0.55); transform: rotate(45deg); border: 1px solid rgba(43, 38, 32, 0.7);"></div>
      <span>Boat</span>
    </div>
  `;
  return legend;
}

export function createControls(inputHandler: FullMapInput): HTMLDivElement {
  const controls = document.createElement('div');
  controls.className = 'map-controls';

  const zoomIn = document.createElement('button');
  zoomIn.className = 'map-control-button';
  zoomIn.textContent = '+';
  zoomIn.addEventListener('pointerdown', (e) => { e.preventDefault(); inputHandler.zoom(0.2); });

  const zoomOut = document.createElement('button');
  zoomOut.className = 'map-control-button';
  zoomOut.textContent = '-';
  zoomOut.addEventListener('pointerdown', (e) => { e.preventDefault(); inputHandler.zoom(-0.2); });

  const reset = document.createElement('button');
  reset.className = 'map-control-button';
  reset.textContent = '⟲';
  reset.addEventListener('pointerdown', (e) => { e.preventDefault(); inputHandler.resetZoom(); });

  controls.appendChild(zoomIn);
  controls.appendChild(zoomOut);
  controls.appendChild(reset);

  return controls;
}

export function createCompass(): HTMLDivElement {
  const compass = document.createElement('div');
  compass.className = 'compass-rose';
  compass.innerHTML = `
    <div class="compass-direction compass-n">N</div>
    <div class="compass-direction compass-s">S</div>
    <div class="compass-direction compass-e">E</div>
    <div class="compass-direction compass-w">W</div>
  `;
  return compass;
}
