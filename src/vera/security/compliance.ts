/**
 * Security & Compliance Manager
 * SOC2 controls, audit logging, encryption
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export interface SecurityConfig {
  enableEncryption: boolean;
  encryptionKey: string;
  auditLogRetention: number; // days
  requireMFA: boolean;
  maxLoginAttempts: number;
  sessionTimeout: number; // minutes
  allowedIPs?: string[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: string;
  userId?: string;
  resource: string;
  result: 'SUCCESS' | 'FAILURE' | 'DENIED';
  details: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export class SecurityManager extends EventEmitter {
  private auditLog: AuditLogEntry[] = [];
  private failedLogins = new Map<string, { count: number; lastAttempt: number }>();
  private activeSessions = new Map<string, { userId: string; createdAt: number; lastActivity: number }>();

  constructor(private config: SecurityConfig) {
    super();
  }

  /**
   * Log security audit event
   */
  audit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    const auditEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...entry,
    };

    this.auditLog.push(auditEntry);

    // Trim old entries
    const cutoff = Date.now() - (this.config.auditLogRetention * 24 * 60 * 60 * 1000);
    while (this.auditLog.length > 0 && this.auditLog[0].timestamp < cutoff) {
      this.auditLog.shift();
    }

    // Log critical events
    if (entry.result === 'FAILURE' || entry.result === 'DENIED') {
      logger.warn('SecurityManager', {
        message: 'Security event',
        action: entry.action,
        result: entry.result,
        userId: entry.userId,
        resource: entry.resource,
      });
    }

    this.emit('audit_event', auditEntry);
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(plaintext: string): string {
    if (!this.config.enableEncryption) return plaintext;

    const algorithm = 'aes-256-gcm';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      algorithm,
      Buffer.from(this.config.encryptionKey.slice(0, 32).padEnd(32, '0')),
      iv
    );

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt data
   */
  decrypt(ciphertext: string): string {
    if (!this.config.enableEncryption) return ciphertext;

    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }

    const algorithm = 'aes-256-gcm';
    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(this.config.encryptionKey.slice(0, 32).padEnd(32, '0')),
      Buffer.from(ivHex, 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Validate access request
   */
  validateAccess(request: {
    userId: string;
    resource: string;
    action: string;
    ip?: string;
  }): { allowed: boolean; reason?: string } {
    // Check IP whitelist
    if (this.config.allowedIPs && this.config.allowedIPs.length > 0) {
      if (!request.ip || !this.config.allowedIPs.includes(request.ip)) {
        this.audit({
          action: 'ACCESS_DENIED',
          userId: request.userId,
          resource: request.resource,
          result: 'DENIED',
          details: { reason: 'IP_NOT_ALLOWED', ip: request.ip },
        });
        return { allowed: false, reason: 'IP address not allowed' };
      }
    }

    // Check failed login attempts
    const failed = this.failedLogins.get(request.userId);
    if (failed && failed.count >= this.config.maxLoginAttempts) {
      this.audit({
        action: 'ACCESS_DENIED',
        userId: request.userId,
        resource: request.resource,
        result: 'DENIED',
        details: { reason: 'TOO_MANY_FAILED_ATTEMPTS' },
      });
      return { allowed: false, reason: 'Account locked due to failed attempts' };
    }

    // Check MFA requirement
    if (this.config.requireMFA) {
      // In production, verify MFA token here
    }

    this.audit({
      action: request.action,
      userId: request.userId,
      resource: request.resource,
      result: 'SUCCESS',
      details: { ip: request.ip },
    });

    return { allowed: true };
  }

  /**
   * Record failed login attempt
   */
  recordFailedLogin(userId: string): void {
    const existing = this.failedLogins.get(userId);
    if (existing) {
      existing.count++;
      existing.lastAttempt = Date.now();
    } else {
      this.failedLogins.set(userId, { count: 1, lastAttempt: Date.now() });
    }

    this.audit({
      action: 'LOGIN_FAILED',
      userId,
      resource: 'authentication',
      result: 'FAILURE',
      details: { attempt: existing?.count || 1 },
    });
  }

  /**
   * Clear failed login attempts on successful login
   */
  recordSuccessfulLogin(userId: string, sessionId: string): void {
    this.failedLogins.delete(userId);

    this.activeSessions.set(sessionId, {
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });

    this.audit({
      action: 'LOGIN_SUCCESS',
      userId,
      resource: 'authentication',
      result: 'SUCCESS',
      details: { sessionId },
    });
  }

  /**
   * Validate session
   */
  validateSession(sessionId: string): { valid: boolean; userId?: string } {
    const session = this.activeSessions.get(sessionId);
    if (!session) return { valid: false };

    const timeout = this.config.sessionTimeout * 60 * 1000;
    if (Date.now() - session.lastActivity > timeout) {
      this.activeSessions.delete(sessionId);
      return { valid: false };
    }

    session.lastActivity = Date.now();
    return { valid: true, userId: session.userId };
  }

  /**
   * Get SOC2 compliance metrics
   */
  getSOC2Metrics(): {
    totalEvents: number;
    failedEvents: number;
    deniedEvents: number;
    activeSessions: number;
    lockedAccounts: number;
    auditRetention: number;
    encryptionEnabled: boolean;
  } {
    return {
      totalEvents: this.auditLog.length,
      failedEvents: this.auditLog.filter(e => e.result === 'FAILURE').length,
      deniedEvents: this.auditLog.filter(e => e.result === 'DENIED').length,
      activeSessions: this.activeSessions.size,
      lockedAccounts: Array.from(this.failedLogins.values()).filter(
        f => f.count >= this.config.maxLoginAttempts
      ).length,
      auditRetention: this.config.auditLogRetention,
      encryptionEnabled: this.config.enableEncryption,
    };
  }

  /**
   * Get audit log
   */
  getAuditLog(filter?: {
    userId?: string;
    resource?: string;
    result?: string;
    startTime?: number;
    endTime?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filter?.userId) {
      entries = entries.filter(e => e.userId === filter.userId);
    }
    if (filter?.resource) {
      entries = entries.filter(e => e.resource === filter.resource);
    }
    if (filter?.result) {
      entries = entries.filter(e => e.result === filter.result);
    }
    if (filter?.startTime) {
      entries = entries.filter(e => e.timestamp >= filter.startTime!);
    }
    if (filter?.endTime) {
      entries = entries.filter(e => e.timestamp <= filter.endTime!);
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Hash sensitive data (one-way)
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }
}

// Singleton instance
export const securityManager = new SecurityManager({
  enableEncryption: !!process.env.VERA_ENCRYPTION_KEY,
  encryptionKey: process.env.VERA_ENCRYPTION_KEY || '',
  auditLogRetention: 90, // 90 days
  requireMFA: false,
  maxLoginAttempts: 5,
  sessionTimeout: 60, // 60 minutes
});

export default SecurityManager;
