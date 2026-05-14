/**
 * Secure Logging System
 * 
 * Replaces console.log with structured, secure logging
 * that includes correlation IDs, log levels, and security filtering.
 */

import { secureConfig } from '../config/secureConfig.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  context?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  source: string;
  environment: string;
}

export interface LogFilter {
  level?: LogLevel;
  source?: string;
  correlationId?: string;
  startTime?: Date;
  endTime?: Date;
}

export class SecureLogger {
  private static instance: SecureLogger;
  private logLevel: LogLevel;
  private logs: LogEntry[] = [];
  private maxLogSize: number = 10000;
  private correlationIdMap: Map<string, string> = new Map();

  private constructor() {
    this.logLevel = secureConfig.isDevelopmentMode() ? LogLevel.DEBUG : LogLevel.INFO;
  }

  public static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Filter out sensitive information
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && this.isSensitiveValue(value)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeContext(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password', 'secret', 'key', 'token', 'private',
      'credential', 'auth', 'signature', 'hash',
      'privateKey', 'apiKey', 'jwt', 'session'
    ];
    
    return sensitiveKeys.some(sensitive => 
      key.toLowerCase().includes(sensitive.toLowerCase())
    );
  }

  private isSensitiveValue(value: string): boolean {
    // Check for patterns that look like sensitive data
    const patterns = [
      /^[0-9a-fA-F]{64}$/, // 64-char hex (likely private key)
      /^[A-Za-z0-9+/]{40,}={0,2}$/, // Base64 encoded data
      /^sk-[a-zA-Z0-9]{48}$/, // Stripe-like API key
      /^ghp_[a-zA-Z0-9]{36}$/, // GitHub token
      /^ghs_[a-zA-Z0-9]{36}$/, // GitHub token
      /^gho_[a-zA-Z0-9]{36}$/, // GitHub token
      /^ghu_[a-zA-Z0-9]{36}$/, // GitHub token
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.getCurrentCorrelationId(),
      context: context ? this.sanitizeContext(context) : undefined,
      source: this.getCallerInfo(),
      environment: secureConfig.getConfig().NODE_ENV
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    return entry;
  }

  private getCurrentCorrelationId(): string | undefined {
    // In a real implementation, this would come from request context
    // For now, we'll use a simple approach
    return this.correlationIdMap.get('current');
  }

  private getCallerInfo(): string {
    const stack = new Error().stack;
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    // Skip the current function and the log function
    const callerLine = lines[4] || lines[3] || 'unknown';
    
    // Extract file and line number
    const match = callerLine.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
    if (match) {
      return `${match[2]}:${match[3]}`;
    }
    
    return callerLine.trim();
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    
    // Maintain log size
    if (this.logs.length > this.maxLogSize) {
      this.logs = this.logs.slice(-this.maxLogSize);
    }
  }

  private formatLog(entry: LogEntry): string {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const levelName = levelNames[entry.level];
    const correlationId = entry.correlationId ? ` [${entry.correlationId}]` : '';
    const source = entry.source ? ` (${entry.source})` : '';
    
    let message = `[${entry.timestamp}] ${levelName}${correlationId} ${entry.message}${source}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` ${JSON.stringify(entry.context)}`;
    }
    
    if (entry.error) {
      message += ` Error: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack && secureConfig.isDevelopmentMode()) {
        message += `\n${entry.error.stack}`;
      }
    }
    
    return message;
  }

  // Public logging methods
  public debug(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, message, context);
    this.addLog(entry);
    
    if (secureConfig.isDevelopmentMode()) {
      console.debug(this.formatLog(entry));
    }
  }

  public info(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, message, context);
    this.addLog(entry);
    
    console.info(this.formatLog(entry));
  }

  public warn(message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, message, context);
    this.addLog(entry);
    
    console.warn(this.formatLog(entry));
  }

  public error(message: string, error?: Error, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, context, error);
    this.addLog(entry);
    
    console.error(this.formatLog(entry));
  }

  public fatal(message: string, error?: Error, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    
    const entry = this.createLogEntry(LogLevel.FATAL, message, context, error);
    this.addLog(entry);
    
    console.error(this.formatLog(entry));
  }

  // Correlation ID management
  public setCorrelationId(correlationId: string): void {
    this.correlationIdMap.set('current', correlationId);
  }

  public clearCorrelationId(): void {
    this.correlationIdMap.delete('current');
  }

  // Log querying and filtering
  public getLogs(filter?: LogFilter): LogEntry[] {
    let filteredLogs = [...this.logs];
    
    if (filter) {
      if (filter.level !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.level >= filter.level!);
      }
      
      if (filter.source) {
        filteredLogs = filteredLogs.filter(log => log.source?.includes(filter.source as string) ?? false);
      }
      
      if (filter.correlationId) {
        filteredLogs = filteredLogs.filter(log => log.correlationId === filter.correlationId);
      }
      
      if (filter.startTime) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= filter.startTime!);
      }
      
      if (filter.endTime) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= filter.endTime!);
      }
    }
    
    return filteredLogs;
  }

  public getLogsByLevel(level: LogLevel): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  public getErrorLogs(): LogEntry[] {
    return this.getLogsByLevel(LogLevel.ERROR).concat(this.getLogsByLevel(LogLevel.FATAL));
  }

  public getRecentLogs(count: number = 100): LogEntry[] {
    return this.logs.slice(-count);
  }

  // Log management
  public clearLogs(): void {
    this.logs = [];
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  // Statistics
  public getLogStats(): {
    total: number;
    byLevel: Record<string, number>;
    bySource: Record<string, number>;
    recentErrors: LogEntry[];
  } {
    const byLevel: Record<string, number> = {
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      FATAL: 0
    };
    
    const bySource: Record<string, number> = {};
    
    for (const log of this.logs) {
      const levelName = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'][log.level];
      byLevel[levelName] = (byLevel[levelName] || 0) + 1;
      
      const source = log.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    }
    
    return {
      total: this.logs.length,
      byLevel,
      bySource,
      recentErrors: this.getErrorLogs().slice(-10)
    };
  }

  // Export logs (for monitoring)
  public exportLogs(filter?: LogFilter): string {
    const logs = this.getLogs(filter);
    return JSON.stringify(logs, null, 2);
  }

  // Health check
  public healthCheck(): {
    status: 'healthy' | 'warning' | 'critical';
    totalLogs: number;
    errorCount: number;
    recentErrors: number;
    recommendations: string[];
  } {
    const totalLogs = this.logs.length;
    const errorLogs = this.getErrorLogs();
    const recentErrors = errorLogs.filter(log => 
      new Date(log.timestamp) > new Date(Date.now() - 60 * 60 * 1000) // Last hour
    ).length;
    
    const recommendations: string[] = [];
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (recentErrors > 10) {
      status = 'critical';
      recommendations.push('High error rate detected - investigate immediately');
    } else if (recentErrors > 5) {
      status = 'warning';
      recommendations.push('Elevated error rate - monitor closely');
    }
    
    if (totalLogs > this.maxLogSize * 0.9) {
      recommendations.push('Log buffer near capacity - consider log rotation');
    }
    
    return {
      status,
      totalLogs,
      errorCount: errorLogs.length,
      recentErrors,
      recommendations
    };
  }
}

// Export singleton instance
export const logger = SecureLogger.getInstance();

// Export convenience functions
export const log = {
  debug: (message: string, context?: Record<string, any>) => logger.debug(message, context),
  info: (message: string, context?: Record<string, any>) => logger.info(message, context),
  warn: (message: string, context?: Record<string, any>) => logger.warn(message, context),
  error: (message: string, error?: Error, context?: Record<string, any>) => logger.error(message, error, context),
  fatal: (message: string, error?: Error, context?: Record<string, any>) => logger.fatal(message, error, context),
};
