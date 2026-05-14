import { config } from '../../config.js';
import type { MeridianShadowScore, VerifiableAITask } from './types.js';
import {
  calculateWeightedConsensus,
  updateReputation,
  detectDrift,
  type WeightedConsensus,
} from './meridianReputation.js';
import {
  calculateCouncilSize,
  adaptCouncilSize,
  selectMeridiansForCouncil,
  type CouncilSizing,
} from './dynamicCouncil.js';
import {
  recordPrediction,
  detectCrossMeridianDrift,
  driftToLesson,
  type DriftEvent,
} from './driftDetection.js';
import { recordLesson } from './crossAgentLearning.js';
import { CircuitBreaker, globalCircuitBreakers } from './circuitBreaker.js';
import { globalMeridianCache } from '../cache/meridianCache.js';

export interface MeridianShadowScorer {
  score(task: VerifiableAITask, candidateAgentIds: string[]): Promise<MeridianShadowScore>;
}

function parseRecommendation(content: string, candidateAgentIds: string[]): string | undefined {
  const lowered = content.toLowerCase();
  return candidateAgentIds.find((agentId) => lowered.includes(agentId.toLowerCase()));
}

function parseProofCompleteness(content: string): MeridianShadowScore['proofCompleteness'] | undefined {
  const lowered = content.toLowerCase();
  if (lowered.includes('operator')) return 'operator_review';
  if (lowered.includes('suspicious')) return 'suspicious';
  if (lowered.includes('incomplete') || lowered.includes('missing')) return 'incomplete';
  if (lowered.includes('complete')) return 'complete';
  return undefined;
}

export class HttpMeridianShadowScorer implements MeridianShadowScorer {
  private readonly circuitBreaker: CircuitBreaker;

  constructor(
    private readonly url = config.MERIDIAN_URL,
    private readonly enabled = config.ENABLE_MERIDIAN_BITNET === 'true',
    private readonly timeoutMs = 1200,
  ) {
    // Get or create circuit breaker for this URL
    const breakerName = `meridian-${url.replace(/[^a-zA-Z0-9]/g, '-')}`;
    this.circuitBreaker = globalCircuitBreakers.getOrCreate(breakerName, {
      failureThreshold: 3,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 3,
      successThreshold: 2,
    });
  }

