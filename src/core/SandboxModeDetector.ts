export interface SandboxConfig {
  npcCount: number;
  duration: number;
  autoStart: boolean;
  enableCombat: boolean;
  /**
   * Deterministic terrain seed for AI_SANDBOX. When present, overrides the
   * default `terrainSeed: 'random'` so harness captures reproduce on the same
   * procedural map. Set via `?seed=<n>` URL param. Falls back to random when
   * absent.
   */
  terrainSeedOverride?: number;
}

const DEFAULT_SANDBOX_CONFIG: SandboxConfig = {
  npcCount: 40,
  duration: 0,
  autoStart: true,
  enableCombat: true
};

const getSearchParams = (): URLSearchParams | null => {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search);
};

const parseBoolean = (value: string | null, fallback: boolean): boolean => {
  if (value === null) return fallback;
  if (value === '1') return true;
  if (value === '0') return false;
  return value.toLowerCase() === 'true';
};

const parseNumber = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export const isSandboxMode = (): boolean => {
  const params = getSearchParams();
  if (!params) return false;
  return parseBoolean(params.get('sandbox'), false);
};

const parseOptionalSeed = (raw: string | null): number | undefined => {
  if (raw === null || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
};

export const getSandboxConfig = (): SandboxConfig => {
  const params = getSearchParams();
  if (!params) {
    return { ...DEFAULT_SANDBOX_CONFIG, autoStart: false };
  }

  const enableCombat = parseBoolean(params.get('combat'), true);
  const npcMin = enableCombat ? 2 : 0;
  const npcCount = parseNumber(params.get('npcs'), DEFAULT_SANDBOX_CONFIG.npcCount, npcMin, 400);
  const duration = parseNumber(params.get('duration'), DEFAULT_SANDBOX_CONFIG.duration, 0, 86400);
  const autoStart = parseBoolean(params.get('autostart'), isSandboxMode() ? true : false);
  const terrainSeedOverride = parseOptionalSeed(params.get('seed'));

  return {
    npcCount,
    duration,
    autoStart,
    enableCombat,
    terrainSeedOverride
  };
};
