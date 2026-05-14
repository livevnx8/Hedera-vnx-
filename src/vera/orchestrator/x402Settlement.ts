import { TransferTransaction, Hbar, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { EventEmitter } from 'events';
import axios from 'axios';
import { getClient } from '../../hedera/tools/client.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SettlementState = 'pending' | 'processing' | 'settled' | 'failed' | 'partial';

export interface SettlementRequest {
  settlementId: string;
  taskId: string;
  agentId: string;
  recipientAccountId: string;
  amountHbar: number;
  method: 'x402' | 'direct_transfer';
  state: SettlementState;
  createdAt: number;
  settledAt?: number;
  txId?: string;
  x402PaymentId?: string;
  error?: string;
  retryCount?: number;
  idempotencyKey?: string;
}

export interface SettlementStats {
  total: number;
  settled: number;
  failed: number;
  pending: number;
  totalHbarPaid: number;
  averageSettlementMs: number;
}

// ─── Circuit Breaker ───────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

export class X402SettlementHandler extends EventEmitter {
  private settlements = new Map<string, SettlementRequest>();
  private readonly x402BaseUrl: string | null;
  private readonly x402ApiKey: string | null;
  private readonly x402Facilitator: string | null;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailure: 0,
    state: 'CLOSED',
  };
  private retryQueue: SettlementRequest[] = [];
  private isProcessingRetries = false;

  constructor() {
    super();
    this.x402BaseUrl = config.X402_BASE_URL || null;
    this.x402ApiKey = config.X402_API_KEY || null;
    this.x402Facilitator = config.X402_FACILITATOR_ACCOUNT || null;
  }

  /**
   * Settle a payment for completed & verified work.
   * Uses x402 if configured, otherwise falls back to direct HBAR transfer.
   */
  async settle(
    taskId: string,
    agentId: string,
    recipientAccountId: string,
    amountHbar: number,
  ): Promise<SettlementRequest> {
    const settlementId = `stl-${taskId}-${Date.now()}`;
    const method = this.x402BaseUrl ? 'x402' : 'direct_transfer';

    const request: SettlementRequest = {
      settlementId,
      taskId,
      agentId,
      recipientAccountId,
      amountHbar,
      method,
      state: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      idempotencyKey: this.generateIdempotencyKey(taskId, agentId, amountHbar),
    };

    this.settlements.set(settlementId, request);

    try {
      request.state = 'processing';

      if (method === 'x402') {
        await this.settleViaX402(request);
      } else {
        await this.settleViaDirectTransfer(request);
      }

      request.state = 'settled';
      request.settledAt = Date.now();

      logger.info('X402Settlement', {
        message: 'Payment settled',
        settlementId,
        taskId,
        agentId,
        amountHbar,
        method,
        txId: request.txId,
      });

      await this.auditLog('payment_settled', request);
      this.emit('settled', request);
    } catch (error) {
      request.state = 'failed';
      request.error = error instanceof Error ? error.message : String(error);

      logger.error('X402Settlement', {
        message: 'Settlement failed',
        settlementId,
        taskId,
        error: request.error,
      });

      await this.auditLog('payment_failed', request);
      this.emit('settlement_failed', request);
    }

    return request;
  }

  // ─── x402 path ───────────────────────────────────────────────────────────

  private async settleViaX402(request: SettlementRequest): Promise<void> {
    if (!this.x402BaseUrl || !this.x402ApiKey) {
      throw new Error('x402 credentials not configured');
    }

    const payload = {
      recipientAccountId: request.recipientAccountId,
      amount: request.amountHbar,
      currency: 'HBAR',
      memo: `Vera task payment: ${request.taskId}`,
      facilitatorAccount: this.x402Facilitator,
      metadata: {
        taskId: request.taskId,
        agentId: request.agentId,
        settlementId: request.settlementId,
      },
    };

    const response = await axios.post(`${this.x402BaseUrl}/payments`, payload, {
      headers: {
        'Authorization': `Bearer ${this.x402ApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    if (response.data?.paymentId) {
      request.x402PaymentId = response.data.paymentId;
      request.txId = response.data.transactionId || response.data.paymentId;
    } else {
      throw new Error(`x402 response missing paymentId: ${JSON.stringify(response.data)}`);
    }
  }

  // ─── Direct transfer path ────────────────────────────────────────────────

  private async settleViaDirectTransfer(request: SettlementRequest): Promise<void> {
    const payerAccountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!payerAccountId) {
      throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
    }

    const client = getClient();
    const resp = await new TransferTransaction()
      .addHbarTransfer(payerAccountId, new Hbar(-request.amountHbar))
      .addHbarTransfer(request.recipientAccountId, new Hbar(request.amountHbar))
      .setTransactionMemo(`Vera payment: ${request.taskId}`)
      .execute(client);

    const receipt = await resp.getReceipt(client);
    request.txId = resp.transactionId.toString();
  }

  // ─── State Recovery ──────────────────────────────────────────────────────

  /**
   * Rehydrate in-memory settlements map from persisted SQLite rows.
   * Call once during orchestrator startup.
   */
  rehydrate(rows: Array<{
    settlementId: string;
    taskId: string;
    agentId: string;
    recipientAccountId: string;
    amountHbar: number;
    method: string;
    state: string;
    txId?: string;
    x402PaymentId?: string;
    error?: string;
    createdAt: number;
    settledAt?: number;
  }>): number {
    let count = 0;
    for (const row of rows) {
      const request: SettlementRequest = {
        settlementId: row.settlementId,
        taskId: row.taskId,
        agentId: row.agentId,
        recipientAccountId: row.recipientAccountId,
        amountHbar: row.amountHbar,
        method: row.method as 'x402' | 'direct_transfer',
        state: row.state as SettlementState,
        createdAt: row.createdAt,
        settledAt: row.settledAt,
        txId: row.txId,
        x402PaymentId: row.x402PaymentId,
        error: row.error,
      };
      this.settlements.set(request.settlementId, request);
      count++;
    }
    logger.info('X402Settlement', { message: 'Rehydrated settlements from store', count });
    return count;
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  getSettlement(settlementId: string): SettlementRequest | undefined {
    return this.settlements.get(settlementId);
  }

  getSettlementByTask(taskId: string): SettlementRequest | undefined {
    for (const s of this.settlements.values()) {
      if (s.taskId === taskId) return s;
    }
    return undefined;
  }

  getStats(): SettlementStats {
    const all = Array.from(this.settlements.values());
    const settled = all.filter((s) => s.state === 'settled');
    const totalMs = settled.reduce((sum, s) => sum + ((s.settledAt ?? s.createdAt) - s.createdAt), 0);

    return {
      total: all.length,
      settled: settled.length,
      failed: all.filter((s) => s.state === 'failed').length,
      pending: all.filter((s) => s.state === 'pending' || s.state === 'processing').length,
      totalHbarPaid: settled.reduce((sum, s) => sum + s.amountHbar, 0),
      averageSettlementMs: settled.length > 0 ? totalMs / settled.length : 0,
    };
  }

  // ─── Circuit Breaker & Retry Logic ─────────────────────────────────────────

  /**
   * Generate idempotency key for settlement request
   */
  private generateIdempotencyKey(taskId: string, agentId: string, amount: number): string {
    return `idem-${taskId}-${agentId}-${amount}-${Date.now().toString().slice(0, -4)}0000`;
  }

  /**
   * Check if circuit breaker allows requests
   */
  private checkCircuitBreaker(): boolean {
    if (this.circuitBreaker.state === 'CLOSED') {
      return true;
    }

    if (this.circuitBreaker.state === 'OPEN') {
      const elapsed = Date.now() - this.circuitBreaker.lastFailure;
      if (elapsed > CIRCUIT_BREAKER_TIMEOUT) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.failures = 0;
        logger.info('X402Settlement', { message: 'Circuit breaker half-open, testing...' });
        return true;
      }
      return false;
    }

    return true; // HALF_OPEN allows one test request
  }

  /**
   * Record success in circuit breaker
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.state = 'CLOSED';
      this.circuitBreaker.failures = 0;
      logger.info('X402Settlement', { message: 'Circuit breaker closed, service restored' });
    } else {
      this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
    }
  }

  /**
   * Record failure in circuit breaker
   */
  private recordFailure(): void {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailure = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.state = 'OPEN';
      logger.error('X402Settlement', {
        message: 'Circuit breaker opened - too many failures',
        failures: this.circuitBreaker.failures,
        timeout: CIRCUIT_BREAKER_TIMEOUT,
      });
    }
  }

  /**
   * Exponential backoff delay
   */
  private async delay(attempt: number): Promise<void> {
    const delayMs = RETRY_DELAY_BASE * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  /**
   * Retry failed settlement with exponential backoff
   */
  async retrySettlement(settlementId: string): Promise<SettlementRequest | null> {
    const request = this.settlements.get(settlementId);
    if (!request || request.state === 'settled') return null;

    if ((request.retryCount || 0) >= MAX_RETRIES) {
      logger.error('X402Settlement', {
        message: 'Max retries exceeded',
        settlementId,
        retryCount: request.retryCount,
      });
      return request;
    }

    request.retryCount = (request.retryCount || 0) + 1;
    request.state = 'pending';
    request.error = undefined;

    logger.info('X402Settlement', {
      message: 'Retrying settlement',
      settlementId,
      attempt: request.retryCount,
      maxRetries: MAX_RETRIES,
    });

    await this.delay(request.retryCount - 1);

    try {
      if (request.method === 'x402') {
        await this.settleViaX402(request);
      } else {
        await this.settleViaDirectTransfer(request);
      }

      request.state = 'settled';
      request.settledAt = Date.now();
      this.recordSuccess();

      logger.info('X402Settlement', {
        message: 'Settlement retry succeeded',
        settlementId,
        attempt: request.retryCount,
      });

      await this.auditLog('payment_settled_retry', request);
      this.emit('settled', request);
    } catch (error) {
      request.error = error instanceof Error ? error.message : String(error);
      this.recordFailure();

      if (request.retryCount >= MAX_RETRIES) {
        request.state = 'failed';
        logger.error('X402Settlement', {
          message: 'Settlement retry failed permanently',
          settlementId,
          error: request.error,
        });
        this.emit('settlement_failed', request);
      }
    }

    return request;
  }

  /**
   * Process retry queue
   */
  async processRetryQueue(): Promise<number> {
    if (this.isProcessingRetries) return 0;
    this.isProcessingRetries = true;

    let processed = 0;
    const failed = this.retryQueue.filter(s => s.state === 'failed');

    for (const request of failed) {
      const result = await this.retrySettlement(request.settlementId);
      if (result?.state === 'settled') processed++;
    }

    this.retryQueue = this.retryQueue.filter(s => s.state !== 'settled');
    this.isProcessingRetries = false;

    logger.info('X402Settlement', {
      message: 'Retry queue processed',
      processed,
      remaining: this.retryQueue.length,
    });

    return processed;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): object {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      lastFailure: this.circuitBreaker.lastFailure,
      threshold: CIRCUIT_BREAKER_THRESHOLD,
      timeout: CIRCUIT_BREAKER_TIMEOUT,
    };
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.state = 'CLOSED';
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailure = 0;
    
    logger.info('X402Settlement', {
      message: 'Circuit breaker manually reset',
      newState: 'CLOSED',
    });
  }

  // ─── Audit ───────────────────────────────────────────────────────────────

  private async auditLog(type: string, request: SettlementRequest): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    const msg = JSON.stringify({
      type,
      settlementId: request.settlementId,
      taskId: request.taskId,
      agentId: request.agentId,
      amountHbar: request.amountHbar,
      method: request.method,
      state: request.state,
      txId: request.txId,
      timestamp: Date.now(),
    });

    try {
      const { hederaMaster } = await import('../../hedera/hederaMasterClass.js');
      await hederaMaster.submitMessage(auditTopicId, JSON.parse(msg), {
        maxChunkSize: 4096,
      });
      return;
    } catch (error) {
      logger.debug('X402Settlement', {
        message: 'HIP-993 audit submit unavailable, falling back to direct topic submit',
        topicId: auditTopicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const client = getClient();
      await new TopicMessageSubmitTransaction()
        .setTopicId(auditTopicId)
        .setMessage(msg)
        .execute(client);
    } catch (error) {
      logger.warn('X402Settlement', {
        message: 'Failed to write settlement audit log',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const x402Settlement = new X402SettlementHandler();
