// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2025-2026 Matthew Kissinger

import { MINIMAP_STYLES } from './MinimapStyles';

type MinimapDOMRefs = {
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  styleSheet: HTMLStyleElement;
};

export function createMinimapDOM(minimapSize: number): MinimapDOMRefs {
  const container = document.createElement('div');
  container.className = 'minimap-container';

  const canvas = document.createElement('canvas');
  canvas.className = 'minimap-canvas';
  canvas.width = minimapSize;
  canvas.height = minimapSize;

  const context = canvas.getContext('2d')!;

  const legend = document.createElement('div');
  legend.className = 'minimap-legend';
  legend.innerHTML = `
    <div style="display: flex; align-items: center; gap: 3px;">
      <div style="width: 8px; height: 8px; background: rgba(125, 154, 90, 0.8); border-radius: 50%;"></div>
      <span>SQUAD</span>
    </div>
    <div style="display: flex; align-items: center; gap: 3px;">
      <div style="width: 8px; height: 8px; background: rgba(79, 107, 58, 0.8); border-radius: 50%;"></div>
      <span>US</span>
    </div>
    <div style="display: flex; align-items: center; gap: 3px;">
      <div style="width: 8px; height: 8px; background: rgba(158, 59, 46, 0.8); border-radius: 50%;"></div>
      <span>OPFOR</span>
    </div>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);

  const styleSheet = document.createElement('style');
  styleSheet.textContent = MINIMAP_STYLES;
  document.head.appendChild(styleSheet);

  return {
    container,
    canvas,
    context,
    styleSheet
  };
}
