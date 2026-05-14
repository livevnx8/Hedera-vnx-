/**
 * HMAC Signature Verification for HCS Messages
 *
 * Every HCS message from a registered agent should carry an HMAC-SHA256
 * signature computed over (agentId + taskId + timestamp + payload).
 * The orchestrator verifies the signature before processing the message.
 *
 * Agents receive their shared secret when they register via the beacon.
 */

import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

export interface HMACConfig {
  algorithm: string;
  secretKeyBase: string;      // Base secret — per-agent keys derived from this
  timestampToleranceMs: number; // Reject messages older than this (replay protection)
  enabled: boolean;
  requireSignature: boolean;
}

const DEFAULT_CONFIG: HMACConfig = {
  algorithm: 'sha256',
  secretKeyBase: process.env.VERA_HMAC_SECRET || '',
  timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
  enabled: !!process.env.VERA_HMAC_SECRET,
  requireSignature: process.env.VERA_REQUIRE_AGENT_SIGNATURE !== 'false',
};

export interface SignedMessage {
  agentId: string;
  payload: string;
  timestamp: number;
  signature: string;
}

export class HMACVerifier {
  private config: HMACConfig;
  private agentSecrets: Map<string, string> = new Map(); // agentId → derived key
  private stats = { verified: 0, rejected: 0, replayed: 0 };
  private recentSignatures: Set<string> = new Set(); // anti-replay nonce set
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<HMACConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    // Periodically clean the anti-replay set (every 5 min)
    this.cleanupTimer = setInterval(() => {
      this.recentSignatures.clear();
    }, this.config.timestampToleranceMs);
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Derive a per-agent secret from the base key.
   */
  deriveAgentSecret(agentId: string): string {
    const derived = crypto
      .createHmac('sha256', this.config.secretKeyBase)
      .update(`vera-agent-${agentId}`)
      .digest('hex');
    this.agentSecrets.set(agentId, derived);
    return derived;
  }

  /**
   * Get or derive the secret for an agent.
   */
  getAgentSecret(agentId: string): string {
    return this.agentSecrets.get(agentId) || this.deriveAgentSecret(agentId);
  }

  /**
   * Sign a message (used by agents or for testing).
   */
  sign(agentId: string, payload: string, timestamp: number): string {
    const secret = this.getAgentSecret(agentId);
    const data = `${agentId}:${timestamp}:${payload}`;
    return crypto.createHmac(this.config.algorithm, secret).update(data).digest('hex');
  }

  /**
   * Verify an incoming HCS message signature.
   * Returns true if valid, false if rejected.
   */
  verify(message: SignedMessage, options: { trackReplay?: boolean } = {}): { valid: boolean; reason?: string } {
    const trackReplay = options.trackReplay ?? true;

    if (!this.config.enabled) {
      return { valid: true }; // HMAC disabled — pass through
    }

    if (!this.config.secretKeyBase) {
      this.stats.rejected++;
      logger.warn('HMACVerifier', {
        message: 'Rejected signed message because HMAC secret is not configured',
        agentId: message.agentId,
      });
      return { valid: false, reason: 'signature_verifier_not_configured' };
    }

    // 1. Timestamp tolerance (replay protection)
    const age = Math.abs(Date.now() - message.timestamp);
    if (age > this.config.timestampToleranceMs) {
      this.stats.rejected++;
      this.stats.replayed++;
      logger.warn('HMACVerifier', {
        message: 'Rejected stale message',
        agentId: message.agentId,
        ageMs: age,
      });
      return { valid: false, reason: 'timestamp_expired' };
    }

    // 2. Anti-replay: reject duplicate signatures
    if (trackReplay && this.recentSignatures.has(message.signature)) {
      this.stats.rejected++;
      this.stats.replayed++;
      logger.warn('HMACVerifier', {
        message: 'Rejected replayed message',
        agentId: message.agentId,
      });
      return { valid: false, reason: 'replay_detected' };
    }

    // 3. Compute expected signature
    const expected = this.sign(message.agentId, message.payload, message.timestamp);

    // 4. Constant-time comparison
    const sigBuffer = Buffer.from(message.signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      this.stats.rejected++;
      logger.warn('HMACVerifier', {
        message: 'Rejected invalid signature',
        agentId: message.agentId,
      });
      return { valid: false, reason: 'invalid_signature' };
    }

    // 5. Accept — add to anti-replay set
    if (trackReplay) this.recentSignatures.add(message.signature);
    this.stats.verified++;
    return { valid: true };
  }

  /**
   * Verify and extract a raw HCS JSON message.
   * Returns null if verification fails.
   */
  verifyHCSMessage(rawJson: string): Record<string, unknown> | null {
    if (!this.config.enabled) {
      if (this.config.requireSignature) {
        this.stats.rejected++;
        logger.warn('HMACVerifier', {
          message: 'Rejected unsigned HCS message because agent signatures are required',
        });
        return null;
      }
      try { return JSON.parse(rawJson); } catch { return null; }
    }

    try {
      const parsed = JSON.parse(rawJson);
      const { _sig, _ts, agentId, ...rest } = parsed;

      if (!_sig || !_ts || !agentId) {
        this.stats.rejected++;
        logger.warn('HMACVerifier', {
          message: 'Rejected HCS message missing signature envelope',
          agentId,
        });
        return null;
      }

      const payload = JSON.stringify(rest);
      const result = this.verify({
        agentId,
        payload,
        timestamp: _ts,
        signature: _sig,
      });

      if (!result.valid) return null;
      return parsed;
    } catch {
      this.stats.rejected++;
      return null;
    }
  }

  getStats() {
    return {
      enabled: this.config.enabled,
      requireSignature: this.config.requireSignature,
      verified: this.stats.verified,
      rejected: this.stats.rejected,
      replayed: this.stats.replayed,
      knownAgents: this.agentSecrets.size,
      antiReplaySetSize: this.recentSignatures.size,
    };
  }
}

// Singleton
export const hmacVerifier = new HMACVerifier();
