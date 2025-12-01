/**
 * Centralized logging utility.
 * Can be easily replaced with a proper logging library (e.g., pino, winston).
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLogLevel: LogLevel = 'info';

/**
 * Set the current log level.
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Check if a log level should be output.
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Logger interface matching console API.
 */
export const logger = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) {
      console.error('[ERROR]', ...args);
    }
  },
};

