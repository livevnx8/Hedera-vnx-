/**
 * Integration Test Suite
 * Comprehensive testing of all Vera components
 */

import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { X402SettlementHandler } from '../../src/vera/orchestrator/x402Settlement.js';
import { ConsensusEngine } from '../../src/vera/orchestrator/consensusEngine.js';
import { featureFlags } from '../../src/vera/orchestrator/featureFlags.js';
import { StateBackupManager } from '../../src/vera/disaster-recovery/stateBackup.js';
import { TopicRecoveryManager } from '../../src/vera/disaster-recovery/topicRecovery.js';
import { HCSBatchingManager } from '../../src/vera/scaling/hcsBatching.js';
import { ConnectionPoolManager } from '../../src/vera/scaling/connectionPool.js';
import { MultiCurrencyHandler } from '../../src/vera/payments/multiCurrency.js';
import { SecurityManager } from '../../src/vera/security/compliance.js';

vi.mock('@hashgraph/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hashgraph/sdk')>();
  return {
    ...actual,
    TransferTransaction: vi.fn().mockImplementation(() => ({
      addHbarTransfer: vi.fn().mockReturnThis(),
      addTokenTransfer: vi.fn().mockReturnThis(),
      setTransactionMemo: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({
        getReceipt: vi.fn().mockResolvedValue({}),
        transactionId: { toString: () => '0.0.123@9999.000' },
      }),
    })),
  };
});

vi.mock('../../src/hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({
    operatorAccountId: { toString: () => '0.0.10294360' },
  }),
}));

