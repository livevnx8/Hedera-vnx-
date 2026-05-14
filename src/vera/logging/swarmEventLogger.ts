/**
 * Swarm Event Logger
 *
 * Every inter-agent / inter-node interaction in Vera's lattice flows through here.
 * Each event is:
 *   1. Given a short correlation id
 *   2. Hashed + signed via actionVerifier
 *   3. Published to HCS via HIP-993 envelope (batched, non-blocking)
 *   4. Added to an in-memory ring buffer for the /api/vera/swarm/events feed
 *   5. Broadcast to any connected SSE subscribers for live dashboards
 *
 * Uses actionVerifier so each proof is independently verifiable via
 * `npx @vera/verify <hash>` — same zero-trust pipeline as tool calls.
 *
 * @module vera/logging/swarmEventLogger
 */

import { EventEmitter } from 'events';
import { actionVerifier } from '../verification/actionVerifier.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SwarmEventKind =
  | 'lattice.route'        // message routed node-to-node
  | 'lattice.decision'     // decision routed through center
  | 'lattice.pulse'        // center heartbeat pulse
  | 'lattice.reinforce'    // path reinforced after successful delivery
  | 'lattice.agent-joined' // agent assigned to a node
  | 'lattice.agent-left'   // agent removed
  | 'swarm.task-routed'    // lattice swarm routed task to agent
  | 'swarm.task-complete'  // agent completed task
  | 'swarm.handshake'      // quantum handshake / peer greeting
  | 'swarm.consensus'      // ABFT consensus proposal/vote
  | 'swarm.gossip'         // gossip event propagation
  | 'swarm.beacon'         // agent beacon
  | 'swarm.payment'        // inter-agent micropayment
  | 'swarm.bridge';        // cross-chain bridge attestation

export interface SwarmEvent {
  /** Correlation id — short, sortable */
  id: string;
  /** Event category */
  kind: SwarmEventKind;
  /** Originating node or agent */
  from: string;
  /** Destination node or agent (if applicable) */
  to?: string;
  /** Local timestamp ms */
  ts: number;
  /** Structured payload */
  data: Record<string, unknown>;
  /** Proof hash (set once actionVerifier returns) */
  hash?: string;
  /** HCS sequence number */
  sequenceNumber?: number;
  /** HCS topic */
  topicId?: string;
  /** Hedera transaction id (usable in HashScan /transaction/:id) */
  transactionId?: string;
  /** HashScan deep-link (transaction page) */
  hashscanUrl?: string;
  /** True once mirror-node round-trip confirms */
  onChain?: boolean;
  /** ms from local emit to on-chain anchor */
  anchorLatencyMs?: number;
}

export interface SwarmLoggerStats {
  totalEvents: number;
  onChainEvents: number;
  pendingEvents: number;
  failedEvents: number;
  eventsByKind: Record<string, number>;
  bufferSize: number;
  /** Anchor latency stats over a rolling window (ms) */
  latency: {
    count: number;
    avgMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    recent: number[]; // last N samples, for sparkline
  };
  /** Rate limit tracking */
  rateLimit: {
    throttledEvents: number;
    lastThrottleAt?: number;
  };
}

// ─── Logger ─────────────────────────────────────────────────────────────────

const MAX_BUFFER = 500;        // recent events kept in memory
const CORRELATION_BYTES = 6;   // 48-bit id = 8 base36 chars

export class SwarmEventLogger extends EventEmitter {
  private buffer: SwarmEvent[] = [];
  private stats = {
    totalEvents: 0,
    onChainEvents: 0,
    pendingEvents: 0,
    failedEvents: 0,
    eventsByKind: new Map<string, number>(),
    throttledEvents: 0,
    lastThrottleAt: undefined as number | undefined,
  };
  /** Rolling window of anchor latencies in ms (most recent first) */
  private latencies: number[] = [];
  private static LATENCY_WINDOW = 200;

