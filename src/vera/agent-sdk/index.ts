import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import axios from 'axios';
import { getClient } from '../../hedera/tools/client.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgentProfile {
  agentId: string;
  service: string;
  feePerTask?: number;
  paymentMethod?: string;
  availability?: boolean;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskPost {
  taskId: string;
  description: string;
  serviceType: string;
  budget: number;
  requiredConfidence: number;
  deadlineMs: number;
  timestamp: number;
}

export interface BidSubmission {
  taskId: string;
  agentId: string;
  fee: number;
  confidence: number;
  estimatedDurationMs?: number;
}

export interface ResultSubmission {
  taskId: string;
  agentId: string;
  result: unknown;
  confidence: number;
  proofHash?: string;
  durationMs?: number;
}

// ─── Agent SDK ───────────────────────────────────────────────────────────────

export class VeraAgentSDK {
  private mirrorNodeUrl: string;
  private registryTopicId: string;
  private taskTopicId: string;
  private resultTopicId: string;
  private lastTaskSequence = 0;

  constructor(options: {
    registryTopicId: string;
    taskTopicId: string;
    resultTopicId: string;
    mirrorNodeUrl?: string;
  }) {
    this.registryTopicId = options.registryTopicId;
    this.taskTopicId = options.taskTopicId;
    this.resultTopicId = options.resultTopicId;
    this.mirrorNodeUrl = options.mirrorNodeUrl ?? config.MIRROR_NODE_BASE_URL ?? 'https://mainnet-public.mirrornode.hedera.com';
  }

  // ─── Registration ─────────────────────────────────────────────────────────

  /**
   * Register this agent on the HCS registry topic.
   */
  async registerAgent(profile: AgentProfile): Promise<{ sequenceNumber: number }> {
    const message = JSON.stringify({
      type: 'agent_register',
      agent_id: profile.agentId,
      service: profile.service,
      fee_per_task: profile.feePerTask ?? 0,
      payment_method: profile.paymentMethod ?? 'direct_transfer',
      availability: profile.availability ?? true,
      account_id: profile.accountId,
      metadata: profile.metadata,
      updated_at: Date.now(),
    });

    const client = getClient();
    const resp = await new TopicMessageSubmitTransaction()
      .setTopicId(this.registryTopicId)
      .setMessage(message)
      .execute(client);
    const receipt = await resp.getReceipt(client);
    const sequenceNumber = Number(receipt.topicSequenceNumber?.toString() ?? '0');

    logger.info('AgentSDK', {
      message: 'Agent registered',
      agentId: profile.agentId,
      service: profile.service,
      sequence: sequenceNumber,
    });

    return { sequenceNumber };
  }

  // ─── Task Subscription ────────────────────────────────────────────────────

  /**
   * Poll the task topic for new task posts.
   * Returns tasks posted since the last poll.
   */
  async subscribeTasks(filter?: {
    serviceType?: string;
    minBudget?: number;
  }): Promise<TaskPost[]> {
    const url = `${this.mirrorNodeUrl}/api/v1/topics/${this.taskTopicId}/messages?order=asc&limit=100&sequencenumber=gt:${this.lastTaskSequence}`;

    const { data } = await axios.get(url, { timeout: 10_000 });
    const messages: Array<{ sequence_number: number; message: string }> = data?.messages ?? [];

    const tasks: TaskPost[] = [];

    for (const msg of messages) {
      this.lastTaskSequence = Math.max(this.lastTaskSequence, msg.sequence_number);

      try {
        const decoded = Buffer.from(msg.message, 'base64').toString('utf-8');
        const payload = JSON.parse(decoded);

        if (payload.type !== 'task_posted') continue;

        const task: TaskPost = {
          taskId: payload.taskId,
          description: payload.description,
          serviceType: payload.serviceType,
          budget: payload.budget,
          requiredConfidence: payload.requiredConfidence,
          deadlineMs: payload.deadlineMs,
          timestamp: payload.timestamp ?? Date.now(),
        };

        // Apply filters
        if (filter?.serviceType && task.serviceType !== filter.serviceType) continue;
        if (filter?.minBudget && task.budget < filter.minBudget) continue;

        tasks.push(task);
      } catch {
        continue;
      }
    }

    return tasks;
  }

  // ─── Bid Submission ───────────────────────────────────────────────────────

  /**
   * Submit a bid for a task via the HCS result topic.
   */
  async submitBid(bid: BidSubmission): Promise<void> {
    const message = JSON.stringify({
      type: 'bid',
      taskId: bid.taskId,
      agentId: bid.agentId,
      fee: bid.fee,
      confidence: bid.confidence,
      estimatedDurationMs: bid.estimatedDurationMs ?? 60_000,
      timestamp: Date.now(),
    });

    const client = getClient();
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.resultTopicId)
      .setMessage(message)
      .execute(client);

    logger.info('AgentSDK', {
      message: 'Bid submitted',
      taskId: bid.taskId,
      agentId: bid.agentId,
      fee: bid.fee,
    });
  }

  // ─── Result Submission ────────────────────────────────────────────────────

  /**
   * Submit a task result via the HCS result topic.
   */
  async submitResult(result: ResultSubmission): Promise<void> {
    const message = JSON.stringify({
      type: 'result',
      taskId: result.taskId,
      agentId: result.agentId,
      result: result.result,
      confidence: result.confidence,
      proofHash: result.proofHash,
      durationMs: result.durationMs,
      timestamp: Date.now(),
    });

    const client = getClient();
    await new TopicMessageSubmitTransaction()
      .setTopicId(this.resultTopicId)
      .setMessage(message)
      .execute(client);

    logger.info('AgentSDK', {
      message: 'Result submitted',
      taskId: result.taskId,
      agentId: result.agentId,
    });
  }
}
