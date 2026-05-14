/**
 * Vera x402 Settlement Hardening
 * Enhanced settlement handler with circuit breaker, retries, and idempotency
 */

import { EventEmitter } from 'events';
import axios from 'axios';
import type { SettlementRequest, SettlementStats, Currency } from '../types/index.js';
import { logger } from '../../monitoring/logger.js';
import { config } from '../../config.js';
import { economicField } from '../lattice/fields/EconomicField.js';
import { latticeOrchestrator } from '../orchestrator/latticeIntegration.js';

// ─────────────────────────────────────────────────────────────────────────────
// Circuit Breaker Implementation
// ─────────────────────────────────────────────────────────────────────────────

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: number;
  private nextAttempt?: number;

  constructor(
    private readonly name: string,
    private readonly failureThreshold = 5,
    private readonly successThreshold = 3,
    private readonly timeoutMs = 60_000,
    private readonly resetTimeoutMs = 300_000 // 5 minutes
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < (this.nextAttempt || 0)) {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
      this.state = 'HALF_OPEN';
      logger.info('CircuitBreaker', { message: 'HALF_OPEN', name: this.name });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.reset();
        logger.info('CircuitBreaker', { message: 'CLOSED', name: this.name });
      }
    } else {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeoutMs;
      this.successCount = 0;
      logger.warn('CircuitBreaker', { 
        message: 'OPEN', 
        name: this.name, 
        failureCount: this.failureCount,
        nextAttempt: this.nextAttempt 
      });
    }
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = undefined;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Enhanced x402 Settlement Handler
// ─────────────────────────────────────────────────────────────────────────────

export interface EnhancedSettlementConfig {
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
  idempotencyWindowMs: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
  supportedCurrencies: Currency[];
}

export const DEFAULT_SETTLEMENT_CONFIG: EnhancedSettlementConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  retryBackoffMultiplier: 2,
  maxRetryDelayMs: 30_000,
  timeoutMs: 30_000,
  idempotencyWindowMs: 5 * 60_000, // 5 minutes
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeoutMs: 300_000, // 5 minutes
  supportedCurrencies: ['HBAR', 'USDC', 'DOVU'],
};

export class EnhancedX402Settlement extends EventEmitter {
  private settlements = new Map<string, SettlementRequest>();
  private idempotencyKeys = new Map<string, number>(); // key -> expiry timestamp
  private circuitBreaker: CircuitBreaker;
  private config: EnhancedSettlementConfig;

  private readonly x402BaseUrl: string | null;
  private readonly x402ApiKey: string | null;
  private readonly x402Facilitator: string | null;

  constructor(customConfig?: Partial<EnhancedSettlementConfig>) {
    super();
    this.config = { ...DEFAULT_SETTLEMENT_CONFIG, ...customConfig };
    
    this.x402BaseUrl = config.X402_BASE_URL || null;
    this.x402ApiKey = config.X402_API_KEY || null;
    this.x402Facilitator = config.X402_FACILITATOR_ACCOUNT || null;

    this.circuitBreaker = new CircuitBreaker(
      'x402-api',
      this.config.circuitBreakerThreshold,
      3, // success threshold
      this.config.circuitBreakerTimeoutMs,
      this.config.circuitBreakerTimeoutMs
    );

    // Start cleanup timer for idempotency keys
    setInterval(() => this.cleanupIdempotencyKeys(), 60_000);
  }

  /**
   * Settle a payment with full retry and circuit breaker protection
   */
  async settle(
    taskId: string,
    agentId: string,
    recipientAccountId: string,
    amount: number,
    currency: Currency = 'HBAR',
    customSettlementId?: string
  ): Promise<SettlementRequest> {
    const settlementId = customSettlementId || `stl-${taskId}-${Date.now()}`;
    const idempotencyKey = `idl-${settlementId}`;

    // Check for duplicate request
    if (this.isDuplicateRequest(idempotencyKey)) {
      const existing = this.settlements.get(settlementId);
      if (existing) {
        logger.info('EnhancedX402Settlement', {
          message: 'Duplicate settlement request detected, returning existing',
          settlementId,
          taskId,
        });
        return existing;
      }
    }

    // Record idempotency key
    this.idempotencyKeys.set(
      idempotencyKey,
      Date.now() + this.config.idempotencyWindowMs
    );

    const request: SettlementRequest = {
      settlementId,
      taskId,
      agentId,
      recipientAccountId,
      amountHbar: currency === 'HBAR' ? amount : 0,
      amountToken: currency !== 'HBAR' ? amount : undefined,
      currency,
      method: this.x402BaseUrl ? 'x402' : 'direct_transfer',
      state: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    };

    this.settlements.set(settlementId, request);

    // Execute with retry logic
    const result = await this.executeWithRetry(request);
    return result;
  }

