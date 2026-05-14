/**
 * Vera Enterprise Heartbeat Manager
 *
 * Smart delta heartbeats with 6x cost savings:
 * - Minimal heartbeat every 10 minutes (status only)
 * - Full capabilities every 60 minutes or on change
 * - HIP-993 format for all messages
 * - Cost tracking and reporting
 */

import { EventEmitter } from 'events';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';
import {
  CapabilityRegistry,
  EnterpriseCapabilities,
  MinimalCapabilityStatus,
} from './capabilityRegistry.js';

// ─── Constants ───────────────────────────────────────────────────────────────

export const HEARTBEAT_VERSION = '2.0.0';
export const MAX_MESSAGE_SIZE = 4096; // HIP-993 max chunk size

// Smart delta intervals (configurable)
export const DEFAULT_MINIMAL_INTERVAL_MS = 600_000; // 10 minutes
export const DEFAULT_FULL_INTERVAL_MS = 3_600_000; // 60 minutes
export const FULL_HEARTBEAT_EVERY_N = 6; // Every 6th heartbeat is full

// Cost constants (approximate)
const HCS_MESSAGE_COST_HBAR = 0.0001; // ~$0.00003 per message

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HeartbeatConfig {
  nodeId: string;
  topicId: string;
  nodeType: EnterpriseCapabilities['node_type'];
  minimalIntervalMs: number;
  fullIntervalMs: number;
  enableCostTracking: boolean;
  enableCompression: boolean;
  staggerStartMs: number;
}

export interface HeartbeatMessage {
  v: string;
  type: 'HEARTBEAT' | 'FULL_HEARTBEAT' | 'SOS';
  node_id: string;
  node_type: EnterpriseCapabilities['node_type'];
  ts: number;
  status: 'healthy' | 'degraded' | 'unhealthy';
  load: number;
  capabilities_hash: string;
  // Only present in full heartbeats:
  capabilities_full?: EnterpriseCapabilities;
  // Cost tracking:
  cost_stats?: CostStats;
  // Optional SOS data:
  sos?: {
    level: 'info' | 'warning' | 'critical';
    message: string;
    code?: string;
  };
}

export interface CostStats {
  heartbeats_sent: number;
  full_heartbeats_sent: number;
  minimal_heartbeats_sent: number;
  hbar_spent: number;
  estimated_monthly_hbar: number;
  savings_vs_legacy_percent: number;
  savings_vs_10min_percent: number;
}

export interface HeartbeatMetrics {
  totalHeartbeats: number;
  minimalHeartbeats: number;
  fullHeartbeats: number;
  failedHeartbeats: number;
  totalCostHbar: number;
  lastHeartbeatAt: number;
  averageLatencyMs: number;
}

// ─── Enterprise Heartbeat Manager ────────────────────────────────────────────

export class EnterpriseHeartbeatManager extends EventEmitter {
  private config: HeartbeatConfig;
  private registry: CapabilityRegistry;
  private isRunning: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatCount: number = 0;
  private metrics: HeartbeatMetrics;
  private lastFullBroadcast: number = 0;
  private pendingSOS: HeartbeatMessage['sos'] | null = null;

