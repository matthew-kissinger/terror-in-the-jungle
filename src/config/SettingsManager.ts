import { Logger } from '../utils/Logger';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';
export type ControllerPreset = 'default' | 'southpaw';
export type ControllerLookCurve = 'precision' | 'linear';
export type ControllerDpadMode = 'weapons' | 'quickCommands';

export interface GameSettings {
  masterVolume: number;       // 0-100
  mouseSensitivity: number;   // 1-10 (UI scale), mapped to 0.001-0.005 internally
  touchSensitivity: number;   // 1-10 (UI scale), mapped to 0.002-0.008 internally (touch needs higher base)
  controllerPreset: ControllerPreset;
  controllerMoveDeadZone: number; // 5-30 percent
  controllerLookDeadZone: number; // 5-30 percent
  controllerLookCurve: ControllerLookCurve;
  controllerInvertY: boolean;
  controllerDpadMode: ControllerDpadMode;
  showFPS: boolean;
  enableShadows: boolean;
  graphicsQuality: GraphicsQuality;
}

type SettingsKey = keyof GameSettings;
type SettingsListener = (key: SettingsKey, value: GameSettings[SettingsKey]) => void;

const STORAGE_KEY = 'pixelart-sandbox-settings';

const DEFAULT_SETTINGS: GameSettings = {
  masterVolume: 70,
  mouseSensitivity: 5,
  touchSensitivity: 5,
  controllerPreset: 'default',
  controllerMoveDeadZone: 15,
  controllerLookDeadZone: 15,
  controllerLookCurve: 'precision',
  controllerInvertY: false,
  controllerDpadMode: 'weapons',
  showFPS: false,
  enableShadows: true,
  graphicsQuality: 'medium',
};

export class SettingsManager {
  private static instance: SettingsManager | null = null;
  private settings: GameSettings;
  private listeners: SettingsListener[] = [];

  private constructor() {
    this.settings = this.loadFromStorage();
  }

  static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  get<K extends SettingsKey>(key: K): GameSettings[K] {
    return this.settings[key];
  }

  set<K extends SettingsKey>(key: K, value: GameSettings[K]): void {
    if (this.settings[key] === value) return;
    this.settings[key] = value;
    this.saveToStorage();
    for (const listener of this.listeners) {
      listener(key, value);
    }
  }

  /** Returns mouse sensitivity in radians/pixel (0.001 - 0.005) */
  getMouseSensitivityRaw(): number {
    const uiValue = this.settings.mouseSensitivity; // 1-10
    return 0.001 + (uiValue - 1) * (0.004 / 9);
  }

  /** Returns touch look sensitivity (0.002 - 0.008). Higher base than mouse for responsive feel. */
  getTouchSensitivityRaw(): number {
    const uiValue = this.settings.touchSensitivity; // 1-10
    return 0.002 + (uiValue - 1) * (0.006 / 9);
  }

  /** Returns controller move stick dead zone as 0-1 fraction. */
  getControllerMoveDeadZoneRaw(): number {
    return this.settings.controllerMoveDeadZone / 100;
  }

  /** Returns controller look stick dead zone as 0-1 fraction. */
  getControllerLookDeadZoneRaw(): number {
    return this.settings.controllerLookDeadZone / 100;
  }

  /** Returns master volume as 0-1 float */
  getMasterVolumeNormalized(): number {
    return this.settings.masterVolume / 100;
  }

  onChange(listener: SettingsListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  getAll(): Readonly<GameSettings> {
    return { ...this.settings };
  }

  private loadFromStorage(): GameSettings {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...DEFAULT_SETTINGS, ...parsed };
        }
      }
    } catch {
      Logger.warn('settings', 'Failed to load settings from localStorage');
    }
    return { ...DEFAULT_SETTINGS };
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch {
      Logger.warn('settings', 'Failed to save settings to localStorage');
    }
  }
}
