import { EventEmitter } from 'events';
import { z } from 'zod';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TaskResultSchema = z.object({
  taskId: z.string().min(1),
  agentId: z.string().min(1),
  result: z.unknown(),
  confidence: z.number().min(0).max(1),
  proofHash: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.number().optional(),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;

export type VerificationOutcome = 'accepted' | 'rejected' | 'needs_review';

export interface VerificationReport {
  taskId: string;
  agentId: string;
  serviceType: string;
  outcome: VerificationOutcome;
  score: number;           // 0.0–1.0 aggregate quality score
  confidenceCheck: boolean;
  schemaValid: boolean;
  proofValid: boolean;
  serviceValid: boolean;
  details: string[];
  verifiedAt: number;
}

export interface VerificationOptions {
  requiredConfidence?: number;
  serviceType?: string;
}

type ServiceVerification = {
  valid: boolean;
  details: string[];
};

type ServiceVerifier = (result: TaskResult) => ServiceVerification;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAnyKey(value: unknown, keys: string[]): boolean {
  return isRecord(value) && keys.some((key) => value[key] !== undefined && value[key] !== null);
}

const defaultVerifier: ServiceVerifier = (result) => ({
  valid: result.result !== undefined && result.result !== null,
  details: ['Default verifier checked non-empty result payload'],
});

const SERVICE_VERIFIERS: Record<string, ServiceVerifier> = {
  'carbon-verification': (result) => ({
    valid: hasAnyKey(result.result, ['emissionsKgCO2e', 'carbonKg', 'validationStatus', 'auditStatus', 'retirementId']),
    details: ['Carbon verifier requires emissions, validation, audit, or retirement evidence'],
  }),
  'carbon': (result) => SERVICE_VERIFIERS['carbon-verification'](result),
  'compliance-audit': (result) => ({
    valid: hasAnyKey(result.result, ['status', 'findings', 'controls', 'riskScore', 'attestation']),
    details: ['Compliance verifier requires status, findings, controls, risk score, or attestation evidence'],
  }),
  'defi-intelligence': (result) => ({
    valid: hasAnyKey(result.result, ['analysis', 'recommendation', 'prices', 'riskScore', 'opportunities']),
    details: ['DeFi verifier requires analysis, recommendation, price, risk, or opportunity evidence'],
  }),
  'proof-publisher': (result) => ({
    valid: hasAnyKey(result.result, ['proofHash', 'hcsTopicId', 'hcsSequence', 'transactionId', 'hashscanUrl']),
    details: ['Proof publisher verifier requires HCS, transaction, hash, or HashScan evidence'],
  }),
};

// ─── Verifier ────────────────────────────────────────────────────────────────

export class ResultVerifier extends EventEmitter {
  private reports = new Map<string, VerificationReport>();
  private readonly confidenceThreshold: number;

  constructor(confidenceThreshold = 0.7) {
    super();
    this.confidenceThreshold = confidenceThreshold;
  }

  /**
   * Verify a raw result message (base64-decoded JSON from HCS result topic).
   * Returns a VerificationReport.
   */
  verify(raw: unknown, requiredConfidenceOrOptions?: number | VerificationOptions): VerificationReport {
    const options: VerificationOptions = typeof requiredConfidenceOrOptions === 'number'
      ? { requiredConfidence: requiredConfidenceOrOptions }
      : requiredConfidenceOrOptions ?? {};
    const threshold = options.requiredConfidence ?? this.confidenceThreshold;
    const serviceType = options.serviceType ?? 'generic';
    const details: string[] = [];
    let schemaValid = false;
    let confidenceCheck = false;
    let proofValid = false;
    let serviceValid = false;
    let score = 0;

    // 1. Schema validation
    const parsed = TaskResultSchema.safeParse(raw);
    if (!parsed.success) {
      details.push(`Schema validation failed: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      const report: VerificationReport = {
        taskId: (raw as any)?.taskId ?? 'unknown',
        agentId: (raw as any)?.agentId ?? 'unknown',
        serviceType,
        outcome: 'rejected',
        score: 0,
        confidenceCheck: false,
        schemaValid: false,
        proofValid: false,
        serviceValid: false,
        details,
        verifiedAt: Date.now(),
      };
    this.reports.set(report.taskId, report);
    this.emit('verification_complete', report);
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordVerification(report))
      .catch((error) => logger.debug('ResultVerifier', { message: 'Workflow verification evidence failed', error: String(error) }));
    return report;
    }

    schemaValid = true;
    details.push('Schema valid');
    const result = parsed.data;

    // 2. Confidence check
    if (result.confidence >= threshold) {
      confidenceCheck = true;
      details.push(`Confidence ${result.confidence.toFixed(3)} >= threshold ${threshold}`);
    } else {
      details.push(`Confidence ${result.confidence.toFixed(3)} < threshold ${threshold}`);
    }

    // 3. Proof hash check. Confidence alone is never enough for acceptance.
    if (result.proofHash && result.proofHash.length >= 16) {
      proofValid = true;
      details.push('Proof hash present and valid');
    } else if (result.proofHash) {
      details.push('Proof hash too short');
    } else {
      details.push('Proof hash required for acceptance');
    }

    // 4. Service-specific verification
    const normalizedService = serviceType.toLowerCase();
    const serviceVerifier = SERVICE_VERIFIERS[normalizedService] ?? defaultVerifier;
    const serviceReport = serviceVerifier(result);
    serviceValid = serviceReport.valid;
    details.push(...serviceReport.details);
    details.push(serviceValid ? `Service verifier passed for ${serviceType}` : `Service verifier failed for ${serviceType}`);

    // 5. Aggregate score
    const weights = { schema: 0.2, confidence: 0.3, proof: 0.25, service: 0.25 };
    score =
      (schemaValid ? weights.schema : 0) +
      (confidenceCheck ? weights.confidence : 0) +
      (proofValid ? weights.proof : 0) +
      (serviceValid ? weights.service : 0);

    // 6. Determine outcome
    let outcome: VerificationOutcome;
    if (score >= 0.8 && confidenceCheck && proofValid && serviceValid) {
      outcome = 'accepted';
    } else if (score < 0.5 || !schemaValid) {
      outcome = 'rejected';
    } else {
      outcome = 'needs_review';
    }

    const report: VerificationReport = {
      taskId: result.taskId,
      agentId: result.agentId,
      serviceType,
      outcome,
      score,
      confidenceCheck,
      schemaValid,
      proofValid,
      serviceValid,
      details,
      verifiedAt: Date.now(),
    };

    this.reports.set(report.taskId, report);
    this.emit('verification_complete', report);
    void import('../workflows/marketplaceWorkflowBridge.js')
      .then(({ marketplaceWorkflowBridge }) => marketplaceWorkflowBridge.recordVerification(report))
      .catch((error) => logger.debug('ResultVerifier', { message: 'Workflow verification evidence failed', error: String(error) }));

    logger.info('ResultVerifier', {
      message: 'Verification complete',
      taskId: report.taskId,
      agentId: report.agentId,
      outcome: report.outcome,
      score: report.score,
    });

    return report;
  }

  /**
   * Publish verification report to the HCS audit topic.
   */
  async publishReport(report: VerificationReport): Promise<void> {
    const auditTopicId = config.VERA_AUDIT_TOPIC_ID;
    if (!auditTopicId) return;

    const msg = JSON.stringify({
      type: 'verification_report',
      ...report,
    });

    try {
      // Submit via hederaMaster with HIP-993 wrapper
      await hederaMaster.submitMessage(auditTopicId, JSON.parse(msg), {
        maxChunkSize: 4096
      });
    } catch (error) {
      logger.warn('ResultVerifier', {
        message: 'Failed to publish verification report',
        taskId: report.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  getReport(taskId: string): VerificationReport | undefined {
    return this.reports.get(taskId);
  }

  getStats() {
    const all = Array.from(this.reports.values());
    return {
      total: all.length,
      accepted: all.filter((r) => r.outcome === 'accepted').length,
      rejected: all.filter((r) => r.outcome === 'rejected').length,
      needsReview: all.filter((r) => r.outcome === 'needs_review').length,
      averageScore: all.length > 0 ? all.reduce((s, r) => s + r.score, 0) / all.length : 0,
    };
  }
}

export const resultVerifier = new ResultVerifier();
