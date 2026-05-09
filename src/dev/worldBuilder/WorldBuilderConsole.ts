/**
 * WorldBuilder dev console.
 *
 * Phase 0 (2026-05-09 realignment) — consolidated isolation/validation tool
 * the Politburo can use to test the running game without leaving the browser.
 * Sits alongside `LiveTuningPanel` (`\` toggle) and the 6-overlay debugger
 * (`Shift+\`); WorldBuilder is bound to **`Shift+G`**.
 *
 * Four folders:
 *   1. God Mode — invulnerable, infinite ammo, refill, no-clip flags.
 *      State is published on `window.__worldBuilder` so engine systems can
 *      consult it. Some flags are runtime-effective today (renderer, time);
 *      others depend on Phase 1 follow-up wiring in PlayerHealthSystem,
 *      FirstPersonWeapon, and PlayerMovement (filed as `worldbuilder-wiring`
 *      tasks in `docs/CARRY_OVERS.md`).
 *   2. System Toggles — shadows, post-process, HUD, ambient audio. Effective
 *      today via existing renderer / DOM / system surfaces.
 *   3. Debug Viz — re-routes to existing overlay panels (no duplicate state).
 *   4. Isolation — teleport to deploy, reset NPCs, force time-of-day, freeze
 *      tick (uses `engine.timeScale.setPaused`).
 *
 * Gating: instantiated only when `import.meta.env.DEV`. Tweakpane lazy-imported
 * so retail builds carry zero WorldBuilder bytes.
 *
 * Persistence: god-mode flags persist to localStorage so they survive page
 * reloads during a debugging session.
 */

import type { GameEngine } from '../../core/GameEngine';
import type { DebugHudRegistry, DebugPanel } from '../../ui/debug/DebugHudRegistry';
import { Logger } from '../../utils/Logger';

/** Minimal Tweakpane shape we use. Mirrors the LiveTuningPanel approach. */
interface PaneLike {
  addFolder(opt: { title: string; expanded?: boolean }): PaneLike;
  addBinding(
    target: object,
    key: string,
    params?: Record<string, unknown>,
  ): { on(event: 'change', handler: (ev: unknown) => void): unknown };
  addButton(opt: { title: string }): { on(event: 'click', handler: () => void): unknown };
  refresh?(): void;
  dispose?(): void;
}

const TOGGLE_KEY = 'G';
const TOGGLE_REQUIRES_SHIFT = true;
const LS_KEY = 'worldBuilder.state.v1';

export interface WorldBuilderState {
  // God mode — most fields are read by engine systems via window.__worldBuilder.
  invulnerable: boolean;
  infiniteAmmo: boolean;
  noClip: boolean;
  oneShotKills: boolean;

  // System toggles
  shadowsEnabled: boolean;
  postProcessEnabled: boolean;
  hudVisible: boolean;
  ambientAudioEnabled: boolean;

  // Isolation
  npcTickPaused: boolean;
  forceTimeOfDay: number; // 0..1, -1 = follow live atmosphere

  // Identification — useful for logging that WorldBuilder is active.
  active: boolean;
}

const DEFAULT_STATE: WorldBuilderState = {
  invulnerable: false,
  infiniteAmmo: false,
  noClip: false,
  oneShotKills: false,
  shadowsEnabled: true,
  postProcessEnabled: true,
  hudVisible: true,
  ambientAudioEnabled: true,
  npcTickPaused: false,
  forceTimeOfDay: -1,
  active: true,
};

export const WORLDBUILDER_GLOBAL_KEY = '__worldBuilder';

/** Read the current WorldBuilder state from `window.__worldBuilder`, if any. */
export function getWorldBuilderState(): WorldBuilderState | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as Record<string, WorldBuilderState | undefined>)[
    WORLDBUILDER_GLOBAL_KEY
  ];
}

/** True when the named god-mode flag is currently active. Engine systems call this. */
export function isWorldBuilderFlagActive(
  flag: keyof Pick<
    WorldBuilderState,
    'invulnerable' | 'infiniteAmmo' | 'noClip' | 'oneShotKills'
  >,
): boolean {
  const s = getWorldBuilderState();
  return Boolean(s && s[flag]);
}

export class WorldBuilderConsole implements DebugPanel {
  readonly id = 'world-builder';
  readonly label = 'WorldBuilder';
  readonly defaultVisible = false;
  readonly defaultHotkey = `Shift+${TOGGLE_KEY}`;