  /**
   * Log a swarm event. Fire-and-forget: returns the locally-tagged event
   * immediately; the on-chain hash/sequence are filled in asynchronously.
   */
  log(kind: SwarmEventKind, params: {
    from: string;
    to?: string;
    data?: Record<string, unknown>;
  }): SwarmEvent {
    const event: SwarmEvent = {
      id: this.generateId(),
      kind,
      from: params.from,
      to: params.to,
      ts: Date.now(),
      data: params.data ?? {},
      onChain: false,
    };

    this.stats.totalEvents++;
    this.stats.pendingEvents++;
    this.stats.eventsByKind.set(kind, (this.stats.eventsByKind.get(kind) ?? 0) + 1);

    this.addToBuffer(event);
    this.emit('event', event);

    // Fire-and-forget async anchoring
    this.anchor(event).catch((err) => {
      logger.debug('SwarmEventLogger', {
        message: 'anchor failed',
        id: event.id,
        kind,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return event;
  }

  /**
   * Submit the event to HCS via actionVerifier. Non-blocking: mirror-node
   * round-trip happens inside actionVerifier.
   */
  private async anchor(event: SwarmEvent): Promise<void> {
    try {
      // Build payload omitting undefined fields (otherwise canonical hash
      // drifts from what survives JSON serialization on HCS).
      const payload: Record<string, unknown> = {
        id: event.id,
        ts: event.ts,
        ...event.data,
      };
      if (event.to !== undefined) payload.to = event.to;

      const proof = await actionVerifier.verifyAction({
        domain: 'swarm',
        type: event.kind,
        actor: event.from,
        payload,
      });

      event.hash = proof.hash;
      event.sequenceNumber = proof.sequenceNumber || undefined;
      event.topicId = proof.topicId;
      event.transactionId = proof.transactionId || undefined;
      // HashScan expects tx id in mirror-node dash format: 0.0.X-seconds-nanos
      // SDK returns 0.0.X@seconds.nanos; split on @ so we only rewrite the
      // seconds/nanos separator, not the account-id dots.
      const hashscanTx = proof.transactionId
        ? (() => {
            const [acct, ts] = proof.transactionId.split('@');
            return ts ? `${acct}-${ts.replace('.', '-')}` : proof.transactionId;
          })()
        : null;
      event.hashscanUrl = hashscanTx
        ? `https://hashscan.io/mainnet/transaction/${hashscanTx}`
        : proof.hashscanUrl;
      event.onChain = !!proof.sequenceNumber;
      if (event.onChain) {
        event.anchorLatencyMs = Date.now() - event.ts;
        this.recordLatency(event.anchorLatencyMs);
      }

      if (event.onChain) {
        this.stats.onChainEvents++;
        this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1);
      } else {
        this.stats.failedEvents++;
        this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1);
      }

      this.emit('anchored', event);
    } catch (err) {
      this.stats.failedEvents++;
      this.stats.pendingEvents = Math.max(0, this.stats.pendingEvents - 1);
      throw err;
    }
  }

  private addToBuffer(event: SwarmEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > MAX_BUFFER) {
      this.buffer.splice(0, this.buffer.length - MAX_BUFFER);
    }
  }

  private generateId(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 2 + CORRELATION_BYTES);
    return `${ts}-${rand}`;
  }

  /**
   * Return the most recent N events (newest first).
   */
  recent(limit = 50, kind?: SwarmEventKind): SwarmEvent[] {
    let result = this.buffer.slice().reverse();
    if (kind) result = result.filter((e) => e.kind === kind);
    return result.slice(0, limit);
  }

  private recordLatency(ms: number): void {
    this.latencies.unshift(ms);
    if (this.latencies.length > SwarmEventLogger.LATENCY_WINDOW) {
      this.latencies.length = SwarmEventLogger.LATENCY_WINDOW;
    }
  }

  private percentile(sortedAsc: number[], p: number): number {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
    return sortedAsc[idx];
  }

  private latencyStats(): SwarmLoggerStats['latency'] {
    const lat = this.latencies;
    if (lat.length === 0) {
      return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, recent: [] };
    }
    const sorted = [...lat].sort((a, b) => a - b);
    const avg = Math.round(lat.reduce((s, x) => s + x, 0) / lat.length);
    return {
      count: lat.length,
      avgMs: avg,
      p50Ms: this.percentile(sorted, 50),
      p95Ms: this.percentile(sorted, 95),
      maxMs: sorted[sorted.length - 1],
      recent: lat.slice(0, 60).reverse(), // oldest → newest, for sparkline
    };
  }

  getStats(): SwarmLoggerStats {
    return {
      totalEvents: this.stats.totalEvents,
      onChainEvents: this.stats.onChainEvents,
      pendingEvents: this.stats.pendingEvents,
      failedEvents: this.stats.failedEvents,
      eventsByKind: Object.fromEntries(this.stats.eventsByKind),
      bufferSize: this.buffer.length,
      latency: this.latencyStats(),
      rateLimit: {
        throttledEvents: this.stats.throttledEvents,
        lastThrottleAt: this.stats.lastThrottleAt,
      },
    };
  }

  /** Call this when a rate-limit/throttle happens */
  recordThrottle(): void {
    this.stats.throttledEvents++;
    this.stats.lastThrottleAt = Date.now();
  }
}

export const swarmEventLogger = new SwarmEventLogger();
