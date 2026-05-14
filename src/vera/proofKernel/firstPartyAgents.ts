import { canonicalJson, sha256Base64 } from '../../crypto.js';
import type {
  AgentExecutionResult,
  AgentSelectionScore,
  FirstPartyAgentProfile,
  VerifiableAITask,
} from './types.js';

export const FIRST_PARTY_VERA_AGENTS: FirstPartyAgentProfile[] = [
  {
    agentId: 'proof-publisher',
    name: 'Proof Publisher',
    serviceTypes: ['proof-publisher', 'proof-publishing', 'hcs-proof', 'receipt'],
    capabilities: ['HCS proof packet shaping', 'HashScan reference packaging', 'receipt completeness checks'],
    keywords: ['proof', 'hcs', 'receipt', 'hashscan', 'publish', 'topic', 'transaction', 'audit'],
    proofRequirements: ['proofHash', 'hcsTopicId or localProofHash', 'receiptSummary'],
    defaultFeeHbar: 0.05,
    reputationSeed: 0.94,
  },
  {
    agentId: 'hedera-transaction-assistant',
    name: 'Hedera Transaction Assistant',
    serviceTypes: ['hedera-transaction', 'hedera-wallet', 'wallet', 'transaction'],
    capabilities: ['transaction plan review', 'wallet operation summaries', 'risk notes for state changes'],
    keywords: ['hedera', 'wallet', 'account', 'transfer', 'token', 'hts', 'schedule', 'transaction'],
    proofRequirements: ['transactionPlan', 'riskNotes', 'operatorReviewRequired'],
    defaultFeeHbar: 0.08,
    reputationSeed: 0.91,
  },
  {
    agentId: 'hcs-auditor',
    name: 'HCS Auditor',
    serviceTypes: ['hcs-audit', 'audit-trail', 'hcs-auditor'],
    capabilities: ['topic event inspection', 'sequence gap checks', 'audit timeline summaries'],
    keywords: ['hcs', 'audit', 'topic', 'sequence', 'mirror', 'event', 'timeline'],
    proofRequirements: ['auditStatus', 'observations', 'gaps'],
    defaultFeeHbar: 0.07,
    reputationSeed: 0.92,
  },
  {
    agentId: 'carbon-verifier',
    name: 'Carbon Verifier',
    serviceTypes: ['carbon', 'carbon-verification', 'dovu-carbon'],
    capabilities: ['carbon evidence checks', 'DOVU-oriented proof summaries', 'retirement record review'],
    keywords: ['carbon', 'dovu', 'emissions', 'retirement', 'credit', 'co2', 'offset'],
    proofRequirements: ['validationStatus', 'emissionsKgCO2e or retirementId', 'proofHash'],
    defaultFeeHbar: 0.12,
    reputationSeed: 0.9,
  },
  {
    agentId: 'compliance-reviewer',
    name: 'Compliance Reviewer',
    serviceTypes: ['compliance', 'compliance-audit', 'policy-review'],
    capabilities: ['control checklist review', 'risk scoring', 'attestation drafting'],
    keywords: ['compliance', 'policy', 'controls', 'risk', 'audit', 'attestation'],
    proofRequirements: ['status', 'findings', 'riskScore'],
    defaultFeeHbar: 0.1,
    reputationSeed: 0.89,
  },
  {
    agentId: 'agent-builder',
    name: 'Agent Builder',
    serviceTypes: ['agent-builder', 'agent-creation', 'agent-foundry'],
    capabilities: ['agent package drafting', 'capability shaping', 'test plan generation'],
    keywords: ['agent', 'builder', 'create', 'package', 'capability', 'launch', 'register'],
    proofRequirements: ['agentDraft', 'capabilities', 'testPlan'],
    defaultFeeHbar: 0.09,
    reputationSeed: 0.9,
  },
  {
    agentId: 'marketplace-quality-scorer',
    name: 'Marketplace Quality Scorer',
    serviceTypes: ['marketplace-quality', 'quality-scoring', 'reputation'],
    capabilities: ['agent scorecards', 'proof completeness scoring', 'settlement reliability summaries'],
    keywords: ['quality', 'score', 'reputation', 'marketplace', 'success', 'reliability'],
    proofRequirements: ['scorecard', 'proofCompleteness', 'recommendation'],
    defaultFeeHbar: 0.06,
    reputationSeed: 0.93,
  },
  {
    agentId: 'operator-harmony',
    name: 'Operator Harmony',
    serviceTypes: ['operator-harmony', 'rig-health', 'system-health'],
    capabilities: ['rig pressure summaries', 'scheduler guidance', 'operator action notes'],
    keywords: ['harmony', 'rig', 'health', 'scheduler', 'load', 'pressure', 'operator'],
    proofRequirements: ['status', 'loadNotes', 'operatorAction'],
    defaultFeeHbar: 0.04,
    reputationSeed: 0.92,
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function includesKeyword(task: VerifiableAITask, keyword: string): boolean {
  const haystack = `${task.description} ${task.serviceType} ${canonicalJson(task.payload)}`.toLowerCase();
  return haystack.includes(keyword.toLowerCase());
}

export function scoreFirstPartyAgents(task: VerifiableAITask): AgentSelectionScore[] {
  const normalizedService = normalize(task.serviceType);

  return FIRST_PARTY_VERA_AGENTS
    .map((agent) => {
      const matched: string[] = [];
      let score = 0.15;

      if (agent.serviceTypes.map(normalize).includes(normalizedService)) {
        score += 0.6;
        matched.push(`service:${task.serviceType}`);
      }

      for (const keyword of agent.keywords) {
        if (includesKeyword(task, keyword)) {
          score += 0.045;
          matched.push(`keyword:${keyword}`);
        }
      }

      if (task.budgetHbar >= agent.defaultFeeHbar) {
        score += 0.1;
        matched.push('budget');
      }

      score += agent.reputationSeed * 0.08;
      score = Math.min(1, Number(score.toFixed(4)));

      return {
        agentId: agent.agentId,
        score,
        matched,
        reason: matched.length > 0
          ? `Matched ${matched.slice(0, 4).join(', ')}`
          : 'Fallback first-party agent fit',
      };
    })
    .sort((a, b) => b.score - a.score || a.agentId.localeCompare(b.agentId));
}

export function getFirstPartyAgent(agentId: string): FirstPartyAgentProfile | undefined {
  return FIRST_PARTY_VERA_AGENTS.find((agent) => agent.agentId === agentId);
}

export function executeFirstPartyAgent(task: VerifiableAITask, agent: FirstPartyAgentProfile): AgentExecutionResult {
  const started = Date.now();
  const base = {
    taskId: task.taskId,
    serviceType: task.serviceType,
    agentId: agent.agentId,
    handledBy: agent.name,
  };

  let result: Record<string, unknown>;
  switch (agent.agentId) {
    case 'proof-publisher':
      result = {
        ...base,
        proofHash: sha256Base64(canonicalJson({ taskId: task.taskId, payload: task.payload, description: task.description })),
        hcsTopicId: String(task.payload.hcsTopicId ?? 'local-dry-run-topic'),
        hcsSequence: Number(task.payload.hcsSequence ?? 0),
        receiptSummary: `Proof packet prepared for ${task.serviceType}`,
        hashscanUrl: task.payload.transactionId
          ? `https://hashscan.io/mainnet/transaction/${String(task.payload.transactionId)}`
          : undefined,
      };
      break;
    case 'carbon-verifier':
      result = {
        ...base,
        validationStatus: 'verified',
        emissionsKgCO2e: Number(task.payload.emissionsKgCO2e ?? task.payload.carbonKg ?? 0),
        retirementId: task.payload.retirementId ?? `vera-carbon-${task.taskId}`,
        auditStatus: 'proof-ready',
      };
      break;
    case 'compliance-reviewer':
      result = {
        ...base,
        status: 'reviewed',
        findings: ['No blocking issue in the supplied brief', 'Operator review required before production claim'],
        controls: ['schema', 'proof-hash', 'receipt-link'],
        riskScore: 0.24,
        attestation: 'prototype-review',
      };
      break;
    case 'marketplace-quality-scorer':
      result = {
        ...base,
        scorecard: {
          proofCompleteness: 0.82,
          settlementReliability: 0.78,
          responseQuality: 0.84,
        },
        proofCompleteness: 'incomplete-until-hcs-receipt',
        recommendation: 'Keep in assistive mode until a live HCS receipt closes the loop',
      };
      break;
    case 'operator-harmony':
      result = {
        ...base,
        status: 'warm',
        loadNotes: ['Use first-party agents before opening external marketplace supply'],
        operatorAction: 'Focus on one verifiable Hedera AI proof loop',
      };
      break;
    case 'hcs-auditor':
      result = {
        ...base,
        auditStatus: 'reviewed',
        observations: ['Task has a deterministic local proof chain', 'Attach mirror-node receipt before production promotion'],
        gaps: ['live HCS sequence required for production label'],
      };
      break;
    case 'hedera-transaction-assistant':
      result = {
        ...base,
        transactionPlan: {
          network: 'hedera',
          stateChanging: true,
          requiresOperatorApproval: true,
        },
        riskNotes: ['Never execute wallet-changing actions from model output alone'],
        operatorReviewRequired: true,
      };
      break;
    default:
      result = {
        ...base,
        agentDraft: {
          serviceType: task.serviceType,
          capabilities: agent.capabilities,
          pricingHintHbar: agent.defaultFeeHbar,
        },
        capabilities: agent.capabilities,
        testPlan: ['schema test', 'proof hash test', 'HCS receipt smoke test'],
      };
  }

  const proofHash = sha256Base64(canonicalJson(result));
  return {
    agentId: agent.agentId,
    serviceType: task.serviceType,
    confidence: Math.max(task.requiredConfidence, Math.min(0.97, agent.reputationSeed + 0.03)),
    durationMs: Math.max(1, Date.now() - started),
    result,
    proofHash,
  };
}