  constructor(cfg: Partial<HeartbeatConfig> = {}) {
    super();

    this.config = {
      nodeId: cfg.nodeId || this.generateNodeId(),
      topicId: cfg.topicId || config.VERA_BEACON_TOPIC_ID || config.HCS_TOPIC_ID || '0.0.0',
      nodeType: cfg.nodeType || 'agent',
      minimalIntervalMs: cfg.minimalIntervalMs || DEFAULT_MINIMAL_INTERVAL_MS,
      fullIntervalMs: cfg.fullIntervalMs || DEFAULT_FULL_INTERVAL_MS,
      enableCostTracking: cfg.enableCostTracking ?? true,
      enableCompression: cfg.enableCompression ?? true,
      staggerStartMs: cfg.staggerStartMs ?? Math.random() * 5000,
    };

    this.registry = new CapabilityRegistry({
      node_id: this.config.nodeId,
      node_type: this.config.nodeType,
    });

    this.metrics = {
      totalHeartbeats: 0,
      minimalHeartbeats: 0,
      fullHeartbeats: 0,
      failedHeartbeats: 0,
      totalCostHbar: 0,
      lastHeartbeatAt: 0,
      averageLatencyMs: 0,
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Start the heartbeat manager
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.emit('started', { nodeId: this.config.nodeId });

    logger.info('EnterpriseHeartbeatManager', {
      message: 'Heartbeat manager started',
      nodeId: this.config.nodeId,
      topicId: this.config.topicId,
      minimalInterval: `${this.config.minimalIntervalMs / 1000}s`,
      fullInterval: `${this.config.fullIntervalMs / 1000}s`,
    });

    // Stagger start to avoid thundering herd
    setTimeout(() => {
      // Send first heartbeat immediately
      this.sendHeartbeat();

      // Start regular interval
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat();
      }, this.config.minimalIntervalMs);
    }, this.config.staggerStartMs);
  }

  /**
   * Stop the heartbeat manager
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.emit('stopped', { nodeId: this.config.nodeId });

    logger.info('EnterpriseHeartbeatManager', {
      message: 'Heartbeat manager stopped',
      nodeId: this.config.nodeId,
      metrics: this.getMetrics(),
    });
  }

  /**
   * Trigger an SOS heartbeat immediately
   */
  sendSOS(level: 'info' | 'warning' | 'critical', message: string, code?: string): void {
    this.pendingSOS = { level, message, code };
    this.sendHeartbeat(true); // Force immediate heartbeat
    this.pendingSOS = null; // Clear after sending

    logger.warn('EnterpriseHeartbeatManager', {
      message: 'SOS heartbeat sent',
      level,
      sosMessage: message,
      code,
    });
  }

  /**
   * Update capabilities and trigger full heartbeat if changed
   */
  updateCapabilities(updates: Partial<EnterpriseCapabilities>): boolean {
    const changed = this.registry.updateCapabilities(updates);

    if (changed) {
      logger.info('EnterpriseHeartbeatManager', {
        message: 'Capabilities updated, will broadcast on next full heartbeat',
        newHash: this.registry.getCapabilityHash(),
      });

      // Force full heartbeat on next cycle if significant change
      this.emit('capabilities_changed', this.registry.getCapabilities());
    }

    return changed;
  }

  /**
   * Update performance metrics (doesn't trigger full heartbeat)
   */
  updatePerformance(metrics: Partial<EnterpriseCapabilities['performance']>): void {
    this.registry.updatePerformance(metrics);
  }

  /**
   * Get current metrics
   */
  getMetrics(): HeartbeatMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cost statistics
   */
  getCostStats(): CostStats {
    const total = this.metrics.totalHeartbeats;
    const full = this.metrics.fullHeartbeats;
    const minimal = this.metrics.minimalHeartbeats;

    // Calculate costs
    const hbarSpent = total * HCS_MESSAGE_COST_HBAR;

    // Estimate monthly (assuming same pattern continues)
    const daysInMonth = 30;
    const heartbeatsPerDay = total / Math.max(1, (Date.now() - this.metrics.lastHeartbeatAt) / 86400000);
    const estimatedMonthlyHbar = heartbeatsPerDay * daysInMonth * HCS_MESSAGE_COST_HBAR;

    // Calculate savings vs legacy (1 minute intervals)
    const legacyHeartbeatsPerDay = 1440;
    const savingsVsLegacy = ((legacyHeartbeatsPerDay - heartbeatsPerDay) / legacyHeartbeatsPerDay) * 100;

    // Calculate savings vs simple 10-minute (no smart delta)
    const simple10minPerDay = 144;
    const smartDeltaPerDay = (minimal + full / FULL_HEARTBEAT_EVERY_N) / Math.max(1, total / simple10minPerDay);
    const savingsVs10Min = ((simple10minPerDay - smartDeltaPerDay) / simple10minPerDay) * 100;

    return {
      heartbeats_sent: total,
      full_heartbeats_sent: full,
      minimal_heartbeats_sent: minimal,
      hbar_spent: parseFloat(hbarSpent.toFixed(6)),
      estimated_monthly_hbar: parseFloat(estimatedMonthlyHbar.toFixed(6)),
      savings_vs_legacy_percent: Math.round(savingsVsLegacy),
      savings_vs_10min_percent: Math.round(savingsVs10Min),
    };
  }

  /**
   * Get current capabilities
   */
  getCapabilities(): EnterpriseCapabilities {
    return this.registry.getCapabilities();
  }

  // ─── Private Methods ───────────────────────────────────────────────────────

  /**
   * Send a heartbeat (minimal or full)
   */
  private async sendHeartbeat(forceFull = false): Promise<void> {
    if (!this.isRunning) return;

    const startTime = Date.now();
    this.heartbeatCount++;

    // Determine if this should be a full heartbeat
    const isFullHeartbeat = forceFull ||
      this.heartbeatCount % FULL_HEARTBEAT_EVERY_N === 0 ||
      this.registry.hasChanged() ||
      (Date.now() - this.lastFullBroadcast) > this.config.fullIntervalMs;

    try {
      const message = this.buildHeartbeatMessage(isFullHeartbeat);
      const result = await this.submitToHCS(message);

      // Update metrics
      this.metrics.totalHeartbeats++;
      if (isFullHeartbeat) {
        this.metrics.fullHeartbeats++;
        this.registry.markBroadcasted();
        this.lastFullBroadcast = Date.now();
      } else {
        this.metrics.minimalHeartbeats++;
      }

      this.metrics.totalCostHbar += HCS_MESSAGE_COST_HBAR;
      this.metrics.lastHeartbeatAt = Date.now();

      // Update latency (running average)
      const latency = Date.now() - startTime;
      this.metrics.averageLatencyMs =
        (this.metrics.averageLatencyMs * (this.metrics.totalHeartbeats - 1) + latency) /
        this.metrics.totalHeartbeats;

      this.emit('heartbeat_sent', {
        type: isFullHeartbeat ? 'full' : 'minimal',
        sequence: result.sequenceNumber,
        latency,
      });

      logger.debug('EnterpriseHeartbeatManager', {
        message: 'Heartbeat sent',
        type: isFullHeartbeat ? 'full' : 'minimal',
        sequence: result.sequenceNumber,
        nodeId: this.config.nodeId,
        latency,
      });
    } catch (error) {
      this.metrics.failedHeartbeats++;

      this.emit('heartbeat_failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      logger.error('EnterpriseHeartbeatManager', {
        message: 'Failed to send heartbeat',
        nodeId: this.config.nodeId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Build heartbeat message payload
   */
  private buildHeartbeatMessage(isFull: boolean): HeartbeatMessage {
    const now = Date.now();
    const caps = this.registry.getCapabilities();

    const message: HeartbeatMessage = {
      v: HEARTBEAT_VERSION,
      type: isFull ? 'FULL_HEARTBEAT' : 'HEARTBEAT',
      node_id: this.config.nodeId,
      node_type: this.config.nodeType,
      ts: now,
      status: this.determineStatus(caps.performance),
      load: caps.performance.avg_response_ms / 1000, // Normalized 0-1
      capabilities_hash: this.registry.getCapabilityHash(),
    };

    // Add full capabilities only for full heartbeats
    if (isFull) {
      message.capabilities_full = caps;
    }

    // Add cost stats if enabled
    if (this.config.enableCostTracking) {
      message.cost_stats = this.getCostStats();
    }

    // Add SOS if pending
    if (this.pendingSOS) {
      message.type = 'SOS';
      message.sos = this.pendingSOS;
    }

    return message;
  }

  /**
   * Submit message to HCS via hederaMaster (HIP-993 format)
   */
  private async submitToHCS(message: HeartbeatMessage) {
    return await hederaMaster.submitMessage(this.config.topicId, message, {
      maxChunkSize: MAX_MESSAGE_SIZE,
    });
  }

  /**
   * Determine node status based on performance
   */
  private determineStatus(perf: EnterpriseCapabilities['performance']): HeartbeatMessage['status'] {
    if (perf.uptime_24h < 95 || perf.success_rate < 90) return 'unhealthy';
    if (perf.uptime_24h < 99 || perf.success_rate < 95) return 'degraded';
    return 'healthy';
  }

  /**
   * Generate unique node ID
   */
  private generateNodeId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `vera-${timestamp}-${random}`;
  }
}

// ─── Singleton Export ──────────────────────────────────────────────────────

export const enterpriseHeartbeat = new EnterpriseHeartbeatManager();