  async score(task: VerifiableAITask, candidateAgentIds: string[]): Promise<MeridianShadowScore> {
    if (!this.enabled) return { status: 'disabled' };

    // Check cache first
    const cached = globalMeridianCache.get(task, candidateAgentIds);
    if (cached) {
      return cached;
    }

    // Check circuit breaker state
    if (!this.circuitBreaker.canExecute()) {
      const stats = this.circuitBreaker.getStats();
      return {
        status: 'unavailable',
        error: `Circuit breaker open - last failure ${stats.lastFailureTime ? new Date(stats.lastFailureTime).toISOString() : 'unknown'}`,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.url}/v1/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          max_tokens: 96,
          temperature: 0,
          system_prompt: [
            "You are Meridian, Vera's specialist control model.",
            'Recommend a first-party Vera agent and proof posture.',
            'Return compact text only; you are advisory, not authoritative.',
          ].join('\n'),
          prompt: JSON.stringify({
            task: {
              serviceType: task.serviceType,
              description: task.description,
              payloadKeys: Object.keys(task.payload),
            },
            candidateAgentIds,
          }),
        }),
      });

      if (!response.ok) {
        this.circuitBreaker.recordFailure(new Error(`HTTP ${response.status}`));
        return { status: 'unavailable', error: `Meridian HTTP ${response.status}` };
      }

      const payload = await response.json() as {
        content?: string;
        model?: string;
        backend?: string;
      };
      const content = payload.content ?? '';
      const result: MeridianShadowScore = {
        status: 'scored',
        model: payload.model,
        backend: payload.backend,
        recommendation: parseRecommendation(content, candidateAgentIds),
        proofCompleteness: parseProofCompleteness(content),
        raw: payload,
      };
      
      // Record successful call
      this.circuitBreaker.recordSuccess();
      
      // Store in cache
      globalMeridianCache.set(task, candidateAgentIds, result);
      
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.circuitBreaker.recordFailure(error instanceof Error ? error : new Error(message));
      return { status: 'unavailable', error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function countValues(values: Array<string | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function topValue(counts: Record<string, number>): string | undefined {
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function configuredMeridianUrls(): string[] {
  const urls = config.MERIDIAN_URLS
    ? config.MERIDIAN_URLS.split(',').map((url) => url.trim()).filter(Boolean)
    : [config.MERIDIAN_URL];
  return Array.from(new Set(urls));
}

export interface EnhancedMeridianShadowScore extends MeridianShadowScore {
  weightedConsensus?: WeightedConsensus;
  councilSizing?: CouncilSizing;
  driftEvents?: DriftEvent[];
  requiresHumanEscalation?: boolean;
  confidence?: number;
}

export class MultiMeridianShadowScorer implements MeridianShadowScorer {
  constructor(
    private readonly urls = configuredMeridianUrls(),
    private readonly enabled = config.ENABLE_MERIDIAN_BITNET === 'true',
    private readonly timeoutMs = 1200,
  ) {}

  async score(task: VerifiableAITask, candidateAgentIds: string[]): Promise<EnhancedMeridianShadowScore> {
    if (!this.enabled) return { status: 'disabled' };
    if (this.urls.length === 0) return { status: 'unavailable', error: 'No Meridian URLs configured' };

    // Feature 2: Dynamic Council Sizing - determine optimal council size
    const councilSizing = calculateCouncilSize(task);
    const adaptedSizing = adaptCouncilSize(
      councilSizing,
      this.urls.map((url, i) => ({ id: `M${i + 1}`, accuracy: 0.9, currentLoad: 0.5 })),
      0.1 // Default historical disagreement
    );

    // Select which Meridians to consult based on reputation and load
    const selectedMeridians = selectMeridiansForCouncil(
      this.urls.map((url, i) => ({
        id: `M${i + 1}`,
        url,
        accuracy: 0.9, // Would come from reputation store
        currentLoad: 0.5,
      })),
      adaptedSizing.size
    );

    // Consult selected Meridians
    const memberResults = await Promise.all(selectedMeridians.map(async ({ id, url }) => {
      const scorer = new HttpMeridianShadowScorer(url, true, adaptedSizing.timeoutMs);
      const score = await scorer.score(task, candidateAgentIds);
      return { id, url, score };
    }));

    const members = memberResults.map(({ id, url, score }) => ({
      id,
      url,
      status: score.status,
      model: score.model,
      backend: score.backend,
      recommendation: score.recommendation,
      proofCompleteness: score.proofCompleteness,
      error: score.error,
    }));

    const scored = members.filter((member) => member.status === 'scored');

    if (scored.length === 0) {
      return {
        status: 'unavailable',
        error: 'No Meridian endpoint returned a score',
        quorum: {
          total: members.length,
          scored: 0,
          unavailable: members.length,
          recommendations: {},
          proofCompleteness: {},
        },
        members,
        councilSizing: adaptedSizing,
        requiresHumanEscalation: adaptedSizing.requiresHumanEscalation,
      };
    }

    // Feature 1: Reputation-Weighted Scoring
    const votes = scored.map((m) => ({
      meridianId: m.id,
      recommendation: m.recommendation,
      confidence: 0.9, // Would be parsed from model output
    }));

    const weightedConsensus = calculateWeightedConsensus(votes, {
      minConfidenceThreshold: adaptedSizing.minConfidence,
    });

    // Feature 5: Real-Time Drift Detection
    const driftEvents: DriftEvent[] = [];
    for (const member of scored) {
      const prediction = recordPrediction(
        member.id,
        task.description,
        member.recommendation ?? 'none',
        0.9
      );
      if (prediction) {
        driftEvents.push(prediction);
        // Feature 4: Cross-Agent Learning - record drift as lesson
        const lesson = driftToLesson(prediction);
        recordLesson(
          member.id,
          'drift_detected',
          lesson.description,
          lesson.confidence,
          lesson.affectedContexts,
          { weightAdjustment: lesson.weightAdjustment }
        );
      }
    }

    // Detect cross-meridian drift
    for (const member of scored) {
      const peerOutputs = scored
        .filter(m => m.id !== member.id)
        .map(m => ({
          meridianId: m.id,
          output: m.recommendation ?? 'none',
          confidence: 0.9,
        }));

      const drift = detectCrossMeridianDrift(
        member.id,
        task.description,
        member.recommendation ?? 'none',
        peerOutputs
      );

      if (drift.hasDrift) {
        console.log(`[ShadowCouncil] Drift detected for ${member.id}: ${drift.details}`);
      }
    }

    // Update reputations based on consensus
    const consensusRec = weightedConsensus.recommendation;
    for (const member of scored) {
      const wasCorrect = member.recommendation === consensusRec;
      updateReputation(member.id, wasCorrect, consensusRec);
    }

    // Feature 6: Block Stream Integration - detectDrift for HCS readiness
    const driftAnalysis = detectDrift(weightedConsensus);
    if (driftAnalysis.hasDrift) {
      console.log(`[ShadowCouncil] ${driftAnalysis.severity} drift: ${driftAnalysis.details}`);
    }

    // Calculate final confidence
    const confidence = weightedConsensus.confidence;
    const requiresHumanEscalation = adaptedSizing.requiresHumanEscalation ||
                                    weightedConsensus.lowConfidence ||
                                    driftEvents.some(d => d.severity === 'critical');

    return {
      status: 'scored',
      model: scored.length === 1 ? scored[0].model : 'meridian-council',
      backend: scored.length === 1 ? scored[0].backend : 'multi',
      recommendation: weightedConsensus.recommendation,
      proofCompleteness: scored[0].proofCompleteness,
      quorum: {
        total: members.length,
        scored: scored.length,
        unavailable: members.length - scored.length,
        recommendations: countValues(scored.map(m => m.recommendation)),
        proofCompleteness: countValues(scored.map(m => m.proofCompleteness)),
      },
      members,
      weightedConsensus,
      councilSizing: adaptedSizing,
      driftEvents: driftEvents.length > 0 ? driftEvents : undefined,
      requiresHumanEscalation,
      confidence,
    };
  }
}

export const meridianShadowScorer = new MultiMeridianShadowScorer();
