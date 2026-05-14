import { config } from '../../config.js';

export type WorkflowFocus = 'work' | 'proof';

export type EllipticalWorkflowStage =
  | 'brief'
  | 'task'
  | 'bid'
  | 'award'
  | 'execution'
  | 'verification'
  | 'settlement'
  | 'reputation'
  | 'receipt'
  | 'lesson'
  | 'upgrade_package';

export type EvidenceSource =
  | 'hcs'
  | 'hip1056_block_stream'
  | 'model_synthesis'
  | 'test'
  | 'settlement'
  | 'reputation'
  | 'operator_review'
  | 'dashboard_metric';

export interface EllipticalWorkflowStep {
  stage: EllipticalWorkflowStage;
  focus: WorkflowFocus;
  label: string;
  description: string;
  requiredEvidence: EvidenceSource[];
  latticeNodeTypes: string[];
}

export interface HcsMemoryPlaneModel {
  role: string;
  writePolicy: Array<{
    lane: 'critical' | 'high' | 'normal' | 'low';
    behavior: string;
    examples: string[];
  }>;
  hipCapabilities: Array<{
    hip: 'HIP-993' | 'HIP-1056' | 'HIP-991' | 'HIP-1200';
    role: string;
    veraUse: string;
    readiness: 'wired' | 'planned' | 'shimmed' | 'observe-first';
  }>;
  replayIndexes: string[];
}

export interface LatticeAbility {
  id: string;
  name: string;
  role: string;
  hcsEvents: string[];
  latticeNodes: string[];
  promotionEvidence: EvidenceSource[];
}

export interface WorkflowRecipe {
  id: string;
  name: string;
  purpose: string;
  path: EllipticalWorkflowStage[];
  hcsTopicPreference: string[];
  emits: string[];
  closesWhen: string[];
}

export interface ProofSurface {
  id: string;
  surface: 'api' | 'dashboard' | 'script' | 'worker';
  path: string;
  purpose: string;
  readiness: 'wired' | 'planned' | 'prototype';
  mustExpose: string[];
}

export interface HcsRiskControl {
  risk: string;
  control: string;
  enforcement: string;
}

export interface PromotionMilestone {
  label: string;
  requiredProof: string[];
  exitsWith: string;
}

export interface BlockStreamEvidencePlan {
  hip: 'HIP-1056';
  status: 'approved';
  role: string;
  captures: Array<{
    item: string;
    whyVeraNeedsIt: string;
  }>;
  ingestionPolicy: {
    allowed: boolean;
    mode: 'observe-first' | 'disabled';
    storeRawBlocks: boolean;
    persistOnly: string[];
  };
}

export interface EllipticalWorkflowModel {
  name: 'VeraLattice Elliptical Proof Workflow';
  principle: string;
  foci: Array<{
    focus: WorkflowFocus;
    name: string;
    purpose: string;
  }>;
  loop: EllipticalWorkflowStep[];
  hcsMemoryPlane: HcsMemoryPlaneModel;
  latticeAbilities: LatticeAbility[];
  workflowRecipes: WorkflowRecipe[];
  proofSurfaces: ProofSurface[];
  riskControls: HcsRiskControl[];
  promotionMilestones: PromotionMilestone[];
  blockStream: BlockStreamEvidencePlan;
  learningAmplification: {
    role: string;
    preferredProviders: string[];
    packetPolicy: {
      storeRawPrompts: boolean;
      storeRawModelResponses: boolean;
      maxLessonChars: number;
      hcsPayload: string[];
    };
    guardrails: string[];
  };
  promotionGate: {
    productionClaimRequires: string[];
    learningRecordRequires: string[];
  };
}

export function getWorkflowStep(stage: EllipticalWorkflowStage): EllipticalWorkflowStep {
  const step = loop.find((item) => item.stage === stage);
  if (!step) {
    throw new Error(`Unknown workflow stage: ${stage}`);
  }
  return step;
}

export function getWorkflowStages(): EllipticalWorkflowStage[] {
  return loop.map((step) => step.stage);
}

