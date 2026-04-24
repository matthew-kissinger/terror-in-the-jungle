/**
 * Tweakpane bindings for the terrain sandbox parameter panel.
 *
 * The sandbox owns a private Tweakpane instance — completely separate from
 * the main-game LiveTuningPanel. Bindings mutate the supplied `params` and
 * `preview` objects in place and call the `onChange` callback so the scene
 * can debounce-regenerate.
 */

import type { HeightmapParams } from './heightmapGenerator';

/**
 * Minimal structural Tweakpane surface we use. Mirrors the `PaneLike`
 * shape in `src/ui/debug/LiveTuningPanel.ts` so call sites don't require
 * @tweakpane/core type metadata.
 */
export interface SandboxPaneLike {
  addFolder(opt: { title: string; expanded?: boolean }): SandboxPaneLike;
  addBinding(
    target: object,
    key: string,
    params?: Record<string, unknown>,
  ): { on(event: 'change', handler: (ev: unknown) => void): unknown };
  addButton(opt: { title: string }): { on(event: 'click', handler: () => void): unknown };
  refresh?(): void;
  dispose?(): void;
}

export interface PreviewToggles {
  wireframe: boolean;
  contours: boolean;
  normals: boolean;
}

export const DEFAULT_PREVIEW_TOGGLES: PreviewToggles = {
  wireframe: false,
  contours: false,
  normals: false,
};

interface SandboxPaneHandlers {
  onParamsChange: () => void;
  onPreviewChange: () => void;
  onExport: () => void;
  onCopyRegistryEntry: () => void;
  onResetDefaults: () => void;
}

export function buildSandboxPane(
  pane: SandboxPaneLike,
  params: HeightmapParams,
  preview: PreviewToggles,
  handlers: SandboxPaneHandlers,
): void {
  const { onParamsChange, onPreviewChange, onExport, onCopyRegistryEntry, onResetDefaults } = handlers;

  const noise = pane.addFolder({ title: 'Noise', expanded: true });
  noise.addBinding(params, 'seed', { min: 1, max: 999999, step: 1 }).on('change', onParamsChange);
  noise.addBinding(params, 'octaves', { min: 1, max: 8, step: 1 }).on('change', onParamsChange);
  noise.addBinding(params, 'frequency', { min: 0.0001, max: 0.01, step: 0.0001 }).on('change', onParamsChange);
  noise.addBinding(params, 'lacunarity', { min: 1.5, max: 3.0, step: 0.05 }).on('change', onParamsChange);
  noise.addBinding(params, 'persistence', { min: 0.3, max: 0.7, step: 0.05 }).on('change', onParamsChange);
  noise.addBinding(params, 'amplitude', { label: 'amplitude m', min: 10, max: 300, step: 5 })
    .on('change', onParamsChange);

  const warp = pane.addFolder({ title: 'Domain warp', expanded: false });
  warp.addBinding(params, 'warpStrength', { label: 'strength', min: 0, max: 100, step: 1 })
    .on('change', onParamsChange);
  warp.addBinding(params, 'warpFrequency', { label: 'frequency', min: 0.0001, max: 0.01, step: 0.0001 })
    .on('change', onParamsChange);

  const shape = pane.addFolder({ title: 'Shape', expanded: true });
  shape.addBinding(params, 'mapSizeMeters', { label: 'map size m', min: 1000, max: 8000, step: 100 })
    .on('change', onParamsChange);
  shape.addBinding(params, 'resolution', {
    options: { '128': 128, '256': 256, '512': 512, '1024': 1024, '2048': 2048 },
  }).on('change', onParamsChange);

  const prev = pane.addFolder({ title: 'Preview', expanded: true });
  prev.addBinding(preview, 'wireframe').on('change', onPreviewChange);
  prev.addBinding(preview, 'contours').on('change', onPreviewChange);
  prev.addBinding(preview, 'normals').on('change', onPreviewChange);

  const exp = pane.addFolder({ title: 'Export', expanded: true });
  exp.addButton({ title: 'Export heightmap (.f32 + .png + .json)' }).on('click', onExport);
  exp.addButton({ title: 'Copy MapSeedRegistry entry' }).on('click', onCopyRegistryEntry);
  exp.addButton({ title: 'Reset to defaults' }).on('click', onResetDefaults);
}
