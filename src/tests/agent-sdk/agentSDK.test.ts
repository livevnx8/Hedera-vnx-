import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VeraAgentSDK, type AgentProfile, type BidSubmission, type ResultSubmission } from '../../../src/vera/agent-sdk/index.js';

const mockExecute = vi.fn();
const mockGetReceipt = vi.fn();
const mockAxiosGet = vi.fn();

vi.mock('@hashgraph/sdk', () => ({
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: mockExecute,
  })),
}));

vi.mock('../../../src/hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('axios', () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
  },
}));

vi.mock('../../../src/monitoring/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('VeraAgentSDK', () => {
  let sdk: VeraAgentSDK;

  beforeEach(() => {
    mockGetReceipt.mockReset();
    mockExecute.mockReset();
    mockAxiosGet.mockReset();

    mockGetReceipt.mockResolvedValue({
      topicSequenceNumber: { toString: () => '42' },
    });
    mockExecute.mockResolvedValue({
      getReceipt: mockGetReceipt,
    });
    mockAxiosGet.mockResolvedValue({
      data: { messages: [] },
    });

    sdk = new VeraAgentSDK({
      registryTopicId: '0.0.1000',
      taskTopicId: '0.0.1001',
      resultTopicId: '0.0.1002',
      mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
    });
  });

  describe('constructor', () => {
    it('should create SDK with provided options', () => {
      expect(sdk).toBeDefined();
    });
  });

  describe('registerAgent', () => {
    it('should register an agent and return the sequence number', async () => {
      const profile: AgentProfile = {
        agentId: 'test-agent',
        service: 'data-analysis',
        feePerTask: 0.5,
        paymentMethod: 'direct_transfer',
        availability: true,
        accountId: '0.0.123',
        metadata: { version: '1.0.0' },
      };

      await expect(sdk.registerAgent(profile)).resolves.toEqual({ sequenceNumber: 42 });
    });
  });

  describe('submitBid', () => {
    it('should submit a bid without throwing', async () => {
      const bid: BidSubmission = {
        taskId: 'task-1',
        agentId: 'test-agent',
        fee: 0.5,
        confidence: 0.9,
        estimatedDurationMs: 5000,
      };

      await expect(sdk.submitBid(bid)).resolves.toBeUndefined();
    });
  });

  describe('submitResult', () => {
    it('should submit a result without throwing', async () => {
      const result: ResultSubmission = {
        taskId: 'task-1',
        agentId: 'test-agent',
        result: { type: 'analysis', data: [] },
        confidence: 0.95,
        proofHash: 'abc123',
        durationMs: 3000,
      };

      await expect(sdk.submitResult(result)).resolves.toBeUndefined();
    });
  });

  describe('subscribeTasks', () => {
    it('should poll tasks from the mirror node and decode task posts', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          messages: [
            {
              sequence_number: 7,
              message: Buffer.from(JSON.stringify({
                type: 'task_posted',
                taskId: 'task-1',
                description: 'Analyze data',
                serviceType: 'data-analysis',
                budget: 2,
                requiredConfidence: 0.8,
                deadlineMs: 123456789,
                timestamp: 123,
              })).toString('base64'),
            },
          ],
        },
      });

      await expect(sdk.subscribeTasks()).resolves.toEqual([
        {
          taskId: 'task-1',
          description: 'Analyze data',
          serviceType: 'data-analysis',
          budget: 2,
          requiredConfidence: 0.8,
          deadlineMs: 123456789,
          timestamp: 123,
        },
      ]);
    });

    it('should filter by service type when provided', async () => {
      mockAxiosGet.mockResolvedValueOnce({
        data: {
          messages: [
            {
              sequence_number: 8,
              message: Buffer.from(JSON.stringify({
                type: 'task_posted',
                taskId: 'task-1',
                description: 'Analyze data',
                serviceType: 'data-analysis',
                budget: 2,
                requiredConfidence: 0.8,
                deadlineMs: 123456789,
                timestamp: 123,
              })).toString('base64'),
            },
            {
              sequence_number: 9,
              message: Buffer.from(JSON.stringify({
                type: 'task_posted',
                taskId: 'task-2',
                description: 'Store files',
                serviceType: 'storage',
                budget: 5,
                requiredConfidence: 0.8,
                deadlineMs: 123456790,
                timestamp: 124,
              })).toString('base64'),
            },
          ],
        },
      });

      const filter = { serviceType: 'data-analysis', minBudget: 0.1 };
      await expect(sdk.subscribeTasks(filter)).resolves.toHaveLength(1);
    });
  });
});

describe('VeraAgentSDK Integration (mocked)', () => {
  it('should expose the expected methods', () => {
    const instance = new VeraAgentSDK({
      registryTopicId: '0.0.1000',
      taskTopicId: '0.0.1001',
      resultTopicId: '0.0.1002',
    });

    expect(typeof instance.registerAgent).toBe('function');
    expect(typeof instance.submitBid).toBe('function');
    expect(typeof instance.submitResult).toBe('function');
    expect(typeof instance.subscribeTasks).toBe('function');
  });
});
