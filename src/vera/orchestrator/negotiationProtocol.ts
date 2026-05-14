/**
 * Vera Agent-to-Agent Negotiation Protocol
 *
 * Allows agents to negotiate task terms (fee, deadline, scope) before
 * formal bidding. The orchestrator mediates with timeouts and fallback
 * to the standard bid flow.
 *
 * HCS message types:
 *   negotiate_start   — requester proposes terms to a specific agent
 *   counter_offer     — agent counters with modified terms
 *   negotiate_accept  — either party accepts the current terms
 *   negotiate_reject  — either party rejects (falls back to open bid)
 *   negotiate_timeout — orchestrator closes stale negotiations
 *
 * Flow:
 *   1. Task poster sends negotiate_start with preferred agent + terms
 *   2. Agent responds with counter_offer or negotiate_accept
 *   3. Up to maxRounds of counter-offers
 *   4. On accept → task awarded directly (skip open bidding)
 *   5. On reject/timeout → task falls back to standard open bid flow
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type NegotiationStatus =
  | 'pending'      // waiting for response
  | 'countering'   // counter-offer in progress
  | 'accepted'     // terms agreed
  | 'rejected'     // one party rejected
  | 'timed_out'    // no response within timeout
  | 'expired';     // max rounds exceeded

export interface NegotiationTerms {
  fee: number;           // HBAR
  deadline?: number;     // ms from now
  scope?: string;        // refined task description
  confidence?: number;   // required confidence 0-1
  currency?: string;     // payment currency
  metadata?: Record<string, unknown>;
}

export interface NegotiationMessage {
  type: 'negotiate_start' | 'counter_offer' | 'negotiate_accept' | 'negotiate_reject';
  negotiationId: string;
  taskId: string;
  fromId: string;        // agent or requester ID
  toId: string;          // target agent or requester ID
  terms: NegotiationTerms;
  round: number;
  timestamp: number;
}

export interface Negotiation {
  negotiationId: string;
  taskId: string;
  requesterId: string;   // who initiated
  agentId: string;       // target agent
  status: NegotiationStatus;
  currentTerms: NegotiationTerms;
  initialTerms: NegotiationTerms;
  history: NegotiationMessage[];
  round: number;
  maxRounds: number;
  timeoutMs: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface NegotiationConfig {
  maxRounds: number;         // max back-and-forth rounds (default: 3)
  roundTimeoutMs: number;    // timeout per round (default: 30s)
  totalTimeoutMs: number;    // overall negotiation timeout (default: 2 min)
}

const DEFAULT_CONFIG: NegotiationConfig = {
  maxRounds: 3,
  roundTimeoutMs: 30_000,
  totalTimeoutMs: 2 * 60 * 1000,
};

// ─── Engine ──────────────────────────────────────────────────────────────────

export class NegotiationProtocol extends EventEmitter {
  private negotiations: Map<string, Negotiation> = new Map();
  private taskToNegotiation: Map<string, string> = new Map(); // taskId → negotiationId
  private config: NegotiationConfig;
  private tickTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: Partial<NegotiationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Check for timeouts every 5 seconds
    this.tickTimer = setInterval(() => this.checkTimeouts(), 5_000);

    logger.info('NegotiationProtocol', { message: 'Started' });
  }

  stop(): void {
    this.isRunning = false;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    logger.info('NegotiationProtocol', { message: 'Stopped' });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Start a negotiation with a specific agent for a task.
   */
  startNegotiation(
    taskId: string,
    requesterId: string,
    agentId: string,
    terms: NegotiationTerms,
    config?: Partial<NegotiationConfig>,
  ): Negotiation {
    const negotiationId = `neg-${randomUUID().slice(0, 8)}`;
    const mergedConfig = { ...this.config, ...config };

    const message: NegotiationMessage = {
      type: 'negotiate_start',
      negotiationId,
      taskId,
      fromId: requesterId,
      toId: agentId,
      terms,
      round: 0,
      timestamp: Date.now(),
    };

    const negotiation: Negotiation = {
      negotiationId,
      taskId,
      requesterId,
      agentId,
      status: 'pending',
      currentTerms: { ...terms },
      initialTerms: { ...terms },
      history: [message],
      round: 0,
      maxRounds: mergedConfig.maxRounds,
      timeoutMs: mergedConfig.totalTimeoutMs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.negotiations.set(negotiationId, negotiation);
    this.taskToNegotiation.set(taskId, negotiationId);

    logger.info('NegotiationProtocol', {
      message: 'Negotiation started',
      negotiationId,
      taskId,
      agentId,
      fee: terms.fee,
    });

    this.emit('negotiate_start', message);
    return negotiation;
  }

  /**
   * Process an incoming counter-offer from an agent.
   */
  counterOffer(
    negotiationId: string,
    fromId: string,
    terms: NegotiationTerms,
  ): Negotiation | null {
    const neg = this.negotiations.get(negotiationId);
    if (!neg || neg.status !== 'pending' && neg.status !== 'countering') {
      return null;
    }

    neg.round++;
    neg.status = 'countering';
    neg.currentTerms = { ...terms };
    neg.updatedAt = Date.now();

    const message: NegotiationMessage = {
      type: 'counter_offer',
      negotiationId,
      taskId: neg.taskId,
      fromId,
      toId: fromId === neg.agentId ? neg.requesterId : neg.agentId,
      terms,
      round: neg.round,
      timestamp: Date.now(),
    };

    neg.history.push(message);

    // Check if max rounds exceeded
    if (neg.round >= neg.maxRounds) {
      neg.status = 'expired';
      neg.resolvedAt = Date.now();

      logger.info('NegotiationProtocol', {
        message: 'Negotiation expired (max rounds)',
        negotiationId,
        rounds: neg.round,
      });

      this.emit('negotiate_expired', { negotiationId, taskId: neg.taskId, reason: 'max_rounds' });
      this.emit('fallback_to_bid', { taskId: neg.taskId, lastTerms: neg.currentTerms });
      return neg;
    }

    logger.info('NegotiationProtocol', {
      message: 'Counter-offer received',
      negotiationId,
      round: neg.round,
      fromId,
      fee: terms.fee,
    });

    this.emit('counter_offer', message);
    return neg;
  }

  /**
   * Accept the current terms — negotiation succeeds.
   */
  accept(negotiationId: string, fromId: string): Negotiation | null {
    const neg = this.negotiations.get(negotiationId);
    if (!neg || (neg.status !== 'pending' && neg.status !== 'countering')) {
      return null;
    }

    neg.status = 'accepted';
    neg.resolvedAt = Date.now();
    neg.updatedAt = Date.now();

    const message: NegotiationMessage = {
      type: 'negotiate_accept',
      negotiationId,
      taskId: neg.taskId,
      fromId,
      toId: fromId === neg.agentId ? neg.requesterId : neg.agentId,
      terms: neg.currentTerms,
      round: neg.round,
      timestamp: Date.now(),
    };

    neg.history.push(message);

    logger.info('NegotiationProtocol', {
      message: 'Negotiation accepted',
      negotiationId,
      taskId: neg.taskId,
      agentId: neg.agentId,
      agreedFee: neg.currentTerms.fee,
      rounds: neg.round,
    });

    this.emit('negotiate_accept', message);
    this.emit('direct_award', {
      taskId: neg.taskId,
      agentId: neg.agentId,
      terms: neg.currentTerms,
      negotiationId,
    });

    return neg;
  }

  /**
   * Reject the negotiation — falls back to open bidding.
   */
  reject(negotiationId: string, fromId: string, reason?: string): Negotiation | null {
    const neg = this.negotiations.get(negotiationId);
    if (!neg || neg.status === 'accepted' || neg.status === 'rejected') {
      return null;
    }

    neg.status = 'rejected';
    neg.resolvedAt = Date.now();
    neg.updatedAt = Date.now();

    const message: NegotiationMessage = {
      type: 'negotiate_reject',
      negotiationId,
      taskId: neg.taskId,
      fromId,
      toId: fromId === neg.agentId ? neg.requesterId : neg.agentId,
      terms: neg.currentTerms,
      round: neg.round,
      timestamp: Date.now(),
    };

    neg.history.push(message);

    logger.info('NegotiationProtocol', {
      message: 'Negotiation rejected',
      negotiationId,
      taskId: neg.taskId,
      reason,
    });

    this.emit('negotiate_reject', message);
    this.emit('fallback_to_bid', { taskId: neg.taskId, lastTerms: neg.currentTerms });

    return neg;
  }

  /**
   * Process an incoming HCS negotiation message.
   */
  handleMessage(msg: NegotiationMessage): void {
    switch (msg.type) {
      case 'negotiate_start':
        // Already handled by startNegotiation — this is for HCS listener
        break;
      case 'counter_offer':
        this.counterOffer(msg.negotiationId, msg.fromId, msg.terms);
        break;
      case 'negotiate_accept':
        this.accept(msg.negotiationId, msg.fromId);
        break;
      case 'negotiate_reject':
        this.reject(msg.negotiationId, msg.fromId);
        break;
    }
  }

  // ── Query ────────────────────────────────────────────────────────────────

  getNegotiation(negotiationId: string): Negotiation | undefined {
    return this.negotiations.get(negotiationId);
  }

  getNegotiationByTask(taskId: string): Negotiation | undefined {
    const negId = this.taskToNegotiation.get(taskId);
    return negId ? this.negotiations.get(negId) : undefined;
  }

  getActiveNegotiations(): Negotiation[] {
    return Array.from(this.negotiations.values())
      .filter(n => n.status === 'pending' || n.status === 'countering');
  }

  getStats() {
    const all = Array.from(this.negotiations.values());
    return {
      total: all.length,
      active: all.filter(n => n.status === 'pending' || n.status === 'countering').length,
      accepted: all.filter(n => n.status === 'accepted').length,
      rejected: all.filter(n => n.status === 'rejected').length,
      timedOut: all.filter(n => n.status === 'timed_out' || n.status === 'expired').length,
      avgRounds: all.length > 0
        ? all.reduce((sum, n) => sum + n.round, 0) / all.length
        : 0,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private checkTimeouts(): void {
    const now = Date.now();

    for (const neg of this.negotiations.values()) {
      if (neg.status !== 'pending' && neg.status !== 'countering') continue;

      // Overall timeout
      if (now - neg.createdAt > neg.timeoutMs) {
        neg.status = 'timed_out';
        neg.resolvedAt = now;
        neg.updatedAt = now;

        logger.info('NegotiationProtocol', {
          message: 'Negotiation timed out',
          negotiationId: neg.negotiationId,
          taskId: neg.taskId,
        });

        this.emit('negotiate_timeout', {
          negotiationId: neg.negotiationId,
          taskId: neg.taskId,
        });
        this.emit('fallback_to_bid', { taskId: neg.taskId, lastTerms: neg.currentTerms });
      }

      // Per-round timeout (last message older than roundTimeoutMs)
      const lastMsg = neg.history[neg.history.length - 1];
      if (lastMsg && now - lastMsg.timestamp > this.config.roundTimeoutMs) {
        neg.status = 'timed_out';
        neg.resolvedAt = now;
        neg.updatedAt = now;

        logger.info('NegotiationProtocol', {
          message: 'Negotiation round timed out',
          negotiationId: neg.negotiationId,
          round: neg.round,
        });

        this.emit('negotiate_timeout', {
          negotiationId: neg.negotiationId,
          taskId: neg.taskId,
          reason: 'round_timeout',
        });
        this.emit('fallback_to_bid', { taskId: neg.taskId, lastTerms: neg.currentTerms });
      }
    }

    // Cleanup old completed negotiations (older than 1 hour)
    const cutoff = now - 60 * 60 * 1000;
    for (const [id, neg] of this.negotiations) {
      if (neg.resolvedAt && neg.resolvedAt < cutoff) {
        this.negotiations.delete(id);
        this.taskToNegotiation.delete(neg.taskId);
      }
    }
  }
}

// Singleton
export const negotiationProtocol = new NegotiationProtocol();
