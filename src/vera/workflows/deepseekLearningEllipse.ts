import { config } from '../../config.js';
import type { VerificationProof } from '../verification/actionVerifier.js';
import type { LearningAmplificationPacket } from './learningAmplificationPackets.js';
import { learningAmplificationPackets } from './learningAmplificationPackets.js';
import type { WorkflowLoopRecord } from './workflowEvidenceLedger.js';
import { workflowEvidenceLedger } from './workflowEvidenceLedger.js';

export interface DeepSeekLearningPrompt {
  workflowLoopId: string;
  subject: string;
  instruction: string;
  evidenceDigest: Array<{
    stage: string;
    source: string;
    summary: string;
    hash?: string;
    transactionId?: string;
    hcsTopicId?: string;
    hcsSequence?: number;
    blockNumber?: number;
    blockProofHash?: string;
  }>;
  outputContract: {
    maxChars: number;
    mustInclude: string[];
    mustAvoid: string[];
  };
}

export interface DeepSeekLearningEllipseResult {
  loop: WorkflowLoopRecord;
  prompt: DeepSeekLearningPrompt;
  packet?: LearningAmplificationPacket;
  hcsProof?: VerificationProof;
}

export function buildDeepSeekLearningPrompt(loop: WorkflowLoopRecord): DeepSeekLearningPrompt {
  return {
    workflowLoopId: loop.id,
    subject: loop.subject,
    instruction: [
      'Synthesize one compact VeraLattice lesson from the proof-backed evidence only.',
      'Do not invent receipts, transaction IDs, outcomes, users, or capabilities.',
      'Return an operator-reviewable lesson that can improve future agents or workflows.',
    ].join(' '),
    evidenceDigest: loop.evidence.map((evidence) => ({
      stage: evidence.stage,
      source: evidence.source,
      summary: evidence.summary,
      hash: evidence.hash,
      transactionId: evidence.transactionId,
      hcsTopicId: evidence.hcsTopicId,
      hcsSequence: evidence.hcsSequence,
      blockNumber: evidence.blockStream?.blockNumber,
      blockProofHash: evidence.blockStream?.blockProofHash,
    })),
    outputContract: {
      maxChars: 2400,
      mustInclude: [
        'what changed or worked',
        'which proof supports it',
        'how Vera should reuse it',
        'what must remain operator-gated',
      ],
      mustAvoid: [
        'raw private prompts',
        'customer payloads',
        'secrets',
        'unsupported production claims',
      ],
    },
  };
}

export async function runDeepSeekLearningEllipse(input: {
  loopId?: string;
  subject?: string;
  lesson?: string;
  qualityScore?: number;
  operatorApproved?: boolean;
  modelProvider?: string;
  modelName?: string;
  publishToHcs?: boolean;
}): Promise<DeepSeekLearningEllipseResult> {
  const loop = input.loopId
    ? await workflowEvidenceLedger.getLoop(input.loopId)
    : await workflowEvidenceLedger.openLoop(input.subject ?? 'DeepSeek learning ellipse', 'lesson', [
        'Opened for high-parameter learning synthesis.',
      ]);

  if (!loop) {
    throw new Error(`Workflow loop not found: ${input.loopId}`);
  }

  const prompt = buildDeepSeekLearningPrompt(loop);
  if (!input.lesson) {
    return { loop, prompt };
  }

  const packet = await learningAmplificationPackets.createFromLoop(loop, {
    modelProvider: input.modelProvider ?? config.VERA_LEARNING_PROVIDER,
    modelName: input.modelName ?? config.VERA_LEARNING_MODEL,
    lesson: input.lesson,
    qualityScore: input.qualityScore ?? config.VERA_LEARNING_MIN_QUALITY_SCORE,
    operatorApproved: input.operatorApproved,
  });

  await workflowEvidenceLedger.recordEvidence(loop.id, {
    source: 'model_synthesis',
    stage: 'lesson',
    summary: `High-parameter learning packet ${packet.id} prepared by ${packet.modelProvider}${packet.modelName ? `/${packet.modelName}` : ''}`,
    hash: packet.lessonHash,
    metadata: {
      packetId: packet.id,
      qualityScore: packet.qualityScore,
      operatorApproved: packet.operatorApproved,
      hcsCandidate: packet.hcsCandidate.shouldLog,
    },
  });

  let hcsProof: VerificationProof | undefined;
  if (input.publishToHcs && packet.hcsCandidate.shouldLog) {
    const topicId = config.VERA_AGENT_LEARNING_TOPIC_ID || config.VERA_COMPLIANCE_AUDIT_TOPIC_ID || config.HCS_TOPIC_ID;
    const { actionVerifier } = await import('../verification/actionVerifier.js');
    hcsProof = await actionVerifier.verifyAction({
      domain: 'learning-amplification',
      type: 'deepseek-elliptical-learning-packet',
      actor: 'vera-learning-ellipse',
      topicId,
      payload: packet.hcsCandidate.payload,
      result: {
        lessonHash: packet.lessonHash,
        qualityScore: packet.qualityScore,
        operatorApproved: packet.operatorApproved,
      },
    });

    await workflowEvidenceLedger.recordEvidence(loop.id, {
      source: 'hcs',
      stage: 'receipt',
      summary: `Learning packet ${packet.id} submitted to HCS${hcsProof.error ? ' with local proof only' : ''}`,
      hash: hcsProof.hash,
      hcsTopicId: hcsProof.topicId,
      hcsSequence: hcsProof.sequenceNumber,
      transactionId: hcsProof.transactionId,
      metadata: {
        packetId: packet.id,
        verified: hcsProof.verified,
        hashscanUrl: hcsProof.hashscanUrl,
        error: hcsProof.error,
      },
    });
    await learningAmplificationPackets.markHcsSubmitted(packet.id, {
      hash: hcsProof.hash,
      topicId: hcsProof.topicId,
      sequenceNumber: hcsProof.sequenceNumber,
      transactionId: hcsProof.transactionId,
      hashscanUrl: hcsProof.hashscanUrl,
      submittedAt: hcsProof.timestamp,
      verified: hcsProof.verified,
    });
  }

  const updated = await workflowEvidenceLedger.getLoop(loop.id);
  return {
    loop: updated ?? loop,
    prompt,
    packet,
    hcsProof,
  };
}
