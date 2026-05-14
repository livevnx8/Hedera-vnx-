import { generateText, importVnxModel } from './vnx-lm-core.js';

export const SWARM_MODELS = [
  { id: 'vera-dialogue', name: 'Vera-Dialogue', icon: '💬', desc: 'Conversational help and onboarding', keywords: ['chat', 'reply', 'user', 'help', 'explain', 'hello', 'vera'], guidance: 'Shape the final answer for clarity, warmth, and user intent.' },
  { id: 'qvx-telemetry', name: 'QVX-Telemetry', icon: '📡', desc: 'System monitoring and metrics', keywords: ['qvx', 'telemetry', 'metric', 'latency', 'runtime', 'stack', 'gpu', 'status'], guidance: 'Look for runtime, metrics, health, stack, and operator-observability implications.' },
  { id: 'ledger-ops', name: 'Ledger-Ops', icon: '⛓️', desc: 'Hedera transactions and receipts', keywords: ['hedera', 'hcs', 'hbar', 'topic', 'transaction', 'receipt', 'hashscan', 'ledger'], guidance: 'Prefer receipt-aware Hedera language and call real tools for live balances, topics, or transactions.' },
  { id: 'proof-kernel', name: 'Proof-Kernel', icon: '🔐', desc: 'Verifiable AI proofs and hashes', keywords: ['proof', 'hash', 'verify', 'attest', 'provenance', 'receipt', 'audit', 'hcs'], guidance: 'Track provenance, hashes, proof packets, and what evidence is required before a claim is promoted.' },
  { id: 'manifesto-spirit', name: 'Manifesto-Spirit', icon: '🔥', desc: 'VeraWorkTree philosophy and values', keywords: ['manifesto', 'sovereign', 'philosophy', 'values', 'narrative', 'mission', 'vision'], guidance: 'Preserve VeraWorkTree positioning while keeping claims grounded and technically honest.' },
  { id: 'code-forge', name: 'Code-Forge', icon: '⚔️', desc: 'Programming and debugging', keywords: ['code', 'bug', 'fix', 'implement', 'typescript', 'javascript', 'api', 'test', 'build'], guidance: 'Prioritize concrete code paths, tests, failure modes, and small implementable changes.' },
  { id: 'security-warden', name: 'Security-Warden', icon: '🛡️', desc: 'Security and cryptography', keywords: ['security', 'crypto', 'key', 'signature', 'private', 'threat', 'audit', 'safe'], guidance: 'Watch secrets, signing, auth, trust boundaries, and places that need explicit operator approval.' },
  { id: 'memory-weave', name: 'Memory-Weave', icon: '🧠', desc: 'Context memory and retrieval', keywords: ['memory', 'context', 'recall', 'history', 'learn', 'session', 'knowledge'], guidance: 'Use recent session context carefully and separate remembered context from verified facts.' },
  { id: 'creative-nexus', name: 'Creative-Nexus', icon: '✨', desc: 'Creative writing and ideation', keywords: ['creative', 'write', 'story', 'name', 'brand', 'idea', 'design', 'copy'], guidance: 'Improve naming, wording, product feel, and narrative without inflating technical claims.' },
  { id: 'logic-sage', name: 'Logic-Sage', icon: '♟️', desc: 'Formal reasoning and logic', keywords: ['logic', 'reason', 'prove', 'plan', 'derive', 'constraint', 'decision', 'architecture'], guidance: 'Expose assumptions, constraints, decision points, and the smallest rigorous next step.' },
  { id: 'data-weaver', name: 'Data-Weaver', icon: '📊', desc: 'Data analysis and patterns', keywords: ['data', 'csv', 'analysis', 'pattern', 'stats', 'chart', 'dataset', 'measure'], guidance: 'Look for measurable fields, summaries, distributions, and evidence that can be compared.' },
  { id: 'network-pulse', name: 'Network-Pulse', icon: '🌐', desc: 'Network topology and health', keywords: ['network', 'node', 'swarm', 'worktree', 'route', 'topology', 'health', 'cluster'], guidance: 'Think in routes, topology, load, node health, and how specialists coordinate.' },
];

let loaded = false;
const models = new Map(); // id -> { model, meta }

