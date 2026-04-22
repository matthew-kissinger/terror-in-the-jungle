import * as THREE from 'three';

/**
 * Contract implemented by every 3D scene-space debug overlay. Overlays lazily
 * create their own Object3D tree on `mount()` and must dispose geometry /
 * materials in `unmount()` so they do not leak when toggled off. Per the
 * cycle-level heap findings, do not pre-allocate; allocate on first toggle-on.
 */
export interface WorldOverlay {
  readonly id: string;
  readonly label: string;
  readonly hotkey?: string;
  readonly defaultVisible: boolean;
  mount(group: THREE.Group): void;
  unmount(): void;
  update?(dt: number): void;
}

interface OverlayEntry {
  overlay: WorldOverlay;
  visible: boolean;
}

/**
 * Parent-of-all scene-space debug overlays. Owns a single `THREE.Group` under
 * `GameRenderer.scene`. Master toggle hides the group without unmounting
 * overlays so repeated Shift+\ does not churn GPU allocations.
 */
export class WorldOverlayRegistry {
  private readonly group: THREE.Group;
  private readonly entries = new Map<string, OverlayEntry>();
  private masterVisible = true;

  constructor(parent: THREE.Scene | THREE.Group) {
    this.group = new THREE.Group();
    this.group.name = 'WorldOverlayRegistry';
    parent.add(this.group);
  }

  getGroup(): THREE.Group { return this.group; }

  register(overlay: WorldOverlay): void {
    if (this.entries.has(overlay.id)) {
      throw new Error(`WorldOverlayRegistry: overlay id "${overlay.id}" already registered`);
    }
    const entry: OverlayEntry = { overlay, visible: false };
    this.entries.set(overlay.id, entry);
    if (overlay.defaultVisible && this.masterVisible) {
      this.setOverlayVisible(overlay.id, true);
    }
  }

  list(): ReadonlyArray<WorldOverlay> {
    return Array.from(this.entries.values()).map((e) => e.overlay);
  }

  isVisible(id: string): boolean {
    const entry = this.entries.get(id);
    return !!entry && entry.visible && this.masterVisible;
  }

  toggleOverlay(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.setOverlayVisible(id, !entry.visible);
  }

  setOverlayVisible(id: string, visible: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.visible === visible) return;
    entry.visible = visible;
    if (visible) entry.overlay.mount(this.group);
    else entry.overlay.unmount();
  }

  toggleAll(): void { this.setMasterVisible(!this.masterVisible); }

  setMasterVisible(visible: boolean): void {
    this.masterVisible = visible;
    this.group.visible = visible;
  }

  isMasterVisible(): boolean { return this.masterVisible; }

  update(dt: number): void {
    if (!this.masterVisible) return;
    for (const entry of this.entries.values()) {
      if (entry.visible && entry.overlay.update) entry.overlay.update(dt);
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.visible) {
        entry.overlay.unmount();
        entry.visible = false;
      }
    }
    this.entries.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
