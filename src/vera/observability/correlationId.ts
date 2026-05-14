/**
 * Correlation ID Manager
 *
 * Generates and propagates a unique correlation ID through the full
 * task lifecycle so every log entry (publish → bid → award → escrow →
 * deliver → verify → settle) can be traced as a single flow.
 *
 * Usage:
 *   const cid = correlationIds.create(taskId);
 *   correlationIds.tag(cid, 'phase', 'bidding');
 *   logger.info('Component', { ...correlationIds.context(cid), message: '...' });
 */

import { randomUUID } from 'crypto';

export interface CorrelationEntry {
  correlationId: string;
  taskId: string;
  chainId?: string;
  negotiationId?: string;
  tags: Record<string, string>;
  createdAt: number;
  lastActivity: number;
}

export class CorrelationIdManager {
  private entries: Map<string, CorrelationEntry> = new Map(); // correlationId → entry
  private taskIndex: Map<string, string> = new Map(); // taskId → correlationId
  private cleanupTimer: NodeJS.Timeout | null = null;

  /**
   * Create a new correlation ID for a task.
   */
  create(taskId: string, extra?: { chainId?: string; negotiationId?: string }): string {
    const correlationId = `cid-${randomUUID().slice(0, 12)}`;
    const entry: CorrelationEntry = {
      correlationId,
      taskId,
      chainId: extra?.chainId,
      negotiationId: extra?.negotiationId,
      tags: {},
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    this.entries.set(correlationId, entry);
    this.taskIndex.set(taskId, correlationId);
    return correlationId;
  }

  /**
   * Get the correlation ID for a task (creates one if missing).
   */
  forTask(taskId: string): string {
    const existing = this.taskIndex.get(taskId);
    if (existing && this.entries.has(existing)) return existing;
    return this.create(taskId);
  }

  /**
   * Attach a tag/metadata to a correlation entry.
   */
  tag(correlationId: string, key: string, value: string): void {
    const entry = this.entries.get(correlationId);
    if (entry) {
      entry.tags[key] = value;
      entry.lastActivity = Date.now();
    }
  }

  /**
   * Link a chain or negotiation to an existing correlation.
   */
  link(correlationId: string, opts: { chainId?: string; negotiationId?: string }): void {
    const entry = this.entries.get(correlationId);
    if (entry) {
      if (opts.chainId) entry.chainId = opts.chainId;
      if (opts.negotiationId) entry.negotiationId = opts.negotiationId;
      entry.lastActivity = Date.now();
    }
  }

  /**
   * Build a log context object for structured logging.
   * Spread this into any logger.info/warn/error call.
   */
  context(correlationIdOrTaskId: string): Record<string, string> {
    // Try direct lookup first
    let entry = this.entries.get(correlationIdOrTaskId);
    // Then try task index
    if (!entry) {
      const cid = this.taskIndex.get(correlationIdOrTaskId);
      if (cid) entry = this.entries.get(cid);
    }
    if (!entry) return { correlationId: 'unknown' };

    const ctx: Record<string, string> = {
      correlationId: entry.correlationId,
      taskId: entry.taskId,
    };
    if (entry.chainId) ctx.chainId = entry.chainId;
    if (entry.negotiationId) ctx.negotiationId = entry.negotiationId;
    // Include custom tags
    for (const [k, v] of Object.entries(entry.tags)) {
      ctx[`tag_${k}`] = v;
    }
    return ctx;
  }

  /**
   * Get the full entry for inspection.
   */
  get(correlationId: string): CorrelationEntry | undefined {
    return this.entries.get(correlationId);
  }

  /**
   * Start cleanup timer (removes entries older than 2 hours).
   */
  start(): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      for (const [id, entry] of this.entries) {
        if (entry.lastActivity < cutoff) {
          this.entries.delete(id);
          this.taskIndex.delete(entry.taskId);
        }
      }
    }, 10 * 60 * 1000); // every 10 min
  }

  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getStats() {
    return {
      activeCorrelations: this.entries.size,
      trackedTasks: this.taskIndex.size,
    };
  }
}

// Singleton
export const correlationIds = new CorrelationIdManager();