const loop: EllipticalWorkflowStep[] = [
  {
    stage: 'brief',
    focus: 'work',
    label: 'Brief intake',
    description: 'Convert requester intent into a bounded task shape, risk notes, and success criteria.',
    requiredEvidence: ['operator_review'],
    latticeNodeTypes: ['capability', 'lesson'],
  },
  {
    stage: 'task',
    focus: 'work',
    label: 'Task posted',
    description: 'Publish a marketplace task with typed requirements and expected proof outputs.',
    requiredEvidence: ['hcs'],
    latticeNodeTypes: ['surface', 'capability', 'proof'],
  },
  {
    stage: 'bid',
    focus: 'work',
    label: 'Agent bids',
    description: 'Collect bids with price, capability, reputation, and settlement terms.',
    requiredEvidence: ['hcs', 'reputation'],
    latticeNodeTypes: ['capability', 'proof'],
  },
  {
    stage: 'award',
    focus: 'work',
    label: 'Winner selected',
    description: 'Award the task using policy, bid fit, reputation, and requester constraints.',
    requiredEvidence: ['hcs', 'operator_review'],
    latticeNodeTypes: ['capability', 'proof'],
  },
  {
    stage: 'execution',
    focus: 'work',
    label: 'Agent executes',
    description: 'Run the task through the chosen agent while collecting deterministic output metadata.',
    requiredEvidence: ['dashboard_metric'],
    latticeNodeTypes: ['capability', 'surface'],
  },
  {
    stage: 'verification',
    focus: 'proof',
    label: 'Result verified',
    description: 'Validate output schema, proof hash, domain checks, and failure reasons.',
    requiredEvidence: ['test', 'hcs', 'hip1056_block_stream'],
    latticeNodeTypes: ['proof'],
  },
  {
    stage: 'settlement',
    focus: 'proof',
    label: 'Payment settles',
    description: 'Release escrow or record x402/HBAR settlement with fee accounting.',
    requiredEvidence: ['settlement', 'hcs', 'hip1056_block_stream'],
    latticeNodeTypes: ['proof', 'capability'],
  },
  {
    stage: 'reputation',
    focus: 'proof',
    label: 'Reputation updates',
    description: 'Update agent score from verified outcome, settlement reliability, and dispute state.',
    requiredEvidence: ['reputation', 'hcs'],
    latticeNodeTypes: ['proof', 'capability'],
  },
  {
    stage: 'receipt',
    focus: 'proof',
    label: 'Proof receipt closes loop',
    description: 'Attach HCS IDs, block-stream references, hashes, and dashboard metrics to the task record.',
    requiredEvidence: ['hcs', 'hip1056_block_stream', 'dashboard_metric'],
    latticeNodeTypes: ['proof'],
  },
  {
    stage: 'lesson',
    focus: 'proof',
    label: 'Lesson distilled',
    description: 'Create a compact, operator-reviewable lesson from proof-backed outcomes only.',
    requiredEvidence: ['operator_review', 'test', 'hcs'],
    latticeNodeTypes: ['lesson'],
  },
  {
    stage: 'upgrade_package',
    focus: 'work',
    label: 'Package promoted',
    description: 'Promote repeated proof-backed lessons into reusable marketplace capability packages.',
    requiredEvidence: ['operator_review', 'test', 'settlement', 'reputation'],
    latticeNodeTypes: ['upgrade_package'],
  },
];

const hcsMemoryPlane: HcsMemoryPlaneModel = {
  role: 'Use HCS as VeraLattice\'s low-cost consensus memory plane for compact proof packets, not as bulk storage.',
  writePolicy: [
    {
      lane: 'critical',
      behavior: 'Submit immediately and require follow-up mirror replay before the packet becomes usable memory.',
      examples: ['settlement.released', 'verification.failed', 'policy.exception'],
    },
    {
      lane: 'high',
      behavior: 'Submit within the active workflow tick and attach the transaction reference to the proof run.',
      examples: ['task.awarded', 'result.verified', 'reputation.updated'],
    },
    {
      lane: 'normal',
      behavior: 'Batch compact lifecycle summaries through HIP-993 when latency is not user-facing.',
      examples: ['task.posted', 'bid.submitted', 'lesson.candidate'],
    },
    {
      lane: 'low',
      behavior: 'Keep off-chain unless promoted by operator review, incident review, or product proof needs.',
      examples: ['debug.metric', 'health.sample', 'draft.lesson'],
    },
  ],
  hipCapabilities: [
    {
      hip: 'HIP-993',
      role: 'Large HCS message transport and chunk reconstruction.',
      veraUse: 'Carry compact Vera memory packets with max 4096 byte chunks, sequence tracking, and replay-safe message IDs.',
      readiness: 'wired',
    },
    {
      hip: 'HIP-1056',
      role: 'Block-stream evidence lane.',
      veraUse: 'Attach block number, transaction order, state-change summaries, and block proof hashes to production claims.',
      readiness: 'observe-first',
    },
    {
      hip: 'HIP-991',
      role: 'Revenue-generating topic posture.',
      veraUse: 'Future premium proof topics where customers or partners pay for high-assurance public evidence streams.',
      readiness: 'planned',
    },
    {
      hip: 'HIP-1200',
      role: 'Threshold-signature council posture.',
      veraUse: 'Future multi-operator approvals for sensitive upgrades, policy exceptions, and model promotion gates.',
      readiness: 'shimmed',
    },
  ],
  replayIndexes: [
    'taskId',
    'agentId',
    'eventType',
    'packetHash',
    'transactionId',
    'sequenceNumber',
    'learningPackageId',
    'modelId',
  ],
};

