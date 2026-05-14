import { createHash } from 'node:crypto';
import {
  selectVnxSwarmSpecialists,
  type VnxSwarmSelection,
} from './swarmPromptContext.js';

export type VnxWorkflowMode = 'assistive' | 'parallel' | 'proofed' | 'learning';
export type VnxWorkflowStage =
  | 'intake'
  | 'specialist_parallel'
  | 'synthesis'
  | 'verification'
  | 'receipt'
  | 'learning';

export interface VnxWorkflowLane {
  id: string;
  specialistId: string;
  specialistName: string;
  stage: VnxWorkflowStage;
  parallelGroup: number;
  role: string;
  routeScore: number;
  baseScore: number;
  adaptiveWeight: number;
  reasons: string[];
  expectedOutput: string;
  proofRequired: string[];
}

export interface VnxLearningHook {
  id: string;
  trigger: string;
  sourceStages: VnxWorkflowStage[];
  lessonCandidate: string;
  promotionGate: string[];
}

export interface VnxLatticeWorkflowPlan {
  standard: 'VNX-LATTICE-WORKFLOW-1';
  id: string;
  createdAt: string;
  intent: string;
  mode: VnxWorkflowMode;
  selectedSpecialists: Array<{
    id: string;
    name: string;
    score: number;
    reasons: string[];
  }>;
  stages: Array<{
    stage: VnxWorkflowStage;
    parallel: boolean;
    description: string;
    lanes: string[];
  }>;
  lanes: VnxWorkflowLane[];
  proofGates: string[];
  learningHooks: VnxLearningHook[];
  workflowSummary: string;
}

const ROLE_BY_SPECIALIST: Record<string, Pick<VnxWorkflowLane, 'role' | 'expectedOutput'> & { proofRequired: string[] }> = {
  'vera-dialogue': {
    role: 'Translate the plan into clear operator-facing guidance.',
    expectedOutput: 'Concise answer framing, assumptions, and next action.',
    proofRequired: ['operator review for tone and claim boundaries'],
  },
  'qvx-telemetry': {
    role: 'Check runtime posture, metrics, latency, GPU/QVX signals, and observable health.',
    expectedOutput: 'Telemetry checklist and metrics that should be captured.',
    proofRequired: ['dashboard metric or QVX signal reference'],
  },
  'ledger-ops': {
    role: 'Map Hedera actions, HCS topics, receipts, transaction IDs, and HashScan references.',
    expectedOutput: 'Ledger proof plan with required topic or transaction evidence.',
    proofRequired: ['HCS transaction/topic reference', 'mirror or HashScan lookup when live'],
  },
  'proof-kernel': {
    role: 'Define hashes, attestations, verification checks, and promotion evidence.',
    expectedOutput: 'Proof packet schema and pass/fail gate.',
    proofRequired: ['hash-only proof packet', 'test or verifier result'],
  },
  'manifesto-spirit': {
    role: 'Keep the narrative sovereign, grounded, and aligned with VeraLattice claims.',
    expectedOutput: 'Positioning guidance with overclaim risks removed.',
    proofRequired: ['operator review for public claims'],
  },
  'code-forge': {
    role: 'Identify code paths, implementation slices, and tests.',
    expectedOutput: 'Patch plan with files, commands, and expected test proof.',
    proofRequired: ['focused test output', 'build output when code changes'],
  },
  'security-warden': {
    role: 'Audit secrets, signing, auth, trust boundaries, and approval requirements.',
    expectedOutput: 'Security checklist with approval gates.',
    proofRequired: ['security review note', 'no raw secret disclosure'],
  },
  'memory-weave': {
    role: 'Separate recalled/session context from verified facts and learning candidates.',
    expectedOutput: 'Memory boundary note and recall/proof separation.',
    proofRequired: ['source reference for any reusable memory'],
  },
  'creative-nexus': {
    role: 'Improve naming, copy, UX feel, and product story.',
    expectedOutput: 'Operator-ready language that avoids technical inflation.',
    proofRequired: ['operator review for messaging'],
  },
  'logic-sage': {
    role: 'Expose assumptions, dependencies, decision points, and rigorous sequencing.',
    expectedOutput: 'Decision tree and dependency order.',
    proofRequired: ['explicit assumptions and unresolved risks'],
  },
  'data-weaver': {
    role: 'Define measurements, comparison fields, distributions, and datasets.',
    expectedOutput: 'Data capture and scoring plan.',
    proofRequired: ['dataset hash or metric summary'],
  },
  'network-pulse': {
    role: 'Plan topology, routing health, parallel coordination, and node load.',
    expectedOutput: 'Parallel lane map with coordination points.',
    proofRequired: ['route map and bounded concurrency note'],
  },
};

export function planVnxLatticeWorkflow(
  intent: string,
  {
    mode = 'parallel',
    maxSpecialists = 4,
    routeWeights = {},
  }: { mode?: VnxWorkflowMode; maxSpecialists?: number; routeWeights?: Record<string, number> } = {},
): VnxLatticeWorkflowPlan {
  const selected = selectVnxSwarmSpecialists(intent, {
    limit: maxSpecialists,
    routeWeights,
  });
  const lanes = buildLanes(selected, mode);
  const stages = buildStages(lanes, mode);
  const proofGates = buildProofGates(lanes, mode);
  const learningHooks = buildLearningHooks(lanes, mode);
  const id = createWorkflowId(intent, selected);

  return {
    standard: 'VNX-LATTICE-WORKFLOW-1',
    id,
    createdAt: new Date().toISOString(),
    intent,
    mode,
    selectedSpecialists: selected.map((item) => ({
      id: item.id,
      name: item.name,
      score: item.score,
      reasons: item.reasons,
    })),
    stages,
    lanes,
    proofGates,
    learningHooks,
    workflowSummary: summarizeWorkflow(mode, selected, lanes),
  };
}

