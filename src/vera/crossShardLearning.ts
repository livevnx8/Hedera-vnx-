/**
 * Vera's Cross-Shard Learning
 * 
 * Finds patterns across chat shards, identifies recurring topics,
 * and builds emergent knowledge from conversation history.
 */
import fs from 'fs';
import path from 'path';
import { getAllRecentShards, type ChatShard } from './chatMemory.js';

const PATTERNS_PATH = '/mnt/vera-mirror-shards/vera-lattice/cross-patterns.json';

interface TopicCluster {
  id: string;
  keywords: string[];
  shardIds: string[];
  firstSeen: number;
  lastSeen: number;
  frequency: number;
  relatedTools: string[];
}

interface EmergingPattern {
  type: 'recurring_topic' | 'tool_sequence' | 'entity_pairing';
  confidence: number;
  evidence: string[];
  firstSeen: number;
  lastSeen: number;
}

interface CrossShardStore {
  clusters: TopicCluster[];
  patterns: EmergingPattern[];
  lastAnalysis: number;
}

let store: CrossShardStore = {
  clusters: [],
  patterns: [],
  lastAnalysis: 0,
};

// Common Hedera/tech keywords to track
const KEYWORDS = [
  'token', 'nft', 'hbar', 'transfer', 'mint', 'create', 'account',
  'topic', 'hcs', 'swap', 'liquidity', 'defi', 'staking', 'balance',
  'query', 'contract', 'deploy', 'schedule', 'consensus', 'mirror',
  'associate', 'dissociate', 'approve', 'allowance', 'key', 'verify',
  'compliance', 'audit', 'report', 'treasury', 'rebalance', 'payment'
];

function load(): void {
  try {
    if (fs.existsSync(PATTERNS_PATH)) {
      store = JSON.parse(fs.readFileSync(PATTERNS_PATH, 'utf8'));
    }
  } catch { /* silent */ }
}

function save(): void {
  try {
    const dir = path.dirname(PATTERNS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PATTERNS_PATH, JSON.stringify(store, null, 2));
  } catch { /* silent */ }
}

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return KEYWORDS.filter(k => lower.includes(k));
}

function findOrCreateCluster(keywords: string[], shardId: string): TopicCluster {
  const sorted = [...keywords].sort().join(',');
  
  // Find existing cluster with similar keywords (80% overlap)
  for (const cluster of store.clusters) {
    const clusterSet = new Set(cluster.keywords);
    const overlap = keywords.filter(k => clusterSet.has(k)).length;
    const similarity = overlap / Math.max(keywords.length, cluster.keywords.length);
    
    if (similarity > 0.8) {
      cluster.shardIds.push(shardId);
      cluster.frequency++;
      cluster.lastSeen = Date.now();
      return cluster;
    }
  }
  
  // Create new cluster
  const cluster: TopicCluster = {
    id: `cluster-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    keywords,
    shardIds: [shardId],
    firstSeen: Date.now(),
    lastSeen: Date.now(),
    frequency: 1,
    relatedTools: [],
  };
  store.clusters.push(cluster);
  return cluster;
}

function detectToolSequence(shards: ChatShard[]): void {
  // Sort by time
  const sorted = [...shards].sort((a, b) => a.timestamp - b.timestamp);
  
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i].toolsUsed || [];
    const next = sorted[i + 1].toolsUsed || [];
    
    if (current.length > 0 && next.length > 0) {
      // Check if tools form a common sequence
      const seq = [...current, ...next].slice(0, 4).join('→');
      
      const existing = store.patterns.find(p => 
        p.type === 'tool_sequence' && p.evidence.includes(seq)
      );
      
      if (existing) {
        existing.lastSeen = Date.now();
        existing.confidence = Math.min(1, existing.confidence + 0.1);
      } else {
        store.patterns.push({
          type: 'tool_sequence',
          confidence: 0.3,
          evidence: [seq],
          firstSeen: Date.now(),
          lastSeen: Date.now(),
        });
      }
    }
  }
}

export function analyzeShards(): void {
  load();
  
  const shards = getAllRecentShards(1000);
  if (shards.length === 0) return;
  
  // Analyze each shard
  for (const shard of shards) {
    const text = `${shard.userMessage} ${shard.veraResponse || ''}`;
    const keywords = extractKeywords(text);
    
    if (keywords.length > 0) {
      const cluster = findOrCreateCluster(keywords, shard.id);
      
      // Track tools used in this cluster
      for (const tool of shard.toolsUsed || []) {
        if (!cluster.relatedTools.includes(tool)) {
          cluster.relatedTools.push(tool);
        }
      }
    }
  }
  
  // Detect sequences
  detectToolSequence(shards);
  
  // Prune old clusters (not seen in 7 days)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  store.clusters = store.clusters.filter(c => c.lastSeen > weekAgo);
  
  store.lastAnalysis = Date.now();
  save();
}

export function getTopClusters(limit = 10): TopicCluster[] {
  load();
  return store.clusters
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, limit);
}

export function getEmergingPatterns(): EmergingPattern[] {
  load();
  return store.patterns
    .filter(p => p.confidence > 0.5)
    .sort((a, b) => b.confidence - a.confidence);
}

export function suggestToolsForQuery(query: string): string[] {
  load();
  const keywords = extractKeywords(query);
  
  // Find matching clusters
  const matching = store.clusters.filter(c => 
    c.keywords.some(k => keywords.includes(k))
  );
  
  // Aggregate tools from matching clusters
  const toolScores = new Map<string, number>();
  for (const cluster of matching) {
    for (const tool of cluster.relatedTools) {
      toolScores.set(tool, (toolScores.get(tool) || 0) + cluster.frequency);
    }
  }
  
  return Array.from(toolScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tool]) => tool);
}

export function getCrossShardStats(): { clusters: number; patterns: number; lastAnalysis: number } {
  load();
  return {
    clusters: store.clusters.length,
    patterns: store.patterns.length,
    lastAnalysis: store.lastAnalysis,
  };
}

// Auto-analyze every 5 minutes
setInterval(() => {
  try {
    analyzeShards();
  } catch { /* silent */ }
}, 5 * 60 * 1000);

// Initialize
load();
