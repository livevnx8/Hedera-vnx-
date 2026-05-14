export const PROOF_EVENT_TYPES = [
  'task_created',
  'agent_selected',
  'execution_started',
  'result_submitted',
  'verification_passed',
  'verification_failed',
  'settlement_recorded',
  'reputation_updated',
  'hcs_proof_emitted',
  'escalation_human_required',
  'escalation_auto_resolved',
  'escalation_resolved',
  'quantum_enhanced',
  'lattice_enhanced',
  'ensemble_scored',
] as const;

export type ProofEventType = typeof PROOF_EVENT_TYPES[number];

export type VerifiableAITaskPriority = 'low' | 'normal' | 'high';

export interface VerifiableAITaskInput {
  description: string;
  serviceType?: string;
  payload?: Record<string, unknown>;
  budgetHbar?: number;
  requiredConfidence?: number;
  priority?: VerifiableAITaskPriority;
  metadata?: Record<string, unknown>;
}

export interface VerifiableAITask {
  taskId: string;
  description: string;
  serviceType: string;
  payload: Record<string, unknown>;
  budgetHbar: number;
  requiredConfidence: number;
  priority: VerifiableAITaskPriority;
  createdAt: number;
  metadata: Record<string, unknown>;
}

export interface FirstPartyAgentProfile {
  agentId: string;
  name: string;
  serviceTypes: string[];
  capabilities: string[];
  keywords: string[];
  proofRequirements: string[];
  defaultFeeHbar: number;
  reputationSeed: number;
}

export interface AgentSelectionScore {
  agentId: string;
  score: number;
  matched: string[];
  reason: string;
}

export interface AgentExecutionResult {
  agentId: string;
  serviceType: string;
  confidence: number;
  durationMs: number;
  result: Record<string, unknown>;
  proofHash: string;
}

export type MeridianShadowStatus = 'disabled' | 'unavailable' | 'scored';

export interface MeridianShadowScore {
  status: MeridianShadowStatus;
  model?: string;
  backend?: string;
  recommendation?: string;
  confidence?: number;
  proofCompleteness?: 'complete' | 'incomplete' | 'suspicious' | 'operator_review';
  quorum?: {
    total: number;
    scored: number;
    unavailable: number;
    recommendations: Record<string, number>;
    proofCompleteness: Record<string, number>;
  };
  members?: Array<{
    url: string;
    status: MeridianShadowStatus;
    model?: string;
    backend?: string;
    recommendation?: string;
    proofCompleteness?: 'complete' | 'incomplete' | 'suspicious' | 'operator_review';
    error?: string;
  }>;
  raw?: unknown;
  error?: string;
  // Quantum enhancement properties
  quantumEnhanced?: boolean;
  cached?: boolean;
  cacheHitCount?: number;
  quantumMetrics?: {
    coherence?: number;
    amplification?: number;
    boost?: number;
  };
}

export interface ProofEvent {
  eventId: string;
  taskId: string;
  type: ProofEventType;
  summary: string;
  timestamp: number;
  hash: string;
  previousHash?: string;
  agentId?: string;
  hcsTopicId?: string;
  hcsSequence?: number;
  transactionId?: string;
  metadata: Record<string, unknown>;
}

export interface ProofKernelVerification {
  outcome: 'accepted' | 'rejected' | 'needs_review';
  score: number;
  details: string[];
}

export interface ProofKernelSettlement {
  state: 'recorded' | 'simulated' | 'skipped';
  amountHbar: number;
  reason: string;
}

export interface ProofKernelReputation {
  agentId: string;
  delta: number;
  scoreAfter: number;
  basis: string;
}

export interface VerifiableAIProofRun {
  runId: string;
  taskId: string;
  status: 'proof_complete' | 'needs_review' | 'failed' | 'escalated';
  productionLabel: 'prototype' | 'testnet-ready' | 'production';
  escalation?: {
    id: string;
    status: 'pending_human_review' | 'approved' | 'rejected';
    triggeredRules: string[];
  };
  task: VerifiableAITask;
  selectedAgent: FirstPartyAgentProfile;
  selection: {
    scores: AgentSelectionScore[];
    meridian: MeridianShadowScore;
  };
  execution: AgentExecutionResult;
  verification: ProofKernelVerification;
  settlement: ProofKernelSettlement;
  reputation: ProofKernelReputation;
  events: ProofEvent[];
  receipt: {
    localProofHash: string;
    hcsTopicId?: string;
    hcsSequence?: number;
    transactionId?: string;
    hashscanUrl?: string;
  };
  memoryPacket?: {
    eventId: string;
    eventType: string;
    packetHash: string;
    schema: string;
    hcsWriteMode?: 'submitted' | 'dry_run' | 'skipped' | 'failed';
    hcsWriteReason?: string;
    hcsTopicId?: string;
    hcsSequence?: number;
    transactionId?: string;
    hashscanUrl?: string;
    chunks?: number;
  };
  createdAt: number;
  updatedAt: number;
}
