import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PaymentTopicManager } from '../../vera/orchestrator/topicManager.js';

const mockExecute = vi.fn();
const mockGetReceipt = vi.fn();

vi.mock('@hashgraph/sdk', () => ({
  TopicCreateTransaction: vi.fn().mockImplementation(() => ({
    setTopicMemo: vi.fn().mockReturnThis(),
    execute: mockExecute,
  })),
}));

vi.mock('../../hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../monitoring/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

let mockConfig: Record<string, any> = {};
vi.mock('../../config.js', () => ({
  get config() { return mockConfig; },
}));

let mockFsReadFile = vi.fn();
let mockFsWriteFile = vi.fn();
let mockFsMkdir = vi.fn();
vi.mock('fs/promises', () => ({
  default: {
    readFile: (...args: any[]) => mockFsReadFile(...args),
    writeFile: (...args: any[]) => mockFsWriteFile(...args),
    mkdir: (...args: any[]) => mockFsMkdir(...args),
  },
}));

describe('PaymentTopicManager', () => {
  beforeEach(() => {
    mockConfig = {
      HEDERA_NETWORK: 'testnet',
      HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
      HEDERA_OPERATOR_PRIVATE_KEY: 'fake-key',
      VERA_REGISTRY_TOPIC_ID: '',
      VERA_TASK_TOPIC_ID: '',
      VERA_RESULT_TOPIC_ID: '',
      VERA_AUDIT_TOPIC_ID: '',
    };

    mockExecute.mockReset();
    mockGetReceipt.mockReset();
    mockFsReadFile.mockReset();
    mockFsWriteFile.mockReset();
    mockFsMkdir.mockReset();

    // Default: topic creation succeeds
    let seqNum = 100;
    mockGetReceipt.mockImplementation(() => ({
      topicId: { toString: () => `0.0.${seqNum++}` },
    }));
    mockExecute.mockResolvedValue({ getReceipt: mockGetReceipt });

    // Default: no file on disk
    mockFsReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsMkdir.mockResolvedValue(undefined);
  });

  describe('ensureTopics — config-based', () => {
    it('should return topics from config if all are set', async () => {
      mockConfig.VERA_REGISTRY_TOPIC_ID = '0.0.1001';
      mockConfig.VERA_TASK_TOPIC_ID = '0.0.1002';
      mockConfig.VERA_RESULT_TOPIC_ID = '0.0.1003';
      mockConfig.VERA_AUDIT_TOPIC_ID = '0.0.1004';

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      expect(topics.registryTopicId).toBe('0.0.1001');
      expect(topics.taskTopicId).toBe('0.0.1002');
      expect(topics.resultTopicId).toBe('0.0.1003');
      expect(topics.auditTopicId).toBe('0.0.1004');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('ensureTopics — disk-based', () => {
    it('should read topics from disk file', async () => {
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify({
        registryTopicId: '0.0.2001',
        taskTopicId: '0.0.2002',
        resultTopicId: '0.0.2003',
        auditTopicId: '0.0.2004',
        network: 'testnet',
        createdAt: new Date().toISOString(),
      }));

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      expect(topics.registryTopicId).toBe('0.0.2001');
      expect(topics.taskTopicId).toBe('0.0.2002');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('should ignore disk file from different network', async () => {
      mockFsReadFile.mockResolvedValueOnce(JSON.stringify({
        registryTopicId: '0.0.2001',
        taskTopicId: '0.0.2002',
        resultTopicId: '0.0.2003',
        auditTopicId: '0.0.2004',
        network: 'mainnet',
        createdAt: new Date().toISOString(),
      }));

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      // Should have created new topics since disk file is for mainnet
      expect(mockExecute).toHaveBeenCalledTimes(4);
    });
  });

  describe('ensureTopics — creation', () => {
    it('should create missing topics on Hedera', async () => {
      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      expect(mockExecute).toHaveBeenCalledTimes(4);
      expect(topics.registryTopicId).toBeTruthy();
      expect(topics.taskTopicId).toBeTruthy();
      expect(topics.resultTopicId).toBeTruthy();
      expect(topics.auditTopicId).toBeTruthy();
    });

    it('should persist created topics to disk', async () => {
      const manager = new PaymentTopicManager();
      await manager.ensureTopics();

      expect(mockFsMkdir).toHaveBeenCalled();
      expect(mockFsWriteFile).toHaveBeenCalledOnce();
      const written = JSON.parse(mockFsWriteFile.mock.calls[0][1]);
      expect(written.network).toBe('testnet');
      expect(written.registryTopicId).toBeTruthy();
    });

    it('should only create topics that are missing', async () => {
      mockConfig.VERA_REGISTRY_TOPIC_ID = '0.0.5001';
      mockConfig.VERA_TASK_TOPIC_ID = '0.0.5002';

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      // Only 2 topics needed creation (result + audit)
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(topics.registryTopicId).toBe('0.0.5001');
      expect(topics.taskTopicId).toBe('0.0.5002');
    });

    it('should handle topic creation failure gracefully', async () => {
      mockExecute.mockRejectedValue(new Error('SDK error'));

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      // Failed topics should be null
      expect(topics.registryTopicId).toBeNull();
    });
  });

  describe('ensureTopics — caching', () => {
    it('should cache topics after first call', async () => {
      mockConfig.VERA_REGISTRY_TOPIC_ID = '0.0.6001';
      mockConfig.VERA_TASK_TOPIC_ID = '0.0.6002';
      mockConfig.VERA_RESULT_TOPIC_ID = '0.0.6003';
      mockConfig.VERA_AUDIT_TOPIC_ID = '0.0.6004';

      const manager = new PaymentTopicManager();
      const first = await manager.ensureTopics();
      const second = await manager.ensureTopics();

      expect(first).toEqual(second);
      // readFile should only be called once (first call)
      expect(mockFsReadFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('ensureTopics — no credentials', () => {
    it('should warn and skip creation when operator credentials missing', async () => {
      mockConfig.HEDERA_OPERATOR_ACCOUNT_ID = '';
      mockConfig.HEDERA_OPERATOR_PRIVATE_KEY = '';

      const manager = new PaymentTopicManager();
      const topics = await manager.ensureTopics();

      expect(mockExecute).not.toHaveBeenCalled();
      expect(topics.registryTopicId).toBeNull();
    });
  });
});