  /**
   * Execute settlement with exponential backoff retry
   */
  private async executeWithRetry(request: SettlementRequest): Promise<SettlementRequest> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        request.state = 'processing';
        request.retryCount = attempt;

        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info('EnhancedX402Settlement', {
            message: `Retry attempt ${attempt}/${this.config.maxRetries}`,
            settlementId: request.settlementId,
            delayMs: delay,
          });
          await this.sleep(delay);
        }

        // Execute settlement
        if (request.method === 'x402') {
          await this.settleViaX402WithCircuitBreaker(request);
        } else {
          await this.settleViaDirectTransfer(request);
        }

        // Success
        request.state = 'settled';
        request.settledAt = Date.now();

        logger.info('EnhancedX402Settlement', {
          message: 'Payment settled successfully',
          settlementId: request.settlementId,
          taskId: request.taskId,
          attempts: attempt + 1,
          duration: request.settledAt - request.createdAt,
        });

        await this.auditLog('payment_settled', request);
        this.emit('settled', request);
        void import('../workflows/marketplaceWorkflowBridge.js')
          .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordSettlement(request))
          .catch((error) => logger.debug('EnhancedX402Settlement', { message: 'Workflow settlement evidence failed', error: String(error) }));
        return request;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          logger.error('EnhancedX402Settlement', {
            message: 'Non-retryable error, failing settlement',
            settlementId: request.settlementId,
            error: lastError.message,
          });
          break;
        }

        logger.warn('EnhancedX402Settlement', {
          message: `Settlement attempt ${attempt + 1} failed, will retry`,
          settlementId: request.settlementId,
          error: lastError.message,
          remainingRetries: this.config.maxRetries - attempt,
        });
      }
    }

    // All retries exhausted
    request.state = 'failed';
    request.error = lastError?.message || 'All retry attempts failed';

    logger.error('EnhancedX402Settlement', {
      message: 'Settlement failed after all retries',
      settlementId: request.settlementId,
      totalAttempts: request.retryCount + 1,
      finalError: request.error,
    });

    await this.auditLog('payment_failed', request);
    this.emit('settlement_failed', request);
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordSettlement(request))
      .catch((error) => logger.debug('EnhancedX402Settlement', { message: 'Workflow settlement evidence failed', error: String(error) }));
    return request;
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.config.retryDelayMs * 
      Math.pow(this.config.retryBackoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on network errors, timeouts, 5xx errors
      if (message.includes('timeout') || 
          message.includes('network') || 
          message.includes('connection') ||
          message.includes('econnrefused') ||
          message.includes('5') || // 5xx status codes
          message.includes('circuit breaker')) {
        return true;
      }
      // Don't retry on 4xx client errors (bad request, auth failed, etc)
      if (message.includes('400') || 
          message.includes('401') || 
          message.includes('403') ||
          message.includes('404')) {
        return false;
      }
    }
    return true; // Default to retryable
  }

  /**
   * x402 settlement with circuit breaker protection
   */
  private async settleViaX402WithCircuitBreaker(request: SettlementRequest): Promise<void> {
    if (!this.config.enableCircuitBreaker) {
      return this.settleViaX402(request);
    }

    return this.circuitBreaker.execute(() => this.settleViaX402(request));
  }

  /**
   * Core x402 settlement logic
   */
  private async settleViaX402(request: SettlementRequest): Promise<void> {
    if (!this.x402BaseUrl || !this.x402ApiKey) {
      throw new Error('x402 credentials not configured');
    }

    const payload = {
      recipientAccountId: request.recipientAccountId,
      amount: request.amountHbar || request.amountToken,
      currency: request.currency,
      memo: `Vera task payment: ${request.taskId}`,
      facilitatorAccount: this.x402Facilitator,
      idempotencyKey: request.settlementId,
      metadata: {
        taskId: request.taskId,
        agentId: request.agentId,
        settlementId: request.settlementId,
        retryCount: request.retryCount,
      },
    };

    const response = await axios.post(`${this.x402BaseUrl}/payments`, payload, {
      headers: {
        'Authorization': `Bearer ${this.x402ApiKey}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': request.settlementId,
      },
      timeout: this.config.timeoutMs,
    });

    if (response.data?.paymentId) {
      request.x402PaymentId = response.data.paymentId;
      request.txId = response.data.transactionId || response.data.paymentId;
    } else {
      throw new Error(`x402 response missing paymentId: ${JSON.stringify(response.data)}`);
    }
  }

  /**
   * Direct Hedera transfer fallback
   */
  private async settleViaDirectTransfer(request: SettlementRequest): Promise<void> {
    // Import dynamically to avoid circular dependencies
    const { getClient } = await import('../../hedera/tools/client.js');
    const { TransferTransaction, Hbar } = await import('@hashgraph/sdk');

    const payerAccountId = config.HEDERA_OPERATOR_ACCOUNT_ID;
    if (!payerAccountId) {
      throw new Error('HEDERA_OPERATOR_ACCOUNT_ID not configured');
    }

    const client = getClient();
    const amount = request.amountHbar;

    const resp = await new TransferTransaction()
      .addHbarTransfer(payerAccountId, new Hbar(-amount))
      .addHbarTransfer(request.recipientAccountId, new Hbar(amount))
      .setTransactionMemo(`Vera: ${request.taskId}`)
      .execute(client);

    request.txId = resp.transactionId.toString();
  }

  /**
   * Check for duplicate request (idempotency)
   */
  private isDuplicateRequest(key: string): boolean {
    const expiry = this.idempotencyKeys.get(key);
    if (!expiry) return false;
    
    if (Date.now() > expiry) {
      this.idempotencyKeys.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Cleanup expired idempotency keys
   */
  private cleanupIdempotencyKeys(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, expiry] of this.idempotencyKeys.entries()) {
      if (now > expiry) {
        this.idempotencyKeys.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug('EnhancedX402Settlement', {
        message: 'Cleaned up idempotency keys',
        count: cleaned,
      });
    }
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset circuit breaker (manual override)
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker = new CircuitBreaker(
      'x402-api',
      this.config.circuitBreakerThreshold,
      3,
      this.config.circuitBreakerTimeoutMs,
      this.config.circuitBreakerTimeoutMs
    );
    logger.info('EnhancedX402Settlement', { message: 'Circuit breaker reset' });
  }

  /**
   * Get all settlements
   */
  getSettlements(): SettlementRequest[] {
    return Array.from(this.settlements.values());
  }

  /**
   * Get settlement by ID
   */
  getSettlement(settlementId: string): SettlementRequest | undefined {
    return this.settlements.get(settlementId);
  }

  /**
   * Get settlement by task ID
   */
  getSettlementByTask(taskId: string): SettlementRequest | undefined {
    for (const settlement of this.settlements.values()) {
      if (settlement.taskId === taskId) {
        return settlement;
      }
    }
    return undefined;
  }

  /**
   * Get settlement statistics
   */
  getStats(): SettlementStats {
    const all = Array.from(this.settlements.values());
    const settled = all.filter((s) => s.state === 'settled');
    const failed = all.filter((s) => s.state === 'failed');
    const pending = all.filter((s) => s.state === 'pending' || s.state === 'processing');
    
    const totalMs = settled.reduce((sum, s) => {
      const duration = (s.settledAt ?? s.createdAt) - s.createdAt;
      return sum + duration;
    }, 0);

    return {
      total: all.length,
      settled: settled.length,
      failed: failed.length,
      pending: pending.length,
      totalHbarPaid: settled.filter(s => s.currency === 'HBAR').reduce((sum, s) => sum + s.amountHbar, 0),
      totalTokensPaid: settled.filter(s => s.currency !== 'HBAR').reduce((sum, s) => sum + (s.amountToken || 0), 0),
      averageSettlementMs: settled.length > 0 ? totalMs / settled.length : 0,
      successRate: all.length > 0 ? settled.length / all.length : 0,
    };
  }

  /**
   * Query economic field before settlement to validate agent worthiness
   */
  async validateAgentForPayment(
    agentId: string,
    amount: number,
    currency: Currency
  ): Promise<{
    valid: boolean;
    economicScore: number;
    reason?: string;
  }> {
    const score = economicField.scoreAgentPaymentCapability(agentId);
    const reliability = economicField.assessSettlementReliability(agentId);

    // Minimum thresholds
    if (score.overallScore < 0.3) {
      return {
        valid: false,
        economicScore: score.overallScore,
        reason: `Agent economic score too low: ${score.overallScore.toFixed(2)}`
      };
    }

    if (reliability < 0.5) {
      return {
        valid: false,
        economicScore: score.overallScore,
        reason: `Agent reliability too low: ${reliability.toFixed(2)}`
      };
    }

    // Check if agent supports currency
    const supportsCurrency = score.preferredCurrencies?.includes(currency) ?? false;
    if (!supportsCurrency && score.preferredCurrencies && score.preferredCurrencies.length > 0) {
      return {
        valid: false,
        economicScore: score.overallScore,
        reason: `Agent does not support ${currency}. Supported: ${score.preferredCurrencies.join(', ')}`
      };
    }

    return {
      valid: true,
      economicScore: score.overallScore
    };
  }

  /**
   * Post-settlement coherence check
   */
  async postSettlementCoherenceCheck(
    settlementId: string
  ): Promise<{
    coherent: boolean;
    issues: string[];
  }> {
    const settlement = this.settlements.get(settlementId);
    if (!settlement) {
      return { coherent: false, issues: ['settlement_not_found'] };
    }

    const issues: string[] = [];

    // Record in economic field
    const duration = settlement.settledAt 
      ? settlement.settledAt - settlement.createdAt 
      : Date.now() - settlement.createdAt;

    economicField.recordSettlement(
      settlement.agentId,
      settlement.amountHbar || settlement.amountToken || 0,
      settlement.currency,
      settlement.state === 'settled',
      duration
    );

    // Record in lattice orchestrator
    latticeOrchestrator.recordSettlementOutcome(
      settlement.agentId,
      settlement.taskId,
      settlement.amountHbar || settlement.amountToken || 0,
      settlement.currency,
      settlement.state === 'settled',
      duration
    );

    // Check coherence
    const economicScore = economicField.scoreAgentPaymentCapability(settlement.agentId);
    
    if (settlement.state === 'settled' && economicScore.paymentReliability < 0.5) {
      issues.push('high_reliability_agent_had_settlement');
    }

    if (duration > 60000 && settlement.state === 'settled') {
      issues.push('slow_settlement_for_successful_agent');
    }

    this.emit('post_settlement_coherence', {
      settlementId,
      coherent: issues.length === 0,
      issues,
      economicScore: economicScore.overallScore
    });

    return {
      coherent: issues.length === 0,
      issues
    };
  }

  /**
   * Get agent payment history from lattice
   */
  getAgentPaymentHistory(agentId: string) {
    return economicField['agentPaymentHistories'].get(agentId);
  }

  /**
   * Rehydrate in-memory settlements from persisted SQLite rows.
   * Drop-in compatible with X402SettlementHandler.rehydrate().
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
        currency: 'HBAR',
        method: row.method as SettlementRequest['method'],
        state: row.state as SettlementRequest['state'],
        createdAt: row.createdAt,
        settledAt: row.settledAt,
        txId: row.txId,
        x402PaymentId: row.x402PaymentId,
        error: row.error,
        retryCount: 0,
      };
      this.settlements.set(request.settlementId, request);
      count++;
    }
    logger.info('EnhancedX402Settlement', { message: 'Rehydrated settlements from store', count });
    return count;
  }

  /**
   * Write settlement audit log to HCS audit topic
   */
  private async auditLog(type: string, request: SettlementRequest): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    const msg = JSON.stringify({
      type,
      settlementId: request.settlementId,
      taskId: request.taskId,
      agentId: request.agentId,
      amountHbar: request.amountHbar,
      currency: request.currency,
      method: request.method,
      state: request.state,
      txId: request.txId,
      timestamp: Date.now(),
    });

    try {
      const { getClient } = await import('../../hedera/tools/client.js');
      const { TopicMessageSubmitTransaction } = await import('@hashgraph/sdk');
      const client = getClient();
      await new TopicMessageSubmitTransaction()
        .setTopicId(auditTopicId)
        .setMessage(msg)
        .execute(client);
    } catch (error) {
      logger.warn('EnhancedX402Settlement', {
        message: 'Failed to write settlement audit log',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const enhancedSettlement = new EnhancedX402Settlement();
export default enhancedSettlement;
