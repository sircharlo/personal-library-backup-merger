/**
 * Console logger shared by the core engine (which may run inside a Web Worker), the wizard and the
 * app shell. Everything goes to the real `console` so the browser devtools show the full lifecycle;
 * `setLogLevel('silent')` mutes it (tests).
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
let currentLevel: LogLevel = 'debug';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

const SCOPE_STYLE = 'color:#a78bfa;font-weight:700';
const RESET_STYLE = 'color:inherit;font-weight:400';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

export interface Logger {
  readonly scope: string;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  /** Collapsed console group around `fn`; closed even when it throws or rejects. */
  group<T>(label: string, fn: () => T): T;
  /** Start a stopwatch; the returned function logs `label — 123 ms` and returns the elapsed ms. */
  time(label: string): (detail?: string) => number;
  child(sub: string): Logger;
}

export function createLogger(scope: string): Logger {
  const prefix = `%c[jwmerge · ${scope}]%c`;
  const emit = (level: LogLevel, method: 'log' | 'warn' | 'error', args: unknown[]) => {
    if (ORDER[level] < ORDER[currentLevel]) return;
    console[method](prefix, SCOPE_STYLE, RESET_STYLE, ...args);
  };
  return {
    scope,
    debug: (...args) => emit('debug', 'log', args),
    info: (...args) => emit('info', 'log', args),
    warn: (...args) => emit('warn', 'warn', args),
    error: (...args) => emit('error', 'error', args),
    group<T>(label: string, fn: () => T): T {
      if (ORDER.info < ORDER[currentLevel]) return fn();
      console.groupCollapsed(prefix, SCOPE_STYLE, RESET_STYLE, label);
      let result: T;
      try {
        result = fn();
      } catch (e) {
        console.groupEnd();
        throw e;
      }
      if (result instanceof Promise) return result.finally(() => console.groupEnd()) as T;
      console.groupEnd();
      return result;
    },
    time(label) {
      const t0 = now();
      return (detail) => {
        const ms = now() - t0;
        emit('debug', 'log', [`${label} — ${fmtMs(ms)}${detail ? ` · ${detail}` : ''}`]);
        return ms;
      };
    },
    child: (sub) => createLogger(`${scope}:${sub}`),
  };
}

/** Best-effort message for unknown thrown values. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
