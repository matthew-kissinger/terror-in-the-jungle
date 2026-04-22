import type { GameEngine } from '../../core/GameEngine';
import type { DebugHudRegistry, DebugPanel } from './DebugHudRegistry';
import { bindAirframeKnobs, applyAirframeState, captureAirframeDefaults } from './tuning/tuneAirframe';
import { bindCloudKnobs, applyCloudState, captureCloudDefaults } from './tuning/tuneCloud';
import { bindAtmosphereKnobs, applyAtmosphereState, captureAtmosphereDefaults } from './tuning/tuneAtmosphere';
import { bindCombatKnobs, applyCombatState, captureCombatDefaults } from './tuning/tuneCombat';
import { bindWeatherKnobs, applyWeatherState, captureWeatherDefaults } from './tuning/tuneWeather';

/** Serialized knob state. Keys are stable domain-prefixed paths. */
export type TuningState = Record<string, number | string | boolean>;

/**
 * Minimal structural type for the Tweakpane surface we use. Tweakpane 4.x
 * ships partial type metadata (FolderApi's method surface comes from
 * @tweakpane/core, which isn't a declared type dep) so a local shape lets
 * our call sites typecheck without pulling that in.
 */
export interface PaneLike {
  addFolder(opt: { title: string; expanded?: boolean }): PaneLike;
  addBinding(target: object, key: string, params?: Record<string, unknown>): { on(event: 'change', handler: (ev: unknown) => void): unknown };
  addButton(opt: { title: string }): { on(event: 'click', handler: () => void): unknown };
  refresh?(): void;
  dispose?(): void;
}

const LS_STATE = 'liveTuningPanel.state';
const LS_PRESET = 'liveTuningPanel.presets.';
const LS_PRESET_NAMES = 'liveTuningPanel.presetNames';
const PERSIST_DEBOUNCE_MS = 500;
const TOGGLE_KEY = '\\';

/**
 * Dev-only live-tuning panel. Mounts a Tweakpane UI bound to curated runtime
 * knobs across flight / clouds / atmosphere / combat / weather. Backslash
 * toggles visibility.
 *
 * Gating: instantiated only when `import.meta.env.DEV`. Vite dead-code
 * eliminates the import site in retail builds, so Tweakpane never ships.
 *
 * Persistence: knob changes debounce a localStorage write. On construction,
 * hydrates from localStorage. Named presets can be saved, loaded, exported.
 */
export class LiveTuningPanel implements DebugPanel {
  readonly id = 'live-tuning';
  readonly label = 'Live Tuning';
  readonly defaultVisible = false;
  readonly defaultHotkey = TOGGLE_KEY;

  private container: HTMLDivElement;
  private visible = false;
  private pane?: PaneLike;
  private state: TuningState = {};
  private defaults: TuningState = {};
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private keyHandler?: (ev: KeyboardEvent) => void;
  private registry?: DebugHudRegistry;
  private disposed = false;

  constructor(private readonly engine: GameEngine) {
    this.container = document.createElement('div');
    this.container.className = 'live-tuning-panel';
    Object.assign(this.container.style, {
      position: 'fixed', top: '16px', right: '16px', width: '320px',
      maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
      pointerEvents: 'auto', display: 'none',
      fontFamily: '"Roboto Mono", monospace', fontSize: '11px',
    } as CSSStyleDeclaration);
  }

  async register(registry: DebugHudRegistry): Promise<void> {
    this.registry = registry;
    registry.register(this);

    // Dynamic import keeps Tweakpane out of the retail bundle — callers
    // behind `import.meta.env.DEV` get the panel; retail never reaches here.
    const { Pane } = await import('tweakpane');
    this.pane = new Pane({ container: this.container, title: 'Live Tuning' }) as unknown as PaneLike;

    // Capture defaults BEFORE hydration so Reset can recover them.
    this.defaults = {
      ...captureAirframeDefaults(),
      ...captureCloudDefaults(),
      ...captureAtmosphereDefaults(this.engine),
      ...captureCombatDefaults(this.engine),
      ...captureWeatherDefaults(this.engine),
    };
    this.state = { ...this.defaults };
    this.hydrateFromLocalStorage();
    this.applyStateToTargets();
    this.buildPanel();

    this.keyHandler = (ev) => this.handleKey(ev);
    window.addEventListener('keydown', this.keyHandler);
  }