export async function loadSwarm({ basePath = '/vnx-swarm' } = {}) {
  if (loaded) return;
  const start = performance.now();

  await Promise.all(
    SWARM_MODELS.map(async (meta) => {
      try {
        const response = await fetch(`${basePath}/${meta.id}.vnx`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const model = importVnxModel(new Uint8Array(buffer));
        models.set(meta.id, { model, meta });
      } catch (err) {
        console.warn(`[vnx-swarm] failed to load ${meta.id}:`, err.message);
      }
    })
  );

  loaded = true;
  console.log(`[vnx-swarm] loaded ${models.size}/${SWARM_MODELS.length} specialists in ${(performance.now() - start).toFixed(1)}ms`);
}

export function isSwarmLoaded() {
  return loaded;
}

export function getSwarmMeta() {
  return SWARM_MODELS.map((meta) => ({
    ...meta,
    loaded: models.has(meta.id),
  }));
}

export function selectSwarmSpecialists(prompt, { limit = 4, includeFallback = true, routeWeights = {} } = {}) {
  const text = String(prompt || '').toLowerCase();
  const tokens = new Set(text.match(/[a-z0-9_.-]+/g) || []);

  const scored = SWARM_MODELS.map((meta) => {
    const hits = [];
    let baseScore = 0;

    for (const keyword of meta.keywords || []) {
      const key = keyword.toLowerCase();
      const directHit = tokens.has(key) || text.includes(key);
      if (directHit) {
        hits.push(keyword);
        baseScore += key.length > 4 ? 3 : 2;
      }
    }

    if (meta.id === 'vera-dialogue') baseScore += 1;
    if (meta.id === 'logic-sage' && text.length > 120) baseScore += 1;
    if (meta.id === 'memory-weave' && /\b(previous|remember|context|history)\b/i.test(text)) baseScore += 2;

    const adaptiveWeight = clampRouteWeight(routeWeights[meta.id] || 0);
    const score = baseScore + adaptiveWeight;
    return { ...meta, baseScore, score, adaptiveWeight, reasons: hits };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const selected = scored.filter((meta) => meta.baseScore > 0 || meta.score > 0).slice(0, limit);
  if (selected.length === 0 && includeFallback) {
    return scored
      .filter((meta) => ['vera-dialogue', 'logic-sage'].includes(meta.id))
      .slice(0, Math.min(limit, 2));
  }

  return selected;
}

function clampRouteWeight(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4, Math.min(4, value));
}

export async function swarmInfer(prompt, options = {}) {
  if (!loaded) await loadSwarm();

  const maxTokens = Math.max(1, Math.min(200, options.maxTokens ?? 32));
  const temperature = options.temperature ?? 0.85;
  const selected = options.runAll
    ? SWARM_MODELS
    : selectSwarmSpecialists(prompt, { limit: options.maxSpecialists ?? 4, routeWeights: options.routeWeights || {} });

  const entries = selected
    .map((route) => [route.id, models.get(route.id), route])
    .filter(([, loadedModel]) => Boolean(loadedModel));
  const inferences = entries.map(async ([id, loadedModel, route]) => {
    const { model, meta } = loadedModel;
    const start = performance.now();
    try {
      const result = generateText(model, prompt, { maxTokens, temperature });
      const elapsed = performance.now() - start;
      // Simple confidence heuristic: prefer longer coherent outputs on domain text
      const avgProb = result.trace.length > 0
        ? result.trace.reduce((s, t) => s + t.probability, 0) / result.trace.length
        : 0;
      const confidence = Math.round(avgProb * 1000) / 10;
      return { id, meta, output: result.text, trace: result.trace, confidence, elapsed, routeScore: route?.score ?? 0, reasons: route?.reasons ?? [] };
    } catch (err) {
      return { id, meta, output: '', trace: [], confidence: 0, elapsed: 0, routeScore: 0, reasons: [], error: err.message };
    }
  });

  return Promise.all(inferences);
}

export async function swarmSuggest(prompt, options = {}) {
  const results = await swarmInfer(prompt, options);
  return results.sort((a, b) => b.routeScore - a.routeScore || b.confidence - a.confidence);
}

export function buildSwarmBriefing(results) {
  const valid = (results || []).filter((item) => item?.meta);
  if (valid.length === 0) return 'No VNX specialists responded.';

  return valid.map((item) => {
    const reasons = item.reasons?.length ? item.reasons.join(', ') : 'fallback';
    const sample = String(item.output || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return `${item.meta.name}: ${item.meta.guidance} Route=${item.routeScore}; reasons=${reasons}; sample="${sample}"`;
  }).join('\n');
}
