import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { logger } from '../../monitoring/logger.js';
import {
  type EllipticalWorkflowStage,
  type EvidenceSource,
  getEllipticalProofWorkflowModel,
  getWorkflowStep,
} from './ellipticalProofWorkflows.js';

export type WorkflowLoopStatus = 'open' | 'proofing' | 'closed' | 'promoted' | 'blocked';

export interface WorkflowEvidenceRef {
  id: string;
  source: EvidenceSource;
  stage: EllipticalWorkflowStage;
  summary: string;
  hash?: string;
  hcsTopicId?: string;
  hcsSequence?: number;
  transactionId?: string;
  scheduleId?: string;
  blockStream?: {
    blockNumber?: number;
    consensusTimestamp?: string;
    blockProofHash?: string;
    stateChangeSummary?: string;
  };
  recordedAt: number;
  metadata: Record<string, unknown>;
}

export interface WorkflowLoopRecord {
  id: string;
  subject: string;
  currentStage: EllipticalWorkflowStage;
  status: WorkflowLoopStatus;
  openedAt: number;
  updatedAt: number;
  closedAt?: number;
  promotedAt?: number;
  evidence: WorkflowEvidenceRef[];
  notes: string[];
}

export interface WorkflowLoopSummary {
  total: number;
  open: number;
  proofing: number;
  closed: number;
  promoted: number;
  blocked: number;
  readyForLesson: number;
  readyForPromotion: number;
}

export class WorkflowEvidenceLedger {
  private loops = new Map<string, WorkflowLoopRecord>();
  private loaded = false;

  constructor(private readonly storagePath = path.join(process.cwd(), 'data', 'vera-workflow-ledger.json')) {}

  async openLoop(subject: string, stage: EllipticalWorkflowStage = 'brief', notes: string[] = []): Promise<WorkflowLoopRecord> {
    await this.load();
    const now = Date.now();
    const loop: WorkflowLoopRecord = {
      id: `workflow-${now}-${randomUUID().slice(0, 8)}`,
      subject,
      currentStage: stage,
      status: getWorkflowStep(stage).focus === 'proof' ? 'proofing' : 'open',
      openedAt: now,
      updatedAt: now,
      evidence: [],
      notes,
    };
    this.loops.set(loop.id, loop);
    await this.persist();
    return loop;
  }

  async recordEvidence(
    loopId: string,
    input: Omit<WorkflowEvidenceRef, 'id' | 'recordedAt'>,
  ): Promise<WorkflowLoopRecord> {
    await this.load();
    const loop = this.loops.get(loopId);
    if (!loop) {
      throw new Error(`Workflow loop not found: ${loopId}`);
    }

    const evidence: WorkflowEvidenceRef = {
      ...input,
      id: `evidence-${Date.now()}-${randomUUID().slice(0, 8)}`,
      recordedAt: Date.now(),
      metadata: input.metadata ?? {},
    };

    loop.evidence.push(evidence);
    loop.currentStage = evidence.stage;
    loop.updatedAt = evidence.recordedAt;
    loop.status = this.deriveStatus(loop);
    if (loop.status === 'closed' && !loop.closedAt) loop.closedAt = evidence.recordedAt;
    if (loop.status === 'promoted' && !loop.promotedAt) loop.promotedAt = evidence.recordedAt;

    await this.persist();
    return loop;
  }

  async markBlocked(loopId: string, note: string): Promise<WorkflowLoopRecord> {
    await this.load();
    const loop = this.loops.get(loopId);
    if (!loop) {
      throw new Error(`Workflow loop not found: ${loopId}`);
    }
    loop.status = 'blocked';
    loop.notes.push(note);
    loop.updatedAt = Date.now();
    await this.persist();
    return loop;
  }

  async listLoops(): Promise<WorkflowLoopRecord[]> {
    await this.load();
    return Array.from(this.loops.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async getLoop(loopId: string): Promise<WorkflowLoopRecord | undefined> {
    await this.load();
    return this.loops.get(loopId);
  }

  async getSummary(): Promise<WorkflowLoopSummary> {
    const loops = await this.listLoops();
    return {
      total: loops.length,
      open: loops.filter((loop) => loop.status === 'open').length,
      proofing: loops.filter((loop) => loop.status === 'proofing').length,
      closed: loops.filter((loop) => loop.status === 'closed').length,
      promoted: loops.filter((loop) => loop.status === 'promoted').length,
      blocked: loops.filter((loop) => loop.status === 'blocked').length,
      readyForLesson: loops.filter((loop) => this.hasEvidence(loop, 'receipt') && !this.hasEvidence(loop, 'lesson')).length,
      readyForPromotion: loops.filter((loop) => this.hasEvidence(loop, 'lesson') && !this.hasEvidence(loop, 'upgrade_package')).length,
    };
  }

  private deriveStatus(loop: WorkflowLoopRecord): WorkflowLoopStatus {
    if (loop.status === 'blocked') return 'blocked';
    if (this.hasEvidence(loop, 'upgrade_package')) return 'promoted';
    if (this.hasEvidence(loop, 'receipt')) return 'closed';
    if (getWorkflowStep(loop.currentStage).focus === 'proof') return 'proofing';
    return 'open';
  }

  private hasEvidence(loop: WorkflowLoopRecord, stage: EllipticalWorkflowStage): boolean {
    return loop.evidence.some((evidence) => evidence.stage === stage);
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      const records = JSON.parse(raw) as WorkflowLoopRecord[];
      this.loops.clear();
      for (const record of records) {
        this.loops.set(record.id, record);
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'ENOENT') {
        logger.warn('WorkflowEvidenceLedger', {
          message: 'Failed to load workflow evidence ledger',
          storagePath: this.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, `${JSON.stringify(Array.from(this.loops.values()), null, 2)}\n`, 'utf-8');
  }
}

export function getWorkflowEvidencePosture() {
  const model = getEllipticalProofWorkflowModel();
  return {
    model: model.name,
    principle: model.principle,
    blockStream: model.blockStream,
    promotionGate: model.promotionGate,
  };
}

export const workflowEvidenceLedger = new WorkflowEvidenceLedger();
