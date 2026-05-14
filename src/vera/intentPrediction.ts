/**
 * Vera's Intent Prediction System
 * 
 * Predicts user intent based on conversation context, temporal patterns,
 * and learned clusters. Pre-warms tools before they're needed.
 */
import fs from 'fs';
import path from 'path';

const INTENT_PATH = '/mnt/vera-mirror-shards/vera-lattice/intent-predictions.json';

interface IntentModel {
  sequences: Map<string, IntentSequence>;
  contextPatterns: ContextPattern[];
  lastUpdated: number;
}

interface IntentSequence {
  tools: string[];
  frequency: number;
  confidence: number;
  avgTimeBetween: number; // ms
}

interface ContextPattern {
  keywords: string[];
  entities: string[];
  predictedTools: string[];
  accuracy: number; // 0-1
  occurrences: number;
}

interface Prediction {
  intent: string;
  confidence: number;
  suggestedTools: string[];
  reasoning: string;
  prewarm: boolean;
}

let model: IntentModel = {
  sequences: new Map(),
  contextPatterns: [],
  lastUpdated: 0,
};

function load(): void {
  try {
    if (fs.existsSync(INTENT_PATH)) {
      const raw = JSON.parse(fs.readFileSync(INTENT_PATH, 'utf8'));
      model.sequences = new Map(Object.entries(raw.sequences || {}));
      model.contextPatterns = raw.contextPatterns || [];
      model.lastUpdated = raw.lastUpdated || 0;
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(INTENT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const serialized = {
      sequences: Object.fromEntries(model.sequences),
      contextPatterns: model.contextPatterns,
      lastUpdated: model.lastUpdated,
    };
    fs.writeFileSync(INTENT_PATH, JSON.stringify(serialized, null, 2));
  } catch { /* silent */ }
}

export function recordSequence(tools: string[]): void {
  if (tools.length < 2) return;
  
  load();
  
  const key = tools.join('→');
  const existing = model.sequences.get(key);
  
  if (existing) {
    existing.frequency++;
    // Recalculate confidence based on frequency
    existing.confidence = Math.min(0.95, 0.3 + (existing.frequency * 0.05));
  } else {
    model.sequences.set(key, {
      tools,
      frequency: 1,
      confidence: 0.3,
      avgTimeBetween: 0,
    });
  }
  
  model.lastUpdated = Date.now();
  save();
}

export function learnContextPattern(
  text: string,
  entities: string[],
  toolsUsed: string[]
): void {
  load();
  
  // Extract keywords
  const keywords = text.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 5);
  
  // Check for similar existing pattern
  const similar = model.contextPatterns.find(p => {
    const overlap = p.keywords.filter(k => keywords.includes(k)).length;
    return overlap >= Math.min(keywords.length, p.keywords.length) * 0.5;
  });
  
  if (similar) {
    similar.occurrences++;
    // Update predicted tools if this one was different
    for (const tool of toolsUsed) {
      if (!similar.predictedTools.includes(tool)) {
        similar.predictedTools.push(tool);
      }
    }
    // Recalculate accuracy
    similar.accuracy = Math.min(0.95, similar.accuracy + 0.02);
  } else {
    model.contextPatterns.push({
      keywords,
      entities,
      predictedTools: toolsUsed,
      accuracy: 0.5,
      occurrences: 1,
    });
  }
  
  // Keep only top patterns by occurrences
  model.contextPatterns.sort((a, b) => b.occurrences - a.occurrences);
  if (model.contextPatterns.length > 50) {
    model.contextPatterns = model.contextPatterns.slice(0, 50);
  }
  
  model.lastUpdated = Date.now();
  save();
}

export function predictIntent(
  recentTools: string[],
  currentText: string,
  entities: string[]
): Prediction[] {
  load();
  
  const predictions: Prediction[] = [];
  
  // 1. Sequence-based prediction
  if (recentTools.length > 0) {
    const lastTool = recentTools[recentTools.length - 1];
    
    // Find sequences starting with recent tools
    for (const [key, seq] of model.sequences.entries()) {
      const seqTools = seq.tools;
      
      // Check if recent tools match the start of this sequence
      const matchLength = recentTools.filter((t, i) => 
        seqTools[i] === t
      ).length;
      
      if (matchLength === recentTools.length && seqTools.length > matchLength) {
        const nextTool = seqTools[matchLength];
        predictions.push({
          intent: `sequence_continuation`,
          confidence: seq.confidence * 0.8,
          suggestedTools: [nextTool],
          reasoning: `Sequence pattern: ${key}`,
          prewarm: seq.confidence > 0.6,
        });
      }
    }
  }
  
  // 2. Context-based prediction
  const textLower = currentText.toLowerCase();
  for (const pattern of model.contextPatterns) {
    const keywordMatch = pattern.keywords.filter(k => 
      textLower.includes(k)
    ).length;
    
    const entityMatch = pattern.entities.filter(e => 
      entities.includes(e)
    ).length;
    
    const matchScore = (keywordMatch / Math.max(1, pattern.keywords.length)) * 0.6 +
                       (entityMatch / Math.max(1, pattern.entities.length)) * 0.4;
    
    if (matchScore > 0.3) {
      predictions.push({
        intent: `context_match`,
        confidence: pattern.accuracy * matchScore,
        suggestedTools: pattern.predictedTools,
        reasoning: `Context pattern: ${pattern.keywords.slice(0, 3).join(', ')}`,
        prewarm: pattern.accuracy > 0.7 && matchScore > 0.5,
      });
    }
  }
  
  // Sort by confidence and remove duplicates
  predictions.sort((a, b) => b.confidence - a.confidence);
  
  // Deduplicate by tool
  const seenTools = new Set<string>();
  const unique = predictions.filter(p => {
    const key = p.suggestedTools.join(',');
    if (seenTools.has(key)) return false;
    seenTools.add(key);
    return true;
  });
  
  return unique.slice(0, 5);
}

export function getTopSequences(limit = 10): IntentSequence[] {
  load();
  return Array.from(model.sequences.values())
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}

export function getIntentStats(): {
  sequences: number;
  patterns: number;
  lastUpdated: number;
} {
  load();
  return {
    sequences: model.sequences.size,
    patterns: model.contextPatterns.length,
    lastUpdated: model.lastUpdated,
  };
}

// Initialize
load();
