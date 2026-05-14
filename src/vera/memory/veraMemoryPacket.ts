import { canonicalJson, sha256Base64 } from '../../crypto.js';
import type { VerifiableAIProofRun } from '../proofKernel/types.js';

export interface VeraMemoryPacket {
  _vera: {
    schema: 'vera.memory.packet.v1';
    eventType: string;
    eventId: string;
    network: string;
    source: string;
    createdAt: string;
    taskId?: string;
    agentId?: string;
    runId?: string;
    correlationId?: string;
    learnable: boolean;
    privacy: 'public_summary' | 'internal' | 'restricted';
  };
  _hip993: {
    type: 'VERA_MEMORY_PACKET';
    version: '1.0.0';
    max_chunk_size: 4096;
    features: string[];
  };
  proof: {
    payloadHash?: string;
    resultHash?: string;
    settlementHash?: string;
    reputationHash?: string;
    eventChainHash: string;
    packetHash: string | null;
  };
  summary: {
    status: string;
    confidence: number;
    shortText: string;
  };
  refs: {
    localRecordId: string;
    dashboardPath: string;
    artifactUri?: string;
    hcsTopicId?: string;
    hcsSequence?: number;
    transactionId?: string;
    hashscanUrl?: string;
    blockStreamRef: string | null;
  };
}

export interface VeraMemoryPacketInput {
  eventType: string;
  eventId: string;
  network: string;
  source: string;
  createdAt: string;
  taskId?: string;
  agentId?: string;
  runId?: string;
  correlationId?: string;
  learnable?: boolean;
  privacy?: VeraMemoryPacket['_vera']['privacy'];
  proof: Omit<VeraMemoryPacket['proof'], 'packetHash'>;
  summary: VeraMemoryPacket['summary'];
  refs: VeraMemoryPacket['refs'];
}

export function buildVeraMemoryPacket(input: VeraMemoryPacketInput): VeraMemoryPacket {
  const packet: VeraMemoryPacket = {
    _vera: {
      schema: 'vera.memory.packet.v1',
      eventType: input.eventType,
      eventId: input.eventId,
      network: input.network,
      source: input.source,
      createdAt: input.createdAt,
      taskId: input.taskId,
      agentId: input.agentId,
      runId: input.runId,
      correlationId: input.correlationId,
      learnable: input.learnable ?? false,
      privacy: input.privacy ?? 'public_summary',
    },
    _hip993: {
      type: 'VERA_MEMORY_PACKET',
      version: '1.0.0',
      max_chunk_size: 4096,
      features: ['chunking', 'sequence_tracking', 'integrity_hash', 'mirror_replay'],
    },
    proof: {
      ...input.proof,
      packetHash: null,
    },
    summary: input.summary,
    refs: input.refs,
  };

  packet.proof.packetHash = hashMemoryPacket(packet);
  return packet;
}

export function hashMemoryPacket(packet: VeraMemoryPacket): string {
  return sha256Base64(canonicalJson({
    ...packet,
    proof: {
      ...packet.proof,
      packetHash: null,
    },
  }));
}

export function validateVeraMemoryPacket(packet: VeraMemoryPacket): string[] {
  const missing: string[] = [];
  if (!packet._vera.schema) missing.push('_vera.schema');
  if (!packet._vera.eventType) missing.push('_vera.eventType');
  if (!packet._vera.eventId) missing.push('_vera.eventId');
  if (!packet._vera.network) missing.push('_vera.network');
  if (!packet._vera.source) missing.push('_vera.source');
  if (!packet._vera.createdAt) missing.push('_vera.createdAt');
  if (!packet.proof.packetHash) missing.push('proof.packetHash');
  if (!packet.refs.localRecordId && !packet.refs.dashboardPath && !packet.refs.artifactUri) {
    missing.push('refs');
  }
  if (!packet._vera.taskId && !packet._vera.agentId && !packet._vera.runId && !packet._vera.correlationId) {
    missing.push('domain identifier');
  }
  return missing;
}

export function buildProofRunMemoryPacket(
  run: Pick<
    VerifiableAIProofRun,
    | 'runId'
    | 'task'
    | 'selectedAgent'
    | 'execution'
    | 'verification'
    | 'settlement'
    | 'reputation'
    | 'events'
    | 'receipt'
    | 'status'
    | 'createdAt'
  >,
  options: { network: string; eventId?: string; createdAtIso?: string } = { network: 'testnet' },
): VeraMemoryPacket {
  const eventChainHash = sha256Base64(canonicalJson(run.events.map((event) => event.hash)));
  const settlementHash = sha256Base64(canonicalJson(run.settlement));
  const reputationHash = sha256Base64(canonicalJson(run.reputation));
  const confidence = Number((run.execution.confidence ?? run.verification.score ?? 0).toFixed(4));

  return buildVeraMemoryPacket({
    eventType: 'task.proof_complete',
    eventId: options.eventId ?? `evt-${run.runId}`,
    network: options.network,
    source: 'vera-proof-kernel',
    createdAt: options.createdAtIso ?? new Date(run.createdAt).toISOString(),
    taskId: run.task.taskId,
    agentId: run.selectedAgent.agentId,
    runId: run.runId,
    correlationId: run.runId,
    learnable: false,
    privacy: 'public_summary',
    proof: {
      payloadHash: sha256Base64(canonicalJson({
        description: run.task.description,
        serviceType: run.task.serviceType,
        payload: run.task.payload,
      })),
      resultHash: run.execution.proofHash,
      settlementHash,
      reputationHash,
      eventChainHash,
    },
    summary: {
      status: run.status,
      confidence,
      shortText: `Verifiable AI task ${run.task.taskId} closed with ${run.verification.outcome} verification and ${run.settlement.state} settlement.`,
    },
    refs: {
      localRecordId: run.runId,
      dashboardPath: `/api/vera/verifiable-ai/runs/${run.runId}`,
      hcsTopicId: run.receipt.hcsTopicId,
      hcsSequence: run.receipt.hcsSequence,
      transactionId: run.receipt.transactionId,
      hashscanUrl: run.receipt.hashscanUrl,
      blockStreamRef: null,
    },
  });
}