const latticeAbilities: LatticeAbility[] = [
  {
    id: 'proof-backed-recall',
    name: 'Proof-backed recall',
    role: 'Retrieve task, result, settlement, reputation, and lesson context only when the packet hash and HCS references verify.',
    hcsEvents: ['task.proof_complete', 'result.verified', 'settlement.released', 'reputation.updated'],
    latticeNodes: ['proof', 'capability', 'lesson'],
    promotionEvidence: ['hcs', 'test', 'dashboard_metric'],
  },
  {
    id: 'agent-reputation-memory',
    name: 'Agent reputation memory',
    role: 'Build agent scorecards from verified outcomes instead of self-claimed capability.',
    hcsEvents: ['bid.submitted', 'result.verified', 'settlement.released', 'reputation.updated'],
    latticeNodes: ['capability', 'proof'],
    promotionEvidence: ['hcs', 'settlement', 'reputation'],
  },
  {
    id: 'workflow-recovery',
    name: 'Workflow recovery',
    role: 'Rebuild local marketplace state by replaying configured HCS topics and validating packet hashes.',
    hcsEvents: ['task.posted', 'task.awarded', 'result.verified', 'settlement.released', 'lesson.approved'],
    latticeNodes: ['surface', 'proof'],
    promotionEvidence: ['hcs', 'hip1056_block_stream', 'test'],
  },
  {
    id: 'upgrade-package-provenance',
    name: 'Upgrade package provenance',
    role: 'Promote repeated proof-backed lessons into reusable Vera capabilities with traceable source receipts.',
    hcsEvents: ['lesson.approved', 'lesson.superseded', 'upgrade_package.published'],
    latticeNodes: ['lesson', 'upgrade_package', 'capability'],
    promotionEvidence: ['operator_review', 'hcs', 'test'],
  },
  {
    id: 'policy-corrective-memory',
    name: 'Policy and correction memory',
    role: 'Preserve immutable history while marking corrected, superseded, or unsafe packets out of active retrieval.',
    hcsEvents: ['policy.reviewed', 'policy.blocked', 'memory.corrected', 'lesson.superseded'],
    latticeNodes: ['proof', 'lesson'],
    promotionEvidence: ['operator_review', 'hcs'],
  },
];

const workflowRecipes: WorkflowRecipe[] = [
  {
    id: 'marketplace-proof-loop',
    name: 'Marketplace proof loop',
    purpose: 'Close a customer task with verifiable output, settlement, reputation, and replayable HCS memory.',
    path: ['brief', 'task', 'bid', 'award', 'execution', 'verification', 'settlement', 'reputation', 'receipt'],
    hcsTopicPreference: ['VERA_TASK_TOPIC_ID', 'VERA_RESULT_TOPIC_ID', 'VERA_AUDIT_TOPIC_ID'],
    emits: ['task.posted', 'bid.submitted', 'task.awarded', 'result.verified', 'settlement.released', 'reputation.updated'],
    closesWhen: ['packet validation passes', 'HCS or dry-run receipt exists', 'mirror replay indexes by task, agent, event, and hash'],
  },
  {
    id: 'lesson-to-upgrade-loop',
    name: 'Lesson to upgrade loop',
    purpose: 'Turn a closed proof loop into an operator-approved reusable marketplace capability.',
    path: ['receipt', 'lesson', 'upgrade_package'],
    hcsTopicPreference: ['VERA_AGENT_LEARNING_TOPIC_ID', 'VERA_COMPLIANCE_AUDIT_TOPIC_ID', 'HCS_TOPIC_ID'],
    emits: ['lesson.candidate', 'lesson.approved', 'upgrade_package.published'],
    closesWhen: ['lesson is operator approved', 'lesson hash points to source evidence', 'upgrade package has tests or review evidence'],
  },
  {
    id: 'mirror-recovery-loop',
    name: 'Mirror recovery loop',
    purpose: 'Prove Vera can rebuild useful memory from HCS/mirror-node history after local state loss.',
    path: ['task', 'verification', 'settlement', 'reputation', 'receipt'],
    hcsTopicPreference: ['VERA_AUDIT_TOPIC_ID', 'VERA_TASK_TOPIC_ID', 'VERA_RESULT_TOPIC_ID'],
    emits: ['memory.replayed', 'memory.indexed', 'memory.gap_detected', 'memory.recovery_reported'],
    closesWhen: ['topic replay completes', 'packet hashes verify', 'gaps and corrections are reported'],
  },
];

