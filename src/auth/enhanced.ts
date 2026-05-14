/**
 * Enhanced Authentication System for VeraLattice
 * 
 * Features:
 * - API key rate limiting and quotas
 * - Key rotation and expiration
 * - Comprehensive audit logging
 * - Permission-based access control
 */

import crypto from 'node:crypto';
import { db, getOrCreateBalance, nowIso } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

export interface ApiKeyPermissions {
  read: boolean;
  write: boolean;
  admin: boolean;
  tools: string[];
}

export interface ApiKeyCreateOptions {
  name?: string;
  permissions?: ApiKeyPermissions;
  rateLimitPerMinute?: number;
  rateLimitPerHour?: number;
  rateLimitPerDay?: number;
  usageQuotaDaily?: number;
  expiresAt?: Date;
}

export interface ApiKeyInfo {
  id: string;
  customerId: string;
  name?: string;
  permissions: ApiKeyPermissions;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  rateLimitPerDay: number;
  usageQuotaDaily?: number;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface AuthResult {
  success: boolean;
  apiKeyId?: string;
  customerId?: string;
  error?: string;
  rateLimitStatus?: {
    remaining: number;
    resetTime: Date;
    limit: number;
  };
}

export interface AuditLogEntry {
  customerId?: string;
  apiKeyId?: string;
  eventType: 'auth' | 'api_call' | 'admin_action' | 'security_event';
  action: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  context?: Record<string, any>;
}

const ApiKeyPermissionsSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  admin: z.boolean(),
  tools: z.array(z.string())
});

type ApiKeyPermissionsOutput = z.infer<typeof ApiKeyPermissionsSchema>;

export class EnhancedAuth {
  private static instance: EnhancedAuth;

  static getInstance(): EnhancedAuth {
    if (!EnhancedAuth.instance) {
      EnhancedAuth.instance = new EnhancedAuth();
    }
    return EnhancedAuth.instance;
  }

