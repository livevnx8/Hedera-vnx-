import axios from 'axios';
import EventEmitter from 'events';
import { z } from 'zod';
import { logger } from '../../monitoring/logger.js';

export interface RegistryWatcherOptions {
  topicId?: string | null;
  mirrorNodeUrl: string;
  pollIntervalMs?: number;
  maxPageSize?: number;
  staleAfterMs?: number;
}

const AgentRegistrationSchema = z.object({
  agent_id: z.string().min(1),
  service: z.string().min(1),
  fee_per_task: z.number().nonnegative().optional(),
  payment_method: z.string().optional(),
  availability: z.boolean().optional().default(true),
  proof_hash: z.string().optional(),
  creation_fee: z.object({
    method: z.enum(['hbar', 'hts']),
    amount: z.number().positive(),
    token_id: z.string().optional(),
    treasury_account: z.string().min(1),
    transaction_id: z.string().min(1),
    memo: z.string().optional(),
  }).optional(),
  metadata: z.record(z.unknown()).optional(),
  updated_at: z.number().optional(),
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;

export interface RegistryAgentRecord {
  profile: AgentRegistration;
  lastSequenceNumber: number;
  lastConsensusTimestamp: string;
  lastSeenAt: number;
  rawMessage: string;
}

export interface RegistryWatcherStats {
  topicId: string | null;
  lastPollAt: number | null;
  lastSequenceNumber: number;
  totalMessagesProcessed: number;
  activeAgents: number;
  staleAgents: number;
  errors: number;
}

export class PaymentRegistryWatcher extends EventEmitter {
  private readonly topicId: string | null;
  private readonly mirrorNodeUrl: string;
  private readonly pollIntervalMs: number;
  private readonly maxPageSize: number;
  private readonly staleAfterMs: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastSequenceNumber = 0;
  private lastPollAt: number | null = null;
  private isPolling = false;
  private errors = 0;
  private readonly agentCache = new Map<string, RegistryAgentRecord>();
  private totalMessagesProcessed = 0;

  constructor(options: RegistryWatcherOptions) {
    super();

    this.topicId = (options.topicId && options.topicId.trim().length > 0) ? options.topicId : null;
    this.mirrorNodeUrl = options.mirrorNodeUrl.replace(/\/$/, '');
    this.pollIntervalMs = options.pollIntervalMs ?? 30_000;
    this.maxPageSize = Math.max(1, Math.min(options.maxPageSize ?? 100, 250));
    this.staleAfterMs = options.staleAfterMs ?? 5 * 60_000; // default 5 minutes

    if (!this.topicId) {
      logger.warn('PaymentRegistryWatcher', { message: 'No registry topic configured; watcher will remain idle.' });
    }
  }

  start(): void {
    if (!this.topicId) return;
    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, this.pollIntervalMs);

    void this.poll();

    logger.info('PaymentRegistryWatcher', {
      message: 'Started registry watcher',
      topicId: this.topicId,
      pollIntervalMs: this.pollIntervalMs,
    });
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  getAgents(includeStale = false): RegistryAgentRecord[] {
    const now = Date.now();
    return Array.from(this.agentCache.values()).filter((record) => {
      if (includeStale) return true;
      return now - record.lastSeenAt <= this.staleAfterMs && record.profile.availability !== false;
    });
  }

  getAgentById(agentId: string): RegistryAgentRecord | undefined {
    return this.agentCache.get(agentId);
  }

  findAgentsByService(service: string, includeStale = false): RegistryAgentRecord[] {
    const normalized = service.toLowerCase();
    return this.getAgents(includeStale).filter((record) => record.profile.service.toLowerCase() === normalized);
  }

  getStats(): RegistryWatcherStats {
    const now = Date.now();
    let staleAgents = 0;
    for (const record of this.agentCache.values()) {
      if (now - record.lastSeenAt > this.staleAfterMs) staleAgents += 1;
    }

    return {
      topicId: this.topicId,
      lastPollAt: this.lastPollAt,
      lastSequenceNumber: this.lastSequenceNumber,
      totalMessagesProcessed: this.totalMessagesProcessed,
      activeAgents: this.agentCache.size,
      staleAgents,
      errors: this.errors,
    };
  }

  private async poll(): Promise<void> {
    if (!this.topicId) return;
    if (this.isPolling) return;

    this.isPolling = true;
    this.lastPollAt = Date.now();

    try {
      const url = `${this.mirrorNodeUrl}/api/v1/topics/${this.topicId}/messages?order=asc&limit=${this.maxPageSize}&sequencenumber=gt:${this.lastSequenceNumber}`;
      const { data } = await axios.get(url, { timeout: Math.max(5_000, this.pollIntervalMs - 1_000) });

      const messages: Array<{
        sequence_number: number;
        consensus_timestamp: string;
        message: string;
      }> = data?.messages ?? [];

      if (messages.length === 0) return;

      for (const message of messages) {
        this.lastSequenceNumber = Math.max(this.lastSequenceNumber, message.sequence_number);

        const decoded = Buffer.from(message.message, 'base64').toString('utf-8');
        let payload: unknown;

        try {
          payload = JSON.parse(decoded);
        } catch (error) {
          this.errors += 1;
          logger.warn('PaymentRegistryWatcher', {
            message: 'Failed to parse registry message JSON',
            error: error instanceof Error ? error.message : String(error),
            sequence: message.sequence_number,
          });
          continue;
        }

        const parsed = AgentRegistrationSchema.safeParse(payload);
        if (!parsed.success) {
          this.errors += 1;
          logger.warn('PaymentRegistryWatcher', {
            message: 'Registry message validation failed',
            sequence: message.sequence_number,
            issues: parsed.error.issues,
          });
          continue;
        }

        this.totalMessagesProcessed += 1;
        this.upsertAgent(parsed.data, message.sequence_number, message.consensus_timestamp, decoded);
      }

      this.emit('agents_updated', { count: this.agentCache.size, lastSequenceNumber: this.lastSequenceNumber });
    } catch (error) {
      this.errors += 1;
      logger.error('PaymentRegistryWatcher', {
        message: 'Polling mirror node failed',
        error: error instanceof Error ? error.message : String(error),
        topicId: this.topicId,
      });
    } finally {
      this.isPolling = false;
    }
  }

  private upsertAgent(
    profile: AgentRegistration,
    sequenceNumber: number,
    consensusTimestamp: string,
    rawMessage: string,
  ): void {
    const now = Date.now();
    const existing = this.agentCache.get(profile.agent_id);

    const record: RegistryAgentRecord = {
      profile: {
        ...existing?.profile,
        ...profile,
        availability: profile.availability ?? existing?.profile.availability ?? true,
      },
      lastSequenceNumber: sequenceNumber,
      lastConsensusTimestamp: consensusTimestamp,
      lastSeenAt: now,
      rawMessage,
    };

    this.agentCache.set(profile.agent_id, record);
    logger.debug('PaymentRegistryWatcher', {
      message: 'Agent registry updated',
      agentId: profile.agent_id,
      service: profile.service,
      sequenceNumber,
    });
  }
}
