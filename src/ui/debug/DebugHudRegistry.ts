import { zIndex } from '../design/tokens';

/**
 * Interface adopted by every debug panel. A panel owns its own visual layout,
 * but the registry is the sole thing that adds/removes it to/from the DOM and
 * controls its visibility.
 *
 * Implementors should avoid calling `document.body.appendChild` themselves —
 * `mount(container)` receives the sub-container from the registry.
 */
export interface DebugPanel {
  /** Stable id used by `togglePanel(id)`. */
  readonly id: string;
  /** Human-readable label shown in future menu UI. */
  readonly label: string;
  /** Whether the panel starts visible (when master hud is on). */
  readonly defaultVisible: boolean;
  /** Optional hotkey metadata (e.g. 'F1'). The registry does not bind keys. */
  readonly defaultHotkey?: string;

  /** Append the panel's root element into the supplied container. */
  mount(container: HTMLElement): void;
  /** Remove the panel's root element from its container. */
  unmount(): void;
  /** Show/hide the panel's root element. */
  setVisible(visible: boolean): void;
  /** True if the panel is currently visible. */
  isVisible(): boolean;
  /** Optional per-frame tick. */
  update?(dt: number): void;
  /** Optional teardown. */
  dispose?(): void;
}

interface PanelEntry {
  panel: DebugPanel;
  subContainer: HTMLDivElement;
}

/**
 * Owns a single top-level `<div id="debug-hud">` host and an ordered set of
 * DebugPanel children. Responsible for mounting panels, toggling individual
 * panel visibility, and toggling the master container (backtick keybind).
 */
export class DebugHudRegistry {
  private readonly container: HTMLDivElement;
  private readonly panels = new Map<string, PanelEntry>();
  private masterVisible = true;

  constructor(parent: HTMLElement = document.body) {
    this.container = document.createElement('div');
    this.container.id = 'debug-hud';
    this.container.style.position = 'fixed';
    this.container.style.inset = '0';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = String(zIndex.debug);
    parent.appendChild(this.container);
  }

  /**
   * Register a panel. Mounts it immediately inside its own sub-container and
   * applies `defaultVisible`.
   */
  register(panel: DebugPanel): void {
    if (this.panels.has(panel.id)) {
      throw new Error(`DebugHudRegistry: panel id "${panel.id}" already registered`);
    }
    const subContainer = document.createElement('div');
    subContainer.dataset.panelId = panel.id;
    subContainer.style.pointerEvents = 'none';
    this.container.appendChild(subContainer);
    panel.mount(subContainer);
    panel.setVisible(panel.defaultVisible && this.masterVisible);
    this.panels.set(panel.id, { panel, subContainer });
  }

  /** Unregister and unmount a panel. No-op if unknown. */
  unregister(id: string): void {
    const entry = this.panels.get(id);
    if (!entry) return;
    entry.panel.unmount();
    entry.panel.dispose?.();
    if (entry.subContainer.parentElement) {
      entry.subContainer.parentElement.removeChild(entry.subContainer);
    }
    this.panels.delete(id);
  }

  /** Look up a panel by id. */
  getPanel(id: string): DebugPanel | undefined {
    return this.panels.get(id)?.panel;
  }

  hasPanel(id: string): boolean {
    return this.panels.has(id);
  }

  /** Toggle visibility of a single panel. No-op if unknown or master hidden. */
  togglePanel(id: string): void {
    const entry = this.panels.get(id);
    if (!entry) return;
    // Toggling a panel implicitly ensures the master is visible; otherwise the
    // user would toggle an invisible panel.
    if (!this.masterVisible) {
      this.setMasterVisible(true);
      entry.panel.setVisible(true);
      return;
    }
    entry.panel.setVisible(!entry.panel.isVisible());
  }

  /** Toggle the master container. When off, no panels render. */
  toggleAll(): void {
    this.setMasterVisible(!this.masterVisible);
  }

  setMasterVisible(visible: boolean): void {
    this.masterVisible = visible;
    this.container.style.display = visible ? 'block' : 'none';
  }

  isMasterVisible(): boolean {
    return this.masterVisible;
  }

  /** Fan-out per-frame tick to panels that implement `update`. */
  update(dt: number): void {
    if (!this.masterVisible) return;
    for (const { panel } of this.panels.values()) {
      if (panel.update && panel.isVisible()) {
        panel.update(dt);
      }
    }
  }

  /** Dispose all panels and detach the host element. */
  dispose(): void {
    for (const id of Array.from(this.panels.keys())) {
      this.unregister(id);
    }
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
