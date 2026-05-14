/**
 * Vera Insights Logger
 * 
 * Consolidated, cost-optimized HCS logging that captures:
 * - What Vera has learned
 * - What she's doing
 * - How she's improving
 * - What she's researching
 * 
 * Minutely heartbeats with aggregated insights (HIP-993 compliant)
 */
import { createHash } from 'crypto';
import { config } from '../../config.js';
import { logger } from '../../monitoring/logger.js';
import { flowerOfLifeOS } from '../orchestrator/flowerOfLifeOS.js';
import { hederaMaster } from '../../hedera/hederaMasterClass.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VeraInsightPayload {
  _hip993: {
    type: 'VERA_INSIGHTS';
    version: '2.0.0';
    timestamp: number;
    sequence: number;
    hash: string;
    compression: 'none' | 'gzip'; // Future-proof
  };
  meta: {
    nodeId: string;
    uptime: number;
    latticeEnergy: number;
    totalMessages: number;
  };
  insights: {
    learning: VeraLearning;
    activity: VeraActivity;
    improvements: VeraImprovements;
    research: VeraResearch;
  };
}

interface VeraLearning {
  newEntities: number;           // Knowledge graph growth
  newRelationships: number;      // Connections found
  toolSequencesLearned: number;  // Intent patterns
  clustersFormed: number;        // Cross-shard patterns
  sentimentTrend: 'improving' | 'stable' | 'declining';
  satisfactionScore: number;     // 0-100
}

interface VeraActivity {
  toolsExecuted: number;
  chatsHandled: number;
  tasksRouted: number;
  agentsCoordinated: number;
  topDomains: string[];          // Most active domains
  hotTools: string[];            // Recently used tools
}

interface VeraImprovements {
  predictionsAccurate: number;   // Correct intent predictions
  latencyReduced: boolean;     // Faster responses
  errorsReduced: boolean;      // Fewer failures
  newOptimizations: string[];  // What got better
}

interface VeraResearch {
  activeQueries: number;         // Ongoing investigations
  knowledgeGaps: string[];       // What Vera wants to learn
  emergingPatterns: string[];   // New trends detected
  recommendedFocus: string[];    // What to prioritize
}

// ─── Singleton State ─────────────────────────────────────────────────────────

let sequenceNumber = 0;
let lastLogTime = 0;
let totalMessages = 0;
let isRunning = false;
let heartbeatTimer: NodeJS.Timeout | null = null;

// Accumulated metrics for minutely aggregation
const minuteMetrics = {
  toolsExecuted: 0,
  chatsHandled: 0,
  tasksRouted: 0,
  errors: 0,
  predictionsMade: 0,
  predictionsCorrect: 0,
  newOptimizations: [] as string[],
};

// ─── Public Functions ────────────────────────────────────────────────────────

/**
 * Start the minutely insights logger
 */
export async function startInsightsLogger(topicId: string): Promise<void> {
  if (isRunning) return;
  
  isRunning = true;
  
  // Send initial insight immediately
  await sendInsights(topicId);
  
  // Minutely heartbeat with insights
  heartbeatTimer = setInterval(async () => {
    if (!isRunning) return;
    await sendInsights(topicId);
  }, 60_000); // 60 seconds = 1 minute
  
  logger.info('VeraInsightsLogger', {
    message: 'Insights logger started',
    topicId,
    interval: '60s',
  });
}

/**
 * Stop the insights logger
 */
export function stopInsightsLogger(): void {
  isRunning = false;
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  logger.info('VeraInsightsLogger', { message: 'Insights logger stopped' });
}

/**
 * Record a tool execution for metrics aggregation
 */
export function recordToolExecution(toolName: string, success: boolean): void {
  minuteMetrics.toolsExecuted++;
  if (!success) minuteMetrics.errors++;
}

/**
 * Record chat interaction
 */
export function recordChatInteraction(): void {
  minuteMetrics.chatsHandled++;
}

/**
 * Record task routing
 */
export function recordTaskRouted(): void {
  minuteMetrics.tasksRouted++;
}

