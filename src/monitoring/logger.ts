/**
 * Structured Logger for VeraLattice
 */

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  userId?: string;
  sessionId?: string;
}

export class Logger {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;

  error(message: string, context?: Record<string, any>, userId?: string, sessionId?: string) {
    this.log(LogLevel.ERROR, message, context, userId, sessionId);
  }

  warn(message: string, context?: Record<string, any>, userId?: string, sessionId?: string) {
    this.log(LogLevel.WARN, message, context, userId, sessionId);
  }

  info(message: string, context?: Record<string, any>, userId?: string, sessionId?: string) {
    this.log(LogLevel.INFO, message, context, userId, sessionId);
  }

  debug(message: string, context?: Record<string, any>, userId?: string, sessionId?: string) {
    this.log(LogLevel.DEBUG, message, context, userId, sessionId);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, userId?: string, sessionId?: string) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      userId,
      sessionId
    };

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Output to console
    const logMessage = `${entry.timestamp.toISOString()} [${level.toUpperCase()}] ${message}`;
    
    if (context) {
      console.log(logMessage, context);
    } else {
      console.log(logMessage);
    }
  }

  getLogs(level?: LogLevel, limit?: number): LogEntry[] {
    let logs = this.logs;
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    if (limit) {
      logs = logs.slice(-limit);
    }
    
    return logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

export const logger = new Logger();
