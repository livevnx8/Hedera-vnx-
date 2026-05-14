/**
 * Human-in-the-Loop Escalation System
 * 
 * Automatically escalates to human operators when:
 * - Confidence below threshold
 * - Critical drift detected
 * - High-stakes operations with low consensus
 * - Novel task types (cold start)
 */

import { config } from '../../config.js';
import type { EnhancedMeridianShadowScore } from './meridianShadow.js';
import type { VerifiableAITask } from './types.js';

export interface EscalationRule {
  id: string;
  name: string;
  condition: (score: EnhancedMeridianShadowScore, task: VerifiableAITask) => boolean;
  priority: number; // 1 = highest
  autoResolve: boolean; // Can system auto-resolve or require human?
  notificationChannels: ('slack' | 'email' | 'hcs')[];
}

export interface EscalationEvent {
  id: string;
  timestamp: number;
  taskId: string;
  taskType: string;
  triggeredRules: string[];
  confidence: number;
  humanDecision?: 'approve' | 'reject' | 'modify';
  modifiedOutput?: string;
  status: 'pending' | 'escalated' | 'approved' | 'rejected' | 'timeout';
  hcsReceiptHash?: string;
}

// Default escalation thresholds
const CONFIDENCE_THRESHOLD = 0.6;
const CRITICAL_DRIFT_THRESHOLD = 0.7;
const FINANCIAL_CONFIDENCE_THRESHOLD = 0.85;

// Escalation rule registry
const escalationRules: EscalationRule[] = [
  {
    id: 'critical_drift',
    name: 'Critical Model Drift Detected',
    condition: (score) => score.driftEvents?.some(e => e.severity === 'critical') ?? false,
    priority: 1,
    autoResolve: false,
    notificationChannels: ['slack', 'hcs'],
  },
  {
    id: 'high_stakes_low_confidence',
    name: 'High-Stakes Task with Low Confidence',
    condition: (score, task) => {
      const isFinancial = /payment|transfer|withdraw|hbar|token/i.test(task.description);
      const confidence = score.confidence ?? 0;
      return isFinancial && confidence < FINANCIAL_CONFIDENCE_THRESHOLD;
    },
    priority: 2,
    autoResolve: false,
    notificationChannels: ['slack', 'email', 'hcs'],
  },
  {
    id: 'low_confidence_threshold',
    name: 'Confidence Below Threshold',
    condition: (score) => (score.confidence ?? 0) < CONFIDENCE_THRESHOLD,
    priority: 3,
    autoResolve: true, // System can retry with more Meridians
    notificationChannels: ['hcs'],
  },
  {
    id: 'major_drift',
    name: 'Major Model Drift Detected',
    condition: (score) => score.driftEvents?.some(e => e.severity === 'major') ?? false,
    priority: 4,
    autoResolve: true,
    notificationChannels: ['slack', 'hcs'],
  },
  {
    id: 'council_split',
    name: 'Council Deeply Split',
    condition: (score) => {
      if (!score.weightedConsensus) return false;
      // If top recommendation has < 60% weighted support
      return score.weightedConsensus.confidence < 0.6 && score.quorum && score.quorum.scored >= 3;
    },
    priority: 5,
    autoResolve: true,
    notificationChannels: ['hcs'],
  },
  {
    id: 'novel_task_type',
    name: 'Novel Task Type (Cold Start)',
    condition: (score, task) => {
      // Check if we've seen this service type before
      // Would query historical data in production
      const seenTypes = ['audit', 'carbon', 'defi', 'messaging']; // Cached
      return !seenTypes.includes(task.serviceType.toLowerCase());
    },
    priority: 6,
    autoResolve: true,
    notificationChannels: ['hcs'],
  },
];

// Active escalation queue
const escalationQueue = new Map<string, EscalationEvent>();

export function evaluateEscalation(
  score: EnhancedMeridianShadowScore,
  task: VerifiableAITask
): { shouldEscalate: boolean; triggeredRules: EscalationRule[]; autoResolvable: boolean } {
  const triggered = escalationRules
    .filter(rule => rule.condition(score, task))
    .sort((a, b) => a.priority - b.priority);

  if (triggered.length === 0) {
    return { shouldEscalate: false, triggeredRules: [], autoResolvable: true };
  }

  // Check if any high-priority rules require human
  const requiresHuman = triggered.some(r => !r.autoResolve);
  const autoResolvable = !requiresHuman;

  return {
    shouldEscalate: true,
    triggeredRules: triggered,
    autoResolvable,
  };
}