describe('Vera Integration Tests', () => {
  describe('Settlement Flow', () => {
    it('should process payment end-to-end', async () => {
      const settlement = new X402SettlementHandler();
      
      const result = await settlement.settle(
        'task-123',
        'agent-001',
        '0.0.12345',
        10.5
      );
      
      expect(result.settlementId).toBeDefined();
      expect(result.state).toBe('settled');
      expect(result.amountHbar).toBe(10.5);
    });

    it('should retry failed settlements', async () => {
      const settlement = new X402SettlementHandler();
      
      // Create a failed settlement
      const result = await settlement.settle(
        'task-retry',
        'agent-001',
        '0.0.12345',
        5.0
      );
      
      // Force failure then retry
      if (result.state === 'failed') {
        const retry = await settlement.retrySettlement(result.settlementId);
        expect(retry).toBeDefined();
      }
    });

    it('should respect circuit breaker', () => {
      const settlement = new X402SettlementHandler();
      
      // Get initial status
      const initialStatus = settlement.getCircuitBreakerStatus() as { state: string; failures: number };
      expect(initialStatus.state).toBeDefined();
    });
  });

  describe('Consensus Engine', () => {
    it('should reach consensus with 2/3 majority', async () => {
      const consensus = new ConsensusEngine({
        voteThreshold: 0.67,
        timeoutMs: 5000,
        minVoters: 3,
        maxRetries: 1,
      });

      const proposal = consensus.propose({
        proposalId: 'test-1',
        proposal: 'Test proposal',
        proposerId: 'agent-a',
        urgency: 'MEDIUM',
      });

      // Submit votes
      consensus.submitVote('test-1', {
        voterId: 'agent-a',
        voterType: 'ANALYST',
        decision: true,
        confidence: 0.9,
        timestamp: Date.now(),
      });

      consensus.submitVote('test-1', {
        voterId: 'agent-b',
        voterType: 'VALIDATOR',
        decision: true,
        confidence: 0.8,
        timestamp: Date.now(),
      });

      consensus.submitVote('test-1', {
        voterId: 'agent-c',
        voterType: 'AUDITOR',
        decision: false,
        confidence: 0.7,
        timestamp: Date.now(),
      });

      // 2/3 approval should be enough
      const result = await proposal;
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('Feature Flags', () => {
    it('should validate operations against flags', () => {
      // Use the singleton instance
      
      // Test mainnet blocking
      const validation = featureFlags.validateOperation({
        type: 'settlement',
        amountHbar: 500,
      });
      
      expect(validation.allowed).toBeDefined();
    });

    it('should respect settlement limits', () => {
      // Use the singleton instance
      featureFlags.set('maxHbarPerSettlement', 100);
      
      const validation = featureFlags.validateOperation({
        type: 'settlement',
        amountHbar: 200,
      });
      
      expect(validation.allowed).toBe(false);
    });
  });

  describe('Disaster Recovery', () => {
    it('should create and restore backups', async () => {
      const backupPath = await mkdtemp(path.join(os.tmpdir(), 'vera-integration-backups-'));
      const backup = new StateBackupManager({
        intervalMs: 60000,
        retentionCount: 5,
        backupPath,
        compressBackups: false,
      });

      try {
        const snapshot = await backup.createBackup('manual');
        expect(snapshot.id).toBeDefined();
        expect(snapshot.checksum).toBeDefined();

        const restored = await backup.restore(snapshot.id);
        expect(restored).toBe(true);
      } finally {
        await rm(backupPath, { recursive: true, force: true });
      }
    });

    it('should handle topic failover', async () => {
      const recovery = new TopicRecoveryManager({
        enableAutoFailover: true,
        failoverThreshold: 3,
        healthCheckIntervalMs: 1000,
        autoCreateFailover: true,
      });

      recovery.registerTopic('test-topic', '0.0.12345', ['0.0.12346']);
      
      const topicId = recovery.getActiveTopicId('test-topic');
      expect(topicId).toBe('0.0.12345');
    });
  });

  describe('Performance', () => {
    it('should batch HCS messages', () => {
      const batcher = new HCSBatchingManager({
        maxBatchSize: 100,
        maxWaitMs: 2000,
        maxMessageSize: 1024,
        enableCompression: true,
      });

      // Queue multiple messages
      for (let i = 0; i < 5; i++) {
        batcher.queueMessage('0.0.12345', `test-message-${i}`, 1);
      }

      const depth = batcher.getQueueDepth('0.0.12345');
      expect(depth).toBe(5);
    });

    it('should manage connection pool', async () => {
      const pool = new ConnectionPoolManager(
        {
          minConnections: 2,
          maxConnections: 5,
          idleTimeoutMs: 1000,
          healthCheckIntervalMs: 500,
          maxWaitMs: 1000,
        },
        () => ({}) as any // Mock client creator
      );

      await pool.initialize();
      
      const stats = pool.getStats();
      expect(stats.total).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Multi-Currency', () => {
    it('should process different currencies', async () => {
      const handler = new MultiCurrencyHandler();
      
      const payment = await handler.processPayment(
        '0.0.12345',
        100,
        'USDC'
      );
      
      expect(payment.currency).toBe('USDC');
      expect(payment.amount).toBe(100);
    });

    it('should convert between currencies', () => {
      const handler = new MultiCurrencyHandler();
      
      const converted = handler.convert(100, 'HBAR', 'USDC');
      expect(converted).toBeGreaterThan(0);
    });
  });

  describe('Security', () => {
    it('should encrypt and decrypt data', () => {
      const security = new SecurityManager({
        enableEncryption: true,
        encryptionKey: 'test-key-123456789012345678901234567890',
        auditLogRetention: 30,
        requireMFA: false,
        maxLoginAttempts: 3,
        sessionTimeout: 60,
      });

      const plaintext = 'sensitive-data';
      const encrypted = security.encrypt(plaintext);
      const decrypted = security.decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    it('should validate access attempts', () => {
      const security = new SecurityManager({
        enableEncryption: true,
        encryptionKey: 'test-key',
        auditLogRetention: 30,
        requireMFA: false,
        maxLoginAttempts: 3,
        sessionTimeout: 60,
      });

      const result = security.validateAccess({
        userId: 'user-1',
        resource: 'payment',
        action: 'create',
      });
      
      expect(result.allowed).toBe(true);
    });
  });
});

export default {};
