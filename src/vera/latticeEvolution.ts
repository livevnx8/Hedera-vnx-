/**
 * Vera's Lattice Evolution Tracker
 * 
 * Tracks the growth and evolution of the lattice over time,
 * measuring expansion, contraction, and emergent properties.
 */
import fs from 'fs';
import path from 'path';

const EVOLUTION_PATH = '/mnt/vera-mirror-shards/vera-lattice/evolution-log.json';

interface EvolutionSnapshot {
  timestamp: number;
  nodes: number;
  edges: number;
  energy: number;
  entities: number;
  relationships: number;
  shards: number;
  clusters: number;
  sentimentScore: number;
  growthRate: number; // nodes per hour
  entropy: number; // measure of disorder/chaos
}

interface EvolutionStats {
  snapshots: EvolutionSnapshot[];
  birthTime: number;
  totalGrowthEvents: number;
  totalDecayEvents: number;
  maxNodes: number;
  maxEnergy: number;
  averageGrowthRate: number;
}

let stats: EvolutionStats = {
  snapshots: [],
  birthTime: Date.now(),
  totalGrowthEvents: 0,
  totalDecayEvents: 0,
  maxNodes: 0,
  maxEnergy: 0,
  averageGrowthRate: 0,
};

function load(): void {
  try {
    if (fs.existsSync(EVOLUTION_PATH)) {
      stats = JSON.parse(fs.readFileSync(EVOLUTION_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(EVOLUTION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(EVOLUTION_PATH, JSON.stringify(stats, null, 2));
  } catch { /* silent */ }
}

export function recordEvolution(data: {
  nodes: number;
  edges: number;
  energy: number;
  entities: number;
  relationships: number;
  shards: number;
  clusters: number;
  sentimentScore: number;
}): void {
  load();
  
  const lastSnapshot = stats.snapshots[stats.snapshots.length - 1];
  const hoursSinceLast = lastSnapshot 
    ? (Date.now() - lastSnapshot.timestamp) / (1000 * 60 * 60)
    : 1;
  
  const growthRate = lastSnapshot
    ? (data.nodes - lastSnapshot.nodes) / hoursSinceLast
    : 0;
  
  // Calculate entropy (higher = more chaotic/unstructured)
  // Simplified: ratio of edges to nodes (complete graph = 1, sparse = 0)
  const maxEdges = (data.nodes * (data.nodes - 1)) / 2;
  const entropy = maxEdges > 0 ? 1 - (data.edges / maxEdges) : 0;
  
  const snapshot: EvolutionSnapshot = {
    timestamp: Date.now(),
    ...data,
    growthRate,
    entropy,
  };
  
  stats.snapshots.push(snapshot);
  
  // Keep last 1000 snapshots
  if (stats.snapshots.length > 1000) {
    stats.snapshots = stats.snapshots.slice(-1000);
  }
  
  // Update stats
  if (data.nodes > stats.maxNodes) stats.maxNodes = data.nodes;
  if (data.energy > stats.maxEnergy) stats.maxEnergy = data.energy;
  if (growthRate > 0) stats.totalGrowthEvents++;
  if (growthRate < 0) stats.totalDecayEvents++;
  
  // Recalculate average growth rate
  const rates = stats.snapshots.map(s => s.growthRate).filter(r => r > 0);
  stats.averageGrowthRate = rates.length > 0
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : 0;
  
  save();
}

export function getEvolutionStats(): EvolutionStats & {
  age: number;
  currentGrowthRate: number;
  currentEntropy: number;
  trend: 'expanding' | 'stable' | 'contracting';
} {
  load();
  
  const last = stats.snapshots[stats.snapshots.length - 1];
  const prev = stats.snapshots[stats.snapshots.length - 2];
  
  let trend: 'expanding' | 'stable' | 'contracting' = 'stable';
  if (last && prev) {
    if (last.nodes > prev.nodes) trend = 'expanding';
    else if (last.nodes < prev.nodes) trend = 'contracting';
  }
  
  return {
    ...stats,
    age: Date.now() - stats.birthTime,
    currentGrowthRate: last?.growthRate || 0,
    currentEntropy: last?.entropy || 0,
    trend,
  };
}

export function getGrowthTimeline(hours = 24): EvolutionSnapshot[] {
  load();
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return stats.snapshots.filter(s => s.timestamp > cutoff);
}

export function predictNextGrowth(): {
  predictedNodes: number;
  predictedEnergy: number;
  confidence: number;
} {
  load();
  
  const recent = stats.snapshots.slice(-10);
  if (recent.length < 3) {
    return { predictedNodes: 0, predictedEnergy: 0, confidence: 0 };
  }
  
  // Simple linear projection
  const nodesGrowth = recent[recent.length - 1].nodes - recent[0].nodes;
  const avgGrowthPerSnapshot = nodesGrowth / (recent.length - 1);
  
  const last = recent[recent.length - 1];
  const predictedNodes = Math.round(last.nodes + avgGrowthPerSnapshot);
  const predictedEnergy = last.energy; // Energy tends to stabilize
  
  // Confidence based on consistency of recent growth
  const variance = recent.reduce((sum, s, i) => {
    if (i === 0) return 0;
    const diff = s.nodes - recent[i - 1].nodes;
    return sum + Math.abs(diff - avgGrowthPerSnapshot);
  }, 0) / recent.length;
  
  const confidence = Math.max(0, Math.min(1, 1 - variance / 10));
  
  return { predictedNodes, predictedEnergy, confidence };
}

// Auto-record every 10 minutes
setInterval(async () => {
  try {
    // Dynamic imports to avoid circular deps
    const { flowerOfLifeOS } = await import('./orchestrator/flowerOfLifeOS.js');
    const { getGraphStats } = await import('./knowledgeGraph.js');
    const { getShardStats } = await import('./chatMemory.js');
    
    const latticeStats = flowerOfLifeOS.getStats();
    const kg = getGraphStats();
    const memory = getShardStats();
    
    // Get sentiment
    const { getSentimentStats } = await import('./sentimentTracker.js');
    const sentiment = getSentimentStats();
    const recentEntries = sentiment.entries.slice(-10);
    const avgSentiment = recentEntries.length > 0
      ? recentEntries.reduce((s, e) => s + e.score, 0) / recentEntries.length
      : 0;
    
    // Get clusters
    const { getCrossShardStats } = await import('./crossShardLearning.js');
    const learning = getCrossShardStats();
    
    recordEvolution({
      nodes: latticeStats.totalNodes,
      edges: latticeStats.totalEdges,
      energy: latticeStats.averageNodeEnergy,
      entities: kg.entities,
      relationships: kg.relationships,
      shards: memory.total,
      clusters: learning.clusters,
      sentimentScore: avgSentiment,
    });
  } catch { /* silent */ }
}, 10 * 60 * 1000);

// Initialize
load();