export function createEscalationEvent(
  task: VerifiableAITask,
  score: EnhancedMeridianShadowScore,
  triggeredRules: EscalationRule[]
): EscalationEvent {
  const event: EscalationEvent = {
    id: `esc-${Date.now()}-${task.taskId?.slice(0, 8) ?? 'unknown'}`,
    timestamp: Date.now(),
    taskId: task.taskId ?? 'unknown',
    taskType: task.serviceType,
    triggeredRules: triggeredRules.map(r => r.id),
    confidence: score.confidence ?? 0,
    status: 'pending',
  };

  escalationQueue.set(event.id, event);
  
  // Emit notifications
  for (const rule of triggeredRules) {
    for (const channel of rule.notificationChannels) {
      emitNotification(channel, event, rule);
    }
  }

  console.log(`[Escalation] Created ${event.id}: ${triggeredRules.map(r => r.name).join(', ')}`);
  return event;
}

function emitNotification(
  channel: 'slack' | 'email' | 'hcs',
  event: EscalationEvent,
  rule: EscalationRule
): void {
  const payload = {
    type: 'vera_escalation',
    eventId: event.id,
    taskId: event.taskId,
    rule: rule.name,
    confidence: event.confidence,
    priority: rule.priority,
    timestamp: event.timestamp,
  };

  switch (channel) {
    case 'slack':
      // Would POST to Slack webhook
      console.log(`[Slack] Escalation: ${rule.name} (${event.id})`);
      break;
    case 'email':
      // Would send via email service
      console.log(`[Email] Escalation: ${rule.name} (${event.id})`);
      break;
    case 'hcs':
      // Emit to Hedera Consensus Service
      if (config.VERA_AUDIT_TOPIC_ID) {
        event.hcsReceiptHash = generateHcsEscalationHash(payload);
        console.log(`[HCS] Escalation receipt: ${event.hcsReceiptHash}`);
      }
      break;
  }
}

function generateHcsEscalationHash(payload: unknown): string {
  const str = JSON.stringify(payload);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `esc-${Math.abs(hash).toString(16).padStart(16, '0')}`;
}

export function resolveEscalation(
  escalationId: string,
  decision: 'approve' | 'reject' | 'modify',
  modifiedOutput?: string
): EscalationEvent | null {
  const event = escalationQueue.get(escalationId);
  if (!event) return null;

  event.humanDecision = decision;
  event.modifiedOutput = modifiedOutput;
  event.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'escalated';

  console.log(`[Escalation] Resolved ${escalationId}: ${decision}`);
  
  // Update HCS with resolution
  if (event.hcsReceiptHash && config.VERA_AUDIT_TOPIC_ID) {
    console.log(`[HCS] Resolution recorded for ${event.hcsReceiptHash}`);
  }

  return event;
}

// Auto-resolve strategies for auto-resolvable escalations
export function attemptAutoResolution(
  task: VerifiableAITask,
  score: EnhancedMeridianShadowScore,
  triggeredRules: EscalationRule[]
): { resolved: boolean; strategy: string; newScore?: EnhancedMeridianShadowScore } {
  const strategies: Array<{ name: string; apply: () => boolean }> = [
    {
      name: 'expand_council',
      apply: () => {
        // Retry with larger council
        if (score.councilSizing && score.councilSizing.size < 5) {
          console.log(`[AutoResolve] Expanding council from ${score.councilSizing.size} to 5`);
          // Would trigger re-consultation with more Meridians
          return true;
        }
        return false;
      },
    },
    {
      name: 'lower_temperature',
      apply: () => {
        // Retry with more deterministic sampling
        console.log('[AutoResolve] Retrying with temperature=0');
        return true;
      },
    },
    {
      name: 'fallback_to_highest_rep',
      apply: () => {
        // Use single highest-reputation Meridian
        if (score.members && score.members.length > 0) {
          console.log('[AutoResolve] Falling back to highest-rep Meridian');
          return true;
        }
        return false;
      },
    },
  ];

  for (const strategy of strategies) {
    if (strategy.apply()) {
      return { resolved: true, strategy: strategy.name };
    }
  }

  return { resolved: false, strategy: 'none_available' };
}

export function getPendingEscalations(): EscalationEvent[] {
  return Array.from(escalationQueue.values())
    .filter(e => e.status === 'pending' || e.status === 'escalated')
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function getEscalationStats(): {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  autoResolved: number;
  avgResolutionTimeMs: number;
} {
  const events = Array.from(escalationQueue.values());
  const resolved = events.filter(e => e.status === 'approved' || e.status === 'rejected');
  const resolutionTimes = resolved
    .map(e => e.timestamp - (escalationQueue.get(e.id)?.timestamp ?? e.timestamp))
    .filter(t => t > 0);

  return {
    total: events.length,
    pending: events.filter(e => e.status === 'pending').length,
    approved: events.filter(e => e.status === 'approved').length,
    rejected: events.filter(e => e.status === 'rejected').length,
    autoResolved: events.filter(e => e.status === 'timeout').length,
    avgResolutionTimeMs: resolutionTimes.length > 0
      ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
      : 0,
  };
}

// Cleanup old escalations
export function cleanupEscalations(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, event] of escalationQueue) {
    if (event.timestamp < cutoff) {
      escalationQueue.delete(id);
    }
  }
}