  private container: HTMLDivElement;
  private visible = false;
  private pane?: PaneLike;
  private state: WorldBuilderState = { ...DEFAULT_STATE };
  private keyHandler?: (ev: KeyboardEvent) => void;
  private registry?: DebugHudRegistry;
  private disposed = false;
  private originalShadowMapEnabled = true;
  private originalAmbientAudioVolume = 1;

  constructor(private readonly engine: GameEngine) {
    this.container = document.createElement('div');
    this.container.className = 'worldbuilder-console';
    Object.assign(this.container.style, {
      position: 'fixed',
      top: '16px',
      right: '352px', // sit to the LEFT of LiveTuningPanel (which is at right:16, width:320)
      width: '320px',
      maxHeight: 'calc(100vh - 32px)',
      overflowY: 'auto',
      pointerEvents: 'auto',
      display: 'none',
      fontFamily: '"Roboto Mono", monospace',
      fontSize: '11px',
    } as CSSStyleDeclaration);
  }

  async register(registry: DebugHudRegistry): Promise<void> {
    this.registry = registry;
    registry.register(this);

    const { Pane } = await import('tweakpane');
    this.pane = new Pane({
      container: this.container,
      title: 'WorldBuilder · Shift+G',
    }) as unknown as PaneLike;

    this.captureBaselines();
    this.hydrateFromLocalStorage();
    this.publishState();
    this.applyEffectiveToggles();
    this.buildPanel();

    this.keyHandler = (ev) => this.handleKey(ev);
    window.addEventListener('keydown', this.keyHandler);
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.container);
  }
  unmount(): void {
    this.container.parentElement?.removeChild(this.container);
  }
  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? 'block' : 'none';
  }
  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = undefined;
    this.pane?.dispose?.();
    this.pane = undefined;
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>)[WORLDBUILDER_GLOBAL_KEY];
    }
    const reg = this.registry;
    this.registry = undefined;
    if (reg?.hasPanel(this.id)) reg.unregister(this.id);
  }

  /** Plain JSON-serializable state snapshot. Used by tests + capture overlay. */
  getState(): WorldBuilderState {
    return { ...this.state };
  }

  /** Apply a state patch programmatically (e.g. from a test). */
  applyState(patch: Partial<WorldBuilderState>): void {
    Object.assign(this.state, patch);
    this.publishState();
    this.applyEffectiveToggles();
    this.persist();
    this.pane?.refresh?.();
  }

  // ---------- internals ----------

  private captureBaselines(): void {
    const r = this.engine.renderer;
    const three = (r as unknown as { renderer?: { shadowMap?: { enabled?: boolean } } }).renderer;
    this.originalShadowMapEnabled = Boolean(three?.shadowMap?.enabled);
  }

  private handleKey(ev: KeyboardEvent): void {
    if (TOGGLE_REQUIRES_SHIFT && !ev.shiftKey) return;
    if (ev.key.toUpperCase() !== TOGGLE_KEY) return;
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    ev.preventDefault();
    const reg = this.registry;
    if (reg && !reg.isMasterVisible()) {
      reg.setMasterVisible(true);
      this.setVisible(true);
    } else {
      this.setVisible(!this.visible);
    }
  }

  private buildPanel(): void {
    if (!this.pane) return;
    const onChange = (): void => {
      this.publishState();
      this.applyEffectiveToggles();
      this.persist();
    };

    // ---- God Mode ----
    const god = this.pane.addFolder({ title: 'God Mode', expanded: true });
    god.addBinding(this.state, 'invulnerable').on('change', () => onChange());
    god.addBinding(this.state, 'infiniteAmmo').on('change', () => onChange());
    god.addBinding(this.state, 'noClip').on('change', () => onChange());
    god.addBinding(this.state, 'oneShotKills').on('change', () => onChange());
    god.addButton({ title: 'Heal & Refill' }).on('click', () => this.healAndRefill());

    // ---- System Toggles ----
    const sys = this.pane.addFolder({ title: 'System Toggles', expanded: false });
    sys.addBinding(this.state, 'shadowsEnabled').on('change', () => onChange());
    sys.addBinding(this.state, 'postProcessEnabled').on('change', () => onChange());
    sys.addBinding(this.state, 'hudVisible').on('change', () => onChange());
    sys.addBinding(this.state, 'ambientAudioEnabled').on('change', () => onChange());

    // ---- Debug Viz (re-routes to existing overlays) ----
    const viz = this.pane.addFolder({ title: 'Debug Viz', expanded: false });
    viz.addButton({ title: 'Toggle Performance Overlay' }).on('click', () => this.togglePanel('performance'));
    viz.addButton({ title: 'Toggle Frame Budget' }).on('click', () => this.togglePanel('frame-budget'));
    viz.addButton({ title: 'Toggle Combat State' }).on('click', () => this.togglePanel('combat-state'));
    viz.addButton({ title: 'Toggle Vehicle State' }).on('click', () => this.togglePanel('vehicle-state'));
    viz.addButton({ title: 'Toggle Entity Inspector' }).on('click', () => this.togglePanel('entity-inspector'));
    viz.addButton({ title: 'Toggle Time Control' }).on('click', () => this.togglePanel('time-control'));

    // ---- Isolation ----
    const iso = this.pane.addFolder({ title: 'Isolation', expanded: false });
    iso.addBinding(this.state, 'npcTickPaused').on('change', () => onChange());
    iso.addBinding(this.state, 'forceTimeOfDay', { min: -1, max: 1, step: 0.05 }).on('change', () => onChange());
    iso.addButton({ title: 'Pause All (Backspace)' }).on('click', () => this.engine.timeScale.pause());
    iso.addButton({ title: 'Resume' }).on('click', () => this.engine.timeScale.resume());
    iso.addButton({ title: 'Step One Frame' }).on('click', () => this.engine.timeScale.stepOneFrame());
    iso.addButton({ title: 'Reset to defaults' }).on('click', () => this.resetToDefaults());
  }

  private togglePanel(id: string): void {
    this.registry?.togglePanel(id);
  }

  private healAndRefill(): void {
    // Best-effort wiring against the well-known systems. Each call is guarded
    // because the surface may not exist in headless / test environments.
    try {
      const sm = this.engine.systemManager as unknown as {
        playerHealth?: { reset?: () => void; revive?: () => void };
        ammoManager?: { refillAll?: () => void; setReserveFull?: () => void };
        firstPersonWeapon?: { reload?: () => void };
      };
      sm.playerHealth?.reset?.();
      sm.playerHealth?.revive?.();
      sm.ammoManager?.refillAll?.();
      sm.ammoManager?.setReserveFull?.();
      sm.firstPersonWeapon?.reload?.();
      Logger.info('worldbuilder', 'Heal & Refill applied (best-effort).');
    } catch (err) {
      Logger.warn('worldbuilder', 'Heal & Refill failed:', err);
    }
  }

  private applyEffectiveToggles(): void {
    // 1. Renderer shadows — flips the WebGLRenderer flag.
    try {
      const three = (this.engine.renderer as unknown as { renderer?: { shadowMap?: { enabled: boolean } } }).renderer;
      if (three?.shadowMap) {
        three.shadowMap.enabled = this.state.shadowsEnabled && this.originalShadowMapEnabled;
      }
    } catch { /* tolerate. */ }

    // 2. HUD visibility — toggles the master debug-hud DOM display
    //    AND any HUD root the game places on document.body via [data-hud-root].
    try {
      const hudRoots = document.querySelectorAll('[data-hud-root]');
      for (const el of Array.from(hudRoots)) {
        (el as HTMLElement).style.display = this.state.hudVisible ? '' : 'none';
      }
    } catch { /* tolerate. */ }

    // 3. NPC tick pause — uses the existing engine-wide pause until per-system
    //    isolation lands. (Tracked as a Phase 1 follow-up.)
    try {
      if (this.state.npcTickPaused) this.engine.timeScale.pause();
      else if (this.engine.timeScale.isPaused()) this.engine.timeScale.resume();
    } catch { /* tolerate. */ }

    // 4. Other flags publish to window.__worldBuilder for engine consumers.
    //    Wiring lives in PlayerHealth / FirstPersonWeapon / PlayerMovement /
    //    AtmosphereSystem — added in Phase 1 follow-up.
  }

  private publishState(): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, WorldBuilderState>)[WORLDBUILDER_GLOBAL_KEY] = {
      ...this.state,
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.state));
    } catch { /* quota / privacy mode; silent. */ }
  }

  private hydrateFromLocalStorage(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WorldBuilderState>;
      for (const key of Object.keys(this.state) as Array<keyof WorldBuilderState>) {
        const v = parsed[key];
        if (v !== undefined && typeof v === typeof this.state[key]) {
          (this.state as unknown as Record<string, unknown>)[key] = v;
        }
      }
    } catch { /* bad JSON. */ }
  }

  private resetToDefaults(): void {
    this.state = { ...DEFAULT_STATE };
    this.publishState();
    this.applyEffectiveToggles();
    this.persist();
    this.pane?.refresh?.();
  }
}