  mount(container: HTMLElement): void { container.appendChild(this.container); }
  unmount(): void { this.container.parentElement?.removeChild(this.container); }
  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? 'block' : 'none';
  }
  isVisible(): boolean { return this.visible; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.keyHandler = undefined;
    this.persistTimer = null;
    this.pane?.dispose?.();
    this.pane = undefined;
    const reg = this.registry;
    this.registry = undefined;
    if (reg?.hasPanel(this.id)) reg.unregister(this.id);
  }

  /** Plain JSON-serializable dictionary of current knob values. Used by R3 playtest-capture-overlay. */
  getState(): TuningState { return { ...this.state }; }

  /** Apply a state patch; pushes to runtime targets and refreshes the pane. */
  applyState(patch: Partial<TuningState>): void {
    Object.assign(this.state, patch);
    this.applyStateToTargets();
    this.pane?.refresh?.();
  }

  private handleKey(ev: KeyboardEvent): void {
    if (ev.key !== TOGGLE_KEY) return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    ev.preventDefault();
    if (this.registry && !this.registry.isMasterVisible()) {
      this.registry.setMasterVisible(true);
      this.setVisible(true);
    } else {
      this.setVisible(!this.visible);
    }
  }

  private buildPanel(): void {
    if (!this.pane) return;
    const onChange = () => this.schedulePersist();
    bindAirframeKnobs(this.pane, this.state, onChange);
    bindCloudKnobs(this.pane, this.state, onChange);
    bindAtmosphereKnobs(this.pane, this.engine, this.state, onChange);
    bindCombatKnobs(this.pane, this.engine, this.state, onChange);
    bindWeatherKnobs(this.pane, this.engine, this.state, onChange);

    const presets = this.pane.addFolder({ title: 'Presets', expanded: false });
    presets.addButton({ title: 'Save preset' }).on('click', () => this.savePreset());
    presets.addButton({ title: 'Load preset' }).on('click', () => this.loadPreset());
    presets.addButton({ title: 'Reset to defaults' }).on('click', () => this.resetToDefaults());
    presets.addButton({ title: 'Export presets JSON' }).on('click', () => this.exportPresets());
  }

  private applyStateToTargets(): void {
    applyAirframeState(this.state);
    applyCloudState(this.state);
    applyAtmosphereState(this.engine, this.state);
    applyCombatState(this.engine, this.state);
    applyWeatherState(this.engine, this.state);
  }

  private schedulePersist(): void {
    this.applyStateToTargets();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      try { localStorage.setItem(LS_STATE, JSON.stringify(this.state)); }
      catch { /* quota / privacy-mode; silent. */ }
    }, PERSIST_DEBOUNCE_MS);
  }

  private hydrateFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(LS_STATE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as TuningState;
      // Drop stale keys from old schemas without clobbering new ones.
      for (const [k, v] of Object.entries(parsed)) {
        if (k in this.defaults) this.state[k] = v;
      }
    } catch { /* bad JSON — stick with defaults. */ }
  }

  private savePreset(): void {
    const name = typeof window.prompt === 'function' ? window.prompt('Preset name:') : null;
    if (!name) return;
    try {
      localStorage.setItem(LS_PRESET + name, JSON.stringify(this.state));
      const names = this.readPresetNames();
      if (!names.includes(name)) {
        names.push(name);
        localStorage.setItem(LS_PRESET_NAMES, JSON.stringify(names));
      }
    } catch { /* quota; silent. */ }
  }

  private loadPreset(): void {
    const names = this.readPresetNames();
    if (names.length === 0) return;
    const name = typeof window.prompt === 'function'
      ? window.prompt(`Load preset (${names.join(', ')}):`) : null;
    if (!name) return;
    try {
      const raw = localStorage.getItem(LS_PRESET + name);
      if (!raw) return;
      this.applyState(JSON.parse(raw) as TuningState);
      this.schedulePersist();
    } catch { /* ignore. */ }
  }

  private resetToDefaults(): void {
    this.applyState({ ...this.defaults });
    this.schedulePersist();
  }

  private exportPresets(): void {
    const names = this.readPresetNames();
    const bundle: Record<string, TuningState> = {};
    for (const name of names) {
      try {
        const raw = localStorage.getItem(LS_PRESET + name);
        if (raw) bundle[name] = JSON.parse(raw) as TuningState;
      } catch { /* skip. */ }
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'live-tuning-presets.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private readPresetNames(): string[] {
    try {
      const raw = localStorage.getItem(LS_PRESET_NAMES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : [];
    } catch { return []; }
  }
}
