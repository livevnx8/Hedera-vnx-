import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResultVerifier } from '../../vera/orchestrator/resultVerifier.js';

vi.mock('@hashgraph/sdk', () => ({
  TopicMessageSubmitTransaction: vi.fn().mockImplementation(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../../hedera/tools/client.js', () => ({
  getClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../../config.js', () => ({
  config: {
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

function makeResult(overrides?: Record<string, unknown>) {
  return {
    taskId: 'task-1',
    agentId: 'agent-1',
    result: { data: 'some output' },
    confidence: 0.9,
    proofHash: 'abcdef1234567890',
    durationMs: 5000,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('ResultVerifier', () => {
  let verifier: ResultVerifier;

  beforeEach(() => {
    verifier = new ResultVerifier(0.7);
  });

  // ─── Schema validation ────────────────────────────────────────────────────

  describe('schema validation', () => {
    it('should reject results missing taskId', () => {
      const report = verifier.verify({ agentId: 'a', confidence: 0.9, result: {} });
      expect(report.outcome).toBe('rejected');
      expect(report.schemaValid).toBe(false);
      expect(report.score).toBe(0);
    });

    it('should reject results missing agentId', () => {
      const report = verifier.verify({ taskId: 't1', confidence: 0.9, result: {} });
      expect(report.outcome).toBe('rejected');
      expect(report.schemaValid).toBe(false);
    });

    it('should reject results with confidence out of range', () => {
      const report = verifier.verify({ taskId: 't1', agentId: 'a', confidence: 1.5, result: {} });
      expect(report.outcome).toBe('rejected');
      expect(report.schemaValid).toBe(false);
    });

    it('should reject null input', () => {
      const report = verifier.verify(null);
      expect(report.outcome).toBe('rejected');
      expect(report.taskId).toBe('unknown');
    });

    it('should accept well-formed results', () => {
      const report = verifier.verify(makeResult());
      expect(report.schemaValid).toBe(true);
    });
  });

  // ─── Confidence check ─────────────────────────────────────────────────────

  describe('confidence check', () => {
    it('should pass when confidence >= threshold', () => {
      const report = verifier.verify(makeResult({ confidence: 0.8 }));
      expect(report.confidenceCheck).toBe(true);
    });

    it('should fail when confidence < threshold', () => {
      const report = verifier.verify(makeResult({ confidence: 0.3 }));
      expect(report.confidenceCheck).toBe(false);
    });

    it('should use requiredConfidence override when provided', () => {
      const report = verifier.verify(makeResult({ confidence: 0.6 }), 0.5);
      expect(report.confidenceCheck).toBe(true);
    });

    it('should fail with higher requiredConfidence override', () => {
      const report = verifier.verify(makeResult({ confidence: 0.8 }), 0.95);
      expect(report.confidenceCheck).toBe(false);
    });
  });

  // ─── Proof hash ───────────────────────────────────────────────────────────

  describe('proof hash', () => {
    it('should accept valid proof hash (>= 16 chars)', () => {
      const report = verifier.verify(makeResult({ proofHash: '1234567890abcdef' }));
      expect(report.proofValid).toBe(true);
    });

    it('should reject short proof hash', () => {
      const report = verifier.verify(makeResult({ proofHash: 'abc' }));
      expect(report.proofValid).toBe(false);
    });

    it('should require a proof hash for acceptance', () => {
      const report = verifier.verify(makeResult({ proofHash: undefined }));
      expect(report.proofValid).toBe(false);
      expect(report.outcome).toBe('needs_review');
    });
  });

  // ─── Outcome determination ────────────────────────────────────────────────

  describe('outcome', () => {
    it('should accept: schema valid + confidence met + proof valid → score >= 0.8', () => {
      const report = verifier.verify(makeResult());
      expect(report.outcome).toBe('accepted');
      expect(report.score).toBe(1.0);
    });

    it('should reject: schema invalid → score 0', () => {
      const report = verifier.verify({});
      expect(report.outcome).toBe('rejected');
      expect(report.score).toBe(0);
    });

    it('should needs_review: schema valid + confidence failed + proof valid + service valid → score 0.7', () => {
      const report = verifier.verify(makeResult({ confidence: 0.3 }));
      expect(report.outcome).toBe('needs_review');
      expect(report.score).toBe(0.7);
    });

    it('should needs_review: schema valid + confidence met + proof invalid + service valid → score 0.75', () => {
      const report = verifier.verify(makeResult({ proofHash: 'abc' }));
      expect(report.outcome).toBe('needs_review');
      expect(report.score).toBeCloseTo(0.75);
    });

    it('should use service-specific verifiers before accepting results', () => {
      const report = verifier.verify(
        makeResult({ result: { output: 'generic text' } }),
        { serviceType: 'carbon-verification' },
      );

      expect(report.serviceValid).toBe(false);
      expect(report.outcome).toBe('needs_review');
    });

    it('should accept when service-specific evidence is present', () => {
      const report = verifier.verify(
        makeResult({ result: { emissionsKgCO2e: 42, validationStatus: 'verified' } }),
        { serviceType: 'carbon-verification' },
      );

      expect(report.serviceValid).toBe(true);
      expect(report.outcome).toBe('accepted');
    });
  });

  // ─── Events and storage ───────────────────────────────────────────────────

  describe('events and storage', () => {
    it('should emit verification_complete event', () => {
      const handler = vi.fn();
      verifier.on('verification_complete', handler);

      verifier.verify(makeResult({ taskId: 'task-evt-1' }));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].taskId).toBe('task-evt-1');
    });

    it('should store reports for later retrieval', () => {
      verifier.verify(makeResult({ taskId: 'task-store-1' }));

      const report = verifier.getReport('task-store-1');
      expect(report).toBeDefined();
      expect(report!.outcome).toBe('accepted');
    });

    it('should calculate stats correctly', () => {
      verifier.verify(makeResult({ taskId: 't1' }));
      verifier.verify(makeResult({ taskId: 't2', confidence: 0.1 }));
      verifier.verify(makeResult({ taskId: 't3' }));

      const stats = verifier.getStats();
      expect(stats.total).toBe(3);
      expect(stats.accepted).toBe(2);
      expect(stats.needsReview).toBe(1);
      expect(stats.averageScore).toBeGreaterThan(0);
    });
  });
});
