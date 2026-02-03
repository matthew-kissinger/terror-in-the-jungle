/**
 * DOM element creation helpers for the Full Map System
 */

import { FullMapInput } from './FullMapInput';

export function createLegend(): HTMLDivElement {
  const legend = document.createElement('div');
  legend.className = 'map-legend';
  legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-icon" style="background: #00ff00;"></div>
      <span>You</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: #4488ff;"></div>
      <span>US Forces</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: #ff4444;"></div>
      <span>OPFOR</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: #ffff44;"></div>
      <span>Contested</span>
    </div>
    <div class="legend-item">
      <div class="legend-icon" style="background: #888888;"></div>
      <span>Neutral</span>
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
  zoomIn.onclick = () => inputHandler.zoom(0.2);

  const zoomOut = document.createElement('button');
  zoomOut.className = 'map-control-button';
  zoomOut.textContent = '-';
  zoomOut.onclick = () => inputHandler.zoom(-0.2);

  const reset = document.createElement('button');
  reset.className = 'map-control-button';
  reset.textContent = '⟲';
  reset.onclick = () => inputHandler.resetZoom();

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
