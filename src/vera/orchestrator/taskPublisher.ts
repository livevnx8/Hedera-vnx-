import { EventEmitter } from 'events';
import { TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { getClient } from '../../hedera/tools/client.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Task lifecycle states ───────────────────────────────────────────────────

export type TaskState =
  | 'posted'
  | 'bidding'
  | 'awarded'
  | 'in_progress'
  | 'delivered'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface TaskIntent {
  taskId: string;
  description: string;
  serviceType: string;
  budget: number;          // HBAR
  requiredConfidence: number; // 0.0–1.0
  deadlineMs: number;      // absolute timestamp
  metadata?: Record<string, unknown>;
}

export interface TaskBid {
  taskId: string;
  agentId: string;
  fee: number;             // HBAR the agent charges
  confidence: number;      // self-reported 0.0–1.0
  estimatedDurationMs: number;
  timestamp: number;
}

export interface TaskRecord {
  intent: TaskIntent;
  state: TaskState;
  bids: TaskBid[];
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
  hcsSequence?: number;
}

export interface WinnerSelectionOptions {
  rankedAgentIds?: string[];
}

// ─── Publisher ───────────────────────────────────────────────────────────────

export class TaskPublisher extends EventEmitter {
  private tasks = new Map<string, TaskRecord>();

  private async submitTopicMessage(topicId: string, payload: Record<string, unknown>): Promise<number> {
    try {
      const { hederaMaster } = await import('../../hedera/hederaMasterClass.js');
      const result = await hederaMaster.submitMessage(topicId, payload, {
        maxChunkSize: 4096,
      });
      return Number(result.sequenceNumber ?? 0);
    } catch (error) {
      logger.debug('TaskPublisher', {
        message: 'HIP-993 submit unavailable, falling back to direct topic submit',
        topicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const client = getClient();
    const response = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(payload))
      .execute(client);
    const receipt = await response.getReceipt(client);
    return Number(receipt.topicSequenceNumber?.toString() ?? '0');
  }

  /** Publish a new task intent to the HCS task topic. */
  async publishTask(intent: TaskIntent): Promise<TaskRecord> {
    const topicId = config.VERA_TASK_TOPIC_ID;
    if (!topicId) {
      throw new Error('VERA_TASK_TOPIC_ID not configured – run topic provisioning first');
    }

    const record: TaskRecord = {
      intent,
      state: 'posted',
      bids: [],
      winnerId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const payload = {
      type: 'task_posted',
      ...intent,
      operator: config.HEDERA_OPERATOR_ACCOUNT_ID,
      timestamp: Date.now(),
    };

    try {
      record.hcsSequence = await this.submitTopicMessage(topicId, payload);

      logger.info('TaskPublisher', {
        message: 'Task published to HCS',
        taskId: intent.taskId,
        topicId,
        sequence: record.hcsSequence,
      });
    } catch (error) {
      logger.error('TaskPublisher', {
        message: 'Failed to publish task to HCS',
        taskId: intent.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    this.tasks.set(intent.taskId, record);
    this.emit('task_posted', record);
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordTaskPosted(record))
      .catch((error) => logger.debug('TaskPublisher', { message: 'Workflow task-post evidence failed', error: String(error) }));
    return record;
  }

  /** Record a bid received (from result-topic polling). */
  receiveBid(bid: TaskBid): boolean {
    const record = this.tasks.get(bid.taskId);
    if (!record) {
      logger.warn('TaskPublisher', { message: 'Bid for unknown task', taskId: bid.taskId });
      return false;
    }
    if (record.state !== 'posted' && record.state !== 'bidding') {
      logger.warn('TaskPublisher', { message: 'Bid for non-biddable task', taskId: bid.taskId, state: record.state });
      return false;
    }

    record.state = 'bidding';
    record.bids.push(bid);
    record.updatedAt = Date.now();
    this.emit('bid_received', { taskId: bid.taskId, bid });
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordBid(bid))
      .catch((error) => logger.debug('TaskPublisher', { message: 'Workflow bid evidence failed', error: String(error) }));
    return true;
  }

  /**
   * Select the winning bid.
   * Strategy: lowest fee among bids meeting the confidence threshold.
   */
  selectWinner(taskId: string, options: WinnerSelectionOptions = {}): TaskBid | null {
    const record = this.tasks.get(taskId);
    if (!record || record.bids.length === 0) return null;

    const eligible = record.bids.filter(
      (b) => b.confidence >= record.intent.requiredConfidence && b.fee <= record.intent.budget,
    );

    if (eligible.length === 0) return null;

    const rankedAgentIds = options.rankedAgentIds ?? [];
    const rank = new Map(rankedAgentIds.map((agentId, index) => [agentId, index]));

    eligible.sort((a, b) => {
      const rankA = rank.get(a.agentId);
      const rankB = rank.get(b.agentId);
      if (rankA !== undefined || rankB !== undefined) {
        return (rankA ?? Number.MAX_SAFE_INTEGER) - (rankB ?? Number.MAX_SAFE_INTEGER);
      }

      // Default strategy: lowest fee, then highest confidence.
      return a.fee - b.fee || b.confidence - a.confidence;
    });
    const winner = eligible[0];

    record.winnerId = winner.agentId;
    record.state = 'awarded';
    record.updatedAt = Date.now();
    this.emit('task_awarded', { taskId, winner });
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordAward(taskId, winner))
      .catch((error) => logger.debug('TaskPublisher', { message: 'Workflow award evidence failed', error: String(error) }));

    logger.info('TaskPublisher', {
      message: 'Task awarded',
      taskId,
      winnerId: winner.agentId,
      fee: winner.fee,
      confidence: winner.confidence,
    });

    return winner;
  }

  /** Advance a task to a new state. */
  advanceState(taskId: string, newState: TaskState): boolean {
    const record = this.tasks.get(taskId);
    if (!record) return false;
    record.state = newState;
    record.updatedAt = Date.now();
    this.emit('state_changed', { taskId, state: newState });
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordStateChange(taskId, newState))
      .catch((error) => logger.debug('TaskPublisher', { message: 'Workflow state evidence failed', error: String(error) }));
    return true;
  }

  /** Publish a state transition to HCS audit topic. */
  async publishStateTransition(taskId: string, newState: TaskState, extra?: Record<string, unknown>): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    const message = JSON.stringify({
      type: 'task_state_transition',
      taskId,
      newState,
      timestamp: Date.now(),
      operator: config.HEDERA_OPERATOR_ACCOUNT_ID,
      ...extra,
    });

    try {
      await this.submitTopicMessage(auditTopicId, JSON.parse(message));
    } catch (error) {
      logger.warn('TaskPublisher', {
        message: 'Failed to publish state transition to audit topic',
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getTask(taskId: string): TaskRecord | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskRecord[] {
    return Array.from(this.tasks.values());
  }

  rehydrate(records: TaskRecord[]): number {
    let count = 0;
    for (const record of records) {
      this.tasks.set(record.intent.taskId, record);
      count++;
    }
    logger.info('TaskPublisher', { message: 'Rehydrated tasks from store', count });
    return count;
  }

  getTasksByState(state: TaskState): TaskRecord[] {
    return this.getAllTasks().filter((t) => t.state === state);
  }

  getStats() {
    const all = this.getAllTasks();
    return {
      total: all.length,
      posted: all.filter((t) => t.state === 'posted').length,
      bidding: all.filter((t) => t.state === 'bidding').length,
      awarded: all.filter((t) => t.state === 'awarded').length,
      in_progress: all.filter((t) => t.state === 'in_progress').length,
      delivered: all.filter((t) => t.state === 'delivered').length,
      accepted: all.filter((t) => t.state === 'accepted').length,
      rejected: all.filter((t) => t.state === 'rejected').length,
      cancelled: all.filter((t) => t.state === 'cancelled').length,
      expired: all.filter((t) => t.state === 'expired').length,
    };
  }
}

export const taskPublisher = new TaskPublisher();
