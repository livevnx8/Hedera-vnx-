import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface VnxSwarmModelMeta {
  id: string;
  name: string;
  desc: string;
  keywords: string[];
  guidance: string;
}

export interface VnxSwarmSelection extends VnxSwarmModelMeta {
  baseScore: number;
  score: number;
  adaptiveWeight: number;
  reasons: string[];
}

export interface VnxSwarmOutput {
  id: string;
  name: string;
  output: string;
  confidence: number;
  elapsedMs: number;
  routeScore: number;
  reasons: string[];
  vertexCount?: number;
  contextSize?: number;
  error?: string;
}

export interface VnxSwarmPromptContext {
  enabled: boolean;
  selected: VnxSwarmSelection[];
  outputs: VnxSwarmOutput[];
  promptContext: string;
  briefing: string;
  modelCount: number;
  maxSpecialists: number;
}

export interface VnxSwarmSelectionOptions {
  limit?: number;
  includeFallback?: boolean;
  routeWeights?: Record<string, number>;
}

type VnxCore = {
  importVnxModel: (buffer: Uint8Array | ArrayBuffer) => any;
  generateText: (model: any, prompt: string, options: Record<string, unknown>) => { text: string; trace: Array<{ probability?: number }> };
};

type LoadedSwarmModel = {
  meta: VnxSwarmModelMeta;
  model: any;
};

export const VNX_SWARM_MODELS: VnxSwarmModelMeta[] = [
  { id: 'vera-dialogue', name: 'Vera-Dialogue', desc: 'Conversational help and onboarding', keywords: ['chat', 'reply', 'user', 'help', 'explain', 'hello', 'vera'], guidance: 'Shape the final answer for clarity, warmth, and user intent.' },
  { id: 'qvx-telemetry', name: 'QVX-Telemetry', desc: 'System monitoring and metrics', keywords: ['qvx', 'telemetry', 'metric', 'latency', 'runtime', 'stack', 'gpu', 'status'], guidance: 'Look for runtime, metrics, health, stack, and operator-observability implications.' },
  { id: 'ledger-ops', name: 'Ledger-Ops', desc: 'Hedera transactions and receipts', keywords: ['hedera', 'hcs', 'hbar', 'topic', 'transaction', 'receipt', 'hashscan', 'ledger'], guidance: 'Prefer receipt-aware Hedera language and call real tools for live balances, topics, or transactions.' },
  { id: 'proof-kernel', name: 'Proof-Kernel', desc: 'Verifiable AI proofs and hashes', keywords: ['proof', 'hash', 'verify', 'attest', 'provenance', 'receipt', 'audit', 'hcs'], guidance: 'Track provenance, hashes, proof packets, and what evidence is required before a claim is promoted.' },
  { id: 'manifesto-spirit', name: 'Manifesto-Spirit', desc: 'VeraLattice philosophy and values', keywords: ['manifesto', 'sovereign', 'philosophy', 'values', 'narrative', 'mission', 'vision'], guidance: 'Preserve VeraLattice positioning while keeping claims grounded and technically honest.' },
  { id: 'code-forge', name: 'Code-Forge', desc: 'Programming and debugging', keywords: ['code', 'bug', 'fix', 'implement', 'typescript', 'javascript', 'api', 'test', 'build'], guidance: 'Prioritize concrete code paths, tests, failure modes, and small implementable changes.' },
  { id: 'security-warden', name: 'Security-Warden', desc: 'Security and cryptography', keywords: ['security', 'crypto', 'key', 'signature', 'private', 'threat', 'audit', 'safe'], guidance: 'Watch secrets, signing, auth, trust boundaries, and places that need explicit operator approval.' },
  { id: 'memory-weave', name: 'Memory-Weave', desc: 'Context memory and retrieval', keywords: ['memory', 'context', 'recall', 'history', 'learn', 'session', 'knowledge'], guidance: 'Use recent session context carefully and separate remembered context from verified facts.' },
  { id: 'creative-nexus', name: 'Creative-Nexus', desc: 'Creative writing and ideation', keywords: ['creative', 'write', 'story', 'name', 'brand', 'idea', 'design', 'copy'], guidance: 'Improve naming, wording, product feel, and narrative without inflating technical claims.' },
  { id: 'logic-sage', name: 'Logic-Sage', desc: 'Formal reasoning and logic', keywords: ['logic', 'reason', 'prove', 'plan', 'derive', 'constraint', 'decision', 'architecture'], guidance: 'Expose assumptions, constraints, decision points, and the smallest rigorous next step.' },
  { id: 'data-weaver', name: 'Data-Weaver', desc: 'Data analysis and patterns', keywords: ['data', 'csv', 'analysis', 'pattern', 'stats', 'chart', 'dataset', 'measure'], guidance: 'Look for measurable fields, summaries, distributions, and evidence that can be compared.' },
  { id: 'network-pulse', name: 'Network-Pulse', desc: 'Network topology and health', keywords: ['network', 'node', 'swarm', 'lattice', 'route', 'topology', 'health', 'cluster'], guidance: 'Think in routes, topology, load, node health, and how specialists coordinate.' },
];

