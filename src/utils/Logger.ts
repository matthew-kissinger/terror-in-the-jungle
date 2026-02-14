export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: string;
  message: string;
  args: unknown[];
}

interface CategoryStats {
  suppressed: number;
  lastTimestamp: number;
}

interface LoggerStats {
  suppressedTotal: number;
  categories: Record<string, { suppressed: number }>;
  recent: LogEntry[];
}

const RATE_LIMIT_WINDOW_MS = 1000;
const MAX_LOGS_PER_WINDOW = 5;
const SUPPRESSED_REPORT_INTERVAL_MS = 2000;
const BUFFER_CAPACITY = 200;

export class Logger {
  private static buffer: LogEntry[] = [];
  private static perCategory: Map<string, { timestamps: number[]; stats: CategoryStats }> = new Map();
  private static suppressedTotal = 0;
  private static minLevel: LogLevel = Logger.resolveInitialLevel();

  static setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  static getMinLevel(): LogLevel {
    return this.minLevel;
  }

  static debug(category: string, message: string, ...args: unknown[]): void {
    this.log('debug', category, message, ...args);
  }

  static info(category: string, message: string, ...args: unknown[]): void {
    this.log('info', category, message, ...args);
  }

  static warn(category: string, message: string, ...args: unknown[]): void {
    this.log('warn', category, message, ...args);
  }

  static error(category: string, message: string, ...args: unknown[]): void {
    this.log('error', category, message, ...args);
  }

  static getStats(): LoggerStats {
    const categories: Record<string, { suppressed: number }> = {};
    this.perCategory.forEach((value, key) => {
      if (value.stats.suppressed > 0) {
        categories[key] = { suppressed: value.stats.suppressed };
      }
    });

    return {
      suppressedTotal: this.suppressedTotal,
      categories,
      recent: [...this.buffer]
    };
  }

  static clearBuffer(): void {
    this.buffer = [];
  }

  static getRecent(limit = 50): LogEntry[] {
    if (limit <= 0) return [];
    return this.buffer.slice(-limit);
  }

  private static log(level: LogLevel, category: string, message: string, ...args: unknown[]): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) {
      return;
    }

    const now = performance.now();
    const key = `${level}:${category}`;
    const entry: LogEntry = { timestamp: now, level, category, message, args };

    let record = this.perCategory.get(key);
    if (!record) {
      record = { timestamps: [], stats: { suppressed: 0, lastTimestamp: 0 } };
      this.perCategory.set(key, record);
    }

    this.pruneOldTimestamps(record.timestamps, now);

    if (record.timestamps.length >= MAX_LOGS_PER_WINDOW) {
      record.stats.suppressed++;
      this.suppressedTotal++;

      if (level !== 'debug' && level !== 'info' && now - record.stats.lastTimestamp > SUPPRESSED_REPORT_INTERVAL_MS) {
        const summary = record.stats.suppressed;
        record.stats.lastTimestamp = now;
        console.warn(
          `[suppressed:${category}] ${summary} messages in last ${(RATE_LIMIT_WINDOW_MS / 1000).toFixed(1)}s`
        );
      }
      return;
    }

    record.timestamps.push(now);
    this.pushToBuffer(entry);
    this.forwardToConsole(entry);
  }

  private static pruneOldTimestamps(timestamps: number[], now: number): void {
    while (timestamps.length > 0 && now - timestamps[0] > RATE_LIMIT_WINDOW_MS) {
      timestamps.shift();
    }
  }

  private static pushToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > BUFFER_CAPACITY) {
      this.buffer.shift();
    }
  }

  private static forwardToConsole(entry: LogEntry): void {
    const { level, category, message, args } = entry;
    const prefix = `[${category}] ${message}`;

    switch (level) {
      case 'debug':
        console.debug(prefix, ...args);
        break;
      case 'info':
        console.info(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
    }
  }

  private static resolveInitialLevel(): LogLevel {
    const fromProcess = this.readLevel((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.LOG_LEVEL);
    const fromGlobal = this.readLevel((globalThis as { __LOG_LEVEL__?: string }).__LOG_LEVEL__);
    const fromStorage = this.readStorageLevel();
    const fromQuery = this.readQueryLevel();
    const fromBuild = this.readBuildDefaultLevel();
    return fromProcess
      ? this.readLevel(fromProcess) ?? 'warn'
      : fromGlobal ?? fromStorage ?? fromQuery ?? fromBuild ?? 'warn';
  }

  private static readBuildDefaultLevel(): LogLevel | null {
    const runtimeDefault = this.readRuntimeDefaultLevel();
    if (runtimeDefault) {
      return runtimeDefault;
    }

    try {
      const env = (import.meta as { env?: { PROD?: boolean; DEV?: boolean } }).env;
      if (env?.PROD) {
        return 'error';
      }
    } catch {
      // ignore and fall through
    }
    return null;
  }

  private static readRuntimeDefaultLevel(): LogLevel | null {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }

    const host = window.location.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return null;
    }

    if (host === 'github.io' || host.endsWith('.github.io')) {
      return 'error';
    }

    return null;
  }

  private static readStorageLevel(): LogLevel | null {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try {
      return this.readLevel(window.localStorage.getItem('logLevel'));
    } catch {
      return null;
    }
  }

  private static readQueryLevel(): LogLevel | null {
    if (typeof window === 'undefined' || !window.location?.search) return null;
    try {
      const params = new URLSearchParams(window.location.search);
      return this.readLevel(params.get('logLevel'));
    } catch {
      return null;
    }
  }

  private static readLevel(raw: string | null | undefined): LogLevel | null {
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
      return normalized;
    }
    return null;
  }
}
