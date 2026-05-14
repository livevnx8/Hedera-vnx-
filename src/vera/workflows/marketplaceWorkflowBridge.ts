import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import type { TaskBid, TaskRecord, TaskState } from '../orchestrator/taskPublisher.js';
import type { VerificationReport } from '../orchestrator/resultVerifier.js';
import type { AgentReputation } from '../marketplace/reputation.js';
import type { SettlementRequest } from '../types/index.js';
import { WorkflowEvidenceLedger, workflowEvidenceLedger } from './workflowEvidenceLedger.js';

interface MarketplaceWorkflowIndex {
  taskLoops: Record<string, string>;
}

export class MarketplaceWorkflowBridge {
  private loaded = false;
  private index: MarketplaceWorkflowIndex = { taskLoops: {} };

  constructor(
    private readonly storagePath = path.join(process.cwd(), 'data', 'vera-marketplace-workflows.json'),
    private readonly ledger: WorkflowEvidenceLedger = workflowEvidenceLedger,
  ) {}

  async recordTaskPosted(record: TaskRecord): Promise<void> {
    const loopId = await this.ensureTaskLoop(record);
    await this.ledger.recordEvidence(loopId, {
      source: record.hcsSequence ? 'hcs' : 'dashboard_metric',
      stage: 'task',
      summary: `Marketplace task posted: ${record.intent.serviceType}`,
      hcsTopicId: record.hcsSequence ? config.VERA_TASK_TOPIC_ID : undefined,
      hcsSequence: record.hcsSequence,
      metadata: {
        taskId: record.intent.taskId,
        budget: record.intent.budget,
        requiredConfidence: record.intent.requiredConfidence,
        deadlineMs: record.intent.deadlineMs,
      },
    });
  }

  async recordBid(bid: TaskBid): Promise<void> {
    const loopId = await this.getLoopIdForTask(bid.taskId);
    if (!loopId) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'dashboard_metric',
      stage: 'bid',
      summary: `Agent ${bid.agentId} bid ${bid.fee} HBAR with confidence ${bid.confidence}`,
      metadata: {
        taskId: bid.taskId,
        agentId: bid.agentId,
        fee: bid.fee,
        confidence: bid.confidence,
        estimatedDurationMs: bid.estimatedDurationMs,
      },
    });
  }

  async recordAward(taskId: string, winner: TaskBid): Promise<void> {
    const loopId = await this.getLoopIdForTask(taskId);
    if (!loopId) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'dashboard_metric',
      stage: 'award',
      summary: `Task awarded to ${winner.agentId}`,
      metadata: {
        taskId,
        winnerAgentId: winner.agentId,
        fee: winner.fee,
        confidence: winner.confidence,
      },
    });
  }

  async recordStateChange(taskId: string, state: TaskState, extra: Record<string, unknown> = {}): Promise<void> {
    const loopId = await this.getLoopIdForTask(taskId);
    if (!loopId) return;
    const stage = state === 'in_progress' || state === 'delivered' ? 'execution' : state === 'accepted' ? 'receipt' : undefined;
    if (!stage) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'dashboard_metric',
      stage,
      summary: `Task state changed to ${state}`,
      metadata: {
        taskId,
        state,
        ...extra,
      },
    });
  }

  async recordVerification(report: VerificationReport): Promise<void> {
    const loopId = await this.getLoopIdForTask(report.taskId);
    if (!loopId) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'test',
      stage: 'verification',
      summary: `Verification ${report.outcome} with score ${report.score}`,
      metadata: {
        taskId: report.taskId,
        agentId: report.agentId,
        outcome: report.outcome,
        score: report.score,
        confidenceCheck: report.confidenceCheck,
        schemaValid: report.schemaValid,
        proofValid: report.proofValid,
        details: report.details,
      },
    });
  }

  async recordSettlement(settlement: SettlementRequest): Promise<void> {
    const loopId = await this.getLoopIdForTask(settlement.taskId);
    if (!loopId) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'settlement',
      stage: 'settlement',
      summary: `Settlement ${settlement.state} for ${settlement.agentId}`,
      transactionId: settlement.txId,
      metadata: {
        settlementId: settlement.settlementId,
        taskId: settlement.taskId,
        agentId: settlement.agentId,
        recipientAccountId: settlement.recipientAccountId,
        amountHbar: settlement.amountHbar,
        amountToken: settlement.amountToken,
        currency: settlement.currency,
        method: settlement.method,
        state: settlement.state,
        error: settlement.error,
      },
    });
  }

  async recordReputation(reputation: AgentReputation, taskId: string, outcome: string): Promise<void> {
    const loopId = await this.getLoopIdForTask(taskId);
    if (!loopId) return;
    await this.ledger.recordEvidence(loopId, {
      source: 'reputation',
      stage: 'reputation',
      summary: `Reputation updated for ${reputation.agentId}: ${reputation.reputationScore}`,
      metadata: {
        taskId,
        outcome,
        agentId: reputation.agentId,
        totalTasks: reputation.totalTasks,
        successRate: reputation.successRate,
        reputationScore: reputation.reputationScore,
      },
    });
  }

  async getLoopIdForTask(taskId: string): Promise<string | undefined> {
    await this.load();
    return this.index.taskLoops[taskId];
  }

  private async ensureTaskLoop(record: TaskRecord): Promise<string> {
    await this.load();
    const existing = this.index.taskLoops[record.intent.taskId];
    if (existing) return existing;

    const loop = await this.ledger.openLoop(
      `Marketplace task ${record.intent.taskId}: ${record.intent.serviceType}`,
      'task',
      [`Auto-opened from marketplace task ${record.intent.taskId}.`],
    );
    this.index.taskLoops[record.intent.taskId] = loop.id;
    await this.persist();
    return loop.id;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      this.index = JSON.parse(raw) as MarketplaceWorkflowIndex;
      this.index.taskLoops ??= {};
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'ENOENT') {
        logger.warn('MarketplaceWorkflowBridge', {
          message: 'Failed to load marketplace workflow index',
          storagePath: this.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, `${JSON.stringify(this.index, null, 2)}\n`, 'utf-8');
  }
}

export const marketplaceWorkflowBridge = new MarketplaceWorkflowBridge();