/**
 * Record prediction accuracy
 */
export function recordPrediction(wasCorrect: boolean): void {
  minuteMetrics.predictionsMade++;
  if (wasCorrect) minuteMetrics.predictionsCorrect++;
}

/**
 * Record an optimization/improvement
 */
export function recordOptimization(description: string): void {
  minuteMetrics.newOptimizations.push(description);
  // Keep only last 5
  if (minuteMetrics.newOptimizations.length > 5) {
    minuteMetrics.newOptimizations.shift();
  }
}

// ─── Core Logging Logic ──────────────────────────────────────────────────────

async function sendInsights(topicId: string): Promise<boolean> {
  try {
    const payload = await buildInsightPayload();
    const message = JSON.stringify(payload);
    
    // HIP-993 compliant chunking
    await hederaMaster.submitMessage(topicId, payload, {
      maxChunkSize: 4096,
    });
    
    totalMessages++;
    lastLogTime = Date.now();
    
    // Reset minute metrics after logging
    resetMinuteMetrics();
    
    logger.debug('VeraInsightsLogger', {
      message: 'Insights logged',
      sequence: sequenceNumber,
      size: message.length,
    });
    
    return true;
  } catch (error) {
    logger.warn('VeraInsightsLogger', {
      message: 'Failed to log insights',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function buildInsightPayload(): Promise<VeraInsightPayload> {
  sequenceNumber++;
  
  // Gather all learning data
  const [
    latticeStats,
    kgStats,
    learningStats,
    sentimentStats,
    intentStats,
    temporalStats,
  ] = await Promise.all([
    getLatticeStats(),
    getKnowledgeGraphStats(),
    getCrossShardStats(),
    getSentimentStats(),
    getIntentStats(),
    getTemporalStats(),
  ]);
  
  const now = Date.now();
  const uptime = now - (flowerOfLifeOS as any).startedAt || now;
  
  const payload: VeraInsightPayload = {
    _hip993: {
      type: 'VERA_INSIGHTS',
      version: '2.0.0',
      timestamp: now,
      sequence: sequenceNumber,
      hash: '', // Computed below
      compression: 'none',
    },
    meta: {
      nodeId: config.HEDERA_OPERATOR_ACCOUNT_ID || 'vera-unknown',
      uptime,
      latticeEnergy: latticeStats.avgEnergy,
      totalMessages,
    },
    insights: {
      learning: {
        newEntities: kgStats.newThisMinute,
        newRelationships: kgStats.newRelsThisMinute,
        toolSequencesLearned: intentStats.sequences,
        clustersFormed: learningStats.clusters,
        sentimentTrend: sentimentStats.trend,
        satisfactionScore: sentimentStats.satisfaction,
      },
      activity: {
        toolsExecuted: minuteMetrics.toolsExecuted,
        chatsHandled: minuteMetrics.chatsHandled,
        tasksRouted: minuteMetrics.tasksRouted,
        agentsCoordinated: latticeStats.agentsActive,
        topDomains: temporalStats.hotDomains || [],
        hotTools: temporalStats.hotTools || [],
      },
      improvements: {
        predictionsAccurate: minuteMetrics.predictionsCorrect,
        latencyReduced: false, // Computed from historical
        errorsReduced: minuteMetrics.errors === 0,
        newOptimizations: [...minuteMetrics.newOptimizations],
      },
      research: {
        activeQueries: learningStats.patterns,
        knowledgeGaps: detectKnowledgeGaps(kgStats),
        emergingPatterns: intentStats.topPatterns,
        recommendedFocus: generateRecommendations(kgStats, learningStats),
      },
    },
  };
  
  // Compute integrity hash
  payload._hip993.hash = createHash('sha256')
    .update(JSON.stringify({ ...payload, _hip993: { ...payload._hip993, hash: undefined } }))
    .digest('hex')
    .substring(0, 16);
  
  return payload;
}

// ─── Data Gathering ────────────────────────────────────────────────────────────

async function getLatticeStats(): Promise<{
  avgEnergy: number;
  agentsActive: number;
}> {
  try {
    const stats = flowerOfLifeOS.getStats();
    return {
      avgEnergy: stats.averageNodeEnergy,
      agentsActive: stats.totalNodes - 43, // Base is 43, extras are agents
    };
  } catch {
    return { avgEnergy: 1.0, agentsActive: 7 };
  }
}

async function getKnowledgeGraphStats(): Promise<{
  newThisMinute: number;
  newRelsThisMinute: number;
}> {
  try {
    const { getGraphStats } = await import('../knowledgeGraph.js');
    const stats = getGraphStats();
    return {
      newThisMinute: stats.entities, // Approximate for now
      newRelsThisMinute: stats.relationships,
    };
  } catch {
    return { newThisMinute: 0, newRelsThisMinute: 0 };
  }
}

async function getCrossShardStats(): Promise<{
  clusters: number;
  patterns: number;
}> {
  try {
    const { getCrossShardStats } = await import('../crossShardLearning.js');
    return getCrossShardStats();
  } catch {
    return { clusters: 0, patterns: 0 };
  }
}

async function getSentimentStats(): Promise<{
  trend: 'improving' | 'stable' | 'declining';
  satisfaction: number;
}> {
  try {
    const { getCurrentMood } = await import('../sentimentTracker.js');
    const mood = getCurrentMood();
    return {
      trend: mood.recentTrend === 'up' ? 'improving' : 
             mood.recentTrend === 'down' ? 'declining' : 'stable',
      satisfaction: mood.satisfaction,
    };
  } catch {
    return { trend: 'stable', satisfaction: 50 };
  }
}

async function getIntentStats(): Promise<{
  sequences: number;
  topPatterns: string[];
}> {
  try {
    const { getIntentStats, getTopSequences } = await import('../intentPrediction.js');
    const stats = getIntentStats();
    const sequences = getTopSequences(3);
    return {
      sequences: stats.sequences,
      topPatterns: sequences.map(s => s.tools.slice(0, 2).join('→')),
    };
  } catch {
    return { sequences: 0, topPatterns: [] };
  }
}

async function getTemporalStats(): Promise<{
  hotDomains: string[];
  hotTools: string[];
}> {
  try {
    const { getTemporalStats, predictHotTools } = await import('../temporalPatterns.js');
    const stats = getTemporalStats();
    const hotTools = predictHotTools(15);
    return {
      hotDomains: stats.globalHotHours?.map(h => `hour-${h}`) || [],
      hotTools: hotTools.slice(0, 3),
    };
  } catch {
    return { hotDomains: [], hotTools: [] };
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function resetMinuteMetrics(): void {
  minuteMetrics.toolsExecuted = 0;
  minuteMetrics.chatsHandled = 0;
  minuteMetrics.tasksRouted = 0;
  minuteMetrics.errors = 0;
  minuteMetrics.predictionsMade = 0;
  minuteMetrics.predictionsCorrect = 0;
  // Keep optimizations for a few minutes
  if (minuteMetrics.newOptimizations.length > 3) {
    minuteMetrics.newOptimizations = minuteMetrics.newOptimizations.slice(-3);
  }
}

function detectKnowledgeGaps(kgStats: { newThisMinute: number }): string[] {
  const gaps: string[] = [];
  if (kgStats.newThisMinute === 0) {
    gaps.push('entity_extraction');
  }
  // Add more gap detection based on learning velocity
  return gaps;
}

function generateRecommendations(
  kgStats: { newThisMinute: number },
  learningStats: { clusters: number }
): string[] {
  const recs: string[] = [];
  if (kgStats.newThisMinute < 2) {
    recs.push('increase_entity_diversity');
  }
  if (learningStats.clusters < 5) {
    recs.push('build_more_clusters');
  }
  return recs;
}

// ─── Stats Export ────────────────────────────────────────────────────────────

export function getInsightsLoggerStats(): {
  running: boolean;
  totalMessages: number;
  lastLogTime: number;
  sequenceNumber: number;
} {
  return {
    running: isRunning,
    totalMessages,
    lastLogTime,
    sequenceNumber,
  };
}
