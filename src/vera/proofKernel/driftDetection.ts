/**
 * Real-Time Drift Detection
 * 
 * Monitors when Meridians diverge significantly on similar inputs,
 * flags model degradation, and triggers retraining or alerts.
 */

import type { LearningLesson } from './crossAgentLearning.js';

export interface DriftEvent {
  id: string;
  timestamp: number;
  meridianId: string;
  divergenceScore: number; // 0.0 - 1.0
  baselineAccuracy: number;
  currentAccuracy: number;
  sampleCount: number;
  context: string;
  severity: 'none' | 'minor' | 'major' | 'critical';
  status: 'detected' | 'investigating' | 'confirmed' | 'resolved';
  recommendedAction: string;
}

export interface DriftMonitor {
  meridianId: string;
  recentPredictions: Array<{
    input: string;
    output: string;
    confidence: number;
    timestamp: number;
  }>;
  baselineSignature: number[]; // Embedding signature of "normal" behavior
  windowSize: number;
  driftThreshold: number;
}

// Drift detection thresholds
const DISSENT_THRESHOLD = 0.30;     // 30% variance triggers warning
const MAJOR_DRIFT_THRESHOLD = 0.50; // 50% variance is critical
const MIN_SAMPLES = 5;              // Need at least 5 samples
const MAX_WINDOW_SIZE = 100;        // Keep last 100 predictions

// Active monitors
const driftMonitors = new Map<string, DriftMonitor>();
const driftEvents = new Map<string, DriftEvent>();

export function registerMeridianForDrift(
  meridianId: string,
  initialSamples?: Array<{ input: string; output: string; confidence: number }>
): DriftMonitor {
  const monitor: DriftMonitor = {
    meridianId,
    recentPredictions: initialSamples?.map(s => ({ ...s, timestamp: Date.now() })) ?? [],
    baselineSignature: [],
    windowSize: MAX_WINDOW_SIZE,
    driftThreshold: DISSENT_THRESHOLD,
  };

  // Build baseline from initial samples
  if (monitor.recentPredictions.length >= MIN_SAMPLES) {
    monitor.baselineSignature = computeBehaviorSignature(monitor.recentPredictions);
  }

  driftMonitors.set(meridianId, monitor);
  return monitor;
}

export function recordPrediction(
  meridianId: string,
  input: string,
  output: string,
  confidence: number
): DriftEvent | null {
  let monitor = driftMonitors.get(meridianId);
  if (!monitor) {
    monitor = registerMeridianForDrift(meridianId);
  }

  // Add new prediction
  monitor.recentPredictions.push({
    input: input.slice(0, 200), // Truncate for memory
    output: output.slice(0, 200),
    confidence,
    timestamp: Date.now(),
  });

  // Trim window
  if (monitor.recentPredictions.length > monitor.windowSize) {
    monitor.recentPredictions.shift();
  }

  // Need enough samples to detect drift
  if (monitor.recentPredictions.length < MIN_SAMPLES) {
    return null;
  }

  // Check for drift
  const drift = detectDriftForMonitor(monitor);
  
  if (drift.severity !== 'none') {
    const event = createDriftEvent(meridianId, drift);
    driftEvents.set(event.id, event);
    return event;
  }

  return null;
}

interface DriftResult {
  severity: 'none' | 'minor' | 'major' | 'critical';
  divergenceScore: number;
  confidence: number;
  context: string;
}

function detectDriftForMonitor(monitor: DriftMonitor): DriftResult {
  const recent = monitor.recentPredictions.slice(-20); // Last 20 predictions
  
  // Calculate behavioral signature
  const currentSignature = computeBehaviorSignature(recent);
  
  // If no baseline yet, use recent as baseline
  if (monitor.baselineSignature.length === 0) {
    monitor.baselineSignature = currentSignature;
    return { severity: 'none', divergenceScore: 0, confidence: 1, context: 'baseline_established' };
  }

  // Compute divergence
  const divergenceScore = calculateDivergence(monitor.baselineSignature, currentSignature);
  
  // Determine severity
  let severity: DriftResult['severity'] = 'none';
  if (divergenceScore >= MAJOR_DRIFT_THRESHOLD) {
    severity = 'critical';
  } else if (divergenceScore >= monitor.driftThreshold) {
    severity = 'major';
  } else if (divergenceScore >= monitor.driftThreshold * 0.5) {
    severity = 'minor';
  }

  // Average confidence of recent predictions
  const avgConfidence = recent.reduce((sum, p) => sum + p.confidence, 0) / recent.length;

  return {
    severity,
    divergenceScore,
    confidence: avgConfidence,
    context: recent[0]?.input.slice(0, 50) ?? 'unknown',
  };
}