const proofSurfaces: ProofSurface[] = [
  {
    id: 'workflow-map-api',
    surface: 'api',
    path: 'GET /api/vera/workflows/elliptical-proof',
    purpose: 'Expose the operator-readable contract for proof loops, HIP lanes, lattice abilities, and promotion gates.',
    readiness: 'wired',
    mustExpose: ['loop', 'hcsMemoryPlane', 'latticeAbilities', 'workflowRecipes', 'promotionGate'],
  },
  {
    id: 'memory-loop-script',
    surface: 'script',
    path: 'npx tsx scripts/prove-vera-memory-loop.ts',
    purpose: 'Generate a local evidence packet that proves proof-run creation, memory packet validation, and mirror replay indexing.',
    readiness: 'wired',
    mustExpose: ['runId', 'taskId', 'packetHash', 'packetIssues', 'replay.indexedPackets'],
  },
  {
    id: 'memory-replay-worker',
    surface: 'worker',
    path: 'src/vera/memory/mirrorReplayWorker.ts',
    purpose: 'Reconstruct Vera memory packets from mirror-node messages and index them by task, agent, event, and hash.',
    readiness: 'wired',
    mustExpose: ['sequenceNumber', 'consensusTimestamp', 'packetHash', 'invalidPackets', 'pendingChunkGroups'],
  },
  {
    id: 'memory-proof-api',
    surface: 'api',
    path: 'GET /api/vera/memory/proof/:hash',
    purpose: 'Return a proof-backed memory record with HCS references, current/superseded state, and dashboard links.',
    readiness: 'planned',
    mustExpose: ['packetHash', 'topicId', 'sequenceNumber', 'transactionId', 'hashscanUrl', 'current'],
  },
  {
    id: 'proof-dashboard',
    surface: 'dashboard',
    path: '/vera/proof',
    purpose: 'Show task lifecycle, HCS receipt status, replay state, settlement, reputation, and unresolved gaps.',
    readiness: 'planned',
    mustExpose: ['task lifecycle', 'HCS links', 'settlement state', 'reputation delta', 'replay health'],
  },
];

const riskControls: HcsRiskControl[] = [
  {
    risk: 'Raw private data is written to immutable HCS topics.',
    control: 'Only compact hashes, summaries, and approved references belong in memory packets.',
    enforcement: 'Policy check before HCS emission, plus correction packet if an unsafe reference is discovered.',
  },
  {
    risk: 'A model treats unverified memory as production truth.',
    control: 'Lattice abilities must declare promotion evidence and retrieval policy before influencing behavior.',
    enforcement: 'Use proof-backed recall only after packet hash validation and replay indexing.',
  },
  {
    risk: 'Local dashboard state diverges from Hedera history.',
    control: 'Mirror replay is the recovery source for task, agent, event, and packet hash indexes.',
    enforcement: 'Recovery report must list missing sequences, invalid packets, and unresolved corrections.',
  },
  {
    risk: 'HCS costs rise from noisy telemetry.',
    control: 'Critical/high events write promptly; normal events batch; low-value telemetry stays off-chain.',
    enforcement: 'Write lane classification in the HCS memory plane model and cost-report review before promotion.',
  },
];

