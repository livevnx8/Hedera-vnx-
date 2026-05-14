/**
 * Meridian Reputation-Weighted Scoring
 * 
 * Tracks historical accuracy per Meridian instance and weights
 * council votes by trust score, not simple majority.
 */

import { config } from '../../config.js';

export interface ReputationScore {
  meridianId: string;
  accuracy: number;        // 0.0 - 1.0
  totalTasks: number;
  correctDecisions: number;
  lastUpdated: number;
  driftWarnings: number;
}

export interface WeightedVote {
  meridianId: string;
  recommendation: string | undefined;
  weight: number;          // 0.0 - 1.0 based on reputation
  rawConfidence: number;
}

export interface WeightedConsensus {
  recommendation: string | undefined;
  confidence: number;      // 0.0 - 1.0
  weightedVotes: WeightedVote[];
  dissenters: string[];    // Meridians who voted differently
  lowConfidence: boolean;  // True if any high-rep Meridian dissented
}

// In-memory reputation store (persist to HCS for cross-node sync)
const reputationStore = new Map<string, ReputationScore>();

// Default reputation for new Meridians
const DEFAULT_REPUTATION = 0.85;

// Minimum tasks before reputation is considered reliable
const MIN_TASKS_FOR_RELIABLE_REP = 10;

// Drift detection threshold
const DISSENT_THRESHOLD = 0.3;

export function getOrCreateReputation(meridianId: string): ReputationScore {
  if (!reputationStore.has(meridianId)) {
    reputationStore.set(meridianId, {
      meridianId,
      accuracy: DEFAULT_REPUTATION,
      totalTasks: 0,
      correctDecisions: 0,
      lastUpdated: Date.now(),
      driftWarnings: 0,
    });
  }
  return reputationStore.get(meridianId)!;
}

export function updateReputation(
  meridianId: string,
  wasCorrect: boolean,
  groundTruth?: string
): void {
  const rep = getOrCreateReputation(meridianId);
  rep.totalTasks++;
  if (wasCorrect) {
    rep.correctDecisions++;
  }
  
  // Exponential moving average for accuracy
  const alpha = 0.1; // Smoothing factor
  const instantAccuracy = wasCorrect ? 1.0 : 0.0;
  rep.accuracy = (alpha * instantAccuracy) + ((1 - alpha) * rep.accuracy);
  rep.lastUpdated = Date.now();
  
  console.log(`[Reputation] ${meridianId}: accuracy=${rep.accuracy.toFixed(3)}, tasks=${rep.totalTasks}`);
}

export function calculateWeightedConsensus(
  votes: Array<{ meridianId: string; recommendation: string | undefined; confidence?: number }>,
  options?: {
    minConfidenceThreshold?: number;
    requireReliableRep?: boolean;
  }
): WeightedConsensus {
  const weightedVotes: WeightedVote[] = votes.map((vote) => {
    const rep = getOrCreateReputation(vote.meridianId);
    // Weight = reputation * confidence (or 1.0 if no confidence provided)
    const weight = rep.accuracy * (vote.confidence ?? 1.0);
    return {
      meridianId: vote.meridianId,
      recommendation: vote.recommendation,
      weight,
      rawConfidence: vote.confidence ?? 1.0,
    };
  });

  // Aggregate weighted votes by recommendation
  const voteWeights = new Map<string, number>();
  let totalWeight = 0;
  
  for (const vote of weightedVotes) {
    const key = vote.recommendation ?? 'no_recommendation';
    const current = voteWeights.get(key) ?? 0;
    voteWeights.set(key, current + vote.weight);
    totalWeight += vote.weight;
  }

  // Find winner
  let bestRecommendation: string | undefined;
  let bestWeight = 0;
  
  for (const [rec, weight] of voteWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestRecommendation = rec === 'no_recommendation' ? undefined : rec;
    }
  }

  const confidence = totalWeight > 0 ? bestWeight / totalWeight : 0;
  
  // Identify dissenters (high-rep Meridians that voted differently)
  const dissenters: string[] = [];
  const unreliableReps: string[] = [];
  
  for (const vote of weightedVotes) {
    const rep = getOrCreateReputation(vote.meridianId);
    const isReliable = rep.totalTasks >= MIN_TASKS_FOR_RELIABLE_REP;
    
    if (vote.recommendation !== bestRecommendation) {
      if (isReliable && rep.accuracy > 0.9) {
        dissenters.push(vote.meridianId);
      } else if (!isReliable) {
        unreliableReps.push(vote.meridianId);
      }
    }
  }

  // Low confidence if high-rep Meridian dissents
  const lowConfidence = dissenters.length > 0 || confidence < (options?.minConfidenceThreshold ?? 0.6);

  return {
    recommendation: bestRecommendation,
    confidence,
    weightedVotes,
    dissenters,
    lowConfidence,
  };
}

export function detectDrift(
  consensus: WeightedConsensus,
  threshold: number = DISSENT_THRESHOLD
): { hasDrift: boolean; severity: 'none' | 'minor' | 'major'; details: string } {
  const { weightedVotes, dissenters, confidence } = consensus;
  
  if (weightedVotes.length < 2) {
    return { hasDrift: false, severity: 'none', details: 'Insufficient votes for drift detection' };
  }

  // Calculate variance in recommendations
  const uniqueRecs = new Set(weightedVotes.map(v => v.recommendation));
  const maxVariance = uniqueRecs.size / weightedVotes.length;

  // Check for high-rep dissent
  const hasHighRepDissent = dissenters.length > 0;
  
  // Calculate severity
  let severity: 'none' | 'minor' | 'major' = 'none';
  let hasDrift = false;
  
  if (hasHighRepDissent) {
    hasDrift = true;
    severity = confidence < 0.5 ? 'major' : 'minor';
  } else if (maxVariance > threshold) {
    hasDrift = true;
    severity = 'minor';
  }

  const details = hasDrift
    ? `Drift detected: ${dissenters.length} high-rep dissenters, confidence=${confidence.toFixed(2)}, variance=${maxVariance.toFixed(2)}`
    : 'No significant drift';

  return { hasDrift, severity, details };
}

export function getReputationReport(): Record<string, ReputationScore> {
  return Object.fromEntries(reputationStore);
}

export function decayOldReputations(ageMs: number = 7 * 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [id, rep] of reputationStore) {
    if (now - rep.lastUpdated > ageMs) {
      // Decay accuracy slightly for stale Meridians
      rep.accuracy = rep.accuracy * 0.95;
      rep.lastUpdated = now;
    }
  }
}

// Export for HCS persistence
export function serializeReputations(): string {
  return JSON.stringify(Object.fromEntries(reputationStore));
}

export function deserializeReputations(data: string): void {
  const parsed = JSON.parse(data);
  for (const [id, rep] of Object.entries(parsed)) {
    reputationStore.set(id, rep as ReputationScore);
  }
}
