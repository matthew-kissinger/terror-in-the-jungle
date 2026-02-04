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
      <div style="width: 8px; height: 8px; background: #00ff66; border-radius: 50%;"></div>
      <span>SQUAD</span>
    </div>
    <div style="display: flex; align-items: center; gap: 3px;">
      <div style="width: 8px; height: 8px; background: #4488ff; border-radius: 50%;"></div>
      <span>US</span>
    </div>
    <div style="display: flex; align-items: center; gap: 3px;">
      <div style="width: 8px; height: 8px; background: #ff4444; border-radius: 50%;"></div>
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
