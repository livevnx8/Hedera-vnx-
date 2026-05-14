import {
  buildVnxSwarmPromptContext,
  selectVnxSwarmSpecialists,
  type VnxSwarmPromptContext,
} from './swarmPromptContext.js';

export interface VnxSwarmEvalCase {
  id: string;
  category: string;
  prompt: string;
  expectedAny: string[];
  expectedAll?: string[];
  avoid?: string[];
  requiredContextTerms?: string[];
}

export interface VnxSwarmEvalCaseResult {
  id: string;
  category: string;
  prompt: string;
  selected: string[];
  expectedAnyHit: boolean;
  expectedAllHit: boolean;
  avoidedForbidden: boolean;
  contextTermsHit: boolean;
  outputCount: number;
  score: number;
  maxScore: number;
  pass: boolean;
  notes: string[];
}

export interface VnxSwarmEvalReport {
  standard: 'VNX-SWARM-EVAL-1';
  createdAt: string;
  caseCount: number;
  passed: number;
  failed: number;
  score: number;
  maxScore: number;
  passRate: number;
  promotionReady: boolean;
  specialistStats: VnxSwarmSpecialistStats[];
  recommendedRouteWeights: Record<string, number>;
  cases: VnxSwarmEvalCaseResult[];
}

export interface VnxSwarmSpecialistStats {
  id: string;
  selected: number;
  expected: number;
  missed: number;
  forbidden: number;
  contributionScore: number;
}

export const VNX_SWARM_EVAL_CASES: VnxSwarmEvalCase[] = [
  {
    id: 'code-typescript-build',
    category: 'code',
    prompt: 'Fix the TypeScript API test failure and explain which build command proves the patch.',
    expectedAny: ['code-forge'],
    expectedAll: ['code-forge'],
    requiredContextTerms: ['Code-Forge', 'tests'],
  },
  {
    id: 'hedera-proof-receipt',
    category: 'hedera',
    prompt: 'Verify the Hedera HCS topic receipt hash and produce a HashScan provenance note.',
    expectedAny: ['ledger-ops', 'proof-kernel'],
    expectedAll: ['ledger-ops', 'proof-kernel'],
    requiredContextTerms: ['Ledger-Ops', 'Proof-Kernel'],
  },
  {
    id: 'qvx-runtime-telemetry',
    category: 'qvx',
    prompt: 'Summarize QVX runtime telemetry, GPU status, latency, and operator health signals.',
    expectedAny: ['qvx-telemetry'],
    expectedAll: ['qvx-telemetry'],
    requiredContextTerms: ['QVX-Telemetry', 'runtime'],
  },
  {
    id: 'security-key-boundary',
    category: 'security',
    prompt: 'Audit the private key signing flow and identify trust boundaries before mainnet approval.',
    expectedAny: ['security-warden', 'proof-kernel'],
    expectedAll: ['security-warden'],
    requiredContextTerms: ['Security-Warden', 'operator approval'],
  },
  {
    id: 'memory-session-recall',
    category: 'memory',
    prompt: 'Remember the previous session context and separate what is recalled from verified facts.',
    expectedAny: ['memory-weave'],
    expectedAll: ['memory-weave'],
    requiredContextTerms: ['Memory-Weave', 'verified facts'],
  },
  {
    id: 'architecture-lattice-routing',
    category: 'architecture',
    prompt: 'Plan the lattice router topology so specialists are selected by route health instead of running every node.',
    expectedAny: ['logic-sage', 'network-pulse'],
    expectedAll: ['logic-sage', 'network-pulse'],
    requiredContextTerms: ['Logic-Sage', 'Network-Pulse'],
  },
  {
    id: 'data-pattern-analysis',
    category: 'data',
    prompt: 'Analyze this dataset pattern, produce stats, and describe what chart should compare the measurements.',
    expectedAny: ['data-weaver'],
    expectedAll: ['data-weaver'],
    requiredContextTerms: ['Data-Weaver', 'measurable'],
  },
  {
    id: 'creative-positioning',
    category: 'creative',
    prompt: 'Write product copy for the sovereign VNX artifact without overclaiming production readiness.',
    expectedAny: ['creative-nexus', 'manifesto-spirit'],
    expectedAll: ['creative-nexus'],
    requiredContextTerms: ['Creative-Nexus', 'technical claims'],
  },
  {
    id: 'plain-help',
    category: 'dialogue',
    prompt: 'Help me understand what Vera can do next.',
    expectedAny: ['vera-dialogue'],
    avoid: ['ledger-ops'],
    requiredContextTerms: ['Vera-Dialogue'],
  },
];

