/**
 * Vera Agent SDK v2
 *
 * A self-contained SDK for agents to interact with the Vera orchestrator.
 * Includes: task lifecycle, bidding, streaming payments, multi-currency,
 * task chains, negotiation, beacon heartbeat, and HMAC signing.
 *
 * Usage:
 *   const agent = new VeraAgentSDK({ agentId: 'my-agent', ... });
 *   await agent.connect();
 *   agent.onTask((task) => { ... });
 *   await agent.submitBid(taskId, { fee: 2, confidence: 0.9 });
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentSDKConfig {
  agentId: string;
  accountId: string;          // Hedera account ID
  capabilities: string[];     // service types this agent handles
  orchestratorUrl: string;    // HTTP base URL for Vera orchestrator
  hmacSecret?: string;        // shared secret for message signing
  heartbeatIntervalMs?: number;
  maxConcurrentTasks?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskOffer {
  taskId: string;
  description: string;
  serviceType: string;
  budget: number;
  requiredConfidence: number;
  deadlineMs: number;
  metadata?: Record<string, unknown>;
}

export interface BidParams {
  fee: number;
  confidence: number;
  estimatedDurationMs: number;
  metadata?: Record<string, unknown>;
}

export interface NegotiationOffer {
  negotiationId: string;
  taskId: string;
  requesterId: string;
  terms: { fee: number; deadline?: number; scope?: string; confidence?: number };
}

export interface TaskResult {
  taskId: string;
  result: string;
  artifacts?: Record<string, unknown>;
  confidence: number;
}

export type AgentStatus = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'error';

// ─── SDK ─────────────────────────────────────────────────────────────────────

export class VeraAgentSDK extends EventEmitter {
  private config: Required<AgentSDKConfig>;
  private status: AgentStatus = 'disconnected';
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeTasks: Set<string> = new Set();
  private registeredAt: number = 0;
  private lastHeartbeat: number = 0;

  constructor(config: AgentSDKConfig) {
    super();
    this.config = {
      hmacSecret: '',
      heartbeatIntervalMs: 30_000,
      maxConcurrentTasks: 5,
      metadata: {},
      ...config,
    };
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Register with the orchestrator and start heartbeat.
   */
  async connect(): Promise<void> {
    this.status = 'connecting';
    this.emit('status', this.status);

    try {
      const res = await this.post('/api/vera/agents/register', {
        agentId: this.config.agentId,
        accountId: this.config.accountId,
        capabilities: this.config.capabilities,
        metadata: this.config.metadata,
      });

      if (!res.ok) {
        throw new Error(`Registration failed: ${res.status}`);
      }

      this.registeredAt = Date.now();
      this.status = 'connected';
      this.emit('status', this.status);
      this.emit('connected');

      // Start heartbeat
      this.startHeartbeat();

      // Start polling for tasks
      this.startTaskPoller();

      logger.info('VeraAgentSDK', {
        message: 'Agent connected',
        agentId: this.config.agentId,
        capabilities: this.config.capabilities,
      });
    } catch (error) {
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from the orchestrator.
   */
  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.heartbeatTimer = null;
    this.pollTimer = null;
    this.status = 'disconnected';
    this.emit('status', this.status);
    this.emit('disconnected');
    logger.info('VeraAgentSDK', { message: 'Agent disconnected', agentId: this.config.agentId });
  }

  // ── Task Operations ──────────────────────────────────────────────────────

  /**
   * Submit a bid for a task.
   */
  async submitBid(taskId: string, params: BidParams): Promise<boolean> {
    const body = this.signPayload({
      taskId,
      agentId: this.config.agentId,
      fee: params.fee,
      confidence: params.confidence,
      estimatedDurationMs: params.estimatedDurationMs,
      metadata: params.metadata,
    });

    const res = await this.post(`/api/vera/tasks/${taskId}/bid`, body);
    if (res.ok) {
      logger.info('VeraAgentSDK', { message: 'Bid submitted', taskId, fee: params.fee });
      return true;
    }
    return false;
  }

  /**
   * Submit a completed result for a task.
   */
  async submitResult(result: TaskResult): Promise<boolean> {
    const body = this.signPayload({
      taskId: result.taskId,
      agentId: this.config.agentId,
      result: result.result,
      artifacts: result.artifacts,
      confidence: result.confidence,
    });

    const res = await this.post(`/api/vera/tasks/${result.taskId}/result`, body);
    if (res.ok) {
      this.activeTasks.delete(result.taskId);
      if (this.activeTasks.size < this.config.maxConcurrentTasks) {
        this.status = 'connected';
        this.emit('status', this.status);
      }
      logger.info('VeraAgentSDK', { message: 'Result submitted', taskId: result.taskId });
      return true;
    }
    return false;
  }

  // ── Negotiation ──────────────────────────────────────────────────────────

  /**
   * Respond to a negotiation with a counter-offer.
   */
  async counterOffer(
    negotiationId: string,
    terms: { fee: number; deadline?: number; scope?: string },
  ): Promise<boolean> {
    const res = await this.post(`/api/vera/negotiations/${negotiationId}/counter`, {
      fromId: this.config.agentId,
      terms,
    });
    return res.ok;
  }

  /**
   * Accept a negotiation's current terms.
   */
  async acceptNegotiation(negotiationId: string): Promise<boolean> {
    const res = await this.post(`/api/vera/negotiations/${negotiationId}/accept`, {
      fromId: this.config.agentId,
    });
    return res.ok;
  }

  /**
   * Reject a negotiation.
   */
  async rejectNegotiation(negotiationId: string, reason?: string): Promise<boolean> {
    const res = await this.post(`/api/vera/negotiations/${negotiationId}/reject`, {
      fromId: this.config.agentId,
      reason,
    });
    return res.ok;
  }

  // ── Streaming Payments ───────────────────────────────────────────────────

  /**
   * Check if a streaming payment is active for a task.
   */
  async getStreamStatus(taskId: string): Promise<Record<string, unknown> | null> {
    const res = await this.get(`/api/vera/streams`);
    if (!res.ok) return null;
    const data = await res.json();
    const active = (data.active as Array<Record<string, unknown>>) || [];
    return active.find((s: any) => s.taskId === taskId) || null;
  }

  // ── Chain Participation ──────────────────────────────────────────────────

  /**
   * Get chains this agent is participating in.
   */
  async getActiveChains(): Promise<Record<string, unknown>> {
    const res = await this.get('/api/vera/chains');
    if (!res.ok) return { active: [], stats: {} };
    return res.json();
  }

  // ── Query ────────────────────────────────────────────────────────────────

  /**
   * Get orchestrator stats.
   */
  async getStats(): Promise<Record<string, unknown>> {
    const res = await this.get('/api/vera/stats');
    if (!res.ok) return {};
    return res.json();
  }

  /**
   * Get own reputation.
   */
  async getReputation(): Promise<Record<string, unknown> | null> {
    const res = await this.get(`/api/vera/reputation/${this.config.agentId}`);
    if (!res.ok) return null;
    return res.json();
  }

  /**
   * Get a fiat payment quote (for agents that accept fiat).
   */
  async getFiatQuote(amount: number, currency = 'USD'): Promise<Record<string, unknown> | null> {
    const res = await this.post('/api/vera/fiat/quote', { amount, currency });
    if (!res.ok) return null;
    return res.json();
  }

  // ── HMAC Signing ─────────────────────────────────────────────────────────

  /**
   * Sign a payload with HMAC for secure HCS message submission.
   */
  signPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (!this.config.hmacSecret) return payload;

    const timestamp = Date.now();
    const data = `${this.config.agentId}:${timestamp}:${JSON.stringify(payload)}`;
    const signature = crypto
      .createHmac('sha256', this.config.hmacSecret)
      .update(data)
      .digest('hex');

    return {
      ...payload,
      _ts: timestamp,
      _sig: signature,
    };
  }

  // ── Status ───────────────────────────────────────────────────────────────

  getStatus(): {
    agentId: string;
    status: AgentStatus;
    activeTasks: number;
    maxConcurrentTasks: number;
    uptime: number;
    lastHeartbeat: number;
  } {
    return {
      agentId: this.config.agentId,
      status: this.status,
      activeTasks: this.activeTasks.size,
      maxConcurrentTasks: this.config.maxConcurrentTasks,
      uptime: this.registeredAt > 0 ? Date.now() - this.registeredAt : 0,
      lastHeartbeat: this.lastHeartbeat,
    };
  }

  // ── Event Handlers (sugar) ───────────────────────────────────────────────

  /**
   * Register a handler for incoming task offers.
   */
  onTask(handler: (task: TaskOffer) => void): void {
    this.on('task_offer', handler);
  }

  /**
   * Register a handler for task awards (you won the bid).
   */
  onAwarded(handler: (data: { taskId: string }) => void): void {
    this.on('task_awarded', handler);
  }

  /**
   * Register a handler for negotiation offers.
   */
  onNegotiation(handler: (offer: NegotiationOffer) => void): void {
    this.on('negotiation_offer', handler);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.post('/api/vera/agents/heartbeat', {
          agentId: this.config.agentId,
          activeTasks: this.activeTasks.size,
          status: this.status,
        });
        this.lastHeartbeat = Date.now();
      } catch (error) {
        logger.warn('VeraAgentSDK', {
          message: 'Heartbeat failed',
          agentId: this.config.agentId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.heartbeatIntervalMs);
  }

  private startTaskPoller(): void {
    // Poll for tasks matching our capabilities every 5 seconds
    this.pollTimer = setInterval(async () => {
      if (this.activeTasks.size >= this.config.maxConcurrentTasks) return;

      try {
        const res = await this.get('/api/vera/tasks?state=bidding');
        if (!res.ok) return;

        const data = await res.json() as { tasks?: TaskOffer[] };
        const tasks = data.tasks || [];

        for (const task of tasks) {
          if (this.config.capabilities.includes(task.serviceType)) {
            this.emit('task_offer', task);
          }
        }
      } catch {
        // Silent — polling failure is non-critical
      }
    }, 5_000);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${this.config.orchestratorUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async get(path: string): Promise<Response> {
    return fetch(`${this.config.orchestratorUrl}${path}`);
  }
}

export default VeraAgentSDK;
