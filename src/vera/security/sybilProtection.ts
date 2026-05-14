/**
 * Sybil Attack Protection for Agent Registration
 *
 * Prevents a single entity from creating many fake agents by:
 *  1. Rate-limiting registrations per IP / account ID
 *  2. Requiring a minimum HBAR stake deposit
 *  3. Tracking registration velocity and blocking bursts
 *  4. Cooldown period between registrations from the same source
 */

import { logger } from '../../monitoring/logger.js';

export interface SybilConfig {
  maxRegistrationsPerHour: number;   // per source (IP or account)
  cooldownMs: number;                // min time between registrations from same source
  minStakeHbar: number;              // minimum deposit to register
  burstThreshold: number;            // registrations within burstWindowMs triggers block
  burstWindowMs: number;
  blockDurationMs: number;           // how long a blocked source stays blocked
  enabled: boolean;
}

const DEFAULT_CONFIG: SybilConfig = {
  maxRegistrationsPerHour: 5,
  cooldownMs: 60_000,           // 1 minute between registrations
  minStakeHbar: 0.1,            // 0.1 HBAR minimum stake
  burstThreshold: 3,            // 3 registrations in burst window = block
  burstWindowMs: 30_000,        // 30 seconds
  blockDurationMs: 60 * 60 * 1000, // 1 hour block
  enabled: true,
};

interface RegistrationRecord {
  timestamps: number[];
  blocked: boolean;
  blockedUntil: number;
}

export class SybilProtection {
  private config: SybilConfig;
  private sources: Map<string, RegistrationRecord> = new Map();
  private stats = { allowed: 0, blocked: 0, cooldownRejected: 0, stakeRejected: 0 };
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<SybilConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    // Cleanup stale records every 10 minutes
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Check if an agent registration should be allowed.
   * `sourceId` is typically an IP address or Hedera account ID.
   */
  checkRegistration(sourceId: string, stakeHbar: number = 0): {
    allowed: boolean;
    reason?: string;
    retryAfterMs?: number;
  } {
    if (!this.config.enabled) {
      this.stats.allowed++;
      return { allowed: true };
    }

    const now = Date.now();
    let record = this.sources.get(sourceId);

    if (!record) {
      record = { timestamps: [], blocked: false, blockedUntil: 0 };
      this.sources.set(sourceId, record);
    }

    // 1. Check if currently blocked
    if (record.blocked && now < record.blockedUntil) {
      this.stats.blocked++;
      logger.warn('SybilProtection', {
        message: 'Registration blocked (source is banned)',
        sourceId,
        blockedUntilMs: record.blockedUntil - now,
      });
      return {
        allowed: false,
        reason: 'source_blocked',
        retryAfterMs: record.blockedUntil - now,
      };
    }

    // Unblock if block has expired
    if (record.blocked && now >= record.blockedUntil) {
      record.blocked = false;
      record.timestamps = [];
    }

    // 2. Minimum stake check
    if (stakeHbar < this.config.minStakeHbar) {
      this.stats.stakeRejected++;
      logger.info('SybilProtection', {
        message: 'Registration rejected (insufficient stake)',
        sourceId,
        stakeHbar,
        minRequired: this.config.minStakeHbar,
      });
      return { allowed: false, reason: 'insufficient_stake' };
    }

    // 3. Cooldown check
    const lastReg = record.timestamps[record.timestamps.length - 1];
    if (lastReg && (now - lastReg) < this.config.cooldownMs) {
      this.stats.cooldownRejected++;
      const retryAfterMs = this.config.cooldownMs - (now - lastReg);
      logger.info('SybilProtection', {
        message: 'Registration rejected (cooldown)',
        sourceId,
        retryAfterMs,
      });
      return { allowed: false, reason: 'cooldown', retryAfterMs };
    }

    // 4. Hourly rate limit
    const hourAgo = now - 60 * 60 * 1000;
    const recentCount = record.timestamps.filter(t => t > hourAgo).length;
    if (recentCount >= this.config.maxRegistrationsPerHour) {
      this.stats.blocked++;
      record.blocked = true;
      record.blockedUntil = now + this.config.blockDurationMs;
      logger.warn('SybilProtection', {
        message: 'Registration blocked (hourly limit exceeded)',
        sourceId,
        count: recentCount,
      });
      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        retryAfterMs: this.config.blockDurationMs,
      };
    }

    // 5. Burst detection
    const burstCutoff = now - this.config.burstWindowMs;
    const burstCount = record.timestamps.filter(t => t > burstCutoff).length;
    if (burstCount >= this.config.burstThreshold) {
      this.stats.blocked++;
      record.blocked = true;
      record.blockedUntil = now + this.config.blockDurationMs;
      logger.warn('SybilProtection', {
        message: 'Registration blocked (burst detected)',
        sourceId,
        burstCount,
      });
      return {
        allowed: false,
        reason: 'burst_detected',
        retryAfterMs: this.config.blockDurationMs,
      };
    }

    // Allowed — record this registration
    record.timestamps.push(now);
    this.stats.allowed++;
    return { allowed: true };
  }

  /**
   * Manually block a source (admin action).
   */
  blockSource(sourceId: string, durationMs?: number): void {
    const record = this.sources.get(sourceId) || { timestamps: [], blocked: false, blockedUntil: 0 };
    record.blocked = true;
    record.blockedUntil = Date.now() + (durationMs ?? this.config.blockDurationMs);
    this.sources.set(sourceId, record);

    logger.info('SybilProtection', { message: 'Source manually blocked', sourceId });
  }

  /**
   * Manually unblock a source.
   */
  unblockSource(sourceId: string): void {
    const record = this.sources.get(sourceId);
    if (record) {
      record.blocked = false;
      record.blockedUntil = 0;
    }
  }

  getStats() {
    const blockedSources = Array.from(this.sources.values()).filter(r => r.blocked).length;
    return {
      enabled: this.config.enabled,
      trackedSources: this.sources.size,
      blockedSources,
      ...this.stats,
    };
  }

  private cleanup(): void {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2 hours
    for (const [id, record] of this.sources) {
      // Remove sources with no recent activity and not blocked
      const hasRecent = record.timestamps.some(t => t > cutoff);
      if (!hasRecent && !record.blocked) {
        this.sources.delete(id);
      }
      // Trim old timestamps
      record.timestamps = record.timestamps.filter(t => t > cutoff);
    }
  }
}

// Singleton
export const sybilProtection = new SybilProtection();
