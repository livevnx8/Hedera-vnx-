/**
 * Vera Shared Types Package
 * Common types for Lattice, Orchestrator, and x402 integration
 */

// ─────────────────────────────────────────────────────────────────────────────
// Lattice Types
// ─────────────────────────────────────────────────────────────────────────────

export type LatticeNodeState = 'superposed' | 'collapsed' | 'entangled';

export interface LatticeNode {
  id: string;
  fieldId: string;
  hypothesis: string;
  state: LatticeNodeState;
  confidence: number;  // 0.0 to 1.0
  evidence: string[];
  coordinates: number[];  // n-dimensional position
  entangledWith: string[];
  createdAt: number;
  collapsedAt?: number;
  metadata?: Record<string, unknown>;
  // Method to add evidence (implemented by class)
  addEvidence?(evidence: string, weight?: number): void;
}

export interface ReasoningField {
  id: string;
  name: string;
  dimensions: string[];
  nodes: Map<string, LatticeNode>;
  coherence: number;
  createdAt: number;
  lastUpdated: number;
}

export interface FieldStats {
  fieldId: string;
  coherence: number;
  averageConfidence: number;
  totalNodes: number;
  collapsedNodes: number;
  entangledPairs: number;
  superposedNodes: number;
}

export interface InterferenceResult {
  nodeA: string;
  nodeB: string;
  interference: number;  // -1 to 1 (destructive to constructive)
  type: 'constructive' | 'destructive' | 'orthogonal';
}

export interface CoherentPath {
  nodes: LatticeNode[];
  totalConfidence: number;
  averageCoherence: number;
  length: number;
}

export interface LatticeRoutingDecision {
  taskId: string;
  recommendedAgents: string[];
  confidence: number;
  estimatedCompletion: number;
  riskFactors: string[];
  requiresHumanReview: boolean;
  reasoningPath?: CoherentPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// x402 Payment Types
// ─────────────────────────────────────────────────────────────────────────────

export type SettlementState = 'pending' | 'processing' | 'settled' | 'failed' | 'partial';
export type SettlementMethod = 'x402' | 'direct_transfer' | 'hts_token' | 'batch_async';
export type Currency = 'HBAR' | 'USDC' | 'DOVU' | 'XSGD';

export interface SettlementRequest {
  settlementId: string;
  taskId: string;
  agentId: string;
  recipientAccountId: string;
  amountHbar: number;
  amountToken?: number;
  currency: Currency;
  method: SettlementMethod;
  state: SettlementState;
  createdAt: number;
  settledAt?: number;
  txId?: string;
  x402PaymentId?: string;
  error?: string;
  retryCount: number;
}

export interface SettlementStats {
  total: number;
  settled: number;
  failed: number;
  pending: number;
  totalHbarPaid: number;
  totalTokensPaid: number;
  averageSettlementMs: number;
  successRate: number;
}

export interface X402Config {
  baseUrl: string;
  apiKey: string;
  facilitatorAccount: string;
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  supportedCurrencies: Currency[];
  enableStreaming: boolean;
  streamChunkSizeHbar: number;
  timeoutMs: number;
}

export interface PaymentStream {
  streamId: string;
  taskId: string;
  agentId: string;
  rateHbarPerSecond: number;
  maxTotalHbar: number;
  state: 'active' | 'paused' | 'completed' | 'failed';
  totalSettled: number;
  lastSettlementAt: number;
  currency: Currency;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator Types
// ─────────────────────────────────────────────────────────────────────────────

export type TaskState =
  | 'posted'
  | 'bidding'
  | 'awarded'
  | 'in_progress'
  | 'delivered'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface TaskIntent {
  taskId: string;
  description: string;
  serviceType: string;
  budget: number;
  requiredConfidence: number;
  deadlineMs: number;
  metadata?: Record<string, unknown>;
}

export interface TaskBid {
  taskId: string;
  agentId: string;
  fee: number;
  confidence: number;
  estimatedDurationMs: number;
  timestamp: number;
  latticeScore?: number;  // Optional lattice-based scoring
}

export interface TaskRecord {
  intent: TaskIntent;
  state: TaskState;
  bids: TaskBid[];
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
  hcsSequence?: number;
  latticeDecision?: LatticeRoutingDecision;
}

export interface AgentRegistration {
  agentId: string;
  service: string;
  feePerTask: number;
  paymentMethod: string;
  availability: boolean;
  proofHash?: string;
  accountId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentReputation {
  agentId: string;
  totalTasks: number;
  acceptedTasks: number;
  rejectedTasks: number;
  averageResponseTimeMs: number;
  totalHbarEarned: number;
  score: number;  // 0-100
  lastUpdated: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Flags & Production Safety
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductionFlags {
  // Network safety
  testnetOnly: boolean;
  dryRunMode: boolean;
  shadowMode: boolean;

  // Gradual rollout
  enableLatticeForServices: string[];
  x402SettlementPercentage: number;
  reputationEngineWeight: number;

  // Component toggles
  enableTaskOrchestrator: boolean;
  enableEscrow: boolean;
  enableX402Settlement: boolean;
  enableAgentSelfRegistration: boolean;
  enableReputationEngine: boolean;
  enableDynamicPricing: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Agent Types
// ─────────────────────────────────────────────────────────────────────────────

export type SubAgentStatus = 'IDLE' | 'BUSY' | 'ERROR';
export type SubAgentType = 'LOAD_PREDICTOR' | 'ANOMALY_DETECTOR' | 'WHALE_TRACKER' | 'THREAT_ANALYZER';

export interface SubAgentConfig {
  id: string;
  parentId: string;
  type: SubAgentType;
  specialty: string;
  taskTimeout: number;
}

export interface SubAgentStats {
  tasksCompleted: number;
  tasksFailed: number;
  avgResponseTime: number;
  successRate: number;
}

export interface SubAgentHealth {
  id: string;
  status: SubAgentStatus;
  successRate: number;
  avgResponseTime: number;
  tasksCompleted: number;
  lastTaskAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// HCS & Hedera Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HCSMessage {
  type: string;
  timestamp: number;
  sequenceNumber?: number;
  topicId: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  data: unknown;
}

export interface PaymentTopics {
  registryTopicId: string;
  taskTopicId: string;
  resultTopicId: string;
  auditTopicId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}
