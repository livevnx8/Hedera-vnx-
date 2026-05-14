import { EventEmitter } from 'events';
import { logger } from '../../monitoring/logger.js';
import { taskPublisher } from './taskPublisher.js';
import { escrowController } from './escrowController.js';
import { resultVerifier } from './resultVerifier.js';
import { enhancedSettlement as x402Settlement } from '../payments/enhancedX402Settlement.js';
import { taskChainEngine } from './taskChainEngine.js';
import { negotiationProtocol } from './negotiationProtocol.js';
import { batchSettlementEngine } from '../payments/asyncBatchSettlement.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StreamEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

type StreamClient = {
  id: string;
  send: (event: StreamEvent) => void;
  connectedAt: number;
};

// ─── Event Stream Hub ────────────────────────────────────────────────────────

export class OrchestratorEventStream extends EventEmitter {
  private clients = new Map<string, StreamClient>();
  private eventLog: StreamEvent[] = [];
  private readonly maxLogSize = 500;
  private wired = false;

  /**
   * Register a client to receive real-time events.
   * Returns an unsubscribe function.
   */
  subscribe(clientId: string, sendFn: (event: StreamEvent) => void): () => void {
    const client: StreamClient = {
      id: clientId,
      send: sendFn,
      connectedAt: Date.now(),
    };
    this.clients.set(clientId, client);

    logger.debug('EventStream', { message: 'Client subscribed', clientId, total: this.clients.size });

    return () => {
      this.clients.delete(clientId);
      logger.debug('EventStream', { message: 'Client unsubscribed', clientId, total: this.clients.size });
    };
  }

