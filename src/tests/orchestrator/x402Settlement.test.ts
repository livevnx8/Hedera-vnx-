import { describe, it, expect, beforeEach, vi } from 'vitest';
import { X402SettlementHandler } from '../../vera/orchestrator/x402Settlement.js';

const mockTransferExecute = vi.fn();
const mockAxiosPost = vi.fn();

vi.mock('@hashgraph/sdk', () => ({
  TransferTransaction: vi.fn().mockImplementation(() => ({
    addHbarTransfer: vi.fn().mockReturnThis(),
    setTransactionMemo: vi.fn().mockReturnThis(),
    execute: mockTransferExecute,
  })),
  Hbar: vi.fn().mockImplementation((v: number) => ({ _amount: v })),
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('axios', () => ({
  default: { post: (...args: any[]) => mockAxiosPost(...args) },
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

// ─── Test suites for both x402 and direct_transfer paths ────────────────────

describe('X402SettlementHandler — direct transfer', () => {
  let handler: X402SettlementHandler;

  beforeEach(() => {
    vi.resetModules();
    mockTransferExecute.mockReset();
    mockAxiosPost.mockReset();

    // No x402 config → direct transfer
    vi.doMock('../../config.js', () => ({
      config: {
        X402_BASE_URL: '',
        X402_API_KEY: '',
        X402_FACILITATOR_ACCOUNT: '',
        HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
        VERA_AUDIT_TOPIC_ID: '0.0.99998',
      },
    }));

    handler = new X402SettlementHandler();

    mockTransferExecute.mockResolvedValue({
      getReceipt: vi.fn().mockResolvedValue({}),
      transactionId: { toString: () => '0.0.123@9999.000' },
    });
  });

  it('should settle via direct transfer when x402 not configured', async () => {
    const result = await handler.settle('task-1', 'agent-1', '0.0.99999', 2.5);

    expect(result.method).toBe('direct_transfer');
    expect(result.state).toBe('settled');
    expect(result.txId).toBe('0.0.123@9999.000');
    expect(result.settledAt).toBeDefined();
  });

  it('should mark settlement as failed on SDK error', async () => {
    mockTransferExecute.mockRejectedValueOnce(new Error('Insufficient balance'));

    const result = await handler.settle('task-2', 'agent-2', '0.0.99999', 100);

    expect(result.state).toBe('failed');
    expect(result.error).toContain('Insufficient balance');
  });

  it('should emit settled event on success', async () => {
    const handler2 = vi.fn();
    handler.on('settled', handler2);

    await handler.settle('task-3', 'agent-3', '0.0.99999', 1);

    expect(handler2).toHaveBeenCalledOnce();
    expect(handler2.mock.calls[0][0].taskId).toBe('task-3');
  });

  it('should emit settlement_failed event on error', async () => {
    mockTransferExecute.mockRejectedValueOnce(new Error('fail'));

    const failHandler = vi.fn();
    handler.on('settlement_failed', failHandler);

    await handler.settle('task-4', 'agent-4', '0.0.99999', 1);

    expect(failHandler).toHaveBeenCalledOnce();
  });
});

describe('X402SettlementHandler — x402 path', () => {
  let handler: X402SettlementHandler;

  beforeEach(async () => {
    vi.resetModules();
    mockAxiosPost.mockReset();
    mockTransferExecute.mockReset();

    // x402 configured
    vi.doMock('../../config.js', () => ({
      config: {
        X402_BASE_URL: 'https://x402.example.com',
        X402_API_KEY: 'test-key-123',
        X402_FACILITATOR_ACCOUNT: '0.0.77777',
        HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
        VERA_AUDIT_TOPIC_ID: '',
      },
    }));

    // Re-import to pick up new config
    const mod = await import('../../vera/orchestrator/x402Settlement.js');
    handler = new mod.X402SettlementHandler();
  });

  it('should settle via x402 when configured', async () => {
    mockAxiosPost.mockResolvedValueOnce({
      data: { paymentId: 'pay-abc', transactionId: '0.0.123@8888.000' },
    });

    const result = await handler.settle('task-x1', 'agent-x1', '0.0.99999', 5);

    expect(result.method).toBe('x402');
    expect(result.state).toBe('settled');
    expect(result.x402PaymentId).toBe('pay-abc');
    expect(result.txId).toBe('0.0.123@8888.000');
  });

  it('should fail if x402 response has no paymentId', async () => {
    mockAxiosPost.mockResolvedValueOnce({ data: {} });

    const result = await handler.settle('task-x2', 'agent-x2', '0.0.99999', 5);

    expect(result.state).toBe('failed');
    expect(result.error).toContain('missing paymentId');
  });

  it('should fail on x402 network error', async () => {
    mockAxiosPost.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await handler.settle('task-x3', 'agent-x3', '0.0.99999', 5);

    expect(result.state).toBe('failed');
    expect(result.error).toContain('Connection refused');
  });
});

describe('X402SettlementHandler — queries', () => {
  let handler: X402SettlementHandler;

  beforeEach(() => {
    vi.doMock('../../config.js', () => ({
      config: {
        X402_BASE_URL: '',
        X402_API_KEY: '',
        X402_FACILITATOR_ACCOUNT: '',
        HEDERA_OPERATOR_ACCOUNT_ID: '0.0.12345',
        VERA_AUDIT_TOPIC_ID: '',
      },
    }));

    handler = new X402SettlementHandler();

    mockTransferExecute.mockResolvedValue({
      getReceipt: vi.fn().mockResolvedValue({}),
      transactionId: { toString: () => '0.0.123@9999.000' },
    });
  });

  it('getSettlementByTask should find settlement', async () => {
    await handler.settle('task-q1', 'agent-q1', '0.0.99999', 1);

    const found = handler.getSettlementByTask('task-q1');
    expect(found).toBeDefined();
    expect(found!.agentId).toBe('agent-q1');
  });

  it('getStats should aggregate correctly', async () => {
    await handler.settle('task-s1', 'a1', '0.0.99999', 2);
    await handler.settle('task-s2', 'a2', '0.0.99999', 3);

    mockTransferExecute.mockRejectedValueOnce(new Error('fail'));
    await handler.settle('task-s3', 'a3', '0.0.99999', 1);

    const stats = handler.getStats();
    expect(stats.total).toBe(3);
    expect(stats.settled).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.totalHbarPaid).toBe(5);
  });
});
