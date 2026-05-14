/**
 * Cross-Agent Learning
 * 
 * Propagates council insights across the Vera lattice so all nodes
 * benefit from collective experience and adjust Meridian weights.
 */

import { config } from '../../config.js';
import type { ReputationScore } from './meridianReputation.js';

export interface LearningLesson {
  id: string;
  timestamp: number;
  meridianId: string;
  lessonType: 'bias_detected' | 'drift_detected' | 'accuracy_drop' | 'specialization_found';
  description: string;
  confidence: number;
  affectedContexts: string[]; // service types where this applies
  recommendedAction: string;
  weightAdjustment?: number; // +/- to apply to Meridian weight
  sourceNode?: string;
  verificationCount: number;
}

export interface LatticeUpdate {
  lessons: LearningLesson[];
  reputationUpdates: Record<string, Partial<ReputationScore>>;
  timestamp: number;
  nodeId: string;
  hcsSequence?: number; // If published to HCS
}

// In-memory lesson store (shared across agents on same node)
const lessonStore = new Map<string, LearningLesson>();

// Minimum confidence before broadcasting a lesson
const BROADCAST_THRESHOLD = 0.85;

// Minimum verifications before applying globally
const GLOBAL_VERIFICATION_THRESHOLD = 3;

export function recordLesson(
  meridianId: string,
  lessonType: LearningLesson['lessonType'],
  description: string,
  confidence: number,
  affectedContexts: string[],
  options?: {
    weightAdjustment?: number;
    sourceNode?: string;
  }
): LearningLesson {
  const lesson: LearningLesson = {
    id: generateLessonId(),
    timestamp: Date.now(),
    meridianId,
    lessonType,
    description,
    confidence,
    affectedContexts,
    recommendedAction: deriveRecommendedAction(lessonType, options?.weightAdjustment),
    weightAdjustment: options?.weightAdjustment,
    sourceNode: options?.sourceNode ?? (config as Record<string, string>).VERA_NODE_ID ?? 'local',
    verificationCount: 1,
  };

  lessonStore.set(lesson.id, lesson);
  
  console.log(`[Learning] Recorded lesson ${lesson.id}: ${lessonType} for ${meridianId}`);
  
  // Auto-broadcast if high confidence
  if (confidence >= BROADCAST_THRESHOLD) {
    broadcastLesson(lesson);
  }

  return lesson;
}

function generateLessonId(): string {
  return `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveRecommendedAction(
  lessonType: LearningLesson['lessonType'],
  weightAdjustment?: number
): string {
  switch (lessonType) {
    case 'bias_detected':
      return `Adjust weight by ${weightAdjustment ?? -0.1} for affected contexts`;
    case 'drift_detected':
      return 'Flag for retraining or replacement';
    case 'accuracy_drop':
      return 'Reduce confidence threshold or escalate to human';
    case 'specialization_found':
      return `Increase weight by ${weightAdjustment ?? 0.05} for specialization`;
    default:
      return 'Monitor and reassess';
  }
}

export async function broadcastLesson(lesson: LearningLesson): Promise<void> {
  // Publish to HCS if configured
  if (config.VERA_AUDIT_TOPIC_ID) {
    try {
      const payload = {
        type: 'vera_learning_lesson',
        lesson: {
          ...lesson,
          // Exclude sensitive details
          description: sanitizeDescription(lesson.description),
        },
      };
      
      // In production: submit to HCS
      console.log(`[Learning] Broadcasting lesson ${lesson.id} to lattice`);
      
      // Simulate HCS publish (replace with actual SDK call)
      // const receipt = await publishToHCS(config.VERA_AUDIT_TOPIC_ID, payload);
      // lesson.hcsSequence = receipt.sequenceNumber;
    } catch (error) {
      console.error('[Learning] Failed to broadcast lesson:', error);
    }
  }

  // Also publish to local lattice for same-node agents
  publishToLocalLattice(lesson);
}

function sanitizeDescription(description: string): string {
  // Remove any potentially sensitive info
  return description
    .replace(/\b0x[a-fA-F0-9]{40,}\b/g, '[ADDRESS]')
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
}

function publishToLocalLattice(lesson: LearningLesson): void {
  // Emit event for other agents on this node via EventEmitter pattern
  if (typeof process !== 'undefined' && 'emit' in process) {
    try {
      (process as NodeJS.EventEmitter).emit('vera:lesson', lesson);
    } catch {
      // EventEmitter not available, skip local broadcast
    }
  }
}

export function receiveLesson(
  lesson: LearningLesson,
  localMeridianIds: string[]
): void {
  const existing = lessonStore.get(lesson.id);
  
  if (existing) {
    // Increment verification count
    existing.verificationCount++;
    existing.confidence = Math.max(existing.confidence, lesson.confidence);
    
    // If enough verifications, apply globally
    if (existing.verificationCount >= GLOBAL_VERIFICATION_THRESHOLD) {
      applyLessonGlobally(existing, localMeridianIds);
    }
  } else {
    // New lesson from another node
    lessonStore.set(lesson.id, { ...lesson, verificationCount: 1 });
  }
}

function applyLessonGlobally(
  lesson: LearningLesson,
  localMeridianIds: string[]
): void {
  if (!localMeridianIds.includes(lesson.meridianId)) {
    return; // Lesson doesn't apply to our Meridians
  }

  console.log(`[Learning] Applying verified lesson ${lesson.id} globally`);
  
  // This would trigger reputation adjustments
  // Import and call from meridianReputation.ts
  if (lesson.weightAdjustment) {
    console.log(`[Learning] Adjusting ${lesson.meridianId} weight by ${lesson.weightAdjustment}`);
    // applyWeightAdjustment(lesson.meridianId, lesson.weightAdjustment);
  }
}

export function getLessonsForMeridian(meridianId: string): LearningLesson[] {
  return Array.from(lessonStore.values())
    .filter(l => l.meridianId === meridianId)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function getRecentLessons(count: number = 10): LearningLesson[] {
  return Array.from(lessonStore.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, count);
}

export function findSpecializations(context: string): Array<{ meridianId: string; confidence: number }> {
  const specializations: Array<{ meridianId: string; confidence: number }> = [];
  
  for (const lesson of lessonStore.values()) {
    if (lesson.lessonType === 'specialization_found' && 
        lesson.affectedContexts.includes(context) &&
        lesson.verificationCount >= GLOBAL_VERIFICATION_THRESHOLD) {
      specializations.push({
        meridianId: lesson.meridianId,
        confidence: lesson.confidence,
      });
    }
  }
  
  return specializations.sort((a, b) => b.confidence - a.confidence);
}

// Serialize for persistence
export function serializeLessons(): string {
  const recentLessons = Array.from(lessonStore.values())
    .filter(l => Date.now() - l.timestamp < 30 * 24 * 60 * 60 * 1000) // 30 days
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 1000); // Keep last 1000
  
  return JSON.stringify(recentLessons);
}

// Deserialize on startup
export function deserializeLessons(data: string): void {
  const lessons: LearningLesson[] = JSON.parse(data);
  for (const lesson of lessons) {
    lessonStore.set(lesson.id, lesson);
  }
}

// Promote repeated lessons to upgrade packages
export function checkForUpgradePackage(): { ready: boolean; packageId?: string } {
  const biasLessons = Array.from(lessonStore.values())
    .filter(l => l.lessonType === 'bias_detected' && l.verificationCount >= 5);
  
  if (biasLessons.length >= 3) {
    // Enough evidence to create upgrade package
    return {
      ready: true,
      packageId: `upgrade-${Date.now()}`,
    };
  }
  
  return { ready: false };
}
