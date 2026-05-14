/**
 * Structured Logger for Vera Agents
 * 
 * Replaces console.log with structured, level-based logging.
 * Supports: DEBUG, INFO, WARN, ERROR levels
 * Outputs JSON for machine parsing
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

export class Logger {
  constructor(context = 'Vera') {
    this.context = context;
  }

  debug(message, meta = {}) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      this.log('DEBUG', message, meta);
    }
  }

  info(message, meta = {}) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      this.log('INFO', message, meta);
    }
  }

  warn(message, meta = {}) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      this.log('WARN', message, meta);
    }
  }

  error(message, meta = {}) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      this.log('ERROR', message, meta);
    }
  }

  log(level, message, meta) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...meta
    };

    // Output as JSON for structured logging
    console.log(JSON.stringify(entry));
  }
}

// Create logger instances for different contexts
export const logger = new Logger('Vera');
export const agentLogger = new Logger('Agent');
export const bridgeLogger = new Logger('Bridge');

// Backwards compatibility with console methods
export function debug(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
    console.debug(...args);
  }
}

export function info(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
    console.info(...args);
  }
}

export function warn(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
    console.warn(...args);
  }
}

export function error(...args) {
  if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
    console.error(...args);
  }
}

// Suppress console.log in production
if (process.env.NODE_ENV === 'production') {
  const originalLog = console.log;
  console.log = (...args) => {
    // Only allow structured JSON logs (start with {)
    if (args[0]?.toString().startsWith('{')) {
      originalLog.apply(console, args);
    }
  };
}