  /**
   * Wire into all orchestrator component events.
   * Call once after orchestrator is started.
   */
  wireEvents(): void {
    if (this.wired) return;
    this.wired = true;

    taskPublisher.on('task_posted', (record) => {
      this.broadcast({
        type: 'task_posted',
        timestamp: Date.now(),
        data: { taskId: record.intent.taskId, serviceType: record.intent.serviceType, budget: record.intent.budget },
      });
    });

    taskPublisher.on('bid_received', ({ taskId, bid }) => {
      this.broadcast({
        type: 'bid_received',
        timestamp: Date.now(),
        data: { taskId, agentId: bid.agentId, fee: bid.fee, confidence: bid.confidence },
      });
    });

    taskPublisher.on('task_awarded', ({ taskId, winner }) => {
      this.broadcast({
        type: 'task_awarded',
        timestamp: Date.now(),
        data: { taskId, winnerId: winner.agentId, fee: winner.fee },
      });
    });

    taskPublisher.on('state_changed', ({ taskId, state }) => {
      this.broadcast({
        type: 'task_state_changed',
        timestamp: Date.now(),
        data: { taskId, state },
      });
    });

    escrowController.on('escrow_locked', (record) => {
      this.broadcast({
        type: 'escrow_locked',
        timestamp: Date.now(),
        data: { escrowId: record.escrowId, taskId: record.taskId, amountHbar: record.amountHbar },
      });
    });

    escrowController.on('escrow_released', (record) => {
      this.broadcast({
        type: 'escrow_released',
        timestamp: Date.now(),
        data: { escrowId: record.escrowId, taskId: record.taskId },
      });
    });

    escrowController.on('escrow_reclaimed', (record) => {
      this.broadcast({
        type: 'escrow_reclaimed',
        timestamp: Date.now(),
        data: { escrowId: record.escrowId, taskId: record.taskId },
      });
    });

    resultVerifier.on('verification_complete', (report) => {
      this.broadcast({
        type: 'verification_complete',
        timestamp: Date.now(),
        data: { taskId: report.taskId, agentId: report.agentId, outcome: report.outcome, score: report.score },
      });
    });

    x402Settlement.on('settled', (request) => {
      this.broadcast({
        type: 'payment_settled',
        timestamp: Date.now(),
        data: {
          settlementId: request.settlementId,
          taskId: request.taskId,
          agentId: request.agentId,
          amountHbar: request.amountHbar,
          method: request.method,
          txId: request.txId,
        },
      });
    });

    x402Settlement.on('settlement_failed', (request) => {
      this.broadcast({
        type: 'payment_failed',
        timestamp: Date.now(),
        data: { settlementId: request.settlementId, taskId: request.taskId, error: request.error },
      });
    });

    // ── Chain engine events ──────────────────────────────────────────────
    taskChainEngine.on('step_dispatched', ({ chainId, stepId, taskId }) => {
      this.broadcast({
        type: 'chain_step_dispatched',
        timestamp: Date.now(),
        data: { chainId, stepId, taskId },
      });
    });

    taskChainEngine.on('step_completed', ({ chainId, stepId, agentId }) => {
      this.broadcast({
        type: 'chain_step_completed',
        timestamp: Date.now(),
        data: { chainId, stepId, agentId },
      });
    });

    taskChainEngine.on('step_failed', ({ chainId, stepId, error }) => {
      this.broadcast({
        type: 'chain_step_failed',
        timestamp: Date.now(),
        data: { chainId, stepId, error },
      });
    });

    taskChainEngine.on('chain_completed', (result) => {
      this.broadcast({
        type: 'chain_completed',
        timestamp: Date.now(),
        data: { chainId: result.chainId, status: result.status, totalSpent: result.totalSpent, durationMs: result.durationMs },
      });
    });

    taskChainEngine.on('chain_rolled_back', (result) => {
      this.broadcast({
        type: 'chain_rolled_back',
        timestamp: Date.now(),
        data: { chainId: result.chainId, totalSpent: result.totalSpent },
      });
    });

    // ── Negotiation protocol events ───────────────────────────────────────
    negotiationProtocol.on('negotiate_start', (msg) => {
      this.broadcast({
        type: 'negotiation_started',
        timestamp: Date.now(),
        data: { negotiationId: msg.negotiationId, taskId: msg.taskId, agentId: msg.toId, fee: msg.terms.fee },
      });
    });

    negotiationProtocol.on('counter_offer', (msg) => {
      this.broadcast({
        type: 'negotiation_counter_offer',
        timestamp: Date.now(),
        data: { negotiationId: msg.negotiationId, taskId: msg.taskId, fromId: msg.fromId, round: msg.round, fee: msg.terms.fee },
      });
    });

    negotiationProtocol.on('negotiate_accept', (msg) => {
      this.broadcast({
        type: 'negotiation_accepted',
        timestamp: Date.now(),
        data: { negotiationId: msg.negotiationId, taskId: msg.taskId, agreedFee: msg.terms.fee },
      });
    });

    negotiationProtocol.on('fallback_to_bid', ({ taskId }) => {
      this.broadcast({
        type: 'negotiation_fallback',
        timestamp: Date.now(),
        data: { taskId },
      });
    });

    // ── Batch settlement events ───────────────────────────────────────────
    batchSettlementEngine.on('batch_settled', (data: any) => {
      this.broadcast({
        type: 'batch_settled',
        timestamp: Date.now(),
        data: { batchId: data.batchId, count: data.count, totalHbar: data.totalHbar },
      });
    });

    logger.info('EventStream', { message: 'Wired to all orchestrator events (extended)' });
  }

  /**
   * Broadcast an event to all connected clients and store in log.
   */
  private broadcast(event: StreamEvent): void {
    // Store in ring buffer
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Emit locally
    this.emit('event', event);

    // Send to all subscribed clients
    for (const client of this.clients.values()) {
      try {
        client.send(event);
      } catch (error) {
        logger.warn('EventStream', {
          message: 'Failed to send event to client',
          clientId: client.id,
          error: error instanceof Error ? error.message : String(error),
        });
        this.clients.delete(client.id);
      }
    }
  }

  /**
   * Get recent events (for clients catching up after reconnect).
   */
  getRecentEvents(limit = 50): StreamEvent[] {
    return this.eventLog.slice(-limit);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      totalEvents: this.eventLog.length,
      oldestEvent: this.eventLog.length > 0 ? this.eventLog[0].timestamp : null,
      newestEvent: this.eventLog.length > 0 ? this.eventLog[this.eventLog.length - 1].timestamp : null,
    };
  }
}

export const orchestratorEventStream = new OrchestratorEventStream();