  private hashApiKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
  }

  private generateApiKey(): string {
    return `vera_${crypto.randomBytes(32).toString('hex')}`;
  }

  private serializePermissions(permissions: ApiKeyPermissions): string {
    return JSON.stringify(permissions);
  }

  private deserializePermissions(permissionsJson: string): ApiKeyPermissions {
    try {
      const parsed = JSON.parse(permissionsJson);
      return {
        read: parsed.read ?? true,
        write: parsed.write ?? false,
        admin: parsed.admin ?? false,
        tools: parsed.tools ?? []
      };
    } catch {
      return { read: true, write: false, admin: false, tools: [] };
    }
  }

  createCustomer(): string {
    const id = uuidv4();
    db.prepare('INSERT INTO customers (id, created_at) VALUES (?, ?)').run(id, nowIso());
    getOrCreateBalance(id);
    return id;
  }

  createApiKey(customerId: string, options: ApiKeyCreateOptions = {}): { apiKey: string; apiKeyId: string } {
    const id = uuidv4();
    const raw = this.generateApiKey();
    const keyHash = this.hashApiKey(raw);
    const permissions = options.permissions || { read: true, write: false, admin: false, tools: [] };

    db.prepare(`
      INSERT INTO api_keys (
        id, customer_id, key_hash, name, permissions,
        rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day,
        usage_quota_daily, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      customerId,
      keyHash,
      options.name || `API Key ${id.slice(0, 8)}`,
      this.serializePermissions(permissions),
      options.rateLimitPerMinute || 100,
      options.rateLimitPerHour || 1000,
      options.rateLimitPerDay || 10000,
      options.usageQuotaDaily || null,
      options.expiresAt?.toISOString() || null,
      nowIso()
    );

    // Initialize usage tracking
    this.initializeUsageTracking(id);

    // Log audit event
    this.logAudit({
      customerId,
      apiKeyId: id,
      eventType: 'admin_action',
      action: 'create_api_key',
      success: true,
      context: { keyName: options.name, permissions }
    });

    return { apiKey: raw, apiKeyId: id };
  }

  private initializeUsageTracking(apiKeyId: string): void {
    const today = new Date().toISOString().split('T')[0];
    const now = nowIso();
    
    db.prepare(`
      INSERT OR IGNORE INTO api_key_usage (
        id, api_key_id, usage_date, last_minute_reset, last_hour_reset, last_day_reset,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      apiKeyId,
      today,
      now,
      now,
      now,
      now,
      now
    );
  }

  async authenticateApiKey(
    rawKey: string,
    context?: { ipAddress?: string; userAgent?: string; endpoint?: string }
  ): Promise<AuthResult> {
    const keyHash = this.hashApiKey(rawKey);
    
    const row = db.prepare(`
      SELECT 
        ak.id as api_key_id,
        ak.customer_id as customer_id,
        ak.revoked_at as revoked_at,
        ak.expires_at as expires_at,
        ak.permissions as permissions,
        ak.rate_limit_per_minute,
        ak.rate_limit_per_hour,
        ak.rate_limit_per_day,
        ak.usage_quota_daily
      FROM api_keys ak 
      WHERE ak.key_hash = ?
    `).get(keyHash) as {
      api_key_id: string;
      customer_id: string;
      revoked_at?: string;
      expires_at?: string;
      permissions: string;
      rate_limit_per_minute: number;
      rate_limit_per_hour: number;
      rate_limit_per_day: number;
      usage_quota_daily?: number;
    } | undefined;

    if (!row) {
      await this.logAudit({
        eventType: 'auth',
        action: 'authenticate_failed',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        errorMessage: 'Invalid API key',
        context: { endpoint: context?.endpoint }
      });
      return { success: false, error: 'Invalid API key' };
    }

    if (row.revoked_at) {
      await this.logAudit({
        customerId: row.customer_id,
        apiKeyId: row.api_key_id,
        eventType: 'auth',
        action: 'authenticate_failed',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        errorMessage: 'API key revoked',
        context: { endpoint: context?.endpoint }
      });
      return { success: false, error: 'API key revoked' };
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      await this.logAudit({
        customerId: row.customer_id,
        apiKeyId: row.api_key_id,
        eventType: 'auth',
        action: 'authenticate_failed',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        errorMessage: 'API key expired',
        context: { endpoint: context?.endpoint, expiresAt: row.expires_at }
      });
      return { success: false, error: 'API key expired' };
    }

    // Check rate limits
    const rateLimitResult = await this.checkRateLimits(row.api_key_id, {
      perMinute: row.rate_limit_per_minute,
      perHour: row.rate_limit_per_hour,
      perDay: row.rate_limit_per_day,
      dailyQuota: row.usage_quota_daily
    });

    if (!rateLimitResult.allowed) {
      await this.logAudit({
        customerId: row.customer_id,
        apiKeyId: row.api_key_id,
        eventType: 'security_event',
        action: 'rate_limit_exceeded',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
        success: false,
        errorMessage: `Rate limit exceeded: ${rateLimitResult.reason}`,
        context: { 
          endpoint: context?.endpoint,
          limits: { minute: row.rate_limit_per_minute, hour: row.rate_limit_per_hour, day: row.rate_limit_per_day }
        }
      });
      return { 
        success: false, 
        error: `Rate limit exceeded: ${rateLimitResult.reason}`,
        rateLimitStatus: rateLimitResult.status
      };
    }

    // Update last used timestamp
    db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(nowIso(), row.api_key_id);

    // Log successful authentication
    await this.logAudit({
      customerId: row.customer_id,
      apiKeyId: row.api_key_id,
      eventType: 'auth',
      action: 'authenticate_success',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      success: true,
      context: { endpoint: context?.endpoint }
    });

    return { 
      success: true, 
      apiKeyId: row.api_key_id, 
      customerId: row.customer_id,
      rateLimitStatus: rateLimitResult.status
    };
  }

  private async checkRateLimits(
    apiKeyId: string,
    limits: { perMinute: number; perHour: number; perDay: number; dailyQuota?: number }
  ): Promise<{ allowed: boolean; reason?: string; status?: any }> {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Get or create usage record
    let usage = db.prepare(`
      SELECT * FROM api_key_usage 
      WHERE api_key_id = ? AND usage_date = ?
    `).get(apiKeyId, today) as any;

    if (!usage) {
      this.initializeUsageTracking(apiKeyId);
      usage = db.prepare(`
        SELECT * FROM api_key_usage 
        WHERE api_key_id = ? AND usage_date = ?
      `).get(apiKeyId, today) as any;
    }

    const nowIso = now.toISOString();
    const oneMinuteAgo = new Date(now.getTime() - 60000).toISOString();
    const oneHourAgo = new Date(now.getTime() - 3600000).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // Reset counters if needed
    if (usage.last_minute_reset < oneMinuteAgo) {
      usage.requests_per_minute = 0;
      usage.last_minute_reset = nowIso;
    }
    if (usage.last_hour_reset < oneHourAgo) {
      usage.requests_per_hour = 0;
      usage.last_hour_reset = nowIso;
    }
    if (usage.last_day_reset < startOfDay) {
      usage.requests_per_day = 0;
      usage.last_day_reset = nowIso;
    }

    // Check limits
    if (usage.requests_per_minute >= limits.perMinute) {
      const resetTime = new Date(new Date(usage.last_minute_reset).getTime() + 60000);
      return {
        allowed: false,
        reason: 'minute',
        status: {
          remaining: 0,
          resetTime,
          limit: limits.perMinute
        }
      };
    }

    if (usage.requests_per_hour >= limits.perHour) {
      const resetTime = new Date(new Date(usage.last_hour_reset).getTime() + 3600000);
      return {
        allowed: false,
        reason: 'hour',
        status: {
          remaining: 0,
          resetTime,
          limit: limits.perHour
        }
      };
    }

    if (usage.requests_per_day >= limits.perDay) {
      const resetTime = new Date(new Date(usage.last_day_reset).getTime() + 86400000);
      return {
        allowed: false,
        reason: 'day',
        status: {
          remaining: 0,
          resetTime,
          limit: limits.perDay
        }
      };
    }

    if (limits.dailyQuota && usage.requests_per_day >= limits.dailyQuota) {
      const resetTime = new Date(new Date(startOfDay).getTime() + 86400000);
      return {
        allowed: false,
        reason: 'quota',
        status: {
          remaining: 0,
          resetTime,
          limit: limits.dailyQuota
        }
      };
    }

    // Increment counters
    usage.requests_per_minute++;
    usage.requests_per_hour++;
    usage.requests_per_day++;
    usage.updated_at = nowIso;

    db.prepare(`
      UPDATE api_key_usage 
      SET requests_per_minute = ?, requests_per_hour = ?, requests_per_day = ?,
          last_minute_reset = ?, last_hour_reset = ?, last_day_reset = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      usage.requests_per_minute,
      usage.requests_per_hour,
      usage.requests_per_day,
      usage.last_minute_reset,
      usage.last_hour_reset,
      usage.last_day_reset,
      usage.updated_at,
      usage.id
    );

    const remainingMinute = limits.perMinute - usage.requests_per_minute;
    const resetTime = new Date(new Date(usage.last_minute_reset).getTime() + 60000);

    return {
      allowed: true,
      status: {
        remaining: Math.max(0, remainingMinute),
        resetTime,
        limit: limits.perMinute
      }
    };
  }

  async logAudit(entry: AuditLogEntry): Promise<void> {
    const id = uuidv4();
    
    db.prepare(`
      INSERT INTO audit_logs (
        id, customer_id, api_key_id, event_type, action, resource_type, resource_id,
        ip_address, user_agent, success, error_message, context, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.customerId || null,
      entry.apiKeyId || null,
      entry.eventType,
      entry.action,
      entry.resourceType || null,
      entry.resourceId || null,
      entry.ipAddress || null,
      entry.userAgent || null,
      entry.success,
      entry.errorMessage || null,
      entry.context ? JSON.stringify(entry.context) : null,
      nowIso()
    );
  }

  getApiKeyInfo(apiKeyId: string): ApiKeyInfo | null {
    const row = db.prepare(`
      SELECT 
        id, customer_id, name, permissions, rate_limit_per_minute, rate_limit_per_hour,
        rate_limit_per_day, usage_quota_daily, expires_at, last_used_at, created_at, revoked_at
      FROM api_keys 
      WHERE id = ?
    `).get(apiKeyId) as any;

    if (!row) return null;

    return {
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      permissions: this.deserializePermissions(row.permissions),
      rateLimitPerMinute: row.rate_limit_per_minute,
      rateLimitPerHour: row.rate_limit_per_hour,
      rateLimitPerDay: row.rate_limit_per_day,
      usageQuotaDaily: row.usage_quota_daily,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    };
  }

  revokeApiKey(apiKeyId: string, reason?: string): boolean {
    const result = db.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?').run(nowIso(), apiKeyId);
    
    if (result.changes > 0) {
      const apiKey = this.getApiKeyInfo(apiKeyId);
      if (apiKey) {
        this.logAudit({
          customerId: apiKey.customerId,
          apiKeyId,
          eventType: 'admin_action',
          action: 'revoke_api_key',
          success: true,
          context: { reason }
        });
      }
      return true;
    }
    return false;
  }

  rotateApiKey(apiKeyId: string): { newApiKey: string } | null {
    const apiKey = this.getApiKeyInfo(apiKeyId);
    if (!apiKey || apiKey.revokedAt) return null;

    // Revoke old key
    this.revokeApiKey(apiKeyId, 'Key rotation');

    // Create new key with same settings
    const result = this.createApiKey(apiKey.customerId, {
      name: apiKey.name,
      permissions: apiKey.permissions,
      rateLimitPerMinute: apiKey.rateLimitPerMinute,
      rateLimitPerHour: apiKey.rateLimitPerHour,
      rateLimitPerDay: apiKey.rateLimitPerDay,
      usageQuotaDaily: apiKey.usageQuotaDaily,
      expiresAt: apiKey.expiresAt ? new Date(apiKey.expiresAt) : undefined
    });

    return { newApiKey: result.apiKey };
  }

  getCustomerApiKeys(customerId: string): ApiKeyInfo[] {
    const rows = db.prepare(`
      SELECT 
        id, customer_id, name, permissions, rate_limit_per_minute, rate_limit_per_hour,
        rate_limit_per_day, usage_quota_daily, expires_at, last_used_at, created_at, revoked_at
      FROM api_keys 
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `).all(customerId) as any[];

    return rows.map(row => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      permissions: this.deserializePermissions(row.permissions),
      rateLimitPerMinute: row.rate_limit_per_minute,
      rateLimitPerHour: row.rate_limit_per_hour,
      rateLimitPerDay: row.rate_limit_per_day,
      usageQuotaDaily: row.usage_quota_daily,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
      revokedAt: row.revoked_at
    }));
  }

  getAuditLogs(filters?: {
    customerId?: string;
    apiKeyId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditLogEntry[] {
    let query = `
      SELECT * FROM audit_logs 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.customerId) {
      query += ' AND customer_id = ?';
      params.push(filters.customerId);
    }
    if (filters?.apiKeyId) {
      query += ' AND api_key_id = ?';
      params.push(filters.apiKeyId);
    }
    if (filters?.eventType) {
      query += ' AND event_type = ?';
      params.push(filters.eventType);
    }
    if (filters?.startDate) {
      query += ' AND timestamp >= ?';
      params.push(filters.startDate.toISOString());
    }
    if (filters?.endDate) {
      query += ' AND timestamp <= ?';
      params.push(filters.endDate.toISOString());
    }

    query += ' ORDER BY timestamp DESC';
    
    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map(row => ({
      customerId: row.customer_id,
      apiKeyId: row.api_key_id,
      eventType: row.event_type,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      success: row.success,
      errorMessage: row.error_message,
      context: row.context ? JSON.parse(row.context) : undefined
    }));
  }
}

// Export singleton instance
export const enhancedAuth = EnhancedAuth.getInstance();

// Legacy compatibility functions
export function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function createCustomer() {
  return enhancedAuth.createCustomer();
}

export function createApiKey(customerId: string, options?: ApiKeyCreateOptions) {
  return enhancedAuth.createApiKey(customerId, options);
}

export function authenticateApiKey(rawKey: string, context?: { ipAddress?: string; userAgent?: string; endpoint?: string }) {
  return enhancedAuth.authenticateApiKey(rawKey, context);
}