// Simple behavioral signature: output length distribution, common tokens, etc.
function computeBehaviorSignature(predictions: Array<{ output: string; confidence: number }>): number[] {
  if (predictions.length === 0) return [];

  const outputLengths = predictions.map(p => p.output.length);
  const avgLength = outputLengths.reduce((a, b) => a + b, 0) / outputLengths.length;
  const avgConfidence = predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;
  
  // Token frequency (simplified)
  const tokenCounts = new Map<string, number>();
  for (const p of predictions) {
    const tokens = p.output.toLowerCase().split(/\s+/).slice(0, 20);
    for (const t of tokens) {
      tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
    }
  }
  
  // Most common tokens
  const topTokens = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token]) => token.charCodeAt(0) % 100 / 100); // Normalize

  return [
    avgLength / 1000, // Normalize
    avgConfidence,
    ...topTokens,
    predictions.length / 100,
  ];
}

// Calculate cosine-like distance between signatures
function calculateDivergence(baseline: number[], current: number[]): number {
  if (baseline.length !== current.length || baseline.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let baselineNorm = 0;
  let currentNorm = 0;

  for (let i = 0; i < baseline.length; i++) {
    dotProduct += baseline[i] * current[i];
    baselineNorm += baseline[i] * baseline[i];
    currentNorm += current[i] * current[i];
  }

  if (baselineNorm === 0 || currentNorm === 0) return 0;

  const cosine = dotProduct / (Math.sqrt(baselineNorm) * Math.sqrt(currentNorm));
  return 1 - cosine; // Convert to distance (0 = identical, 1 = opposite)
}

function createDriftEvent(meridianId: string, drift: DriftResult): DriftEvent {
  const event: DriftEvent = {
    id: `drift-${Date.now()}-${meridianId}`,
    timestamp: Date.now(),
    meridianId,
    divergenceScore: drift.divergenceScore,
    baselineAccuracy: 0, // Would be fetched from reputation
    currentAccuracy: drift.confidence,
    sampleCount: driftMonitors.get(meridianId)?.recentPredictions.length ?? 0,
    context: drift.context,
    severity: drift.severity,
    status: 'detected',
    recommendedAction: deriveDriftAction(drift.severity),
  };

  console.log(`[Drift] ${drift.severity.toUpperCase()} drift detected for ${meridianId}: ${drift.divergenceScore.toFixed(2)}`);

  return event;
}

function deriveDriftAction(severity: DriftEvent['severity']): string {
  switch (severity) {
    case 'critical':
      return 'Immediately remove from council, flag for retraining or replacement';
    case 'major':
      return 'Reduce weight by 50%, require additional verification for decisions';
    case 'minor':
      return 'Monitor closely, schedule re-evaluation in 24h';
    default:
      return 'No action required';
  }
}

// Compare multiple Meridians on same input
export function detectCrossMeridianDrift(
  meridianId: string,
  input: string,
  output: string,
  peerOutputs: Array<{ meridianId: string; output: string; confidence: number }>
): { hasDrift: boolean; severity: DriftEvent['severity']; details: string } {
  if (peerOutputs.length < 2) {
    return { hasDrift: false, severity: 'none', details: 'Insufficient peers for comparison' };
  }

  // Check if this Meridian's output is an outlier
  const thisOutput = output.toLowerCase();
  const similarOutputs = peerOutputs.filter(p => 
    similarity(thisOutput, p.output.toLowerCase()) > 0.7
  );

  const agreementRatio = similarOutputs.length / peerOutputs.length;

  if (agreementRatio < 0.3) {
    return {
      hasDrift: true,
      severity: 'major',
      details: `Output diverges significantly from ${peerOutputs.length - similarOutputs.length} peers`,
    };
  }

  if (agreementRatio < 0.5) {
    return {
      hasDrift: true,
      severity: 'minor',
      details: `Partial agreement with ${similarOutputs.length}/${peerOutputs.length} peers`,
    };
  }

  return { hasDrift: false, severity: 'none', details: 'Output consistent with peers' };
}

// Simple string similarity (Jaccard-like)
function similarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

// Export for alerting
export function getActiveDrifts(severity?: DriftEvent['severity']): DriftEvent[] {
  const events = Array.from(driftEvents.values())
    .filter(e => e.status !== 'resolved');
  
  if (severity) {
    return events.filter(e => e.severity === severity);
  }
  
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

export function resolveDrift(driftId: string): void {
  const event = driftEvents.get(driftId);
  if (event) {
    event.status = 'resolved';
    console.log(`[Drift] Resolved: ${driftId}`);
  }
}

// Convert drift event to learning lesson
export function driftToLesson(drift: DriftEvent): LearningLesson {
  return {
    id: drift.id,
    timestamp: drift.timestamp,
    meridianId: drift.meridianId,
    lessonType: 'drift_detected',
    description: `Model drift detected: divergence=${drift.divergenceScore.toFixed(2)}`,
    confidence: 0.9,
    affectedContexts: [drift.context],
    recommendedAction: drift.recommendedAction,
    weightAdjustment: drift.severity === 'critical' ? -0.5 : 
                      drift.severity === 'major' ? -0.3 : -0.1,
    verificationCount: 1,
  };
}