const promotionMilestones: PromotionMilestone[] = [
  {
    label: 'local-proof',
    requiredProof: ['deterministic tests pass', 'local memory packet validates', 'local mirror replay indexes one packet'],
    exitsWith: 'prototype claim: local proof loop is working',
  },
  {
    label: 'testnet-proof',
    requiredProof: ['funded testnet HCS transaction ID', 'topic ID and sequence number', 'HashScan link', 'mirror-node replay confirms packet'],
    exitsWith: 'testnet-ready claim: Vera can write and replay Hedera memory',
  },
  {
    label: 'dashboard-proof',
    requiredProof: ['proof dashboard reads replay index', 'settlement and reputation visible', 'corrections/supersession shown'],
    exitsWith: 'operator claim: proof loop can be inspected by humans',
  },
  {
    label: 'production-proof',
    requiredProof: ['mainnet or production topic policy approved', 'cost guardrails active', 'rollback/correction story tested', 'privacy review complete'],
    exitsWith: 'production claim: Vera memory plane is ready for customer-facing proof',
  },
];

export function getEllipticalProofWorkflowModel(): EllipticalWorkflowModel {
  return {
    name: 'VeraLattice Elliptical Proof Workflow',
    principle: 'Every Vera workflow moves around two foci: useful marketplace work and verifiable evidence that can safely teach the lattice.',
    foci: [
      {
        focus: 'work',
        name: 'Marketplace work',
        purpose: 'Turn requester intent into agent execution, settlement, and reusable capability.',
      },
      {
        focus: 'proof',
        name: 'Verifiable proof',
        purpose: 'Close each loop with tests, HCS receipts, settlement records, reputation updates, and HIP-1056 block-stream evidence.',
      },
    ],
    loop,
    hcsMemoryPlane,
    latticeAbilities,
    workflowRecipes,
    proofSurfaces,
    riskControls,
    promotionMilestones,
    blockStream: {
      hip: 'HIP-1056',
      status: 'approved',
      role: 'Use block streams as a verifiable evidence lane for task receipts, state changes, settlement confirmation, and reputation updates.',
      captures: [
        {
          item: 'BlockHeader and block number',
          whyVeraNeedsIt: 'Stable ordering for marketplace events and receipt timelines.',
        },
        {
          item: 'Transaction inputs and outputs',
          whyVeraNeedsIt: 'Connect task, bid, award, result, settlement, and reputation events back to network execution.',
        },
        {
          item: 'State changes',
          whyVeraNeedsIt: 'Verify that settlement and reputation transitions became ledger-backed state.',
        },
        {
          item: 'BlockProof and TSS-BLS signature',
          whyVeraNeedsIt: 'Attach network-verifiable proof before promoting a production claim or learning record.',
        },
      ],
      ingestionPolicy: {
        allowed: config.VERA_LEARNING_ALLOW_BLOCK_STREAM === 'true',
        mode: config.VERA_LEARNING_ALLOW_BLOCK_STREAM === 'true' ? 'observe-first' : 'disabled',
        storeRawBlocks: false,
        persistOnly: [
          'blockNumber',
          'consensusTimestamp',
          'transactionId',
          'topicId',
          'scheduleId',
          'proofHash',
          'stateChangeSummary',
          'blockProofHash',
        ],
      },
    },
    learningAmplification: {
      role: 'Use high-parameter models as optional synthesizers over compact proof packets, never as the source of truth.',
      preferredProviders: [
        'nvidia-nemotron',
        'nvidia-nim',
        'vllm',
        'qvx',
        'deepseek',
      ],
      packetPolicy: {
        storeRawPrompts: false,
        storeRawModelResponses: false,
        maxLessonChars: 2400,
        hcsPayload: [
          'packetId',
          'workflowLoopId',
          'lessonHash',
          'modelProvider',
          'modelName',
          'qualityScore',
          'evidenceRefs',
          'blockStreamRefs',
        ],
      },
      guardrails: [
        'High-parameter synthesis can propose lessons, but cannot close proof loops by itself.',
        'Only compact lesson hashes, evidence references, and operator-approved summaries should be logged to HCS.',
        'Raw private prompts, customer payloads, secrets, and full model traces stay out of Hedera logs.',
        'External model lanes remain optional and swappable; Vera must keep operating when they are disabled.',
      ],
    },
    promotionGate: {
      productionClaimRequires: [
        'passing deterministic tests',
        'locally runnable or deployed endpoint/script/dashboard',
        'HCS receipt or HIP-1056 block-stream reference',
        'settlement/reputation/audit metric when the workflow touches marketplace value',
        'operator rollback or failure behavior',
      ],
      learningRecordRequires: [
        'operator-approved compact lesson',
        'no private secrets or raw customer payloads',
        'no raw high-parameter model trace unless explicitly marked learnable by the operator',
        'pointer to task, test, receipt, settlement, reputation update, or dashboard metric',
      ],
    },
  };
}
