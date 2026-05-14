import { createHash, randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { getEllipticalProofWorkflowModel } from './ellipticalProofWorkflows.js';
import type { WorkflowLoopRecord } from './workflowEvidenceLedger.js';

export interface LearningAmplificationPacket {
  id: string;
  workflowLoopId: string;
  subject: string;
  modelProvider: string;
  modelName?: string;
  lesson: string;
  lessonHash: string;
  qualityScore: number;
  operatorApproved: boolean;
  synthesisHash?: string;
  evidenceRefs: Array<{
    evidenceId: string;
    source: string;
    stage: string;
    hash?: string;
    transactionId?: string;
    hcsTopicId?: string;
    hcsSequence?: number;
  }>;
  blockStreamRefs: Array<{
    evidenceId: string;
    blockNumber?: number;
    consensusTimestamp?: string;
    blockProofHash?: string;
    stateChangeSummary?: string;
  }>;
  hcsSubmission?: {
    hash?: string;
    topicId?: string;
    sequenceNumber?: number;
    transactionId?: string;
    hashscanUrl?: string;
    submittedAt: number;
    verified?: boolean;
  };
  blockStreamClosure?: {
    blockNumber: number;
    consensusTimestamp?: string;
    transactionId?: string;
    blockProofHash: string;
    stateChangeSummary?: string;
    attachedAt: number;
  };
  hcsCandidate: {
    shouldLog: boolean;
    reason: string;
    payload: Record<string, unknown>;
  };
  createdAt: number;
}

export class LearningAmplificationPacketStore {
  private packets = new Map<string, LearningAmplificationPacket>();
  private loaded = false;

  constructor(private readonly storagePath = path.join(process.cwd(), 'data', 'vera-learning-packets.json')) {}

  async createFromLoop(
    loop: WorkflowLoopRecord,
    input: {
      modelProvider: string;
      modelName?: string;
      lesson: string;
      qualityScore: number;
      operatorApproved?: boolean;
      synthesisHash?: string;
    },
  ): Promise<LearningAmplificationPacket> {
    await this.load();
    const policy = getEllipticalProofWorkflowModel().learningAmplification.packetPolicy;
    const lesson = this.compactLesson(input.lesson, policy.maxLessonChars);
    const lessonHash = createHash('sha256').update(lesson).digest('hex');
    const blockStreamRefs = loop.evidence
      .filter((evidence) => evidence.blockStream)
      .map((evidence) => ({
        evidenceId: evidence.id,
        blockNumber: evidence.blockStream?.blockNumber,
        consensusTimestamp: evidence.blockStream?.consensusTimestamp,
        blockProofHash: evidence.blockStream?.blockProofHash,
        stateChangeSummary: evidence.blockStream?.stateChangeSummary,
      }));
    const evidenceRefs = loop.evidence.map((evidence) => ({
      evidenceId: evidence.id,
      source: evidence.source,
      stage: evidence.stage,
      hash: evidence.hash,
      transactionId: evidence.transactionId,
      hcsTopicId: evidence.hcsTopicId,
      hcsSequence: evidence.hcsSequence,
    }));
    const operatorApproved = input.operatorApproved === true;
    const qualityPass = input.qualityScore >= config.VERA_LEARNING_MIN_QUALITY_SCORE;
    const hasReceipt = loop.evidence.some((evidence) => evidence.stage === 'receipt');
    const shouldLog = operatorApproved && qualityPass && hasReceipt;
    const packet: LearningAmplificationPacket = {
      id: `learn-${Date.now()}-${randomUUID().slice(0, 8)}`,
      workflowLoopId: loop.id,
      subject: loop.subject,
      modelProvider: input.modelProvider,
      modelName: input.modelName,
      lesson,
      lessonHash,
      qualityScore: input.qualityScore,
      operatorApproved,
      synthesisHash: input.synthesisHash,
      evidenceRefs,
      blockStreamRefs,
      hcsCandidate: {
        shouldLog,
        reason: shouldLog
          ? 'Operator-approved, quality-scored, receipt-backed compact lesson is ready for HCS logging.'
          : 'Hold until operator approval, quality threshold, and receipt evidence are all present.',
        payload: {
          packetId: '',
          workflowLoopId: loop.id,
          lessonHash,
          modelProvider: input.modelProvider,
          modelName: input.modelName,
          qualityScore: input.qualityScore,
          evidenceRefs: evidenceRefs.map((ref) => ref.evidenceId),
          blockStreamRefs: blockStreamRefs.map((ref) => ({
            evidenceId: ref.evidenceId,
            blockNumber: ref.blockNumber,
            blockProofHash: ref.blockProofHash,
          })),
        },
      },
      createdAt: Date.now(),
    };
    packet.hcsCandidate.payload.packetId = packet.id;
    this.packets.set(packet.id, packet);
    await this.persist();
    return packet;
  }

  async listPackets(): Promise<LearningAmplificationPacket[]> {
    await this.load();
    return Array.from(this.packets.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getPacket(packetId: string): Promise<LearningAmplificationPacket | undefined> {
    await this.load();
    return this.packets.get(packetId);
  }

  async markHcsSubmitted(
    packetId: string,
    submission: NonNullable<LearningAmplificationPacket['hcsSubmission']>,
  ): Promise<LearningAmplificationPacket> {
    await this.load();
    const packet = this.packets.get(packetId);
    if (!packet) {
      throw new Error(`Learning packet not found: ${packetId}`);
    }
    packet.hcsSubmission = submission;
    await this.persist();
    return packet;
  }

  async attachBlockStreamClosure(
    packetId: string,
    closure: Omit<NonNullable<LearningAmplificationPacket['blockStreamClosure']>, 'attachedAt'>,
  ): Promise<LearningAmplificationPacket> {
    await this.load();
    const packet = this.packets.get(packetId);
    if (!packet) {
      throw new Error(`Learning packet not found: ${packetId}`);
    }
    packet.blockStreamClosure = {
      ...closure,
      attachedAt: Date.now(),
    };
    await this.persist();
    return packet;
  }

  private compactLesson(lesson: string, maxChars: number): string {
    const normalized = lesson.replace(/\s+/g, ' ').trim();
    return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars).trimEnd();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(this.storagePath, 'utf-8');
      const packets = JSON.parse(raw) as LearningAmplificationPacket[];
      this.packets.clear();
      for (const packet of packets) {
        this.packets.set(packet.id, packet);
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'ENOENT') {
        logger.warn('LearningAmplificationPacketStore', {
          message: 'Failed to load learning packets',
          storagePath: this.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.storagePath), { recursive: true });
    await writeFile(this.storagePath, `${JSON.stringify(Array.from(this.packets.values()), null, 2)}\n`, 'utf-8');
  }
}

export const learningAmplificationPackets = new LearningAmplificationPacketStore();