function buildLanes(selected: VnxSwarmSelection[], mode: VnxWorkflowMode): VnxWorkflowLane[] {
  const specialistStage = mode === 'assistive' ? 'synthesis' : 'specialist_parallel';
  return selected.map((item, index) => {
    const profile = ROLE_BY_SPECIALIST[item.id] || {
      role: item.guidance,
      expectedOutput: 'Specialist advisory note.',
      proofRequired: ['operator review'],
    };

    return {
      id: `lane-${String(index + 1).padStart(2, '0')}-${item.id}`,
      specialistId: item.id,
      specialistName: item.name,
      stage: specialistStage,
      parallelGroup: mode === 'parallel' || mode === 'proofed' || mode === 'learning' ? 1 : index + 1,
      role: profile.role,
      routeScore: item.score,
      baseScore: item.baseScore,
      adaptiveWeight: item.adaptiveWeight,
      reasons: item.reasons,
      expectedOutput: profile.expectedOutput,
      proofRequired: profile.proofRequired,
    };
  });
}

function buildStages(lanes: VnxWorkflowLane[], mode: VnxWorkflowMode): VnxLatticeWorkflowPlan['stages'] {
  const stageList: VnxLatticeWorkflowPlan['stages'] = [
    {
      stage: 'intake',
      parallel: false,
      description: 'Normalize intent, choose VNX specialists, and record why each lane is active.',
      lanes: [],
    },
  ];

  if (mode !== 'assistive') {
    stageList.push({
      stage: 'specialist_parallel',
      parallel: true,
      description: 'Run selected specialist lanes concurrently and keep outputs separated by provenance.',
      lanes: lanes.map((lane) => lane.id),
    });
  }

  stageList.push({
    stage: 'synthesis',
    parallel: false,
    description: 'Merge specialist outputs into one operator-facing answer or work plan.',
    lanes: mode === 'assistive' ? lanes.map((lane) => lane.id) : [],
  });

  if (mode === 'proofed' || mode === 'learning') {
    stageList.push(
      {
        stage: 'verification',
        parallel: true,
        description: 'Validate claims with tests, receipts, QVX metrics, or operator review.',
        lanes: lanes.filter((lane) => lane.proofRequired.length > 0).map((lane) => lane.id),
      },
      {
        stage: 'receipt',
        parallel: false,
        description: 'Emit or store compact evidence: hashes, test output, HCS-ready packets, and route metadata.',
        lanes: [],
      },
    );
  }

  if (mode === 'learning') {
    stageList.push({
      stage: 'learning',
      parallel: false,
      description: 'Convert verified outcomes into lesson candidates and future route-weight updates.',
      lanes: [],
    });
  }

  return stageList;
}

function buildProofGates(lanes: VnxWorkflowLane[], mode: VnxWorkflowMode): string[] {
  const gates = new Set<string>([
    'Every active specialist must have a route reason or bounded adaptive weight.',
    'Raw low-bit VNX samples are advisory and cannot override verified facts.',
  ]);

  for (const lane of lanes) {
    for (const proof of lane.proofRequired) gates.add(`${lane.specialistName}: ${proof}`);
  }

  if (mode === 'proofed' || mode === 'learning') {
    gates.add('Persist route metadata, selected specialists, and proof hashes before promotion.');
  }

  if (mode === 'learning') {
    gates.add('Learning candidates require operator approval or deterministic test evidence before retraining corpora.');
  }

  return Array.from(gates);
}

function buildLearningHooks(lanes: VnxWorkflowLane[], mode: VnxWorkflowMode): VnxLearningHook[] {
  if (mode !== 'learning') return [];

  return lanes.map((lane) => ({
    id: `learn-${lane.specialistId}`,
    trigger: `${lane.specialistName} output is verified useful by test, receipt, metric, or operator review.`,
    sourceStages: ['specialist_parallel', 'verification', 'receipt'],
    lessonCandidate: `Append a compact lesson to ${lane.specialistId} corpus or adjust its route weight.`,
    promotionGate: [
      'lesson is hashable',
      'source workflow has proof evidence',
      'operator approves retraining or route-weight change',
    ],
  }));
}

function summarizeWorkflow(mode: VnxWorkflowMode, selected: VnxSwarmSelection[], lanes: VnxWorkflowLane[]): string {
  const specialists = selected.map((item) => item.name).join(', ') || 'none';
  const laneCount = lanes.length;
  return `VNX ${mode} workflow with ${laneCount} specialist lane(s): ${specialists}. Parallel outputs stay separated until synthesis, then proof gates decide whether the result can teach Vera.`;
}

function createWorkflowId(intent: string, selected: VnxSwarmSelection[]): string {
  const hash = createHash('sha256')
    .update(JSON.stringify({ intent, selected: selected.map((item) => item.id) }))
    .digest('hex')
    .slice(0, 12);
  return `vnx-workflow-${hash}`;
}
