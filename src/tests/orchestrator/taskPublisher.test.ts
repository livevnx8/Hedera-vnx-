import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskPublisher, type TaskIntent, type TaskBid } from '../../vera/orchestrator/taskPublisher.js';

// Mock Hedera SDK and dependencies so tests run without network
vi.mock('@hashgraph/sdk', () => ({
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({
      getReceipt: vi.fn().mockResolvedValue({ topicSequenceNumber: { toString: () => '42' } }),
      transactionId: { toString: () => '0.0.123@1234567890.000' },
    }),
  })),
}));

vi.mock('../../hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../config.js', () => ({
  config: {
    VERA_TASK_TOPIC_ID: '0.0.99999',
    VERA_AUDIT_TOPIC_ID: '0.0.99998',
    HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
  },
}));

vi.mock('../../monitoring/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makeIntent(overrides?: Partial<TaskIntent>): TaskIntent {
  return {
    taskId: `task-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    description: 'Test task',
    serviceType: 'carbon-verification',
    budget: 5,
    requiredConfidence: 0.7,
    deadlineMs: Date.now() + 300_000,
    ...overrides,
  };
}

function makeBid(taskId: string, overrides?: Partial<TaskBid>): TaskBid {
  return {
    taskId,
    agentId: `agent-${Math.random().toString(36).slice(2, 5)}`,
    fee: 2,
    confidence: 0.85,
    estimatedDurationMs: 10_000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('TaskPublisher', () => {
  let publisher: TaskPublisher;

  beforeEach(() => {
    publisher = new TaskPublisher();
  });

  // ─── publishTask ──────────────────────────────────────────────────────────

  describe('publishTask', () => {
    it('should create a task record in posted state', async () => {
      const intent = makeIntent({ taskId: 'task-pub-1' });
      const record = await publisher.publishTask(intent);

      expect(record.state).toBe('posted');
      expect(record.intent.taskId).toBe('task-pub-1');
      expect(record.bids).toEqual([]);
      expect(record.winnerId).toBeNull();
      expect(record.hcsSequence).toBe(42);
    });

    it('should store the task for later retrieval', async () => {
      const intent = makeIntent({ taskId: 'task-pub-2' });
      await publisher.publishTask(intent);

      const found = publisher.getTask('task-pub-2');
      expect(found).toBeDefined();
      expect(found!.intent.description).toBe('Test task');
    });

    it('should emit task_posted event', async () => {
      const handler = vi.fn();
      publisher.on('task_posted', handler);

      const intent = makeIntent({ taskId: 'task-pub-3' });
      await publisher.publishTask(intent);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].intent.taskId).toBe('task-pub-3');
    });
  });

  // ─── receiveBid ───────────────────────────────────────────────────────────

  describe('receiveBid', () => {
    it('should accept bids on posted tasks', async () => {
      const intent = makeIntent({ taskId: 'task-bid-1' });
      await publisher.publishTask(intent);

      const bid = makeBid('task-bid-1');
      const accepted = publisher.receiveBid(bid);

      expect(accepted).toBe(true);
      const task = publisher.getTask('task-bid-1')!;
      expect(task.state).toBe('bidding');
      expect(task.bids).toHaveLength(1);
    });

    it('should accept bids on bidding tasks', async () => {
      const intent = makeIntent({ taskId: 'task-bid-2' });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-bid-2', { agentId: 'a1' }));
      const accepted = publisher.receiveBid(makeBid('task-bid-2', { agentId: 'a2' }));

      expect(accepted).toBe(true);
      expect(publisher.getTask('task-bid-2')!.bids).toHaveLength(2);
    });

    it('should reject bids for unknown tasks', () => {
      const bid = makeBid('nonexistent');
      expect(publisher.receiveBid(bid)).toBe(false);
    });

    it('should reject bids on awarded tasks', async () => {
      const intent = makeIntent({ taskId: 'task-bid-3' });
      await publisher.publishTask(intent);
      publisher.advanceState('task-bid-3', 'awarded');

      expect(publisher.receiveBid(makeBid('task-bid-3'))).toBe(false);
    });

    it('should emit bid_received event', async () => {
      const handler = vi.fn();
      publisher.on('bid_received', handler);

      const intent = makeIntent({ taskId: 'task-bid-4' });
      await publisher.publishTask(intent);
      publisher.receiveBid(makeBid('task-bid-4', { agentId: 'agent-x' }));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].bid.agentId).toBe('agent-x');
    });
  });

  // ─── selectWinner ─────────────────────────────────────────────────────────

  describe('selectWinner', () => {
    it('should select the lowest-fee eligible bid', async () => {
      const intent = makeIntent({ taskId: 'task-win-1', budget: 10, requiredConfidence: 0.7 });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-win-1', { agentId: 'expensive', fee: 8, confidence: 0.9 }));
      publisher.receiveBid(makeBid('task-win-1', { agentId: 'cheap', fee: 3, confidence: 0.8 }));
      publisher.receiveBid(makeBid('task-win-1', { agentId: 'mid', fee: 5, confidence: 0.85 }));

      const winner = publisher.selectWinner('task-win-1');

      expect(winner).not.toBeNull();
      expect(winner!.agentId).toBe('cheap');
      expect(publisher.getTask('task-win-1')!.state).toBe('awarded');
      expect(publisher.getTask('task-win-1')!.winnerId).toBe('cheap');
    });

    it('should break ties by highest confidence', async () => {
      const intent = makeIntent({ taskId: 'task-win-2', budget: 10, requiredConfidence: 0.5 });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-win-2', { agentId: 'a', fee: 3, confidence: 0.7 }));
      publisher.receiveBid(makeBid('task-win-2', { agentId: 'b', fee: 3, confidence: 0.9 }));

      const winner = publisher.selectWinner('task-win-2');
      expect(winner!.agentId).toBe('b');
    });

    it('should honor pre-ranked reputation/lattice order for eligible bids', async () => {
      const intent = makeIntent({ taskId: 'task-win-ranked', budget: 10, requiredConfidence: 0.5 });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-win-ranked', { agentId: 'cheap', fee: 1, confidence: 0.8 }));
      publisher.receiveBid(makeBid('task-win-ranked', { agentId: 'best', fee: 5, confidence: 0.95 }));

      const winner = publisher.selectWinner('task-win-ranked', { rankedAgentIds: ['best', 'cheap'] });

      expect(winner!.agentId).toBe('best');
      expect(publisher.getTask('task-win-ranked')!.winnerId).toBe('best');
    });

    it('should reject bids below confidence threshold', async () => {
      const intent = makeIntent({ taskId: 'task-win-3', budget: 10, requiredConfidence: 0.9 });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-win-3', { agentId: 'low', fee: 1, confidence: 0.5 }));

      const winner = publisher.selectWinner('task-win-3');
      expect(winner).toBeNull();
    });

    it('should reject bids exceeding budget', async () => {
      const intent = makeIntent({ taskId: 'task-win-4', budget: 2, requiredConfidence: 0.5 });
      await publisher.publishTask(intent);

      publisher.receiveBid(makeBid('task-win-4', { agentId: 'pricey', fee: 5, confidence: 0.9 }));

      const winner = publisher.selectWinner('task-win-4');
      expect(winner).toBeNull();
    });

    it('should return null for tasks with no bids', async () => {
      const intent = makeIntent({ taskId: 'task-win-5' });
      await publisher.publishTask(intent);

      expect(publisher.selectWinner('task-win-5')).toBeNull();
    });

    it('should return null for unknown tasks', () => {
      expect(publisher.selectWinner('nonexistent')).toBeNull();
    });

    it('should emit task_awarded event', async () => {
      const handler = vi.fn();
      publisher.on('task_awarded', handler);

      const intent = makeIntent({ taskId: 'task-win-6', budget: 10, requiredConfidence: 0.5 });
      await publisher.publishTask(intent);
      publisher.receiveBid(makeBid('task-win-6', { agentId: 'winner-agent', fee: 2, confidence: 0.8 }));
      publisher.selectWinner('task-win-6');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].winner.agentId).toBe('winner-agent');
    });
  });

  // ─── advanceState ─────────────────────────────────────────────────────────

  describe('advanceState', () => {
    it('should change task state', async () => {
      const intent = makeIntent({ taskId: 'task-adv-1' });
      await publisher.publishTask(intent);

      const result = publisher.advanceState('task-adv-1', 'in_progress');
      expect(result).toBe(true);
      expect(publisher.getTask('task-adv-1')!.state).toBe('in_progress');
    });

    it('should return false for unknown tasks', () => {
      expect(publisher.advanceState('nonexistent', 'cancelled')).toBe(false);
    });

    it('should emit state_changed event', async () => {
      const handler = vi.fn();
      publisher.on('state_changed', handler);

      const intent = makeIntent({ taskId: 'task-adv-2' });
      await publisher.publishTask(intent);
      publisher.advanceState('task-adv-2', 'expired');

      expect(handler).toHaveBeenCalledWith({ taskId: 'task-adv-2', state: 'expired' });
    });
  });

  // ─── Query methods ────────────────────────────────────────────────────────

  describe('queries', () => {
    it('getTasksByState should filter correctly', async () => {
      await publisher.publishTask(makeIntent({ taskId: 't1' }));
      await publisher.publishTask(makeIntent({ taskId: 't2' }));
      await publisher.publishTask(makeIntent({ taskId: 't3' }));
      publisher.advanceState('t2', 'in_progress');

      expect(publisher.getTasksByState('posted')).toHaveLength(2);
      expect(publisher.getTasksByState('in_progress')).toHaveLength(1);
    });

    it('getAllTasks should return all tasks', async () => {
      await publisher.publishTask(makeIntent({ taskId: 'q1' }));
      await publisher.publishTask(makeIntent({ taskId: 'q2' }));

      expect(publisher.getAllTasks()).toHaveLength(2);
    });

    it('getStats should aggregate counts', async () => {
      await publisher.publishTask(makeIntent({ taskId: 's1' }));
      await publisher.publishTask(makeIntent({ taskId: 's2' }));
      publisher.advanceState('s2', 'accepted');

      const stats = publisher.getStats();
      expect(stats.total).toBe(2);
      expect(stats.posted).toBe(1);
      expect(stats.accepted).toBe(1);
    });
  });
});