export function evaluateVnxSwarmSelection(
  testCase: VnxSwarmEvalCase,
  context: Pick<VnxSwarmPromptContext, 'selected' | 'outputs' | 'promptContext'>,
): VnxSwarmEvalCaseResult {
  const selected = context.selected.map((item) => item.id);
  const selectedSet = new Set(selected);
  const expectedAll = testCase.expectedAll || [];
  const avoid = testCase.avoid || [];
  const requiredTerms = testCase.requiredContextTerms || [];

  const expectedAnyHit = testCase.expectedAny.some((id) => selectedSet.has(id));
  const expectedAllHit = expectedAll.every((id) => selectedSet.has(id));
  const avoidedForbidden = avoid.every((id) => !selectedSet.has(id));
  const contextTermsHit = requiredTerms.every((term) => context.promptContext.includes(term));
  const outputCount = context.outputs.filter((item) => item.output && !item.error).length;
  const notes: string[] = [];
  let score = 0;
  const maxScore = 5;

  if (expectedAnyHit) score += 1;
  else notes.push(`missing one of expected specialists: ${testCase.expectedAny.join(', ')}`);

  if (expectedAll.length === 0 || expectedAllHit) score += 1;
  else notes.push(`missing required specialists: ${expectedAll.filter((id) => !selectedSet.has(id)).join(', ')}`);

  if (avoidedForbidden) score += 1;
  else notes.push(`selected forbidden specialists: ${avoid.filter((id) => selectedSet.has(id)).join(', ')}`);

  if (contextTermsHit) score += 1;
  else notes.push(`context missing terms: ${requiredTerms.filter((term) => !context.promptContext.includes(term)).join(', ')}`);

  if (outputCount > 0 && outputCount <= 4) score += 1;
  else notes.push(`unexpected output count: ${outputCount}`);

  return {
    id: testCase.id,
    category: testCase.category,
    prompt: testCase.prompt,
    selected,
    expectedAnyHit,
    expectedAllHit,
    avoidedForbidden,
    contextTermsHit,
    outputCount,
    score,
    maxScore,
    pass: score >= 4,
    notes,
  };
}

export async function runVnxSwarmEvaluation(
  cases: VnxSwarmEvalCase[] = VNX_SWARM_EVAL_CASES,
): Promise<VnxSwarmEvalReport> {
  const results: VnxSwarmEvalCaseResult[] = [];

  for (const testCase of cases) {
    const context = await buildVnxSwarmPromptContext(testCase.prompt, {
      maxSpecialists: 4,
      maxTokens: 16,
    });
    results.push(evaluateVnxSwarmSelection(testCase, context));
  }

  const score = results.reduce((sum, item) => sum + item.score, 0);
  const maxScore = results.reduce((sum, item) => sum + item.maxScore, 0);
  const passed = results.filter((item) => item.pass).length;
  const passRate = cases.length ? passed / cases.length : 0;
  const specialistStats = buildSpecialistStats(cases, results);
  const recommendedRouteWeights = deriveVnxSwarmRouteWeights(specialistStats);

  return {
    standard: 'VNX-SWARM-EVAL-1',
    createdAt: new Date().toISOString(),
    caseCount: cases.length,
    passed,
    failed: cases.length - passed,
    score,
    maxScore,
    passRate,
    promotionReady: passRate >= 0.9 && score / Math.max(1, maxScore) >= 0.85,
    specialistStats,
    recommendedRouteWeights,
    cases: results,
  };
}

export function runVnxSwarmSelectionEvaluation(
  cases: VnxSwarmEvalCase[] = VNX_SWARM_EVAL_CASES,
): VnxSwarmEvalCaseResult[] {
  return cases.map((testCase) => {
    const selected = selectVnxSwarmSpecialists(testCase.prompt, { limit: 4 });
    return evaluateVnxSwarmSelection(testCase, {
      selected,
      outputs: selected.map((item) => ({
        id: item.id,
        name: item.name,
        output: 'selection-only',
        confidence: 0,
        elapsedMs: 0,
        routeScore: item.score,
        reasons: item.reasons,
      })),
      promptContext: selected.map((item) => `${item.name} ${item.guidance}`).join('\n'),
    });
  });
}

export function deriveVnxSwarmRouteWeights(stats: VnxSwarmSpecialistStats[]): Record<string, number> {
  const weights: Record<string, number> = {};

  for (const item of stats) {
    const signal = item.expected + item.selected;
    if (signal === 0) continue;

    const raw = (item.expected * 0.35) + (item.selected * 0.1) - (item.missed * 0.45) - (item.forbidden * 0.65);
    const normalized = Math.max(-2, Math.min(2, Math.round(raw * 10) / 10));
    if (normalized !== 0) weights[item.id] = normalized;
  }

  return weights;
}

function buildSpecialistStats(cases: VnxSwarmEvalCase[], results: VnxSwarmEvalCaseResult[]): VnxSwarmSpecialistStats[] {
  const stats = new Map<string, VnxSwarmSpecialistStats>();

  function ensure(id: string): VnxSwarmSpecialistStats {
    if (!stats.has(id)) {
      stats.set(id, {
        id,
        selected: 0,
        expected: 0,
        missed: 0,
        forbidden: 0,
        contributionScore: 0,
      });
    }
    return stats.get(id)!;
  }

  for (let i = 0; i < cases.length; i += 1) {
    const testCase = cases[i];
    const result = results[i];
    const selected = new Set(result.selected);
    const expected = new Set([...(testCase.expectedAny || []), ...(testCase.expectedAll || [])]);
    const forbidden = new Set(testCase.avoid || []);

    for (const id of selected) {
      const item = ensure(id);
      item.selected += 1;
      if (expected.has(id)) item.contributionScore += 1;
      if (forbidden.has(id)) {
        item.forbidden += 1;
        item.contributionScore -= 2;
      }
    }

    for (const id of expected) {
      const item = ensure(id);
      item.expected += 1;
      if (!selected.has(id)) {
        item.missed += 1;
        item.contributionScore -= 1;
      }
    }
  }

  return Array.from(stats.values()).sort((a, b) => b.contributionScore - a.contributionScore || a.id.localeCompare(b.id));
}