let corePromise: Promise<VnxCore> | null = null;
const modelCache = new Map<string, Promise<LoadedSwarmModel | null>>();

function swarmDir(): string {
  return join(process.cwd(), 'public', 'vnx-swarm');
}

function modelFilePath(id: string): string {
  return join(swarmDir(), `${id}.vnx`);
}

async function loadCore(): Promise<VnxCore> {
  if (!corePromise) {
    const coreUrl = pathToFileURL(join(process.cwd(), 'public', 'js', 'vnx-lm-core.js')).href;
    corePromise = import(coreUrl) as Promise<VnxCore>;
  }
  return corePromise;
}

async function loadModel(meta: VnxSwarmModelMeta): Promise<LoadedSwarmModel | null> {
  if (!modelCache.has(meta.id)) {
    modelCache.set(meta.id, (async () => {
      try {
        const [core, bytes] = await Promise.all([
          loadCore(),
          fs.readFile(modelFilePath(meta.id)),
        ]);
        return { meta, model: core.importVnxModel(new Uint8Array(bytes)) };
      } catch {
        return null;
      }
    })());
  }

  return modelCache.get(meta.id)!;
}

export function selectVnxSwarmSpecialists(
  prompt: string,
  { limit = 4, includeFallback = true, routeWeights = {} }: VnxSwarmSelectionOptions = {},
): VnxSwarmSelection[] {
  const text = String(prompt || '').toLowerCase();
  const tokens = new Set(text.match(/[a-z0-9_.-]+/g) || []);

  const scored = VNX_SWARM_MODELS.map((meta) => {
    const reasons: string[] = [];
    let baseScore = 0;

    for (const keyword of meta.keywords) {
      const key = keyword.toLowerCase();
      if (tokens.has(key) || text.includes(key)) {
        reasons.push(keyword);
        baseScore += key.length > 4 ? 3 : 2;
      }
    }

    if (meta.id === 'vera-dialogue') baseScore += 1;
    if (meta.id === 'logic-sage' && text.length > 120) baseScore += 1;
    if (meta.id === 'memory-weave' && /\b(previous|remember|context|history)\b/i.test(text)) baseScore += 2;

    const adaptiveWeight = clampRouteWeight(routeWeights[meta.id] || 0);
    const score = baseScore + adaptiveWeight;

    return { ...meta, baseScore, score, adaptiveWeight, reasons };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const selected = scored.filter((meta) => meta.baseScore > 0 || meta.score > 0).slice(0, limit);
  if (selected.length > 0 || !includeFallback) return selected;

  return scored
    .filter((meta) => ['vera-dialogue', 'logic-sage'].includes(meta.id))
    .slice(0, Math.min(limit, 2));
}

export async function buildVnxSwarmPromptContext(
  prompt: string,
  { maxSpecialists = 4, maxTokens = 48, temperature = 0.82, routeWeights = {} }: { maxSpecialists?: number; maxTokens?: number; temperature?: number; routeWeights?: Record<string, number> } = {},
): Promise<VnxSwarmPromptContext> {
  const selected = selectVnxSwarmSpecialists(prompt, { limit: maxSpecialists, routeWeights });
  const core = await loadCore();

  const outputs = await Promise.all(selected.map(async (route) => {
    const startedAt = Date.now();
    const loaded = await loadModel(route);
    if (!loaded) {
      return {
        id: route.id,
        name: route.name,
        output: '',
        confidence: 0,
        elapsedMs: Date.now() - startedAt,
        routeScore: route.score,
        reasons: route.reasons,
        error: 'model_unavailable',
      };
    }

    try {
      const result = core.generateText(loaded.model, prompt, {
        maxTokens: Math.max(1, Math.min(96, maxTokens)),
        temperature,
      });
      const avgProb = result.trace.length > 0
        ? result.trace.reduce((sum, item) => sum + (item.probability || 0), 0) / result.trace.length
        : 0;
      const confidence = Math.round(avgProb * 1000) / 10;

      return {
        id: route.id,
        name: route.name,
        output: result.text.trim(),
        confidence,
        elapsedMs: Date.now() - startedAt,
        routeScore: route.score,
        reasons: route.reasons,
        vertexCount: loaded.model.vertexCount,
        contextSize: loaded.model.contextSize,
      };
    } catch (error) {
      return {
        id: route.id,
        name: route.name,
        output: '',
        confidence: 0,
        elapsedMs: Date.now() - startedAt,
        routeScore: route.score,
        reasons: route.reasons,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));

  const validOutputs = outputs.filter((item) => item.output && !item.error);
  const briefing = formatSwarmBriefing(selected, validOutputs);
  const promptContext = formatSwarmPromptContext(selected, validOutputs, briefing);

  return {
    enabled: validOutputs.length > 0,
    selected,
    outputs,
    promptContext,
    briefing,
    modelCount: VNX_SWARM_MODELS.length,
    maxSpecialists,
  };
}

function clampRouteWeight(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4, Math.min(4, value));
}

export async function listVnxSwarmModels() {
  return Promise.all(VNX_SWARM_MODELS.map(async (meta) => {
    try {
      const stat = await fs.stat(modelFilePath(meta.id));
      return { ...meta, available: true, size: stat.size };
    } catch {
      return { ...meta, available: false, size: null };
    }
  }));
}

function formatSwarmBriefing(selected: VnxSwarmSelection[], outputs: VnxSwarmOutput[]): string {
  if (selected.length === 0) return 'No VNX specialists selected.';

  const available = new Set(outputs.map((item) => item.id));
  return selected.map((item) => {
    const status = available.has(item.id) ? 'sampled' : 'selected';
    const reason = item.reasons.length ? item.reasons.join(', ') : 'fallback';
    return `${item.name}: ${item.guidance} Route=${item.score}; reasons=${reason}; status=${status}.`;
  }).join('\n');
}

function formatSwarmPromptContext(selected: VnxSwarmSelection[], outputs: VnxSwarmOutput[], briefing: string): string {
  if (selected.length === 0) return '';

  const selectedLine = selected
    .map((item) => `${item.name}(score=${item.score}${item.reasons.length ? `; ${item.reasons.join(', ')}` : ''})`)
    .join('; ');

  const outputLines = outputs.map((item) => {
    const compactOutput = item.output.replace(/\s+/g, ' ').trim();
    const text = compactOutput.length > 180 ? `${compactOutput.slice(0, 180)}...` : compactOutput;
    return `- ${item.name}: confidence=${item.confidence.toFixed(1)}%, vertices=${item.vertexCount ?? 'n/a'}, signal="${text}"`;
  });

  return [
    'VNX Swarm Context',
    'Use this as advisory local specialist signal. Treat the guidance as higher value than the low-bit samples. Prefer verified tools, receipts, tests, and known facts when they disagree.',
    `Selected specialists: ${selectedLine}`,
    'Specialist guidance:',
    briefing,
    'Low-bit samples:',
    ...outputLines,
  ].join('\n');
}
